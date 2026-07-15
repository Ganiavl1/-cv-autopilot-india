// api/generate.js — calls Anthropic server-side, then returns ONLY a short teaser
// of the CV. The FULL CV is encrypted (AES-256-GCM) with a server-side key and
// returned as an opaque blob. The browser cannot read it. /api/reveal.js decrypts
// it only after a valid Razorpay payment signature. No DB, no npm deps.

import crypto from "crypto";

const MODEL = "claude-sonnet-4-6";

// Derive a stable 32-byte key from a server secret. Uses CV_SECRET if set,
// otherwise falls back to RAZORPAY_KEY_SECRET so you don't need a new env var.
function getKey() {
  const base = process.env.CV_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (!base) return null;
  return crypto.createHash("sha256").update(String(base)).digest(); // 32 bytes
}

function encrypt(plaintext) {
  const key = getKey();
  if (!key) throw new Error("Encryption not configured");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // pack iv + tag + ciphertext into one base64 string
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

// Build a teaser: keep whole HTML blocks until we've shown ~40% of the CV,
// always cutting on a tag boundary so the markup stays valid.
function makeTeaser(html) {
  const blocks = html.match(/<(h2|h3|p|ul|ol|div)[\s\S]*?<\/\1>/gi) || [];
  if (!blocks.length) {
    // Fallback: no recognisable blocks — show a small slice of text only.
    return html.slice(0, Math.floor(html.length * 0.35));
  }
  const budget = Math.floor(html.length * 0.4);
  let out = "";
  for (const b of blocks) {
    if (out.length + b.length > budget && out.length > 0) break;
    out += b;
  }
  // Always keep at least the first block (name/heading) so it looks real.
  if (!out) out = blocks[0];
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI not configured" });
  if (!getKey()) return res.status(500).json({ error: "Server not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const raw = (body.career || "").toString().trim();
    const role = (body.role || "").toString().trim();

    if (raw.length < 30) {
      return res.status(400).json({ error: "Please paste a bit more about your career." });
    }
    if (raw.length > 8000) {
      return res.status(400).json({ error: "That's too long — please trim to the essentials." });
    }

    const system = `You are an expert Indian resume writer who builds ATS-friendly CVs that clear automated screening at Indian companies and MNCs hiring in India.

Rules:
- Output a single clean, professional CV in well-structured HTML (use <h2>, <h3>, <ul>, <li>, <p>, <strong>). Do NOT include <html>, <head>, <body>, markdown fences, or commentary — only the CV body HTML.
- Follow Indian resume conventions: Name as a heading, then a contact line (phone, email, city, LinkedIn if given). A 2-3 line professional summary. Then Skills, Work Experience (reverse chronological, with strong action-verb bullets and quantified impact), Education, and optional sections (Certifications, Projects, Languages) only if the input supports them.
- Use Indian English spelling and phrasing. Keep currency/figures as given.
- NEVER invent employers, dates, degrees, certifications, or metrics not present or clearly implied in the input. If something is missing, omit it gracefully.
- Make bullets results-oriented and ATS-keyword-rich for the target role.
- Keep it to a realistic one-page length unless the experience clearly warrants two.`;

    const userMsg = `Target role: ${role || "(infer the most suitable role from the content)"}

Raw career information:
"""${raw}"""

Write the polished, ATS-optimized CV now as HTML body only.`;

    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await ar.json();

    if (!ar.ok) {
      console.error("Anthropic error:", data);
      return res.status(502).json({ error: "AI generation failed. Please try again." });
    }

    const cvHtml = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```html|```/g, "")
      .trim();

    if (!cvHtml) return res.status(502).json({ error: "Empty result. Please try again." });

    // The browser gets ONLY the teaser + an unreadable encrypted blob.
    const preview = makeTeaser(cvHtml);
    const locked = encrypt(cvHtml);

    return res.status(200).json({ preview, locked });
  } catch (err) {
    console.error("generate.js error:", err);
    return res.status(500).json({ error: "Server error generating CV." });
  }
}
