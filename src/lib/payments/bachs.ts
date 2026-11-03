/* eslint-disable @typescript-eslint/no-explicit-any -- payment-provider payloads are untyped JSON */
import crypto from "crypto";

/**
 * Bachs (bachs.io) payments: hosted checkout + signed webhooks.
 *
 * Amounts: the database stores USD cents; Bachs wants decimal strings ("450.00").
 * Never import this file from client components: it uses secret keys.
 */

const DEFAULT_BASE_URL = {
  sandbox: "https://sandbox-api.bachs.io",
  live: "https://api.bachs.io",
} as const;

export function getBachsConfig() {
  const apiKey = process.env.BACHS_API_KEY;
  const productId = process.env.BACHS_PRODUCT_ID;
  const env = process.env.BACHS_ENV === "live" ? "live" : "sandbox";
  const baseUrl = (process.env.BACHS_API_BASE_URL || DEFAULT_BASE_URL[env]).replace(/\/$/, "");
  return { apiKey, productId, env, baseUrl };
}

export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface CreateCheckoutInput {
  amountCents: number;
  dealId: string;
  leadId: string;
  stage: "60" | "40";
  businessName: string;
  successUrl: string;
  customerEmail?: string | null;
  idempotencyKey: string;
}

export interface CheckoutSession {
  checkoutId: string;
  checkoutUrl: string;
}

/**
 * Creates a one-off checkout session for a single instalment.
 * Uses ONE reusable Bachs product ("Orayn Website Build") and overrides its price
 * per checkout with the exact instalment amount.
 */
export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
  const { apiKey, productId, baseUrl } = getBachsConfig();
  if (!apiKey) throw new Error("BACHS_API_KEY is not set");
  if (!productId) throw new Error("BACHS_PRODUCT_ID is not set (create one product in your Bachs dashboard)");

  const body: Record<string, unknown> = {
    product_cart: [
      {
        product_id: productId,
        quantity: 1,
        pricing: { price_type: "fixed", amount: centsToDecimalString(input.amountCents) },
      },
    ],
    success_url: input.successUrl,
    metadata: {
      deal_id: input.dealId,
      lead_id: input.leadId,
      stage: input.stage,
      business_name: input.businessName,
    },
  };
  if (input.customerEmail) body.customer = { email: input.customerEmail };

  const res = await fetch(`${baseUrl}/v1/checkout-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    const msg = json?.error?.message ?? json?.message ?? text.slice(0, 300);
    throw new Error(`Bachs error ${res.status}: ${msg}`);
  }

  const data = json?.data ?? json;
  const checkoutUrl: string | undefined = data?.checkout_url ?? data?.url;
  const checkoutId: string | undefined = data?.checkout_id ?? data?.id;
  if (!checkoutUrl || !checkoutId) {
    throw new Error("Bachs response did not include a checkout URL and ID");
  }
  return { checkoutId, checkoutUrl };
}

/**
 * Verifies a Bachs webhook.
 *
 * Scheme (from Bachs's docs): HMAC-SHA256 over `${timestamp}.${rawBody}` using the
 * webhook signing secret (not the API key), with a 5-minute replay window.
 *   Preferred header: X-Bachs-Signature-V2   ->  "t=<unix>,v1=<signature>"
 *   Legacy headers:   X-Bachs-Timestamp + X-Bachs-Signature
 * The raw body must be the exact bytes received (read with request.text()).
 */
export function verifyBachsSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  toleranceSeconds = 300,
): { ok: true } | { ok: false; reason: string } {
  let timestamp: string | null = null;
  const candidates: string[] = [];

  const v2 = headers.get("x-bachs-signature-v2");
  if (v2) {
    for (const part of v2.split(",")) {
      const [k, ...rest] = part.trim().split("=");
      const v = rest.join("=");
      if (k === "t") timestamp = v;
      if (k === "v1" && v) candidates.push(v);
    }
  }
  if (!timestamp || candidates.length === 0) {
    timestamp = headers.get("x-bachs-timestamp");
    const legacy = headers.get("x-bachs-signature");
    if (legacy) candidates.push(legacy.replace(/^v1=/, "").replace(/^sha256=/, ""));
  }
  if (!timestamp || candidates.length === 0) {
    return { ok: false, reason: "Missing signature headers" };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "Bad timestamp" };
  const nowSec = Math.floor(Date.now() / 1000);
  // Accept seconds or milliseconds
  const tsSec = tsNum > 1e12 ? Math.floor(tsNum / 1000) : tsNum;
  if (Math.abs(nowSec - tsSec) > toleranceSeconds) {
    return { ok: false, reason: "Timestamp outside the allowed window" };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const hex = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const b64 = crypto.createHmac("sha256", secret).update(signedPayload).digest("base64");

  const safeEqual = (a: string, b: string) => {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  };

  for (const c of candidates) {
    if (safeEqual(c.toLowerCase(), hex) || safeEqual(c, b64)) return { ok: true };
  }
  return { ok: false, reason: "Signature mismatch" };
}
