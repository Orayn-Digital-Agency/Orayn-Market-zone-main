import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Agent } from "@/types/supabase";

export type UserRole = "admin" | "agent";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  agent: Agent | null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const role = (user.app_metadata?.role as UserRole) ?? "agent";

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    role,
    agent: agent ?? null,
  };
}
