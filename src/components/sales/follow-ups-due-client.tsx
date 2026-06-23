"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ExternalLink, AlertTriangle } from "lucide-react";
import { StatusBadge, TierBadge } from "@/components/ui/badges";
import type { Lead } from "@/types/supabase";

interface FollowUpsDueClientProps {
  agentCode: string;
  isAdmin: boolean;
}

export function FollowUpsDueClient({
  agentCode,
  isAdmin,
}: FollowUpsDueClientProps) {
  // Non-admin agents never get a scope choice — they only ever see
  // their own follow-ups. The toggle exists for admin only.
  const [scope, setScope] = useState<"mine" | "all">(isAdmin ? "all" : "mine");
  const effectiveScope = isAdmin ? scope : "mine";

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ["follow-ups-due", effectiveScope, agentCode],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .from("leads")
        .select("*")
        .not("follow_up_date", "is", null)
        .order("follow_up_date", { ascending: true });

      if (effectiveScope === "mine") {
        query = query.eq("assigned_to", agentCode);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const now = new Date();

  const grouped = (leads ?? []).reduce(
    (acc, lead) => {
      if (!lead.follow_up_date) return acc;
      const due = new Date(lead.follow_up_date);
      const diffDays = Math.ceil(
        (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays < 0) acc.overdue.push(lead);
      else if (diffDays === 0) acc.today.push(lead);
      else acc.upcoming.push(lead);
      return acc;
    },
    { overdue: [] as Lead[], today: [] as Lead[], upcoming: [] as Lead[] },
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-sora text-xl sm:text-2xl font-bold text-orayn-navy">
            Follow-ups Due
          </h1>
          <p className="text-sm text-orayn-gray mt-1">
            {isAdmin
              ? "Leads that asked agents to reach back later. Sorted by urgency."
              : "Leads that asked you to reach back later. Sorted by urgency."}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 bg-orayn-light rounded-lg p-1 self-start sm:self-auto">
            <button
              onClick={() => setScope("all")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                scope === "all"
                  ? "bg-white text-orayn-navy shadow-sm"
                  : "text-orayn-gray"
              }`}
            >
              All Agents
            </button>
            <button
              onClick={() => setScope("mine")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                scope === "mine"
                  ? "bg-white text-orayn-navy shadow-sm"
                  : "text-orayn-gray"
              }`}
            >
              Mine Only
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="text-sm text-orayn-gray py-12 text-center">
          Loading follow-ups...
        </div>
      )}

      {!isLoading && (leads?.length ?? 0) === 0 && (
        <div className="bg-white rounded-xl border border-orayn-mid p-8 sm:p-12 text-center">
          <CalendarClock size={32} className="text-orayn-gray mx-auto mb-3" />
          <p className="text-sm font-semibold text-orayn-text">
            No follow-ups scheduled
          </p>
          <p className="text-xs text-orayn-gray mt-1 max-w-sm mx-auto">
            When a business asks you to reach back later, schedule a follow-up
            from the Sales table instead of marking the lead as Lost.
          </p>
        </div>
      )}

      {!isLoading && (leads?.length ?? 0) > 0 && (
        <div className="space-y-6">
          {grouped.overdue.length > 0 && (
            <FollowUpGroup
              title="Overdue"
              icon={<AlertTriangle size={14} className="text-orayn-red" />}
              leads={grouped.overdue}
              accentClass="border-orayn-red/30"
            />
          )}
          {grouped.today.length > 0 && (
            <FollowUpGroup
              title="Due Today"
              icon={<CalendarClock size={14} className="text-orayn-amber" />}
              leads={grouped.today}
              accentClass="border-orayn-amber/30"
            />
          )}
          {grouped.upcoming.length > 0 && (
            <FollowUpGroup
              title="Upcoming"
              icon={<CalendarClock size={14} className="text-orayn-gray" />}
              leads={grouped.upcoming}
              accentClass="border-orayn-mid"
            />
          )}
        </div>
      )}
    </div>
  );
}

function FollowUpGroup({
  title,
  icon,
  leads,
  accentClass,
}: {
  title: string;
  icon: React.ReactNode;
  leads: Lead[];
  accentClass: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-sora text-sm font-bold text-orayn-navy">{title}</h2>
        <span className="text-xs text-orayn-gray">({leads.length})</span>
      </div>
      <div className="space-y-2">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className={`bg-white rounded-xl border ${accentClass} p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="font-sora text-sm font-bold text-orayn-navy truncate">
                  {lead.business_name}
                </p>
                <StatusBadge status={lead.status} />
                {lead.service_tier && <TierBadge tier={lead.service_tier} />}
              </div>
              {lead.follow_up_note && (
                <p className="text-xs text-orayn-gray italic truncate">
                  &ldquo;{lead.follow_up_note}&rdquo;
                </p>
              )}
              <p className="text-xs text-orayn-gray mt-1">
                Follow up:{" "}
                <span className="font-semibold text-orayn-text">
                  {lead.follow_up_date &&
                    new Date(lead.follow_up_date).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Africa/Lagos",
                    })}
                </span>
                {lead.follow_up_set_by && (
                  <span className="ml-2">
                    Set by{" "}
                    <span className="font-semibold text-orayn-text">
                      {lead.follow_up_set_by}
                    </span>
                  </span>
                )}
              </p>
            </div>
            <Link
              href="/sales"
              className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-orayn-navy hover:underline whitespace-nowrap self-start sm:self-auto"
            >
              Go to Sales
              <ExternalLink size={11} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
