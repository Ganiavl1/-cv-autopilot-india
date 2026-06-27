# CV Autopilot — India (₹99 / UPI via Razorpay)

Pay-per-download AI CV generator for the Indian market.
Free watermarked preview → pay ₹99 via UPI → watermark removed → download PDF.
Theme: "minimal gold rule" — ivory paper, marigold accent, warm ink, gold hairline, serif headline.

## Files
```
index.html              frontend (Razorpay Checkout, UPI-first)
api/generate.js         Anthropic call (claude-sonnet-4-6), key server-side
api/order.js            creates a Razorpay order; PRICE IS FIXED HERE (₹99 = 9900 paise)
api/verify.js           HMAC-SHA256 signature verification (the real unlock gate)
legal/refund.html       Refund & Cancellation Policy
legal/privacy.html      Privacy Policy
legal/terms.html        Terms & Conditions
vercel.json             clean routing
```
No npm dependencies. Native `fetch` + Node `crypto` (Node 18+/20 on Vercel).

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | same place — keep secret |

> Razorpay gives **Test** keys instantly and **Live** keys after KYC is approved.
> Build and test the whole flow today with Test keys; switch to Live once activated.

## Deploy
1. Create a GitHub repo. Upload `index.html` and `vercel.json`.
2. **Create the api + legal files manually** — GitHub's web uploader silently drops folders.
   Use **Add file → Create new file**, type the full path (e.g. `api/generate.js`,
   `legal/refund.html`) so the folder is auto-created, paste, commit. Repeat for each.
3. Import the repo in Vercel → add the 3 env vars → Deploy.
4. (Optional) Add `cv-in.autopilotdollar.com` in Vercel; CNAME → `cname.vercel-dns.com`
   in Cloudflare (proxy = grey / DNS-only).

## Change the price (keep all 3 in sync)
- `PRICE_PAISE` in `api/order.js`
- the `=== 9900` amount check in `api/verify.js`
- the ₹99 labels in `index.html`

## Going-live checklist
- [ ] Razorpay KYC approved — PAN name **must match** bank account name exactly
- [ ] Test keys swapped for Live keys in Vercel
- [ ] Refund + Privacy + Terms pages live and linked (already in `legal/`) — Razorpay requires these
- [ ] One real ₹99 UPI payment tested end-to-end

## Razorpay individual-seller notes
- Individual / sole proprietor is a supported business type (personal PAN + Aadhaar + bank).
- No GST needed — tick "I do not have a GSTIN" (you only lose input-tax-credit on fees).
- A savings account is fine for sole proprietors; Razorpay does a ₹1 penny-drop test.
