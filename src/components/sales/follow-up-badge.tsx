import { CalendarClock } from "lucide-react";

interface FollowUpBadgeProps {
  followUpDate: string | null;
  followUpNote: string | null;
}

/**
 * Shows a small follow-up indicator next to the lead status.
 * Color logic:
 *   - Red:   follow-up date has passed (overdue — needs action today)
 *   - Amber: follow-up date is today or within the next 2 days (due soon)
 *   - Gray:  follow-up date is further out (scheduled, no urgency yet)
 */
export function FollowUpBadge({
  followUpDate,
  followUpNote,
}: FollowUpBadgeProps) {
  if (!followUpDate) return null;

  const due = new Date(followUpDate);
  const now = new Date();
  const diffDays = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  let colorClass = "bg-orayn-light text-orayn-gray";
  let label = "";

  if (diffDays < 0) {
    colorClass = "bg-orayn-red-bg text-orayn-red";
    label = `Overdue ${Math.abs(diffDays)}d`;
  } else if (diffDays === 0) {
    colorClass = "bg-orayn-amber-bg text-orayn-amber";
    label = "Due today";
  } else if (diffDays <= 2) {
    colorClass = "bg-orayn-amber-bg text-orayn-amber";
    label = `Due in ${diffDays}d`;
  } else {
    label = due.toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Lagos",
    });
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${colorClass}`}
      title={followUpNote ?? undefined}
    >
      <CalendarClock size={10} />
      {label}
    </span>
  );
}
