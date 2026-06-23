"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { useAgentSession } from "@/stores/agent-session";
import {
  StatusBadge,
  TierBadge,
  WebQualityBadge,
} from "@/components/ui/badges";
import { FollowUpBadge } from "@/components/sales/follow-up-badge";
import { DealClosedModal } from "@/components/sales/deal-closed-modal";
import { FailedModal } from "@/components/sales/failed-modal";
import { FollowUpModal } from "@/components/sales/follow-up-modal";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNairaDirect, timeAgo } from "@/lib/format";
import type { Lead, LeadStatus, ServiceTier } from "@/types/supabase";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  Filter,
  TableProperties,
  CalendarClock,
} from "lucide-react";

const STAGE_ORDER: LeadStatus[] = [
  "uncontacted",
  "contacted",
  "demo_sent",
  "negotiating",
  "closed",
  "lost",
];

const STAGE_LABELS: Record<LeadStatus, string> = {
  uncontacted: "Uncontacted",
  contacted: "Contacted",
  demo_sent: "Demo Sent",
  negotiating: "Negotiating",
  closed: "Closed",
  lost: "Lost",
};

interface SalesTableProps {
  _isAdmin?: boolean;
}

export function SalesTable({ _isAdmin = false }: SalesTableProps) {
  const queryClient = useQueryClient();
  const { agentCode, agentId } = useAgentSession();

  const [dealModalLead, setDealModalLead] = useState<Lead | null>(null);
  const [failModalLead, setFailModalLead] = useState<Lead | null>(null);
  const [followUpModalLead, setFollowUpModalLead] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [tierFilter, setTierFilter] = useState<ServiceTier | "all">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");

  // Fetch leads
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("lead_score", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  // Realtime subscription on leads table
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!agentId) throw new Error("No agent session");
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("claim_lead", {
        p_lead_id: leadId,
        p_agent_id: agentId,
      });
      if (error) throw error;
      const result = data as {
        success: boolean;
        message: string;
        claimed_by: string | null;
      };
      if (!result.success) {
        throw new Error(result.message ?? "Could not claim lead");
      }
      return result;
    },
    onSuccess: (_, leadId) => {
      toast.success("Lead claimed successfully");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      // Log activity
      const supabase = createSupabaseBrowserClient();
      supabase.from("activity_log").insert({
        agent_id: agentId!,
        lead_id: leadId,
        action: "claimed",
      });
    },
    onError: (err: Error) => {
      toast.error("Could not claim lead", { description: err.message });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // Stage update mutation
  const stageMutation = useMutation({
    mutationFn: async ({
      leadId,
      newStatus,
    }: {
      leadId: string;
      newStatus: LeadStatus;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus })
        .eq("id", leadId);
      if (error) throw error;

      await supabase.from("activity_log").insert({
        agent_id: agentId!,
        lead_id: leadId,
        action:
          newStatus === "contacted"
            ? "contacted"
            : newStatus === "demo_sent"
              ? "demo_sent"
              : "stage_updated",
        metadata: { new_status: newStatus },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
    },
    onError: (err: Error) => {
      toast.error("Failed to update stage", { description: err.message });
    },
  });

  // Collect unique cities for filter
  const cities = useMemo(() => {
    const all = leads.map((l) => l.city).filter((c): c is string => !!c);
    return [...new Set(all)].sort();
  }, [leads]);

  // Filtered data
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (
        searchTerm &&
        !lead.business_name.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (tierFilter !== "all" && lead.service_tier !== tierFilter)
        return false;
      if (cityFilter !== "all" && lead.city !== cityFilter) return false;
      return true;
    });
  }, [leads, searchTerm, statusFilter, tierFilter, cityFilter]);

  const columns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        id: "claim",
        header: "Claim",
        size: 120,
        cell: ({ row }) => {
          const lead = row.original;
          const isMyLead = lead.assigned_to === agentCode;
          const isClaimed = !!lead.assigned_to;
          const canClaim = !isClaimed && lead.status === "uncontacted";

          if (isClaimed && !isMyLead) {
            return (
              <span className="text-xs text-orayn-gray">
                {lead.assigned_to}
                {lead.claimed_at && (
                  <span className="block text-orayn-mid">
                    {timeAgo(lead.claimed_at)}
                  </span>
                )}
              </span>
            );
          }
          if (isMyLead) {
            return (
              <span className="text-xs font-semibold text-orayn-gold">
                You ({lead.claimed_at ? timeAgo(lead.claimed_at) : ""})
              </span>
            );
          }
          if (canClaim) {
            return (
              <button
                onClick={() => claimMutation.mutate(lead.id)}
                disabled={claimMutation.isPending}
                className="btn-primary text-xs px-3 py-1.5"
              >
                Claim
              </button>
            );
          }
          return <span className="text-xs text-orayn-gray">—</span>;
        },
      },
      {
        accessorKey: "business_name",
        header: "Business",
        cell: ({ getValue }) => (
          <span className="font-semibold text-orayn-navy text-sm">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ getValue }) => (
          <span className="text-sm text-orayn-gray">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-orayn-text">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ getValue }) => {
          const v = getValue<string>();
          return v ? (
            <a
              href={`mailto:${v}`}
              className="text-xs text-orayn-navy underline underline-offset-2"
            >
              {v}
            </a>
          ) : (
            <span className="text-xs text-orayn-gray">—</span>
          );
        },
      },
      {
        accessorKey: "city",
        header: "City",
        cell: ({ getValue }) => (
          <span className="text-sm text-orayn-gray">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
      {
        id: "source_link",
        header: "Maps",
        cell: ({ row }) =>
          row.original.source_link ? (
            <a
              href={row.original.source_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-orayn-navy hover:text-orayn-gold"
            >
              View <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-xs text-orayn-gray">—</span>
          ),
      },
      {
        accessorKey: "web_exists",
        header: "Web",
        cell: ({ getValue }) => (
          <span
            className={`text-xs font-semibold ${getValue<boolean>() ? "text-orayn-green" : "text-orayn-red"}`}
          >
            {getValue<boolean>() ? "Yes" : "No"}
          </span>
        ),
      },
      {
        accessorKey: "web_quality",
        header: "Web Quality",
        cell: ({ getValue }) => (
          <WebQualityBadge quality={getValue<string | null>()} />
        ),
      },
      {
        accessorKey: "service_tier",
        header: "Tier",
        cell: ({ getValue }) => {
          const tier = getValue<ServiceTier | null>();
          return tier ? (
            <TierBadge tier={tier} />
          ) : (
            <span className="text-xs text-orayn-gray">—</span>
          );
        },
      },
      {
        accessorKey: "price_range",
        header: "Price Range",
        cell: ({ getValue }) => (
          <span className="text-xs text-orayn-text">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
      {
        id: "demo_url",
        header: "Demo",
        cell: ({ row }) =>
          row.original.demo_url ? (
            <a
              href={row.original.demo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-orayn-navy hover:text-orayn-gold"
            >
              Open <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-xs text-orayn-gray">No demo</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row, getValue }) => (
          <div className="flex flex-col gap-1">
            <StatusBadge status={getValue<LeadStatus>()} />
            <FollowUpBadge
              followUpDate={row.original.follow_up_date}
              followUpNote={row.original.follow_up_note}
            />
          </div>
        ),
      },
      {
        id: "stage_selector",
        header: "Update Stage",
        cell: ({ row }) => {
          const lead = row.original;
          const isMyLead = lead.assigned_to === agentCode;
          if (!isMyLead || lead.status === "closed" || lead.status === "lost")
            return null;

          const currentIdx = STAGE_ORDER.indexOf(lead.status);
          const nextStages = STAGE_ORDER.slice(currentIdx + 1).filter(
            (s) => s !== "closed" && s !== "lost",
          );
          if (nextStages.length === 0) return null;

          return (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  stageMutation.mutate({
                    leadId: lead.id,
                    newStatus: e.target.value as LeadStatus,
                  });
                }
              }}
              className="input-field text-xs py-1 px-2"
            >
              <option value="">Move to...</option>
              {nextStages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        accessorKey: "deal_amount",
        header: "Amount",
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v ? (
            <span className="text-sm font-semibold text-orayn-green">
              {formatNairaDirect(v)}
            </span>
          ) : (
            <span className="text-xs text-orayn-gray">—</span>
          );
        },
      },
      {
        accessorKey: "commission_amount",
        header: "Commission",
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v ? (
            <span className="text-sm font-semibold text-orayn-gold">
              {formatNairaDirect(v)}
            </span>
          ) : (
            <span className="text-xs text-orayn-gray">—</span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const lead = row.original;
          const isMyLead = lead.assigned_to === agentCode;
          if (!isMyLead) return null;
          if (lead.status === "closed" || lead.status === "lost") return null;

          return (
            <div className="flex items-center gap-1.5">
              {lead.status === "negotiating" && (
                <button
                  onClick={() => setDealModalLead(lead)}
                  className="btn-success text-xs px-2.5 py-1.5"
                >
                  Closed
                </button>
              )}
              {["contacted", "demo_sent", "negotiating"].includes(
                lead.status,
              ) && (
                <button
                  onClick={() => setFollowUpModalLead(lead)}
                  className="btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1"
                  title="Schedule a follow-up instead of marking Lost"
                >
                  <CalendarClock size={11} />
                  Follow-up
                </button>
              )}
              <button
                onClick={() => setFailModalLead(lead)}
                className="btn-danger text-xs px-2.5 py-1.5"
              >
                Failed
              </button>
            </div>
          );
        },
      },
    ],
    [agentCode, claimMutation, stageMutation],
  );

  const table = useReactTable({
    data: filteredLeads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50, pageIndex: 0 } },
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-orayn-gray"
          />
          <input
            type="text"
            placeholder="Search business name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-orayn-gray hidden sm:block" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as LeadStatus | "all")
            }
            className="input-field w-auto text-sm"
          >
            <option value="all">All statuses</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>

          <select
            value={tierFilter}
            onChange={(e) =>
              setTierFilter(e.target.value as ServiceTier | "all")
            }
            className="input-field w-auto text-sm"
          >
            <option value="all">All tiers</option>
            {(
              ["Starter", "Business", "Premium", "Platform"] as ServiceTier[]
            ).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {cities.length > 0 && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="input-field w-auto text-sm"
            >
              <option value="all">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-orayn-mid rounded-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-orayn-mid">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="table-header whitespace-nowrap"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={columns.length} />
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <EmptyState
                      icon={TableProperties}
                      title="No leads found"
                      description="The lead engine will populate this automatically when n8n runs. Try adjusting your filters."
                    />
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const lead = row.original;
                  const rowBg =
                    lead.status === "closed"
                      ? "bg-orayn-green-bg"
                      : lead.status === "lost"
                        ? "bg-orayn-red-bg"
                        : lead.assigned_to === agentCode
                          ? "bg-blue-50/30"
                          : "";

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-orayn-mid last:border-0 transition-colors ${rowBg} hover:bg-orayn-light/50`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="table-cell whitespace-nowrap"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && filteredLeads.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-orayn-mid bg-orayn-light/50">
            <p className="text-xs text-orayn-gray">
              Showing {table.getState().pagination.pageIndex * 50 + 1}–
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * 50,
                filteredLeads.length,
              )}{" "}
              of {filteredLeads.length} leads
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="w-8 h-8 flex items-center justify-center rounded border border-orayn-mid
                           text-orayn-gray hover:text-orayn-navy hover:border-orayn-navy
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-orayn-text font-medium">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="w-8 h-8 flex items-center justify-center rounded border border-orayn-mid
                           text-orayn-gray hover:text-orayn-navy hover:border-orayn-navy
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {dealModalLead && agentId && (
        <DealClosedModal
          open={!!dealModalLead}
          onClose={() => setDealModalLead(null)}
          lead={dealModalLead}
          agentId={agentId}
        />
      )}
      {failModalLead && agentId && (
        <FailedModal
          open={!!failModalLead}
          onClose={() => setFailModalLead(null)}
          lead={failModalLead}
          agentId={agentId}
        />
      )}
      {followUpModalLead && agentCode && (
        <FollowUpModal
          open={!!followUpModalLead}
          onClose={() => setFollowUpModalLead(null)}
          lead={followUpModalLead}
          agentCode={agentCode}
        />
      )}
    </div>
  );
}
