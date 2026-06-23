"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { Modal } from "@/components/ui/modal";
import type { Lead } from "@/types/supabase";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";

interface FollowUpModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  agentCode: string | null;
}

// ── Quick-pick options — covers what agents told you they actually hear ─────
const QUICK_OPTIONS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 2 days", days: 2 },
  { label: "In 1 week", days: 7 },
  { label: "In 2 weeks", days: 14 },
  { label: "In 1 month", days: 30 },
  { label: "In 2 months", days: 60 },
] as const;

const schema = z.object({
  followUpDate: z.string().min(1, "Choose a date"),
  followUpNote: z
    .string()
    .max(280, "Keep the note under 280 characters")
    .optional(),
});

type FormValues = z.infer<typeof schema>;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function FollowUpModal({
  open,
  onClose,
  lead,
  agentCode,
}: FollowUpModalProps) {
  const queryClient = useQueryClient();
  const [selectedQuickDays, setSelectedQuickDays] = useState<number | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      followUpDate: lead.follow_up_date
        ? toDateInputValue(new Date(lead.follow_up_date))
        : "",
      followUpNote: lead.follow_up_note ?? "",
    },
  });

  const noteValue = watch("followUpNote") ?? "";

  function pickQuickOption(days: number) {
    setSelectedQuickDays(days);
    const d = new Date();
    d.setDate(d.getDate() + days);
    setValue("followUpDate", toDateInputValue(d), { shouldValidate: true });
  }

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!agentCode) throw new Error("No agent session found");
      const supabase = createSupabaseBrowserClient();
      const isoDate = new Date(`${values.followUpDate}T09:00:00`).toISOString();

      const { error } = await supabase
        .from("leads")
        .update({
          follow_up_date: isoDate,
          follow_up_note: values.followUpNote?.trim() || null,
          follow_up_set_by: agentCode,
          follow_up_set_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      if (error) throw error;

      await supabase.from("activity_log").insert({
        agent_id: agentCode,
        lead_id: lead.id,
        action: "stage_updated",
        metadata: {
          follow_up_scheduled: true,
          follow_up_date: isoDate,
          note: values.followUpNote?.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Follow-up scheduled", {
        description: `You will see this lead in Follow-ups Due on the date you chose.`,
      });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups-due"] });
      reset();
      setSelectedQuickDays(null);
      onClose();
    },
    onError: (err: Error) => {
      toast.error("Failed to schedule follow-up", { description: err.message });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("leads")
        .update({
          follow_up_date: null,
          follow_up_note: null,
          follow_up_set_by: null,
          follow_up_set_at: null,
        })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up cleared");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups-due"] });
      reset();
      onClose();
    },
    onError: (err: Error) => {
      toast.error("Failed to clear follow-up", { description: err.message });
    },
  });

  function handleClose() {
    if (mutation.isPending || clearMutation.isPending) return;
    reset();
    setSelectedQuickDays(null);
    onClose();
  }

  const hasExistingFollowUp = !!lead.follow_up_date;
  const isPending = mutation.isPending || clearMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule Follow-up"
      size="md"
    >
      <div className="space-y-4">
        {/* Lead summary */}
        <div className="bg-orayn-light rounded-lg p-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-orayn-gray">
            Business
          </p>
          <p className="font-sora text-sm font-bold text-orayn-navy leading-snug">
            {lead.business_name}
          </p>
          <p className="text-xs text-orayn-gray">
            Use this when a business asks you to reach back later instead of
            marking the lead as Lost. The lead keeps its current stage and
            reappears in your Follow-ups Due list on the date you choose.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          noValidate
          className="space-y-4"
        >
          {/* Quick options */}
          <div>
            <label className="block text-sm font-semibold text-orayn-text mb-2">
              When should you follow up?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {QUICK_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => pickQuickOption(opt.days)}
                  className={`text-xs font-semibold py-2 px-2 rounded-lg border transition-colors ${
                    selectedQuickDays === opt.days
                      ? "border-orayn-navy bg-orayn-navy text-white"
                      : "border-orayn-mid text-orayn-text hover:border-orayn-navy"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exact date */}
          <div>
            <label
              htmlFor="followUpDate"
              className="block text-sm font-semibold text-orayn-text mb-1.5"
            >
              Or choose an exact date
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orayn-gray">
                <CalendarClock size={15} />
              </span>
              <input
                id="followUpDate"
                type="date"
                min={toDateInputValue(new Date())}
                {...register("followUpDate")}
                onChange={(e) => {
                  setSelectedQuickDays(null);
                  register("followUpDate").onChange(e);
                }}
                className={`input-field pl-9 ${errors.followUpDate ? "input-error" : ""}`}
              />
            </div>
            {errors.followUpDate && (
              <p className="text-xs text-orayn-red mt-1">
                {errors.followUpDate.message}
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label
              htmlFor="followUpNote"
              className="block text-sm font-semibold text-orayn-text mb-1.5"
            >
              Note{" "}
              <span className="text-orayn-gray font-normal">(optional)</span>
            </label>
            <textarea
              id="followUpNote"
              rows={3}
              {...register("followUpNote")}
              placeholder='e.g. "Owner said to call back after Ramadan" or "Wants to see demo before deciding"'
              className={`input-field resize-none ${errors.followUpNote ? "input-error" : ""}`}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.followUpNote ? (
                <p className="text-xs text-orayn-red">
                  {errors.followUpNote.message}
                </p>
              ) : (
                <span />
              )}
              <p className="text-xs text-orayn-gray">{noteValue.length}/280</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            {hasExistingFollowUp ? (
              <button
                type="button"
                onClick={() => clearMutation.mutate()}
                disabled={isPending}
                className="text-xs font-semibold text-orayn-red hover:underline disabled:opacity-50 text-left sm:text-center"
              >
                Clear follow-up
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !agentCode}
                className="btn-primary flex items-center gap-2"
              >
                {mutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Schedule Follow-up"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
