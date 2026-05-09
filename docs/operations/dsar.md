# DSAR response — operator runbook

When a data subject requests access to or deletion of their personal data
(GDPR Art. 15 / Art. 17, CCPA §1798.105), Sarif has 30 days to respond.
This runbook documents the mechanics.

## Scope of data

The Sarif site stores two tables of personal data:

| Table            | Origin                                     | Retention |
| ---------------- | ------------------------------------------ | --------- |
| `transmissions`  | `/contact` submissions                     | 90 days (per retention purge) |
| `subscriptions`  | `/praxis` subscribe form                   | 90 days unless the subject later becomes a client |

Additional technical logs (`client_errors`, `csp_reports`, `dsar_audit`)
contain daily-rotated IP hashes but no raw PII; they are NOT in scope for
a DSAR response.

## Step 1 — confirm the requester identity

Match the inbound email to the address we hold. If the subject requests
deletion via a different address, ask for corroboration (the exact date
range of their transmission will do).

## Step 2 — run the lookup

Use the authenticated endpoint. This does NOT modify any data; it reads
the aggregate metadata and writes one row to `dsar_audit`.

```bash
# PowerShell
curl -sfL -X POST `
  -H "Authorization: Bearer $env:ADMIN_PURGE_TOKEN" `
  -H "Content-Type: application/json" `
  --data '{"email":"subject@example.com","action":"lookup","reason":"GDPR Art. 15 request 2026-04-17"}' `
  https://sarifconsulting.ai/api/admin/dsar
```

Sample response:

```json
{
  "transmissions": {
    "count": 2,
    "first_received_at": "2026-02-01T14:21:07.000Z",
    "last_received_at":  "2026-03-11T09:44:52.000Z",
    "status_breakdown": [
      { "status": "received",  "c": 1 },
      { "status": "triaged",   "c": 1 }
    ]
  },
  "subscriptions": {
    "count": 1,
    "first_received_at": "2026-03-02T18:00:11.000Z",
    "last_received_at":  "2026-03-02T18:00:11.000Z"
  }
}
```

## Step 3 — respond

For access requests, respond with a narrative version of the metadata
above plus the raw signal bodies (looked up separately by `id` via
`wrangler d1 execute`). Do NOT paste another subject's data by mistake —
filter strictly by `prospect_email = ?`.

Suggested response skeleton:

> Per your request dated {DATE}, we hold the following personal data
> associated with the email {EMAIL}:
>
> - {N} contact transmissions received between {FIRST} and {LAST}
>   (statuses: {BREAKDOWN}).
> - {M} Praxis subscription records between {FIRST} and {LAST}.
>
> The full text of those transmissions is attached as a CSV. Per our
> 90-day retention policy, records older than 90 days have been
> automatically purged.

## Step 4 — deletion (if requested)

```bash
curl -sfL -X POST `
  -H "Authorization: Bearer $env:ADMIN_PURGE_TOKEN" `
  -H "Content-Type: application/json" `
  --data '{"email":"subject@example.com","action":"delete","reason":"GDPR Art. 17 request 2026-04-17"}' `
  https://sarifconsulting.ai/api/admin/dsar
```

Response:

```json
{
  "deleted": true,
  "transmissions_deleted": 2,
  "subscriptions_deleted": 1
}
```

A row in `dsar_audit` is written with `action=delete`. Keep this audit
trail for 3 years (our record-of-processing retention standard).

## Step 5 — confirm with the subject

Send a short acknowledgment email:

> We confirm that all personal data we hold for {EMAIL} has been deleted
> as of {UTC_TIMESTAMP}. This acknowledgment is itself logged (not the
> email; a hashed reference) in our audit record.

## Edge cases

| Situation                               | Response                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Email has zero matches                  | Still send the "we hold nothing" response; do not pretend to delete data. |
| Email has a `sent` transmission         | Deletion still runs — the subject's right overrides our 90-day policy.    |
| Subject withdraws the request mid-flow  | The delete endpoint is idempotent; re-running it is safe.                 |
| Audit row write fails                   | The endpoint returns success (the data is deleted). Re-invoke `lookup` against the new empty state to confirm. |
