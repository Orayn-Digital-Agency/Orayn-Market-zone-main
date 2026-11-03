"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { Modal } from "@/components/ui/modal";
import type { Lead, LossReason } from "@/types/supabase";
import { toast } from "sonner";
import { dollarsToCents } from "@/lib/format";
import { XCircle } from "lucide-react";

interface FailedModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  agentId: string;
}

const LOSS_REASONS: { value: LossReason; label: string }[] = [
  { value: "price_too_high", label: "Price too high" },
  { value: "not_interested", label: "Not interested" },
  { value: "no_response", label: "No response" },
  { value: "went_with_competitor", label: "Went with a competitor" },
  { value: "other", label: "Other" },
];

const schema = z
  .object({
    lossReason: z.enum(
      [
        "price_too_high",
        "not_interested",
        "no_response",
        "went_with_competitor",
        "other",
      ],
      { errorMap: () => ({ message: "Select a reason" }) },
    ),
    lossReasonDetail: z
      .string()
      .max(280, "Keep this under 280 characters")
      .optional(),
    lossReasonPrice: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lossReason === "other" && !data.lossReasonDetail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lossReasonDetail"],
        message: "Tell us the actual reason so we can improve our approach",
      });
    }
    if (data.lossReason === "price_too_high") {
      const n = Number(data.lossReasonPrice);
      if (!data.lossReasonPrice || isNaN(n) || n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lossReasonPrice"],
          message: "Enter the amount the business said they wanted to pay",
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

export function FailedModal({
  open,
  onClose,
  lead,
  agentId,
}: FailedModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const selectedReason = watch("lossReason");

  const failMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createSupabaseBrowserClient();

      const update: {
        status: "lost";
        loss_reason: LossReason;
        loss_reason_detail: string | null;
        loss_reason_price: number | null;
      } = {
        status: "lost",
        loss_reason: values.lossReason,
        loss_reason_detail: null,
        loss_reason_price: null,
      };

      if (values.lossReason === "other") {
        update.loss_reason_detail = values.lossReasonDetail?.trim() || null;
      }
      if (values.lossReason === "price_too_high") {
        update.loss_reason_price = values.lossReasonPrice
          ? dollarsToCents(Number(values.lossReasonPrice))
          : null;
      }

      const { error: leadError } = await supabase
        .from("leads")
        .update(update)
        .eq("id", lead.id);
      if (leadError) throw leadError;

      await supabase.from("activity_log").insert({
        agent_id: agentId,
        lead_id: lead.id,
        action: "lost",
        metadata: {
          loss_reason: values.lossReason,
          loss_reason_detail: update.loss_reason_detail,
          loss_reason_price: update.loss_reason_price,
        },
      });
    },
    onSuccess: () => {
      toast.error("Lead marked as failed", {
        description: `${lead.business_name} has been archived.`,
      });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      reset();
      onClose();
    },
    onError: (err: Error) => {
      toast.error("Failed to update lead", { description: err.message });
    },
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Mark as Failed"
      maxWidth="max-w-sm"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 p-4 bg-orayn-red-bg rounded-lg">
          <XCircle size={20} className="text-orayn-red flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-orayn-red">
              {lead.business_name}
            </p>
            <p className="text-xs text-orayn-gray mt-0.5">
              This lead will be archived and removed from your active pipeline.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit((v) => failMutation.mutate(v))}
          noValidate
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="lossReason"
              className="block text-sm font-semibold text-orayn-text mb-1.5"
            >
              Reason for failure
            </label>
            <select
              id="lossReason"
              {...register("lossReason")}
              className={`input-field ${errors.lossReason ? "input-error" : ""}`}
              defaultValue=""
            >
              <option value="" disabled>
                Select a reason...
              </option>
              {LOSS_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {errors.lossReason && (
              <p className="text-xs text-orayn-red mt-1">
                {errors.lossReason.message}
              </p>
            )}
          </div>

          {/* Conditional: price field, only when "Price too high" is selected */}
          {selectedReason === "price_too_high" && (
            <div>
              <label
                htmlFor="lossReasonPrice"
                className="block text-sm font-semibold text-orayn-text mb-1.5"
              >
                What did they say they wanted to pay?
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orayn-gray text-sm font-semibold">
                  $
                </span>
                <input
                  id="lossReasonPrice"
                  type="number"
                  min="0"
                  step="50"
                  {...register("lossReasonPrice")}
                  className={`input-field pl-7 ${errors.lossReasonPrice ? "input-error" : ""}`}
                  placeholder="e.g. 500"
                />
              </div>
              {errors.lossReasonPrice && (
                <p className="text-xs text-orayn-red mt-1">
                  {errors.lossReasonPrice.message}
                </p>
              )}
              <p className="text-xs text-orayn-gray mt-1">
                Helps admin see if our pricing needs adjusting for this
                category.
              </p>
            </div>
          )}

          {/* Conditional: free-text detail, only when "Other" is selected */}
          {selectedReason === "other" && (
            <div>
              <label
                htmlFor="lossReasonDetail"
                className="block text-sm font-semibold text-orayn-text mb-1.5"
              >
                What actually happened?
              </label>
              <textarea
                id="lossReasonDetail"
                rows={3}
                {...register("lossReasonDetail")}
                placeholder="e.g. Business shut down, owner travelled indefinitely, wrong contact number..."
                className={`input-field resize-none ${errors.lossReasonDetail ? "input-error" : ""}`}
              />
              {errors.lossReasonDetail && (
                <p className="text-xs text-orayn-red mt-1">
                  {errors.lossReasonDetail.message}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
              disabled={failMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={failMutation.isPending}
              className="btn-danger flex items-center gap-2"
            >
              {failMutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Marking...
                </>
              ) : (
                "Mark as Failed"
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
