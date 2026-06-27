// api/verify.js — verifies a Razorpay payment via HMAC-SHA256 signature.
// This is the real security gate: a faked frontend "success" cannot unlock anything
// because only the server holds RAZORPAY_KEY_SECRET. Native crypto, no npm deps.

import crypto from "crypto";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(500).json({ error: "Payment not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, error: "Missing payment fields" });
    }

    // Razorpay signs: order_id + "|" + payment_id  with the key secret.
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    // Constant-time compare to avoid timing attacks.
    const a = Buffer.from(expected);
    const b = Buffer.from(razorpay_signature);
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!valid) {
      return res.status(400).json({ ok: false, error: "Signature verification failed" });
    }

    // Optional hardening: re-fetch the payment from Razorpay and confirm it is
    // actually captured and for the right amount. Costs one extra API call but
    // closes the (already cryptographically-closed) loop completely.
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (keyId) {
      try {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        const pr = await fetch(
          `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
          { headers: { Authorization: `Basic ${auth}` } }
        );
        const p = await pr.json();
        if (pr.ok) {
          const captured = p.status === "captured" || p.status === "authorized";
          const rightAmount = Number(p.amount) === 9900; // ₹99
          if (!captured || !rightAmount) {
            return res.status(400).json({ ok: false, error: "Payment not valid" });
          }
        }
      } catch (e) {
        // If the re-fetch fails (network), the HMAC check above already passed,
        // so we still honor the unlock rather than punish a paying customer.
        console.warn("verify.js payment re-fetch failed, proceeding on HMAC:", e);
      }
    }

    // Issue a short unlock token (just a marker; the real proof was the signature).
    const token = crypto
      .createHmac("sha256", keySecret)
      .update(`unlock:${razorpay_payment_id}`)
      .digest("hex")
      .slice(0, 32);

    return res.status(200).json({ ok: true, token, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error("verify.js error:", err);
    return res.status(500).json({ ok: false, error: "Server error verifying payment" });
  }
}
