// @ts-nocheck
import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase-server";
import { formatUSD } from "@/lib/format";

/**
 * Monthly payout summary.
 * A deal only counts toward a payout once the client has paid BOTH instalments
 * (60% upfront + 40% on delivery), so commission is never paid on money we have
 * not received. This rule lives in the monthly_payout_summary() database function.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json(
      { error: "month parameter required" },
      { status: 400 },
    );
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("monthly_payout_summary", {
    p_month: month,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

/**
 * Mark an agent's month as paid.
 * The total is recomputed here from the database; the amount sent by the browser
 * is ignored, and only fully-paid, still-pending deals are included.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = (await request.json()) as { agent_id: string; month: string };
  if (!body?.agent_id || !body?.month) {
    return NextResponse.json(
      { error: "agent_id and month are required" },
      { status: 400 },
    );
  }

  const service = createSupabaseServiceClient();

  const { data: eligible, error: dealsError } = await service
    .from("deals")
    .select("id, commission_amount")
    .eq("agent_id", body.agent_id)
    .eq("payout_month", body.month)
    .eq("payout_status", "pending")
    .eq("payment_60_confirmed", true)
    .eq("payment_40_confirmed", true);

  if (dealsError) {
    return NextResponse.json({ error: dealsError.message }, { status: 500 });
  }
  if (!eligible || eligible.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to pay: this agent has no deals for this month where the client has paid in full.",
      },
      { status: 400 },
    );
  }

  const total = eligible.reduce((sum, d) => sum + (d.commission_amount ?? 0), 0);

  const { error } = await service.from("payouts").upsert(
    {
      agent_id: body.agent_id,
      month: body.month,
      total_commission: total,
      status: "paid",
      paid_at: new Date().toISOString(),
    },
    { onConflict: "agent_id,month" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await service
    .from("deals")
    .update({ payout_status: "paid" })
    .in(
      "id",
      eligible.map((d) => d.id),
    );

  await service.from("notifications").insert({
    agent_id: body.agent_id,
    type: "payout_processed",
    title: "Payout Processed",
    message: `Your commission for ${body.month} has been paid. Total: ${formatUSD(total)}.`,
    is_read: false,
  });

  return NextResponse.json({ success: true, total_commission: total });
}
