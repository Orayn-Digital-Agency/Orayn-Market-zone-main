/**
 * MONEY: every amount in the database is USD CENTS (an integer). 75000 = $750.00.
 * Use these helpers at the edges only (display, and converting what a person types).
 */
export function formatUSD(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

/** Converts dollars typed by a person (e.g. 1250.5) to integer cents. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Converts integer cents to a plain dollar number (for input fields). */
export function centsToDollars(cents: number): number {
  return cents / 100
}

/**
 * Formats a UTC ISO date string for display in WAT (Africa/Lagos, UTC+1).
 */
export function formatDateWAT(
  isoString: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }
  return new Intl.DateTimeFormat('en-NG', defaultOptions).format(
    new Date(isoString)
  )
}

/**
 * Returns a relative time string like "2h ago", "just now", "3d ago".
 */
export function timeAgo(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return formatDateWAT(isoString, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Returns the current YYYY-MM string in WAT.
 */
export function currentMonthWAT(): string {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .split('/')
    .reverse()
    .join('-')
}

/** Agents earn 20% of a closed deal... */
export const COMMISSION_BASE_RATE = 0.2
/** ...or 25% when the deal closes ABOVE the set price. */
export const COMMISSION_BONUS_RATE = 0.25

/**
 * 25% if the deal is above the set price, otherwise 20%.
 * (The database enforces this too; this is for the live preview in the UI.)
 */
export function getCommissionRate(
  dealCents: number,
  setPriceCents: number
): typeof COMMISSION_BASE_RATE | typeof COMMISSION_BONUS_RATE {
  return dealCents > setPriceCents ? COMMISSION_BONUS_RATE : COMMISSION_BASE_RATE
}

export function calcCommissionCents(dealCents: number, setPriceCents: number): number {
  return Math.round(dealCents * getCommissionRate(dealCents, setPriceCents))
}

/** Payment is collected 60% upfront, 40% on delivery. */
export function splitPayments(dealCents: number): { upfront: number; balance: number } {
  const upfront = Math.round(dealCents * 0.6)
  return { upfront, balance: dealCents - upfront }
}
