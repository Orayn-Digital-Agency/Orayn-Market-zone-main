// @ts-nocheck
import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const service = createSupabaseServiceClient();

  const { data: payouts, error } = await service
    .from("payouts")
    .select("*")
    .order("month", { ascending: false })
    .order("paid_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: agents } = await service
    .from("agents")
    .select("id, agent_code, full_name");

  const agentMap = new Map((agents ?? []).map((a) => [a.id, a]));

  const result = (payouts ?? []).map((p) => {
    const agent = agentMap.get(p.agent_id);
    return {
      ...p,
      agent_code: agent?.agent_code ?? "—",
      full_name: agent?.full_name ?? "—",
    };
  });

  return NextResponse.json(result);
}
