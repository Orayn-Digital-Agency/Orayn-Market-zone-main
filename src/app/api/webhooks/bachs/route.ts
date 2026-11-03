/* eslint-disable @typescript-eslint/no-explicit-any -- payment-provider payloads are untyped JSON */
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { verifyBachsSignature } from "@/lib/payments/bachs";
import { formatUSD } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Stage = "60" | "40";

const asString = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Bachs webhook receiver.  URL to register in the Bachs dashboard:
 *   https://<your-app-domain>/api/webhooks/bachs      (event: checkout.completed)
 *
 * Trust model: the request is accepted ONLY if its HMAC signature verifies against
 * BACHS_WEBHOOK_SECRET. The amount is never read from the webhook; we confirm the
 * instalment we created ourselves, so the money figures cannot be tampered with.
 */
export async function POST(request: Request) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[bachs-webhook] BACHS_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Signature must be checked against the EXACT raw body
  const rawBody = await request.text();
  const verification = verifyBachsSignature(rawBody, request.headers, secret);
  if (!verification.ok) {
    console.warn("[bachs-webhook] rejected:", verification.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type: string = event?.type ?? event?.event ?? "unknown";
  const eventId: string =
    asString(event?.id) ?? asString(event?.event_id) ?? `hash-${rawBody.length}-${Date.now()}`;

  const service = createSupabaseServiceClient();

  // Idempotency: Bachs retries. Record the event first; a duplicate is a no-op.
  const { error: dedupeError } = await service
    .from("payment_events")
    .insert({ event_id: eventId, event_type: type, payload: event });
  if (dedupeError) {
    if ((dedupeError as any).code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[bachs-webhook] could not record event:", dedupeError.message);
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  try {
    if (type !== "checkout.completed") {
      return NextResponse.json({ received: true, ignored: type });
    }

    const data = event?.data ?? event;
    const paid = data?.payment_status === "paid" || data?.status === "paid";
    if (!paid) {
      return NextResponse.json({ received: true, ignored: "not paid" });
    }

    // Find which deal/instalment this checkout belongs to
    const ids = [
      data?.checkout_id,
      data?.checkout_session_id,
      data?.session_id,
      data?.checkout?.id,
      data?.id,
    ]
      .map(asString)
      .filter((v): v is string => !!v);

    let deal: any = null;
    let stage: Stage | null = null;

    if (ids.length) {
      const r60 = await service.from("deals").select("*").in("payment_60_checkout_id", ids).maybeSingle();
      if (r60.data) {
        deal = r60.data;
        stage = "60";
      } else {
        const r40 = await service.from("deals").select("*").in("payment_40_checkout_id", ids).maybeSingle();
        if (r40.data) {
          deal = r40.data;
          stage = "40";
        }
      }
    }

    // Fallback: the metadata we attached when creating the checkout
    if (!deal) {
      const meta = data?.metadata ?? data?.checkout?.metadata ?? {};
      const dealId = asString(meta.deal_id);
      const metaStage = meta.stage === "60" || meta.stage === "40" ? (meta.stage as Stage) : null;
      if (dealId && metaStage) {
        const { data: d } = await service.from("deals").select("*").eq("id", dealId).maybeSingle();
        if (d) {
          deal = d;
          stage = metaStage;
        }
      }
    }

    if (!deal || !stage) {
      // Saved in payment_events for manual review. Return 200 so Bachs does not retry forever.
      console.error("[bachs-webhook] paid checkout did not match a deal:", JSON.stringify(event).slice(0, 2000));
      return NextResponse.json({ received: true, matched: false });
    }

    const alreadyConfirmed = stage === "60" ? deal.payment_60_confirmed : deal.payment_40_confirmed;
    if (alreadyConfirmed) {
      return NextResponse.json({ received: true, alreadyConfirmed: true });
    }

    const nowIso = new Date().toISOString();
    const update =
      stage === "60"
        ? {
            payment_60_confirmed: true,
            payment_60_confirmed_at: nowIso,
            payment_confirmed: true,
            payment_confirmed_at: nowIso,
          }
        : { payment_40_confirmed: true, payment_40_confirmed_at: nowIso };

    const { error: updateError } = await service.from("deals").update(update).eq("id", deal.id);
    if (updateError) throw new Error(updateError.message);

    // Tell the agent
    const { data: lead } = await service
      .from("leads")
      .select("business_name")
      .eq("id", deal.lead_id)
      .maybeSingle();
    const name = lead?.business_name ?? "your client";
    const amount = stage === "60" ? deal.payment_60_amount : deal.payment_40_amount;
    const fullyPaid = stage === "40" || (stage === "60" && deal.payment_40_confirmed);

    await service.from("notifications").insert({
      agent_id: deal.agent_id,
      type: "payment_confirmed",
      title: stage === "60" ? "Upfront payment received" : "Final payment received",
      message:
        `${name}: ${stage === "60" ? "60% upfront" : "40% balance"} payment of ${formatUSD(amount ?? 0)} received.` +
        (fullyPaid
          ? ` Paid in full: your ${formatUSD(deal.commission_amount)} commission is now eligible for payout.`
          : ""),
      is_read: false,
    });

    return NextResponse.json({ received: true, confirmed: stage });
  } catch (err) {
    // Remove the idempotency record so Bachs' retry can be processed
    await service.from("payment_events").delete().eq("event_id", eventId);
    console.error("[bachs-webhook] processing failed:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
