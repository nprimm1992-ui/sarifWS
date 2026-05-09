# Sarif — Jensen Pickup API Contract

**Status:** Phase A (scope B). Endpoints are live, authenticated, and dormant until the Jensen-side `contact_drafting` surface mode consumes them.
**Base URL (production):** `https://sarifconsulting.ai`
**Base URL (staging / preview):** Cloudflare Pages preview URL for the current PR
**Transport:** HTTPS only.
**Auth:** Bearer token, constant-time compared. See [Authentication](#authentication).
**Audience:** Jensen application engineers. This is the only sanctioned interface between Jensen and the transmissions store.

---

## Doctrine

These endpoints are the seam between two systems that never share code:

- **Sarif site (this repo)** owns the transmissions table, prospect data, and the operator (Nicholas) inbox workflow.
- **Jensen app (separate repo)** owns concept activation, drafting, and the workstation UI that Nicholas uses to review and send replies.

Jensen **must not** reach into D1 directly. Every read and write goes through the contract below. If Jensen needs a field that isn't here, the field is added to this document first, then implemented in the endpoint — never the other way around.

---

## Authentication

All pickup routes require:

```
Authorization: Bearer <JENSEN_PICKUP_TOKEN>
```

`JENSEN_PICKUP_TOKEN` is a 64-character hex string, installed as a Cloudflare Pages environment variable on the Sarif site. Jensen stores the same token in its own secret manager. Rotating the token requires updating both sides in a narrow window; plan rotations against the backlog.

The token is compared with a constant-time check (`verifyBearer` in `functions/api/_shared/validate.js`) to avoid timing oracles. Missing or malformed headers return `401 Unauthorized` with a generic error body.

Admin endpoints (e.g. `/api/admin/purge`) use a **separate** token (`ADMIN_PURGE_TOKEN`). A Jensen-side leak therefore never grants deletion rights.

---

## Endpoints

### `GET /api/pickup`

List unclaimed transmissions. Jensen polls this endpoint, picks a transmission, then calls `/claim` before drafting.

**Filter:** `jensen_pickup_at IS NULL AND status = 'received'`.
**Order:** `received_at ASC` (FIFO).
**Limit:** 50 per response.

#### Response — 200

```json
{
  "transmissions": [
    {
      "id": "c8e2f1a4-1234-4567-89ab-cdef01234567",
      "reference_id": "TX-2026-04-A7F2",
      "received_at": "2026-04-17T18:42:11.312Z",
      "raw_signal": "…raw prospect text, verbatim…",
      "prospect_name": "Alex Rivera",
      "prospect_email": "alex@riverasystems.io",
      "prospect_organization": "Rivera Systems",
      "lexicon_version": "2026-04-v1"
    }
  ]
}
```

When the queue is empty, `transmissions` is an empty array.

#### Response — 401

```json
{ "error": "Unauthorized" }
```

#### Response — 500

```json
{ "error": "Pickup query failed" }
```

---

### `POST /api/pickup/:id/claim`

Atomically mark a transmission as being processed by the caller. Prevents two Jensen instances from drafting the same signal.

**Path parameter:** `id` — the transmission UUID returned by `GET /api/pickup`.
**Body:** none.

Implementation detail (see `functions/api/pickup/[id]/claim.js`):

```sql
UPDATE transmissions
   SET jensen_pickup_at = now
 WHERE id = ?
   AND jensen_pickup_at IS NULL
```

If the UPDATE affects one row, the caller owns the transmission. If it affects zero rows, somebody else claimed it first — Jensen should log the conflict and move on.

**Status contract:** a claim does **not** transition `status`. The row remains `'received'` until `POST /draft` moves it to `'drafted'` or `'refused'`. The `status = 'triaged'` value and the `triaged_at` column are reserved for Nicholas's operator workflow ("Nicholas opens / acknowledges receipt") and are never written by Jensen. This keeps Jensen's automated read and Nicholas's human review as separable signals in the data.

#### Response — 200 (claim succeeded)

```json
{ "claimed": true }
```

#### Response — 404 (id not found)

```json
{ "claimed": false, "reason": "not_found" }
```

#### Response — 409 (already claimed)

```json
{ "claimed": false, "reason": "already_claimed" }
```

---

### `POST /api/pickup/:id/draft`

Write Jensen's draft reply — or a structured refusal — back to the transmission row.

**Precondition:** the transmission must already be claimed (`jensen_pickup_at` is not null). A draft without a preceding claim returns `409`.

**Path parameter:** `id` — the transmission UUID.

**Request body (JSON):**

| Field                       | Type                  | Required           | Notes                                                                          |
| --------------------------- | --------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `jensen_trace_id`           | `string`              | yes                | Jensen-side correlation id; used for joins against Jensen logs. ≤ 128 chars.   |
| `draft_subject`             | `string`              | yes (if not refusal) | ≤ 400 chars. Free-form; Nicholas edits before send.                          |
| `draft_body`                | `string`              | yes (if not refusal) | ≤ 50,000 chars. Plain text. Never auto-sent.                                 |
| `draft_activated_concepts`  | `string[]`            | optional           | Array of lexicon slugs Jensen activated (e.g. `"briefing"`, `"trace"`). JSON-encoded server-side; ≤ 4,000 chars when serialized. |
| `draft_confidence_band`     | `"clear" \| "partial" \| "unclear"` | optional | See [Confidence bands](#confidence-bands).                                   |
| `draft_refusal_reason`      | `string \| null`      | optional           | Non-null → transmission status becomes `refused`. ≤ 2,000 chars.               |
| `jensen_metadata`           | `object`              | optional           | JSON escape-hatch for non-critical flags. ≤ 4,000 chars when serialized.       |

**Status transitions**:

- `draft_refusal_reason` non-null → `status = 'refused'`, `drafted_at` NOT set.
- otherwise → `status = 'drafted'`, `drafted_at = now`.

Nicholas moves the status from `drafted` / `refused` to `sent` via the operator workflow once he has sent the reply. (That transition is not part of this API.)

#### Response — 200

```json
{ "updated": true }
```

#### Response — 400 (validation)

```json
{ "error": "jensen_trace_id is required." }
```

#### Response — 404

```json
{ "error": "Transmission not found" }
```

#### Response — 409 (protocol violation)

```json
{ "error": "Transmission must be claimed via /claim before posting a draft." }
```

---

### `POST /api/admin/purge` (ops-only)

Separate bearer (`ADMIN_PURGE_TOKEN`). Not for Jensen. Documented here for completeness.

Deletes rows where `received_at < now - 90 days AND status NOT IN ('sent','archived')`. Phase A ships as a manual trigger; cron automation is a follow-up.

```json
{ "purged": 12, "retained_engaged": 3, "retention_days": 90 }
```

---

## Confidence bands

`draft_confidence_band` is categorical — never a number. This is deliberate: Nicholas should not be presented with a false-precision percentage that invites rubber-stamping.

| Band      | Meaning for the drafter                                                                      |
| --------- | -------------------------------------------------------------------------------------------- |
| `clear`   | Jensen activated well-matched concepts; the draft is ready for Nicholas to lightly edit.     |
| `partial` | Some concepts matched; draft is a starting point but needs Nicholas to supply framing.       |
| `unclear` | Low confidence; Jensen produced a skeleton and flagged the signal for operator judgment.    |
| `null`    | Jensen did not compute confidence (e.g. a structured refusal without drafting).              |

If Jensen cannot categorize cleanly, prefer `unclear` over guessing. Nicholas's read of a candid `unclear` is always better than a misleading `clear`.

---

## Lexicon versioning

Every transmission row stores `lexicon_version` at ingest. The source of truth for the current value is `src/lib/lexicon-version.ts` (mirrored at `functions/api/_shared/lexicon-version.js` for the Workers bundle).

**Bump the version when:**

1. The set of 11 lexicon entry IDs changes (add / remove / rename).
2. An entry's definition or status changes (e.g. `active` → `deprecated`).
3. Cross-references between entries change in ways that alter semantics.

**Do not bump for:**

- Pure copy edits (typo fixes, voice tightening) that preserve meaning.
- Styling, layout, or rendering-order changes on `/lexicon`.
- Adding non-semantic metadata (anchor IDs, reveal triggers).

**Format:** `YYYY-MM-v<N>` — month of the bump; `N` resets per month.

Jensen should treat `lexicon_version` as an opaque pointer and resolve it to the underlying concept set via the git history of the Sarif repo when replaying a historical transmission.

---

## Error envelope

All non-2xx responses return:

```json
{ "error": "<human-readable reason>" }
```

Errors are safe to log verbatim. They never echo prospect PII.

---

## Rate limits

The pickup endpoints are internal; no rate limit is applied today. If Jensen deploys in a polling pattern, keep polls at ≥ 5s intervals to avoid log noise. Long-lived server-sent events or push notifications are **not** part of this contract — add them as an explicit extension rather than overload `/api/pickup`.

---

## Atomic-claim guarantee

The single correctness invariant Jensen depends on:

> For any given transmission `id`, at most one caller ever receives `{ claimed: true }` from `POST /api/pickup/:id/claim`.

This is enforced by the `WHERE jensen_pickup_at IS NULL` clause on the UPDATE statement. D1 serializes writes to a single row, so the race is resolved at the storage layer — Jensen does not need additional locking.

If Jensen crashes after claiming but before drafting, the row will sit with `status = 'received'` and a `jensen_pickup_at` timestamp but no draft. The `jensen_pickup_at IS NULL` filter on `GET /api/pickup` will continue to exclude it, so it will not be re-picked automatically. A follow-up ops procedure (re-enqueue by clearing `jensen_pickup_at` after a stale-claim threshold) will be added in Phase B.

---

## Change log

- **2026-04 (Phase A, scope B)** — initial contract. Endpoints implemented; Jensen-side integration pending.
