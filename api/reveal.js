// api/reveal.js — the paywall. Verifies the Razorpay payment signature (HMAC-SHA256)
// and ONLY then decrypts the locked CV blob and returns the full CV.
// Without a valid payment the full text is never sent to the browser.

import crypto from "crypto";

const PRICE_PAISE = 9900; // ₹99

function getKey() {
  const base = process.env.CV_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (!base) return null;
  return crypto.createHash("sha256").update(String(base)).digest();
}

function decrypt(packedB64) {
  const key = getKey();
  if (!key) throw new Error("Encryption not configured");
  const packed = Buffer.from(packedB64, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ct = packed.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(500).json({ ok: false, error: "Payment not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, locked } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, error: "Missing payment fields" });
    }
    if (!locked) {
      return res.status(400).json({ ok: false, error: "Missing CV data" });
    }

    // 1) Verify the payment signature — this is the gate.
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(String(razorpay_signature));
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!valid) {
      return res.status(400).json({ ok: false, error: "Signature verification failed" });
    }

    // 2) Confirm with Razorpay that the payment is real, captured and ₹99.
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
          const rightAmount = Number(p.amount) === PRICE_PAISE;
          if (!captured || !rightAmount) {
            return res.status(400).json({ ok: false, error: "Payment not valid" });
          }
        }
      } catch (e) {
        // Network issue re-checking: the HMAC above already passed, so don't
        // punish a paying customer. Proceed.
        console.warn("reveal.js payment re-fetch failed, proceeding on HMAC:", e);
      }
    }

    // 3) Payment is good — decrypt and hand over the full CV.
    let cv;
    try {
      cv = decrypt(String(locked));
    } catch (e) {
      console.error("reveal.js decrypt failed:", e);
      return res.status(400).json({ ok: false, error: "Could not unlock this CV. Please contact support with your payment ID." });
    }

    return res.status(200).json({ ok: true, cv, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error("reveal.js error:", err);
    return res.status(500).json({ ok: false, error: "Server error unlocking CV." });
  }
}
