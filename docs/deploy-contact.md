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
| `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (emitted to the browser — public). **Also required in the shell that runs the build — see §4a.** When empty in both places, Turnstile is disabled and the form falls back to honeypot + rate-limit only (P7b). |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key (server-only). When empty, siteverify is skipped — intended for local/preview bring-up. When set, `/api/transmit` refuses submissions that fail the challenge or when siteverify is unreachable. |

Secrets should be **Encrypted** in the dashboard. The Turnstile site and
secret keys are provisioned in **Zero Trust → Turnstile** with widget mode
set to **Managed** (Cloudflare picks between invisible and interactive based
on the request risk signal) and domain scoped to `sarifconsulting.ai`.

### 4a. `PUBLIC_TURNSTILE_SITE_KEY` is read TWICE — build and runtime

This is the single most dangerous configuration detail on the site. Setting the
site key **only** in the Pages dashboard produces a **silent, total contact-form
outage** behind a green deploy.

The same variable name is consumed at two different moments by two different
pieces of code:

| Where | When | What it decides |
| ----- | ---- | --------------- |
| `src/pages/contact.astro` (`import.meta.env`) | **Build** — from the shell running `astro build` | Whether the Turnstile widget markup is emitted into `dist/` **at all** |
| `functions/api/transmit.js` (`env`) | **Runtime** — from the Pages dashboard | Whether a Turnstile token is **mandatory** for a submission to be accepted |

`npm run deploy` builds **locally**, so the build never sees the dashboard.
Setting the key in the dashboard alone therefore yields:

1. Build has no key → contact page ships with **no widget**.
2. Runtime has the key → `/api/transmit` **requires** a token.
3. No widget exists to mint a token → **every** submission returns
   `verification_missing` (HTTP 400). The only inbound channel on the site is
   dead, and nothing in the build log says so.

**Deploy with Turnstile ON** — export both keys so the widget is baked in and
matches the dashboard:

```bash
export PUBLIC_TURNSTILE_SITE_KEY=0x...   # same value as the dashboard
export TURNSTILE_SECRET_KEY=0x...        # server-only; harmless at build time
npm run deploy
```

**Deploy with Turnstile OFF** — declare the intent, and clear the key in the
dashboard as well, so build and runtime agree that verification is disabled:

```bash
TURNSTILE_POSTURE=disabled npm run deploy
```

Either path is enforced by `scripts/check-turnstile-posture.mjs`, which runs in
`postbuild`. It compares the build environment against the emitted HTML and
**fails a release build** (`npm run deploy` sets `SARIF_RELEASE=1`) that would
ship a keyless contact page without an explicit `TURNSTILE_POSTURE=disabled`.
Silence is not consent: "I forgot to export the key" and "I intend to ship
without bot protection" must not look identical to the toolchain.

Rotating the key means updating **both** the dashboard and the deploying shell,
then redeploying — a dashboard-only rotation reintroduces the outage.

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
