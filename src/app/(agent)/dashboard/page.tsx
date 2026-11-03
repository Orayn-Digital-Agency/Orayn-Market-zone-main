'use client'

import { useQuery } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'
import { MetricCard } from '@/components/dashboard/metric-card'
import { MetricCardSkeleton } from '@/components/ui/skeleton'
import { QuotaBar } from '@/components/dashboard/quota-bar'
import { ActivityLog } from '@/components/dashboard/activity-log'
import { Leaderboard } from '@/components/dashboard/leaderboard'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { formatUSD, currentMonthWAT } from '@/lib/format'
import { useAgentSession } from '@/stores/agent-session'
import {
  DollarSign,
  TrendingUp,
  Award,
  Percent,
  Clock,
  Layers,
} from 'lucide-react'

interface DashboardMetrics {
  earningsThisMonth: number
  closedThisMonth: number
  allTime: number
  pending: number
  claimed: number
  closeRate: number
  monthStr: string
  isRamp: boolean
  floor: number
  agentCode: string
}

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = createSupabaseBrowserClient()

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) throw new Error('Not authenticated')
  const user = authData.user

  // Try to find agent record — use maybeSingle to avoid throwing on no result
  const { data: agentRows, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('auth_user_id', user.id)
    .limit(1)

  if (agentError) {
    console.error('Agent lookup error:', agentError)
    throw new Error('Database error: ' + agentError.message)
  }

  const agent = agentRows?.[0] ?? null
  if (!agent) {
    // Log for debugging — remove once fixed
    console.error('Agent not found. User ID from session:', user.id, '| User email:', user.email)
    throw new Error('Agent record not found')
  }

  const monthStr = currentMonthWAT()

  const [dealsThisMonth, allTimeDeals, pendingPayout, claimedLeads, demosSent] =
    await Promise.all([
      supabase
        .from('deals')
        .select('commission_amount', { count: 'exact' })
        .eq('agent_id', agent.id)
        .eq('payout_month', monthStr),
      supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id),
      supabase
        .from('deals')
        .select('commission_amount')
        .eq('agent_id', agent.id)
        .eq('payout_status', 'pending'),
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', agent.agent_code),
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', agent.agent_code)
        .in('status', ['demo_sent', 'negotiating', 'closed']),
    ])

  const closedThisMonth = dealsThisMonth.count ?? 0
  const earningsThisMonth = (dealsThisMonth.data ?? []).reduce(
    (sum: number, d: { commission_amount: number | null }) => sum + (d.commission_amount ?? 0),
    0,
  )
  const allTime = allTimeDeals.count ?? 0
  const pending = (pendingPayout.data ?? []).reduce(
    (sum: number, d: { commission_amount: number | null }) => sum + (d.commission_amount ?? 0),
    0,
  )
  const claimed = claimedLeads.count ?? 0
  const demos = demosSent.count ?? 0
  const closeRate = demos > 0 ? Math.round((closedThisMonth / demos) * 100) : 0

  const createdAt = new Date(agent.created_at)
  const daysSince = Math.floor((Date.now() - createdAt.getTime()) / 86400000)
  const isRamp = daysSince <= 90
  const floor = isRamp ? 1 : 2

  return {
    earningsThisMonth,
    closedThisMonth,
    allTime,
    pending,
    claimed,
    closeRate,
    monthStr,
    isRamp,
    floor,
    agentCode: agent.agent_code,
  }
}

export default function DashboardPage() {
  const { agentCode: storeAgentCode, agentId, role } = useAgentSession()

  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: fetchDashboardMetrics,
    staleTime: 30 * 1000,
  })

  const displayCode = metrics?.agentCode ?? storeAgentCode ?? (role === 'admin' ? 'ADMIN' : '—')
  const isRamp = metrics?.isRamp ?? true
  const floor = metrics?.floor ?? 1

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="font-sora text-lg font-semibold text-orayn-navy mb-2">
          Failed to load dashboard
        </p>
        <p className="text-sm text-orayn-gray">
          {(error as Error).message || 'Please refresh the page.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-sora text-2xl sm:text-3xl font-bold text-orayn-navy">
          Dashboard
        </h1>
        <p className="text-sm text-orayn-gray mt-1 flex items-center gap-2">
          <span>{displayCode}</span>
          {isRamp && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orayn-amber-bg text-orayn-amber">
              Ramp period
            </span>
          )}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <MetricCard
              title="Earnings This Month"
              value={formatUSD(metrics?.earningsThisMonth ?? 0)}
              icon={DollarSign}
              iconBg="bg-orayn-green-bg"
              iconColor="text-orayn-green"
              subtitle="Commission earned"
            />
            <MetricCard
              title="Deals This Month"
              value={String(metrics?.closedThisMonth ?? 0)}
              icon={TrendingUp}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              subtitle="of 5 target"
            />
            <MetricCard
              title="All-Time Deals"
              value={String(metrics?.allTime ?? 0)}
              icon={Award}
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
              subtitle="Since joining"
            />
            <MetricCard
              title="Close Rate"
              value={`${metrics?.closeRate ?? 0}%`}
              icon={Percent}
              iconBg="bg-orayn-amber-bg"
              iconColor="text-orayn-amber"
              subtitle="Closed / demos sent"
            />
            <MetricCard
              title="Pending Payout"
              value={formatUSD(metrics?.pending ?? 0)}
              icon={Clock}
              iconBg="bg-orayn-light"
              iconColor="text-orayn-navy"
              subtitle="Paid on last working day"
            />
            <MetricCard
              title="Leads Claimed"
              value={String(metrics?.claimed ?? 0)}
              icon={Layers}
              iconBg="bg-orayn-light"
              iconColor="text-orayn-navy"
              subtitle="Currently assigned to you"
            />
          </>
        )}
      </div>

      {/* Quota bar */}
      <ErrorBoundary>
        <QuotaBar
          current={metrics?.closedThisMonth ?? 0}
          target={5}
          floor={floor}
          loading={isLoading}
        />
      </ErrorBoundary>

      {/* Activity + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary>
          <ActivityLog agentId={agentId ?? ''} />
        </ErrorBoundary>
        <ErrorBoundary>
          <Leaderboard currentAgentCode={displayCode} />
        </ErrorBoundary>
      </div>
    </div>
  )
}
