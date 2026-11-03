import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase-server";
import { createCheckoutSession } from "@/lib/payments/bachs";

type Stage = "60" | "40";

// A hosted checkout link is only valid for a limited time. Re-use a recent link,
// create a fresh one when it is older than this.
const LINK_REUSE_MS = 20 * 60 * 60 * 1000;

/**
 * POST /api/payments/bachs/checkout   { dealId, stage: "60" | "40" }
 * Creates (or returns the existing) Bachs payment link for one instalment.
 * The amount always comes from the database, never from the browser.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { dealId?: string; stage?: Stage; forceNew?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { dealId, stage } = body;
  if (!dealId || (stage !== "60" && stage !== "40")) {
    return NextResponse.json({ error: "dealId and stage (60 or 40) are required" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const isAdmin = user.app_metadata?.role === "admin";

  const { data: deal, error: dealError } = await service
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (dealError || !deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  // Only the deal's own agent (or an admin) may create links
  if (!isAdmin) {
    const { data: agent } = await service
      .from("agents")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!agent || agent.id !== deal.agent_id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  const confirmed = stage === "60" ? deal.payment_60_confirmed : deal.payment_40_confirmed;
  if (confirmed) {
    return NextResponse.json({ error: "This instalment has already been paid" }, { status: 409 });
  }
  if (stage === "40" && !deal.payment_60_confirmed) {
    return NextResponse.json(
      { error: "The 40% balance can only be requested after the 60% upfront payment is received" },
      { status: 409 },
    );
  }

  const existingLink = stage === "60" ? deal.payment_60_link : deal.payment_40_link;
  const createdAt = stage === "60" ? deal.payment_60_link_created_at : deal.payment_40_link_created_at;
  if (
    existingLink &&
    !body.forceNew &&
    createdAt &&
    Date.now() - new Date(createdAt).getTime() < LINK_REUSE_MS
  ) {
    return NextResponse.json({ url: existingLink, reused: true });
  }

  const amountCents = stage === "60" ? deal.payment_60_amount : deal.payment_40_amount;
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: "Deal has no amount for this instalment" }, { status: 400 });
  }

  const { data: lead } = await service
    .from("leads")
    .select("id, business_name, email")
    .eq("id", deal.lead_id)
    .maybeSingle();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  try {
    const session = await createCheckoutSession({
      amountCents,
      dealId: deal.id,
      leadId: deal.lead_id,
      stage,
      businessName: lead?.business_name ?? "Website project",
      successUrl: `${appUrl}/payment-received`,
      customerEmail: lead?.email ?? null,
      idempotencyKey: `${deal.id}-${stage}-${Math.floor(Date.now() / 3_600_000)}`,
    });

    const nowIso = new Date().toISOString();
    const update =
      stage === "60"
        ? {
            payment_60_link: session.checkoutUrl,
            payment_60_checkout_id: session.checkoutId,
            payment_60_link_created_at: nowIso,
          }
        : {
            payment_40_link: session.checkoutUrl,
            payment_40_checkout_id: session.checkoutId,
            payment_40_link_created_at: nowIso,
          };

    const { error: updateError } = await service.from("deals").update(update).eq("id", deal.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ url: session.checkoutUrl });
  } catch (err) {
    console.error("[bachs] checkout creation failed:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Could not create the payment link" },
      { status: 502 },
    );
  }
}
