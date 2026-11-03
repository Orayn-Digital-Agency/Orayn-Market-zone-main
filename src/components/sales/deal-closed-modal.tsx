"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { Modal } from "@/components/ui/modal";
import {
  formatUSD,
  dollarsToCents,
  centsToDollars,
  getCommissionRate,
  calcCommissionCents,
  splitPayments,
  COMMISSION_BONUS_RATE,
} from "@/lib/format";
import type { Lead, Deal } from "@/types/supabase";
import { toast } from "sonner";
import {
  TrendingUp,
  Info,
  Link as LinkIcon,
  Copy,
  CheckCircle,
  Clock,
  ExternalLink,
} from "lucide-react";

interface DealClosedModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  agentId: string;
}

type Stage = "60" | "40";

// ── Small reusable components ────────────────────────────────────────────────

function PaymentStatusBadge({
  confirmed,
  confirmedAt,
}: {
  confirmed: boolean;
  confirmedAt: string | null;
}) {
  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-orayn-green">
        <CheckCircle size={11} />
        Paid
        {confirmedAt && (
          <span className="font-normal text-orayn-gray ml-1">
            {new Date(confirmedAt).toLocaleDateString("en-US", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orayn-amber">
      <Clock size={11} />
      Awaiting payment
    </span>
  );
}

function InstalmentCard({
  title,
  amountCents,
  confirmed,
  confirmedAt,
  link,
  disabledReason,
  busy,
  onGenerate,
}: {
  title: string;
  amountCents: number;
  confirmed: boolean;
  confirmedAt: string | null;
  link: string | null;
  disabledReason?: string;
  busy: boolean;
  onGenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — open the link and copy it from the address bar");
    }
  }

  return (
    <div className="border border-orayn-mid rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-orayn-text">{title}</p>
          <p className="text-sm font-bold text-orayn-navy mt-0.5">
            {formatUSD(amountCents)}
          </p>
        </div>
        <PaymentStatusBadge confirmed={confirmed} confirmedAt={confirmedAt} />
      </div>

      {!confirmed && (
        <div className="space-y-2">
          {link ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="btn-secondary flex items-center gap-1.5 text-xs"
              >
                {copied ? (
                  <CheckCircle size={12} className="text-orayn-green" />
                ) : (
                  <Copy size={12} />
                )}
                {copied ? "Copied" : "Copy payment link"}
              </button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-orayn-navy underline underline-offset-2"
              >
                <ExternalLink size={11} />
                Open
              </a>
              <button
                type="button"
                onClick={onGenerate}
                disabled={busy}
                className="text-xs text-orayn-gray underline underline-offset-2 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create a new link"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGenerate}
              disabled={busy || !!disabledReason}
              className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50"
            >
              <LinkIcon size={12} />
              {busy ? "Creating link…" : "Generate payment link"}
            </button>
          )}
          {disabledReason && !link && (
            <p className="text-xs text-orayn-gray">{disabledReason}</p>
          )}
          {link && (
            <p className="text-xs text-orayn-gray">
              Send this link to the client. It shows &quot;Paid&quot; here
              automatically once they pay.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function DealClosedModal({
  open,
  onClose,
  lead,
  agentId,
}: DealClosedModalProps) {
  const queryClient = useQueryClient();
  const [justClosed, setJustClosed] = useState(false);
  const [busyStage, setBusyStage] = useState<Stage | null>(null);

  // The set price is the FLOOR. It is fixed per lead and enforced by the database.
  const setPriceCents = lead.set_price ?? 0;
  const setPriceDollars = centsToDollars(setPriceCents);

  const schema = z.object({
    dealAmount: z
      .string()
      .min(1, "Enter the deal amount")
      .refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
        message: "Enter a valid amount greater than 0",
      })
      .refine((v) => dollarsToCents(Number(v)) >= setPriceCents, {
        message: `Deals can never close below the set price (${formatUSD(setPriceCents)})`,
      }),
  });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const dealAmountRaw = watch("dealAmount");
  const typedCents = (() => {
    const n = Number(dealAmountRaw);
    return !isNaN(n) && n > 0 ? dollarsToCents(n) : null;
  })();
  const belowFloor = typedCents !== null && typedCents < setPriceCents;
  const preview =
    typedCents !== null && !belowFloor && setPriceCents > 0
      ? {
          rate: getCommissionRate(typedCents, setPriceCents),
          amount: calcCommissionCents(typedCents, setPriceCents),
          split: splitPayments(typedCents),
        }
      : null;

  // ── Load the deal when the lead is already closed ────────────────────────
  const showPaymentView = lead.status === "closed" || justClosed;
  const { data: existingDeal } = useQuery<Deal | null>({
    queryKey: ["deal-for-lead", lead.id],
    enabled: showPaymentView && open,
    // Poll so "Paid" appears as soon as the Bachs webhook confirms a payment.
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("lead_id", lead.id)
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Deal | null;
    },
  });

  // ── Create a Bachs payment link for one instalment ───────────────────────
  async function generateLink(dealId: string, stage: Stage) {
    setBusyStage(stage);
    try {
      const res = await fetch("/api/payments/bachs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, stage }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create the payment link");
      toast.success("Payment link ready");
      await queryClient.invalidateQueries({ queryKey: ["deal-for-lead", lead.id] });
    } catch (err) {
      toast.error("Payment link failed", { description: (err as Error).message });
    } finally {
      setBusyStage(null);
    }
  }

  // ── Close a new deal ─────────────────────────────────────────────────────
  // The database re-checks the price floor and calculates commission itself,
  // so nothing the browser sends can lower the price or raise the commission.
  const closeDealMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createSupabaseBrowserClient();
      const cents = dollarsToCents(Number(values.dealAmount));

      const { error: leadError } = await supabase
        .from("leads")
        .update({ status: "closed", deal_amount: cents })
        .eq("id", lead.id);
      if (leadError) throw leadError;

      const { data: deal, error: dealError } = await supabase
        .from("deals")
        .insert({
          lead_id: lead.id,
          agent_id: agentId,
          deal_amount: cents,
          closed_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (dealError) throw dealError;

      await supabase.from("activity_log").insert({
        agent_id: agentId,
        lead_id: lead.id,
        action: "closed",
        metadata: {
          deal_amount: cents,
          commission_rate: deal.commission_rate,
          commission_amount: deal.commission_amount,
        },
      });

      return deal as Deal;
    },
    onSuccess: async (deal) => {
      toast.success("Deal closed!", {
        description: `Commission of ${formatUSD(deal.commission_amount)} recorded. Creating the payment link…`,
      });
      setJustClosed(true);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.setQueryData(["deal-for-lead", lead.id], deal);
      reset();
      await generateLink(deal.id, "60");
    },
    onError: (err: Error) => {
      toast.error("Failed to close deal", { description: err.message });
    },
  });

  function handleClose() {
    if (closeDealMutation.isPending || busyStage) return;
    reset();
    setJustClosed(false);
    onClose();
  }

  // ── Payment status view (deal already closed) ────────────────────────────
  if (showPaymentView) {
    if (!existingDeal) {
      return (
        <Modal open={open} onClose={handleClose} title="Deal Payment Status" size="md">
          <p className="text-sm text-orayn-gray py-6 text-center">Loading deal…</p>
        </Modal>
      );
    }
    const d60 = existingDeal.payment_60_amount ?? splitPayments(existingDeal.deal_amount).upfront;
    const d40 = existingDeal.payment_40_amount ?? splitPayments(existingDeal.deal_amount).balance;

    return (
      <Modal open={open} onClose={handleClose} title="Deal Payment Status" size="md">
        <div className="space-y-4">
          <div className="bg-orayn-light rounded-lg p-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray">
              Business
            </p>
            <p className="font-sora text-sm font-bold text-orayn-navy leading-snug">
              {lead.business_name}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <span className="text-xs text-orayn-gray">
                Tier:{" "}
                <span className="font-semibold text-orayn-text">
                  {lead.service_tier ?? "—"}
                </span>
              </span>
              <span className="text-xs text-orayn-gray">
                Deal:{" "}
                <span className="font-semibold text-orayn-green">
                  {formatUSD(existingDeal.deal_amount)}
                </span>
              </span>
              <span className="text-xs text-orayn-gray">
                Commission:{" "}
                <span className="font-semibold text-orayn-gold">
                  {formatUSD(existingDeal.commission_amount)}
                </span>
              </span>
            </div>
          </div>

          <InstalmentCard
            title="60% Upfront"
            amountCents={d60}
            confirmed={existingDeal.payment_60_confirmed}
            confirmedAt={existingDeal.payment_60_confirmed_at}
            link={existingDeal.payment_60_link}
            busy={busyStage === "60"}
            onGenerate={() => generateLink(existingDeal.id, "60")}
          />

          <InstalmentCard
            title="40% Balance on delivery"
            amountCents={d40}
            confirmed={existingDeal.payment_40_confirmed}
            confirmedAt={existingDeal.payment_40_confirmed_at}
            link={existingDeal.payment_40_link}
            busy={busyStage === "40"}
            disabledReason={
              existingDeal.payment_60_confirmed
                ? undefined
                : "Available once the 60% upfront payment has been received."
            }
            onGenerate={() => generateLink(existingDeal.id, "40")}
          />

          <p className="text-xs text-orayn-gray flex items-start gap-1.5">
            <Info size={11} className="flex-shrink-0 mt-0.5" />
            Your commission is paid once the client has paid both instalments in full.
          </p>

          <div className="flex items-center justify-end pt-1">
            <button type="button" onClick={handleClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── New deal view ────────────────────────────────────────────────────────
  const noPrice = setPriceCents <= 0;

  return (
    <Modal open={open} onClose={handleClose} title="Close Deal" size="md">
      <div className="space-y-4">
        <div className="bg-orayn-light rounded-lg p-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray">
            Business
          </p>
          <p className="font-sora text-sm font-bold text-orayn-navy leading-snug">
            {lead.business_name}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-xs text-orayn-gray">
              Tier:{" "}
              <span className="font-semibold text-orayn-text">
                {lead.service_tier ?? "—"}
              </span>
            </span>
            <span className="text-xs text-orayn-gray">
              Set price (minimum):{" "}
              <span className="font-semibold text-orayn-text">
                {noPrice ? "—" : formatUSD(setPriceCents)}
              </span>
            </span>
          </div>
        </div>

        {noPrice && (
          <div className="bg-orayn-red/10 border border-orayn-red/30 rounded-lg p-3 text-xs text-orayn-red">
            This lead has no set price yet, so it cannot be closed. Ask an admin
            to assign a tier.
          </div>
        )}

        <form
          onSubmit={handleSubmit((v) => closeDealMutation.mutate(v))}
          noValidate
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="dealAmount"
              className="block text-sm font-semibold text-orayn-text mb-1.5"
            >
              Agreed deal amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orayn-gray text-sm font-semibold">
                $
              </span>
              <input
                id="dealAmount"
                type="number"
                min={setPriceDollars || 1}
                step="1"
                disabled={noPrice}
                {...register("dealAmount")}
                className={`input-field pl-7 ${errors.dealAmount ? "input-error" : ""}`}
                placeholder={noPrice ? "" : `${setPriceDollars} or more`}
              />
            </div>
            {errors.dealAmount ? (
              <p className="text-xs text-orayn-red mt-1">{errors.dealAmount.message}</p>
            ) : (
              !noPrice && (
                <p className="text-xs text-orayn-gray mt-1">
                  Minimum {formatUSD(setPriceCents)}. Close above it to earn{" "}
                  {Math.round(COMMISSION_BONUS_RATE * 100)}% instead of 20%.
                </p>
              )
            )}
          </div>

          {preview && (
            <div className="bg-orayn-green-bg border border-orayn-green/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-orayn-green" />
                <p className="text-xs font-bold text-orayn-green">Commission Preview</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-orayn-gray">Rate</p>
                  <p className="font-sora text-base font-bold text-orayn-navy leading-tight">
                    {Math.round(preview.rate * 100)}%
                    {preview.rate === COMMISSION_BONUS_RATE && (
                      <span className="ml-1 badge bg-orayn-gold text-orayn-dark text-xs">
                        Above set price
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-orayn-gray">Your commission</p>
                  <p className="font-sora text-base font-bold text-orayn-green leading-tight">
                    {formatUSD(preview.amount)}
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-orayn-green/20 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-orayn-gray">60% upfront due</p>
                  <p className="text-sm font-semibold text-orayn-text">
                    {formatUSD(preview.split.upfront)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-orayn-gray">40% on delivery</p>
                  <p className="text-sm font-semibold text-orayn-text">
                    {formatUSD(preview.split.balance)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-orayn-gray mt-2">
                A secure payment link is created automatically when you confirm.
                Commission is paid once the client has paid in full.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
              disabled={closeDealMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={closeDealMutation.isPending || !preview || noPrice}
              className="btn-success flex items-center gap-2"
            >
              {closeDealMutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Closing...
                </>
              ) : (
                "Confirm Deal Closed"
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
