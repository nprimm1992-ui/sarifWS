/**
 * Nicholas's enriched transmission readout.
 *
 * Layout doctrine:
 *  - Signal first. The raw prospect text appears verbatim above any
 *    Jensen-prepared content. Anchoring defense against model drift.
 *  - Reference_id in subject line so Nicholas can search by TX-code without
 *    exposing the id to the prospect.
 *  - Reply-direct breadcrumb keeps the existing email-primary workflow.
 *  - Jensen-prepared block is a placeholder in Phase A; the structure is
 *    wire-compatible with the post-pickup format so no email changes are
 *    needed when Jensen begins drafting back.
 */

const RULE = '════════════════════════════════════════════════════════════';
const SOFT = '────────────────────────────────────────────────────────────';

/**
 * Format an ISO timestamp as "YYYY-MM-DD HH:MM UTC".
 */
function formatReceivedAt(iso) {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

/**
 * Build the subject line for Nicholas's inbox.
 *   [TX-YYYY-MM-XXXX] New transmission from <Name> (<Org>)
 * Organization suffix omitted when not provided.
 */
export function buildSubject({ referenceId, prospectName, prospectOrganization }) {
  const who = prospectOrganization
    ? `${prospectName} (${prospectOrganization})`
    : prospectName;
  return `[${referenceId}] New transmission from ${who}`;
}

/**
 * Build the plain-text body. All inputs are expected to be already sanitized
 * by the caller; raw_signal is passed verbatim (control chars stripped by
 * the shared validator, but otherwise unmodified).
 */
export function buildBody({
  referenceId,
  receivedAt,
  prospectName,
  prospectEmail,
  prospectOrganization,
  rawSignal,
  lexiconVersion,
  persisted,
}) {
  const lines = [];

  lines.push(RULE);
  lines.push(`TRANSMISSION ${referenceId}`);
  lines.push(`Received: ${formatReceivedAt(receivedAt)}`);
  lines.push(RULE);
  lines.push('');

  lines.push(`${prospectName} <${prospectEmail}>`);
  if (prospectOrganization) {
    lines.push(prospectOrganization);
  }
  lines.push('');

  lines.push(`── SIGNAL ${SOFT.slice(10)}`);
  lines.push('');
  lines.push(rawSignal);
  lines.push('');

  lines.push(`── ACTIONS ${SOFT.slice(11)}`);
  lines.push('');
  lines.push(`Reply directly to ${prospectEmail}.`);
  lines.push('This inbox is the system of record.');
  lines.push('');

  lines.push(`── (Jensen preparation, once wired) ${SOFT.slice(36)}`);
  lines.push('');
  lines.push('Pending. Jensen will draft once /api/pickup is live on the');
  if (persisted) {
    lines.push(`Jensen side. This transmission is stored at ref ${referenceId}`);
    lines.push(`and available for retrieval. Lexicon: ${lexiconVersion}.`);
  } else {
    lines.push('Jensen side. NOTE: D1 persistence failed for this transmission;');
    lines.push('the raw signal above is the only record. Investigate the Pages');
    lines.push(`Function logs for transmission_id=${referenceId}.`);
  }
  lines.push('');

  lines.push('(Policy: retention 90d unless engaged.)');
  lines.push(RULE);

  return lines.join('\n');
}

/**
 * One-shot convenience: returns { subject, body } ready to ship to the
 * Google Apps Script relay.
 */
export function renderTransmissionEmail(params) {
  return {
    subject: buildSubject(params),
    body: buildBody(params),
  };
}
