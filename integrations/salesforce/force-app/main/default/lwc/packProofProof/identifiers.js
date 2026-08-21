/**
 * Case-text classifiers for PackProof Connect / Proof lookup.
 * Possession of an identifier never grants access; the merchant API still authorizes.
 */

export const PROOF_DISPLAY_SOURCE = 'PP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}';
export const PROOF_RESOURCE_SOURCE = 'ppt_[a-f0-9]{40}';
export const TRANSACTION_SOURCE = 'txn_[A-Za-z0-9_-]{8,128}';
export const CONNECT_SESSION_PATTERN = /^[a-f0-9]{64}$/;
export const SHOPIFY_ORDER_SOURCE = 'gid:\\/\\/shopify\\/Order\\/\\d+';
export const AMAZON_ORDER_SOURCE = '\\b\\d{3}-\\d{7}-\\d{7}\\b';
export const ORDER_LABEL_SOURCE = '\\b(?:order|ord(?:er)?(?:\\s*id)?|po|external(?:\\s*order)?)[:\\s#-]+([A-Za-z0-9._/-]{3,80})';

/**
 * @typedef {'proof' | 'transaction' | 'connect_session' | 'order'} LookupKind
 * @typedef {{ kind: LookupKind, value: string, source: string }} LookupCandidate
 */

/**
 * @param {string} value
 * @returns {LookupKind | null}
 */
export function classifyIdentifier(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (/^PP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/i.test(trimmed)) return 'proof';
  if (/^ppt_[a-f0-9]{40}$/i.test(trimmed)) return 'proof';
  if (/^txn_[A-Za-z0-9_-]{8,128}$/.test(trimmed)) return 'transaction';
  if (CONNECT_SESSION_PATTERN.test(trimmed)) return 'connect_session';
  if (trimmed.length >= 1 && trimmed.length <= 200) return 'order';
  return null;
}

/**
 * @param {string} value
 * @param {string} source
 * @returns {LookupCandidate | null}
 */
export function candidateFromValue(value, source) {
  const trimmed = String(value ?? '').trim();
  const kind = classifyIdentifier(trimmed);
  if (!kind) return null;
  return {
    kind,
    value: kind === 'proof' && /^pp-/i.test(trimmed) ? trimmed.toUpperCase() : trimmed,
    source,
  };
}

/**
 * @param {Iterable<LookupCandidate>} candidates
 * @returns {LookupCandidate[]}
 */
export function dedupeCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

/**
 * @param {string} text
 * @param {string} source
 * @returns {LookupCandidate[]}
 */
export function extractFromText(text, source) {
  const haystack = String(text ?? '');
  /** @type {LookupCandidate[]} */
  const found = [];
  for (const match of haystack.matchAll(new RegExp(PROOF_DISPLAY_SOURCE, 'gi'))) {
    found.push({ kind: 'proof', value: match[0].toUpperCase(), source });
  }
  for (const match of haystack.matchAll(new RegExp(PROOF_RESOURCE_SOURCE, 'gi'))) {
    found.push({ kind: 'proof', value: match[0].toLowerCase(), source });
  }
  for (const match of haystack.matchAll(new RegExp(TRANSACTION_SOURCE, 'g'))) {
    found.push({ kind: 'transaction', value: match[0], source });
  }
  for (const match of haystack.matchAll(new RegExp(SHOPIFY_ORDER_SOURCE, 'gi'))) {
    found.push({ kind: 'order', value: match[0], source });
  }
  for (const match of haystack.matchAll(new RegExp(AMAZON_ORDER_SOURCE, 'g'))) {
    found.push({ kind: 'order', value: match[0], source });
  }
  for (const match of haystack.matchAll(new RegExp(ORDER_LABEL_SOURCE, 'gi'))) {
    const value = String(match[1] ?? '').replace(/[.,;:]+$/, '');
    if (classifyIdentifier(value) === 'order') found.push({ kind: 'order', value, source });
  }
  return dedupeCandidates(found);
}

const KIND_RANK = { proof: 0, transaction: 1, connect_session: 2, order: 3 };

/**
 * @param {object} record
 * @param {string | null | undefined} record.id
 * @param {string | null | undefined} record.subject
 * @param {string | null | undefined} record.description
 * @param {string[] | null | undefined} record.tags
 * @param {string | null | undefined} record.orderFieldValue
 * @param {string} [orderFieldSource]
 * @returns {LookupCandidate[]}
 */
export function collectRecordCandidates(record, orderFieldSource = 'record.order_field') {
  const ranked = [
    ...extractFromText(record?.subject ?? '', 'record.subject'),
    ...extractFromText(record?.description ?? '', 'record.description'),
    ...extractFromText((record?.tags ?? []).join(' '), 'record.tags'),
  ];
  const fromField = candidateFromValue(record?.orderFieldValue, orderFieldSource);
  if (fromField) ranked.unshift(fromField);
  return dedupeCandidates(ranked).sort((left, right) => {
    const kind = KIND_RANK[left.kind] - KIND_RANK[right.kind];
    if (kind) return kind;
    if (left.source === orderFieldSource) return -1;
    if (right.source === orderFieldSource) return 1;
    return 0;
  });
}

/**
 * @param {object} caseRecord
 * @returns {LookupCandidate[]}
 */
export function collectCaseCandidates(caseRecord) {
  return collectRecordCandidates(
    {
      id: caseRecord?.id,
      subject: caseRecord?.subject,
      description: caseRecord?.description,
      tags: [caseRecord?.type, caseRecord?.reason, ...(caseRecord?.tags ?? [])].filter(Boolean),
      orderFieldValue: caseRecord?.orderFieldValue,
    },
    'case.order_field',
  ).map((candidate) => ({
    ...candidate,
    source: candidate.source.replace(/^record\./, 'case.'),
  }));
}
