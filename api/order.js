// api/order.js — creates a Razorpay order. Price is fixed server-side so the
// client can never tamper with the amount. No npm deps; native fetch (Node 18+/20).

const PRICE_PAISE = 9900; // ₹99.00  (Razorpay works in paise)
const CURRENCY = "INR";

export default async function handler(req, res) {
  // CORS / preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({ error: "Payment not configured" });
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const receipt = "cv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

    const rp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: PRICE_PAISE,
        currency: CURRENCY,
        receipt,
        notes: { product: "CV Autopilot India" },
      }),
    });

    const data = await rp.json();

    if (!rp.ok) {
      console.error("Razorpay order error:", data);
      return res.status(502).json({ error: "Could not create payment order" });
    }

    // Only return what the frontend needs. keyId is publishable (safe client-side).
    return res.status(200).json({
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId, // razorpay key_id is meant to be public
    });
  } catch (err) {
    console.error("order.js error:", err);
    return res.status(500).json({ error: "Server error creating order" });
  }
}
