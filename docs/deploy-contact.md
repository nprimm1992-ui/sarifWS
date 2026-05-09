# Contact form and MailChannels (Cloudflare Pages)

The contact page and Praxis subscribe form **POST** JSON to [`functions/api/contact.js`](../functions/api/contact.js) (`/api/contact`), which sends mail via [MailChannels Email API](https://www.mailchannels.com/email-api/). **GET** on `/api/contact` returns **405** (method not allowed). API JSON responses use **`Cache-Control: no-store`**.

Payload shape: [MailChannels — personalizations / reply_to](https://docs.mailchannels.net/email-api/sending-email/personalizations/) (global or per-personalization `reply_to` is supported).

## 1. Domain Lockdown (required)

MailChannels rejects sends from Cloudflare unless your domain authorizes your Pages project.

1. In [Cloudflare Dashboard](https://dash.cloudflare.com/) go to **Workers & Pages** → your **Pages** project → **Overview**.
2. Copy **Your subdomain** (the `*.pages.dev` hostname shown for the project).
3. In **DNS** for `sarifconsulting.ai`, add a **TXT** record:
   - **Name:** `_mailchannels` (resolves as `_mailchannels.sarifconsulting.ai`)
   - **Content:** `v=mc1 cfid=<paste-your-subdomain>`  
     Example shape: `v=mc1 cfid=myproject-abc123.pages.dev` (use the exact value from the dashboard).

See MailChannels: [Domain Lockdown](https://support.mailchannels.com/hc/en-us/articles/16918954360845-Secure-your-domain-name-against-spoofing-with-Domain-Lockdown-) and [Sending from Cloudflare Workers](https://support.mailchannels.com/hc/en-us/articles/4565898358413-Sending-Email-from-Cloudflare-Workers-using-MailChannels-Send-API).

If MailChannels support gives you an **`auth=`** identifier (e.g. after Email API signup), append or combine per their instructions (e.g. `v=mc1 cfid=... auth=...`).

## 2. MailChannels Email API (post–Aug 2024)

MailChannels changed the free Workers integration in 2024. Confirm your account and quotas on the [Email API](https://www.mailchannels.com/email-api/) / [pricing](https://www.mailchannels.com/pricing/#for_devs) pages. If the dashboard provides an API key, set it as **`MAILCHANNELS_API_KEY`** in Pages (see below); the function sends it when present.

## 3. SPF (deliverability)

Ensure your domain’s **SPF** TXT record authorizes MailChannels (often `include:relay.mailchannels.net`). Do not publish multiple SPF TXT records for the same name—merge into one `v=spf1 ...` line.

Optional but recommended: **DKIM** and **DMARC** per MailChannels and your mail host.

## 4. Environment variables (Cloudflare Pages)

In **Pages → Settings → Environment variables** (production and preview as needed):

| Variable | Purpose |
|----------|---------|
| `CONTACT_TO_EMAIL` | Inbox that receives submissions (default in code: `info@sarifconsulting.ai`) |
| `CONTACT_TO_NAME` | Display name for the `to` field (optional) |
| `CONTACT_FROM_EMAIL` | Envelope/from address (default: `contact@sarifconsulting.ai`) |
| `CONTACT_FROM_NAME` | From display name (optional) |
| `MAILCHANNELS_API_KEY` | If your MailChannels plan requires it (optional; sent as `X-Api-Key` — confirm header name in current MailChannels API docs) |
| `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (emitted to the browser — public). When empty, Turnstile is disabled and the form falls back to honeypot + rate-limit only (P7b). |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key (server-only). When empty, siteverify is skipped — intended for local/preview bring-up. When set, `/api/transmit` refuses submissions that fail the challenge or when siteverify is unreachable. |

Secrets should be **Encrypted** in the dashboard. The Turnstile site and
secret keys are provisioned in **Zero Trust → Turnstile** with widget mode
set to **Managed** (Cloudflare picks between invisible and interactive based
on the request risk signal) and domain scoped to `sarifconsulting.ai`.

## 5. Local testing of the API

Static `astro dev` does **not** run Pages Functions. After a production build:

```bash
npm run build
npx wrangler pages dev dist
```

Then open the printed local URL and submit `/contact`. Requires Wrangler logged in if your project uses remote bindings.

## 6. Production verification

- DNS: `nslookup -type=TXT _mailchannels.sarifconsulting.ai` (or dig) shows the lockdown record.
- Submit the live form; check **Pages → Functions → Logs** for MailChannels HTTP status.
- Confirm messages arrive (and are not spam-foldered).

## 7. Fallback if MailChannels still fails

Consider a second provider (Resend, Postmark, etc.) behind a new env flag and Worker code path—same JSON from the frontend.
