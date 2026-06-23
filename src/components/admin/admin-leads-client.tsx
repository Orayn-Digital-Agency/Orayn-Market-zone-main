"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { StatusBadge, TierBadge } from "@/components/ui/badges";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { formatNairaDirect, timeAgo } from "@/lib/format";
import type { Lead, LeadStatus, ServiceTier } from "@/types/supabase";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  ExternalLink,
  RotateCcw,
  List,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";

interface LeadWithAgentName extends Lead {
  agent_full_name?: string;
}

const STAGE_LABELS: Record<LeadStatus, string> = {
  uncontacted: "Uncontacted",
  contacted: "Contacted",
  demo_sent: "Demo Sent",
  negotiating: "Negotiating",
  closed: "Closed",
  lost: "Lost",
};

export function AdminLeadsClient() {
  const queryClient = useQueryClient();
  const [releaseTarget, setReleaseTarget] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [tierFilter, setTierFilter] = useState<ServiceTier | "all">("all");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["admin-leads"],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: leadsData, error } = await supabase
        .from("leads")
        .select("*")
        .order("lead_score", { ascending: false });
      if (error) throw error;

      // Fetch agents to map codes to names
      const { data: agents } = await supabase
        .from("agents")
        .select("agent_code, full_name");

      const agentMap: Record<string, string> = {};
      for (const a of agents ?? []) {
        agentMap[a.agent_code] = a.full_name;
      }

      return (leadsData as Lead[]).map(
        (l): LeadWithAgentName => ({
          ...l,
          agent_full_name: l.assigned_to ? agentMap[l.assigned_to] : undefined,
        }),
      );
    },
  });

  // Realtime
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("admin-leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const releaseMutation = useMutation({
    mutationFn: async (lead: Lead) => {
      const supabase = createSupabaseBrowserClient();

      const { data, error } = await supabase.rpc("release_lead_manually", {
        p_lead_id: lead.id,
      });
      if (error) throw error;
      if (
        data &&
        typeof data === "object" &&
        "success" in data &&
        !data.success
      ) {
        throw new Error((data as { error?: string }).error ?? "Release failed");
      }

      // Log the manual release
      if (lead.assigned_to) {
        const { data: agent } = await supabase
          .from("agents")
          .select("id")
          .eq("agent_code", lead.assigned_to)
          .single();

        if (agent) {
          await supabase.from("activity_log").insert({
            agent_id: agent.id,
            lead_id: lead.id,
            action: "manually_released",
            metadata: { released_by: "admin" },
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Lead released back to pool");
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
      setReleaseTarget(null);
    },
    onError: (err: Error) => {
      toast.error("Failed to release lead", { description: err.message });
    },
  });

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (
        searchTerm &&
        !l.business_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
        return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (tierFilter !== "all" && l.service_tier !== tierFilter) return false;
      return true;
    });
  }, [leads, searchTerm, statusFilter, tierFilter]);

  const columns = useMemo<ColumnDef<LeadWithAgentName>[]>(
    () => [
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
        accessorKey: "city",
        header: "City",
        cell: ({ getValue }) => (
          <span className="text-sm text-orayn-gray">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "service_tier",
        header: "Tier",
        cell: ({ getValue }) => {
          const t = getValue<ServiceTier | null>();
          return t ? (
            <TierBadge tier={t} />
          ) : (
            <span className="text-xs text-orayn-gray">—</span>
          );
        },
      },
      {
        id: "assigned_to",
        header: "Assigned To",
        cell: ({ row }) => {
          const lead = row.original;
          if (!lead.assigned_to)
            return <span className="text-xs text-orayn-gray">Unclaimed</span>;
          return (
            <div>
              <p className="text-xs font-bold text-orayn-gold">
                {lead.assigned_to}
              </p>
              {lead.agent_full_name && (
                <p className="text-xs text-orayn-gray">
                  {lead.agent_full_name}
                </p>
              )}
              {lead.claimed_at && (
                <p className="text-xs text-orayn-gray">
                  {timeAgo(lead.claimed_at)}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue<LeadStatus>()} />,
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
            <span className="text-xs text-orayn-gray">—</span>
          ),
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
        accessorKey: "lead_score",
        header: "Score",
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return (
            <span
              className={`text-sm font-bold ${
                (v ?? 0) >= 8
                  ? "text-orayn-green"
                  : (v ?? 0) >= 5
                    ? "text-orayn-amber"
                    : "text-orayn-gray"
              }`}
            >
              {v ?? "—"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const lead = row.original;
          if (
            !lead.assigned_to ||
            lead.status === "closed" ||
            lead.status === "lost"
          )
            return null;
          return (
            <button
              onClick={() => setReleaseTarget(lead)}
              className="flex items-center gap-1 text-xs font-semibold text-orayn-amber hover:text-orayn-amber/80 transition-colors"
            >
              <RotateCcw size={12} />
              Release
            </button>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50, pageIndex: 0 } },
  });

  return (
    <>
      {/* Filters */}
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
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-orayn-gray hidden sm:block" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as LeadStatus | "all")
            }
            className="input-field w-auto text-sm"
          >
            <option value="all">All statuses</option>
            {(Object.keys(STAGE_LABELS) as LeadStatus[]).map((s) => (
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
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-orayn-mid rounded-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-orayn-mid">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="table-header">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={columns.length} />
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <EmptyState
                      icon={List}
                      title="No leads found"
                      description="Try adjusting your filters."
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
                        : "";
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-orayn-mid last:border-0 hover:bg-orayn-light/40 transition-colors ${rowBg}`}
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

        {!isLoading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-orayn-mid bg-orayn-light/50">
            <p className="text-xs text-orayn-gray">
              {filtered.length} leads total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="w-8 h-8 flex items-center justify-center rounded border border-orayn-mid text-orayn-gray hover:text-orayn-navy disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium text-orayn-text">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="w-8 h-8 flex items-center justify-center rounded border border-orayn-mid text-orayn-gray hover:text-orayn-navy disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        onConfirm={() => releaseTarget && releaseMutation.mutate(releaseTarget)}
        title="Release Lead"
        description={`Release "${releaseTarget?.business_name}" from ${releaseTarget?.assigned_to}? The lead will return to Uncontacted status and become available to all agents.`}
        confirmLabel="Release Lead"
        loading={releaseMutation.isPending}
        variant="warning"
      />
    </>
  );
}
