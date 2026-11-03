// @ts-nocheck
import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const service = createSupabaseServiceClient();

    const { data: agents, error: agentsError } = await service
      .from("agents")
      .select("*")
      .order("created_at", { ascending: true });

    if (agentsError) {
      console.error("[GET /api/admin/agents] agents error:", agentsError);
      return NextResponse.json({ error: agentsError.message }, { status: 500 });
    }

    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const { data: deals } = await service
      .from("deals")
      .select("agent_id, payout_month");

    const dealCounts: Record<string, { month: number; all: number }> = {};
    for (const deal of deals ?? []) {
      if (!dealCounts[deal.agent_id])
        dealCounts[deal.agent_id] = { month: 0, all: 0 };
      dealCounts[deal.agent_id].all++;
      if (deal.payout_month === monthStr) dealCounts[deal.agent_id].month++;
    }

    const result = (agents ?? []).map((a) => ({
      ...a,
      deals_this_month: dealCounts[a.id]?.month ?? 0,
      all_time_deals: dealCounts[a.id]?.all ?? 0,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/admin/agents] unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      fullName: string;
      email: string;
      agentCode: string;
    };

    if (!body.fullName || !body.email || !body.agentCode) {
      return NextResponse.json(
        { error: "fullName, email, and agentCode are all required." },
        { status: 400 },
      );
    }

    const service = createSupabaseServiceClient();

    // Verify agent code is not already in use
    const { data: existing } = await service
      .from("agents")
      .select("id")
      .eq("agent_code", body.agentCode)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Agent code ${body.agentCode} is already in use.` },
        { status: 400 },
      );
    }

    // redirectTo MUST match one of the allowed URLs in Supabase Dashboard →
    // Authentication → URL Configuration → Redirect URLs.
    // Currently allowed: http://localhost:3000/invite
    // Supabase appends the invite token as a hash fragment:
    // http://localhost:3000/invite#access_token=...&type=invite
    // The Supabase browser client on /invite detects this hash automatically.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectTo = `${appUrl}/invite`;

    const { data: inviteData, error: inviteError } =
      await service.auth.admin.inviteUserByEmail(body.email, {
        data: { role: "agent" },
        redirectTo,
      });

    if (inviteError || !inviteData?.user) {
      console.error("[POST /api/admin/agents] invite error:", inviteError);
      return NextResponse.json(
        { error: inviteError?.message ?? "Failed to send invite email." },
        { status: 500 },
      );
    }

    const { error: agentError } = await service.from("agents").insert({
      auth_user_id: inviteData.user.id,
      agent_code: body.agentCode,
      full_name: body.fullName,
      email: body.email,
      is_active: true,
    });

    if (agentError) {
      console.error("[POST /api/admin/agents] insert error:", agentError);
      // Roll back the auth user so the invite can be re-sent cleanly
      await service.auth.admin.deleteUser(inviteData.user.id);
      return NextResponse.json({ error: agentError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/admin/agents] unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
