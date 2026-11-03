"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { formatUSD, formatDateWAT } from "@/lib/format";
import { toast } from "sonner";
import { CheckCircle, Clock, DollarSign } from "lucide-react";

interface PayoutSummaryRow {
  agent_id: string;
  agent_code: string;
  full_name: string;
  total_deals: number;
  total_commission: number;
  payout_status: "pending" | "paid";
  paid_at: string | null;
}

interface PayoutHistoryRow {
  id: string;
  agent_id: string;
  agent_code: string;
  full_name: string;
  month: string;
  total_commission: number;
  status: "pending" | "paid";
  paid_at: string | null;
}

function getMonthOptions(): { value: string; label: string }[] {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-NG", {
      year: "numeric",
      month: "long",
      timeZone: "Africa/Lagos",
    });
    options.push({ value, label });
  }
  return options;
}

function StatusPill({ status }: { status: "pending" | "paid" }) {
  return status === "paid" ? (
    <span className="badge bg-orayn-green-bg text-orayn-green flex items-center gap-1 w-fit">
      <CheckCircle size={11} /> Paid
    </span>
  ) : (
    <span className="badge bg-orayn-amber-bg text-orayn-amber flex items-center gap-1 w-fit">
      <Clock size={11} /> Pending
    </span>
  );
}

export function PayoutsDashboardClient() {
  const queryClient = useQueryClient();
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [markPaidTarget, setMarkPaidTarget] = useState<PayoutSummaryRow | null>(
    null,
  );

  const { data: summary = [], isLoading: summaryLoading } = useQuery({
    queryKey: ["payout-summary", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payouts?month=${selectedMonth}`);
      if (!res.ok) throw new Error("Failed to fetch payout summary");
      return res.json() as Promise<PayoutSummaryRow[]>;
    },
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["payout-history"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payouts/history");
      if (!res.ok) throw new Error("Failed to fetch payout history");
      return res.json() as Promise<PayoutHistoryRow[]>;
    },
    enabled: activeTab === "history",
  });

  const markPaidMutation = useMutation({
    mutationFn: async (row: PayoutSummaryRow) => {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: row.agent_id,
          month: selectedMonth,
          total_commission: row.total_commission,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to mark as paid");
      }
    },
    onSuccess: () => {
      toast.success("Payout marked as paid");
      queryClient.invalidateQueries({ queryKey: ["payout-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payout-history"] });
      setMarkPaidTarget(null);
    },
    onError: (err: Error) => {
      toast.error("Failed to mark payout", { description: err.message });
    },
  });

  const totalPending = summary
    .filter((r) => r.payout_status === "pending")
    .reduce((s, r) => s + r.total_commission, 0);

  const totalAll = summary.reduce((s, r) => s + r.total_commission, 0);

  return (
    <div className="space-y-6">
      {/* Month selector + tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="input-field w-full sm:w-auto"
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-orayn-light rounded-lg p-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("current")}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-semibold transition-colors
              ${
                activeTab === "current"
                  ? "bg-white text-orayn-navy shadow-card"
                  : "text-orayn-gray hover:text-orayn-navy"
              }`}
          >
            Monthly Summary
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-semibold transition-colors
              ${
                activeTab === "history"
                  ? "bg-white text-orayn-navy shadow-card"
                  : "text-orayn-gray hover:text-orayn-navy"
              }`}
          >
            Payout History
          </button>
        </div>
      </div>

      {activeTab === "current" && (
        <>
          {/* Summary stat cards — responsive grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray mb-1">
                Total Commissions
              </p>
              <p className="font-sora text-xl font-bold text-orayn-navy">
                {formatUSD(totalAll)}
              </p>
            </div>
            <div className="card">
              <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray mb-1">
                Pending Transfer
              </p>
              <p className="font-sora text-xl font-bold text-orayn-red">
                {formatUSD(totalPending)}
              </p>
            </div>
            <div className="card">
              <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray mb-1">
                Agents with Earnings
              </p>
              <p className="font-sora text-xl font-bold text-orayn-navy">
                {summary.length}
              </p>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white border border-orayn-mid rounded-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-orayn-mid">
                    <th className="table-header">Agent Code</th>
                    <th className="table-header">Full Name</th>
                    <th className="table-header">Deals</th>
                    <th className="table-header">Commission</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRowSkeleton key={i} cols={6} />
                    ))
                  ) : summary.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={DollarSign}
                          title="No deals this month"
                          description="No closed deals recorded for the selected month."
                        />
                      </td>
                    </tr>
                  ) : (
                    summary.map((row) => (
                      <tr
                        key={row.agent_id}
                        className="border-b border-orayn-mid last:border-0 hover:bg-orayn-light/40"
                      >
                        <td className="table-cell">
                          <span className="font-mono font-bold text-orayn-gold">
                            {row.agent_code}
                          </span>
                        </td>
                        <td className="table-cell font-semibold text-orayn-navy">
                          {row.full_name}
                        </td>
                        <td className="table-cell text-center font-semibold">
                          {row.total_deals}
                        </td>
                        <td className="table-cell font-semibold text-orayn-green">
                          {formatUSD(row.total_commission)}
                        </td>
                        <td className="table-cell">
                          <StatusPill status={row.payout_status} />
                        </td>
                        <td className="table-cell">
                          {row.payout_status === "pending" ? (
                            <button
                              onClick={() => setMarkPaidTarget(row)}
                              className="btn-success text-xs px-3 py-1.5"
                            >
                              Mark as Paid
                            </button>
                          ) : (
                            <span className="text-xs text-orayn-gray">
                              {row.paid_at
                                ? formatDateWAT(row.paid_at, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card list — shown only on small screens */}
          <div className="sm:hidden space-y-3">
            {summaryLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="h-4 bg-orayn-mid rounded w-24 mb-3" />
                    <div className="h-4 bg-orayn-mid rounded w-40 mb-3" />
                    <div className="h-4 bg-orayn-mid rounded w-32" />
                  </div>
                ))}
              </div>
            ) : summary.length === 0 ? (
              <div className="card text-center">
                <p className="text-sm text-orayn-gray">
                  No deals recorded for this month.
                </p>
              </div>
            ) : (
              summary.map((row) => (
                <div key={row.agent_id} className="card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono font-bold text-orayn-gold text-sm">
                        {row.agent_code}
                      </p>
                      <p className="font-semibold text-orayn-navy text-sm mt-0.5">
                        {row.full_name}
                      </p>
                    </div>
                    <StatusPill status={row.payout_status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-orayn-mid">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray mb-0.5">
                        Deals
                      </p>
                      <p className="text-sm font-semibold text-orayn-text">
                        {row.total_deals}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray mb-0.5">
                        Commission
                      </p>
                      <p className="text-sm font-semibold text-orayn-green">
                        {formatUSD(row.total_commission)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-1">
                    {row.payout_status === "pending" ? (
                      <button
                        onClick={() => setMarkPaidTarget(row)}
                        className="btn-success text-xs px-3 py-2 w-full"
                      >
                        Mark as Paid
                      </button>
                    ) : (
                      <p className="text-xs text-orayn-gray">
                        Paid on{" "}
                        {row.paid_at
                          ? formatDateWAT(row.paid_at, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === "history" && (
        <>
          {/* Desktop history table */}
          <div className="hidden sm:block bg-white border border-orayn-mid rounded-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-orayn-mid">
                    <th className="table-header">Month</th>
                    <th className="table-header">Agent Code</th>
                    <th className="table-header">Full Name</th>
                    <th className="table-header">Commission</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Paid At</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={i} cols={6} />
                    ))
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={DollarSign}
                          title="No payout history yet"
                          description="Completed payouts will appear here once agents earn commissions."
                        />
                      </td>
                    </tr>
                  ) : (
                    history.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-orayn-mid last:border-0 hover:bg-orayn-light/40"
                      >
                        <td className="table-cell font-mono text-sm">
                          {row.month}
                        </td>
                        <td className="table-cell font-mono font-bold text-orayn-gold">
                          {row.agent_code}
                        </td>
                        <td className="table-cell font-semibold text-orayn-navy">
                          {row.full_name}
                        </td>
                        <td className="table-cell font-semibold text-orayn-green">
                          {formatUSD(row.total_commission)}
                        </td>
                        <td className="table-cell">
                          <StatusPill status={row.status} />
                        </td>
                        <td className="table-cell text-xs text-orayn-gray">
                          {row.paid_at
                            ? formatDateWAT(row.paid_at, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile history card list */}
          <div className="sm:hidden space-y-3">
            {historyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="h-4 bg-orayn-mid rounded w-24 mb-3" />
                    <div className="h-4 bg-orayn-mid rounded w-40" />
                  </div>
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="card text-center">
                <p className="text-sm text-orayn-gray">
                  No payout history yet.
                </p>
              </div>
            ) : (
              history.map((row) => (
                <div key={row.id} className="card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono font-bold text-orayn-gold text-sm">
                        {row.agent_code}
                      </p>
                      <p className="font-semibold text-orayn-navy text-sm mt-0.5">
                        {row.full_name}
                      </p>
                    </div>
                    <StatusPill status={row.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-orayn-mid">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray mb-0.5">
                        Month
                      </p>
                      <p className="text-sm font-mono text-orayn-text">
                        {row.month}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray mb-0.5">
                        Commission
                      </p>
                      <p className="text-sm font-semibold text-orayn-green">
                        {formatUSD(row.total_commission)}
                      </p>
                    </div>
                  </div>
                  {row.paid_at && (
                    <p className="text-xs text-orayn-gray pt-1 border-t border-orayn-mid">
                      Paid{" "}
                      {formatDateWAT(row.paid_at, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      <ConfirmModal
        open={!!markPaidTarget}
        onClose={() => setMarkPaidTarget(null)}
        onConfirm={() =>
          markPaidTarget && markPaidMutation.mutate(markPaidTarget)
        }
        title="Mark Payout as Paid"
        description={`Confirm that you have transferred ${markPaidTarget ? formatUSD(markPaidTarget.total_commission) : ""} to ${markPaidTarget?.full_name} (${markPaidTarget?.agent_code}). This action cannot be undone.`}
        confirmLabel="Confirm Payment"
        loading={markPaidMutation.isPending}
        variant="warning"
      />
    </div>
  );
}
