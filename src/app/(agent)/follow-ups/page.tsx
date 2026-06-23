import { ErrorBoundary } from "@/components/ui/error-boundary";
import { FollowUpsDueClient } from "@/components/sales/follow-ups-due-client";
import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Follow-ups Due — market.zone",
};

export default async function FollowUpsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6 max-w-full">
      <ErrorBoundary>
        <FollowUpsDueClient
          agentCode={user.agent?.agent_code ?? ""}
          isAdmin={user.role === "admin"}
        />
      </ErrorBoundary>
    </div>
  );
}
