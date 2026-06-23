"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { Modal } from "@/components/ui/modal";
import { formatNairaDirect, parsePriceRangeMax } from "@/lib/format";
import type { Lead, Deal, ServiceTier } from "@/types/supabase";
import { toast } from "sonner";
import { TrendingUp, Info, Link, Copy, CheckCircle, Clock } from "lucide-react";

interface DealClosedModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  agentId: string;
}

// ── Validation schema ────────────────────────────────────────────────────────
// Identical to the original schema except paystackLink is replaced with two
// separate fields — one per instalment. Both are optional, both validate HTTPS.
const linkValidator = z
  .string()
  .optional()
  .refine(
    (v) => {
      if (!v || v.trim() === "") return true;
      try {
        const url = new URL(v.trim());
        return url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Enter a valid HTTPS payment link or leave blank" },
  );

const schema = z.object({
  dealAmount: z
    .string()
    .min(1, "Enter the deal amount")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
      message: "Enter a valid amount greater than 0",
    }),
  payment60Link: linkValidator,
  payment40Link: linkValidator,
});

type FormValues = z.infer<typeof schema>;

// ── Fallback max prices per tier (used when price_range is null) ─────────────
const TIER_PRICE_RANGE_MAX: Record<ServiceTier, number> = {
  Starter: 300000,
  Business: 500000,
  Premium: 1000000,
  Platform: 9999999,
};

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
            {new Date(confirmedAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Africa/Lagos",
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

function CopyLinkField({
  id,
  label,
  description,
  fieldName,
  register: reg,
  watch: watcher,
  error,
}: {
  id: string;
  label: string;
  description: string;
  fieldName: keyof FormValues;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: any;
  error?: string;
}) {
  const [copied, setCopied] = useState(false);
  const value = watcher(fieldName) as string | undefined;

  async function copy() {
    if (!value?.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-orayn-text mb-1"
      >
        {label} <span className="text-orayn-gray font-normal">(optional)</span>
      </label>
      <p className="text-xs text-orayn-gray mb-1.5">{description}</p>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orayn-gray">
          <Link size={13} />
        </span>
        <input
          id={id}
          type="url"
          {...reg}
          className={`input-field pl-8 pr-9 ${error ? "input-error" : ""}`}
          placeholder="https://paystack.com/pay/..."
        />
        {value?.trim() && !error && (
          <button
            type="button"
            onClick={copy}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-orayn-gray hover:text-orayn-navy transition-colors"
            aria-label="Copy link"
          >
            {copied ? (
              <CheckCircle size={13} className="text-orayn-green" />
            ) : (
              <Copy size={13} />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-orayn-red mt-1">{error}</p>}
      {copied && (
        <p className="text-xs text-orayn-green mt-1">Copied to clipboard</p>
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

  const [preview, setPreview] = useState<{
    rate: 0.25 | 0.3;
    amount: number;
  } | null>(null);

  const priceRangeMax = lead.price_range
    ? parsePriceRangeMax(lead.price_range)
    : TIER_PRICE_RANGE_MAX[(lead.service_tier as ServiceTier) ?? "Starter"];

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const dealAmountRaw = watch("dealAmount");

  // Compute 60/40 split for the preview panel
  const upfront60 = (() => {
    const amount = Number(dealAmountRaw);
    if (!isNaN(amount) && amount > 0) return Math.round(amount * 0.6);
    return null;
  })();

  useEffect(() => {
    const amount = Number(dealAmountRaw);
    if (!isNaN(amount) && amount > 0) {
      const rate = amount > priceRangeMax ? 0.3 : 0.25;
      setPreview({ rate, amount: Math.round(amount * rate) });
    } else {
      setPreview(null);
    }
  }, [dealAmountRaw, priceRangeMax]);

  // ── Load existing deal when lead is already closed ───────────────────────
  const { data: existingDeal } = useQuery<Deal | null>({
    queryKey: ["deal-for-lead", lead.id],
    enabled: lead.status === "closed" && open,
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

  // ── Mutation: update payment links on an existing deal ──────────────────
  const updateLinksMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!existingDeal) throw new Error("No existing deal found");
      const supabase = createSupabaseBrowserClient();
      const update: Record<string, string | null> = {};
      if (values.payment60Link?.trim())
        update.payment_60_link = values.payment60Link.trim();
      if (values.payment40Link?.trim())
        update.payment_40_link = values.payment40Link.trim();
      if (Object.keys(update).length === 0) return;
      const { error } = await supabase
        .from("deals")
        .update(update)
        .eq("id", existingDeal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment links updated");
      queryClient.invalidateQueries({ queryKey: ["deal-for-lead", lead.id] });
      reset();
      onClose();
    },
    onError: (err: Error) => {
      toast.error("Failed to update links", { description: err.message });
    },
  });

  // ── Mutation: close a new deal ──────────────────────────────────────────
  // Preserves the exact same logic as the original modal — only adds the
  // two new instalment fields to the Supabase insert.
  const closeDealMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createSupabaseBrowserClient();
      const amount = Number(values.dealAmount);
      const rate = amount > priceRangeMax ? 0.3 : 0.25;
      const commission = Math.round(amount * rate);
      const p60link = values.payment60Link?.trim() || null;
      const p40link = values.payment40Link?.trim() || null;
      const upfront = Math.round(amount * 0.6);
      const balance = Math.round(amount * 0.4);

      // 1. Update lead record — identical to original
      const { error: leadError } = await supabase
        .from("leads")
        .update({
          status: "closed",
          deal_amount: amount,
          commission_rate: rate,
          commission_amount: commission,
        })
        .eq("id", lead.id);
      if (leadError) throw leadError;

      // 2. Insert deal record — adds instalment fields, keeps all original fields
      const now = new Date().toISOString();
      const payoutMonth = now.slice(0, 7);
      const { error: dealError } = await supabase.from("deals").insert({
        lead_id: lead.id,
        agent_id: agentId,
        deal_amount: amount,
        commission_rate: rate,
        commission_amount: commission,
        closed_at: now,
        payout_month: payoutMonth,
        payout_status: "pending",
        payment_confirmed: false,
        // Legacy single-link field — keep for backwards compatibility
        ...(p60link ? { paystack_link: p60link } : {}),
        // New instalment fields
        service_tier: lead.service_tier,
        payment_60_amount: upfront,
        payment_60_confirmed: false,
        ...(p60link ? { payment_60_link: p60link } : {}),
        payment_40_amount: balance,
        payment_40_confirmed: false,
        ...(p40link ? { payment_40_link: p40link } : {}),
      });
      if (dealError) throw dealError;

      // 3. Log activity — identical to original
      await supabase.from("activity_log").insert({
        agent_id: agentId,
        lead_id: lead.id,
        action: "closed",
        metadata: {
          deal_amount: amount,
          commission_rate: rate,
          commission_amount: commission,
          payment_60_link_added: !!p60link,
          payment_40_link_added: !!p40link,
        },
      });
    },
    onSuccess: () => {
      toast.success("Deal closed!", {
        description: `Commission of ${formatNairaDirect(preview?.amount ?? 0)} recorded.`,
      });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      reset();
      setPreview(null);
      onClose();
    },
    onError: (err: Error) => {
      toast.error("Failed to close deal", { description: err.message });
    },
  });

  function handleClose() {
    if (closeDealMutation.isPending || updateLinksMutation.isPending) return;
    reset();
    setPreview(null);
    onClose();
  }

  const isPending =
    closeDealMutation.isPending || updateLinksMutation.isPending;

  // ── Already-closed view — shows instalment status + link update form ────
  if (lead.status === "closed" && existingDeal) {
    const d60amount =
      existingDeal.payment_60_amount ??
      Math.round(existingDeal.deal_amount * 0.6);
    const d40amount =
      existingDeal.payment_40_amount ??
      Math.round(existingDeal.deal_amount * 0.4);

    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Deal Payment Status"
        size="md"
      >
        <div className="space-y-4">
          {/* Lead summary — identical structure to original */}
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
                  {formatNairaDirect(existingDeal.deal_amount)}
                </span>
              </span>
              <span className="text-xs text-orayn-gray">
                Commission:{" "}
                <span className="font-semibold text-orayn-gold">
                  {formatNairaDirect(existingDeal.commission_amount)}
                </span>
              </span>
            </div>
          </div>

          {/* 60% instalment */}
          <div className="border border-orayn-mid rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-orayn-text">
                  60% Upfront
                </p>
                <p className="text-sm font-bold text-orayn-navy mt-0.5">
                  {formatNairaDirect(d60amount)}
                </p>
              </div>
              <PaymentStatusBadge
                confirmed={existingDeal.payment_60_confirmed}
                confirmedAt={existingDeal.payment_60_confirmed_at}
              />
            </div>
            {existingDeal.payment_60_link && (
              <a
                href={existingDeal.payment_60_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-orayn-navy underline underline-offset-2"
              >
                <Link size={11} />
                View payment link
              </a>
            )}
          </div>

          {/* 40% instalment */}
          <div className="border border-orayn-mid rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-orayn-text">
                  40% Balance on delivery
                </p>
                <p className="text-sm font-bold text-orayn-navy mt-0.5">
                  {formatNairaDirect(d40amount)}
                </p>
              </div>
              <PaymentStatusBadge
                confirmed={existingDeal.payment_40_confirmed}
                confirmedAt={existingDeal.payment_40_confirmed_at}
              />
            </div>
            {existingDeal.payment_40_link && (
              <a
                href={existingDeal.payment_40_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-orayn-navy underline underline-offset-2"
              >
                <Link size={11} />
                View payment link
              </a>
            )}
          </div>

          {/* Link update form */}
          <form
            onSubmit={handleSubmit((v) => updateLinksMutation.mutate(v))}
            noValidate
            className="space-y-3 pt-2 border-t border-orayn-mid"
          >
            <p className="text-xs text-orayn-gray">
              Add or update Paystack links below. Leave blank to keep existing
              links.
            </p>
            <CopyLinkField
              id="payment60Link"
              label="60% Upfront — Paystack link"
              description="Paste the Paystack link for the 60% upfront payment."
              fieldName="payment60Link"
              register={register("payment60Link")}
              watch={watch}
              error={errors.payment60Link?.message}
            />
            <CopyLinkField
              id="payment40Link"
              label="40% Balance — Paystack link"
              description="Paste the Paystack link for the 40% delivery balance."
              fieldName="payment40Link"
              register={register("payment40Link")}
              watch={watch}
              error={errors.payment40Link?.message}
            />
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary"
                disabled={isPending}
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="btn-primary flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Update Links"
                )}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    );
  }

  // ── New deal close view — original layout preserved exactly ─────────────
  return (
    <Modal open={open} onClose={handleClose} title="Close Deal" size="md">
      <div className="space-y-4">
        {/* Lead summary — identical to original */}
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
              Listed range:{" "}
              <span className="font-semibold text-orayn-text">
                {lead.price_range ?? "—"}
              </span>
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit((v) => closeDealMutation.mutate(v))}
          noValidate
          className="space-y-4"
        >
          {/* Deal amount — identical to original */}
          <div>
            <label
              htmlFor="dealAmount"
              className="block text-sm font-semibold text-orayn-text mb-1.5"
            >
              Agreed deal amount (NGN)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orayn-gray text-sm font-semibold">
                ₦
              </span>
              <input
                id="dealAmount"
                type="number"
                min="1"
                step="1000"
                {...register("dealAmount")}
                className={`input-field pl-7 ${errors.dealAmount ? "input-error" : ""}`}
                placeholder="e.g. 280000"
              />
            </div>
            {errors.dealAmount && (
              <p className="text-xs text-orayn-red mt-1">
                {errors.dealAmount.message}
              </p>
            )}
          </div>

          {/* Commission preview — identical to original */}
          {preview && (
            <div className="bg-orayn-green-bg border border-orayn-green/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-orayn-green" />
                <p className="text-xs font-bold text-orayn-green">
                  Commission Preview
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-orayn-gray">Rate</p>
                  <p className="font-sora text-base font-bold text-orayn-navy leading-tight">
                    {preview.rate === 0.3 ? "30%" : "25%"}
                    {preview.rate === 0.3 && (
                      <span className="ml-1 badge bg-orayn-gold text-orayn-dark text-xs">
                        Above range
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-orayn-gray">Your commission</p>
                  <p className="font-sora text-base font-bold text-orayn-green leading-tight">
                    {formatNairaDirect(preview.amount)}
                  </p>
                </div>
              </div>
              {upfront60 !== null && (
                <div className="mt-2 pt-2 border-t border-orayn-green/20 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-orayn-gray">60% upfront due</p>
                    <p className="text-sm font-semibold text-orayn-text">
                      {formatNairaDirect(upfront60)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-orayn-gray">40% on delivery</p>
                    <p className="text-sm font-semibold text-orayn-text">
                      {formatNairaDirect(
                        Math.round(Number(dealAmountRaw) * 0.4),
                      )}
                    </p>
                  </div>
                </div>
              )}
              {preview.rate === 0.3 && (
                <div className="flex items-start gap-1.5 mt-2 text-xs text-orayn-amber">
                  <Info size={11} className="flex-shrink-0 mt-0.5" />
                  Deal exceeds listed range — 30% rate applies.
                </div>
              )}
            </div>
          )}

          {/* Two link fields replacing the original single paystackLink field */}
          <CopyLinkField
            id="payment60Link"
            label="60% Upfront — Paystack link"
            description="Paste the Paystack link for the 60% upfront payment. Saved to the deal record."
            fieldName="payment60Link"
            register={register("payment60Link")}
            watch={watch}
            error={errors.payment60Link?.message}
          />
          <CopyLinkField
            id="payment40Link"
            label="40% Balance — Paystack link"
            description="Paste the Paystack link for the 40% delivery balance. Can be added now or later."
            fieldName="payment40Link"
            register={register("payment40Link")}
            watch={watch}
            error={errors.payment40Link?.message}
          />

          {/* Actions — identical to original */}
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
              disabled={closeDealMutation.isPending || !preview}
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
