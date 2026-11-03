import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase-server";

// Next.js 15.3.x: params must be typed as Promise<...> and awaited
type RouteParams = { params: Promise<{ agentId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { agentId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = (await request.json()) as { is_active: boolean };
  const service = createSupabaseServiceClient();

  const { data: agent, error: fetchError } = await service
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .single();

  if (fetchError || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { error: updateError } = await service
    .from("agents")
    .update({ is_active: body.is_active })
    .eq("id", agentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: authError } = await service.auth.admin.updateUserById(
    agent.auth_user_id,
    { ban_duration: body.is_active ? "none" : "876000h" },
  );

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { agentId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const service = createSupabaseServiceClient();

  const { data: agent, error: fetchError } = await service
    .from("agents")
    .select("auth_user_id, agent_code")
    .eq("id", agentId)
    .single();

  if (fetchError || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.agent_code === "ADMIN") {
    return NextResponse.json({ error: "Cannot delete the admin account." }, { status: 400 });
  }

  const { error: deleteError } = await service
    .from("agents")
    .delete()
    .eq("id", agentId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: authDeleteError } = await service.auth.admin.deleteUser(
    agent.auth_user_id,
  );

  if (authDeleteError) {
    console.error("[DELETE /api/admin/agents] auth delete error:", authDeleteError);
  }

  return NextResponse.json({ success: true });
}
