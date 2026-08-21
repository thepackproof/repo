const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

const INVENTORY_LABELS = {
  COMMERCE_ORDER_RECORD: 'Order record',
  ITEM_IDENTIFIER_EVIDENCE: 'Item identifiers',
  CONDITION_EVIDENCE: 'Condition imagery',
  PACKING_CAPTURE: 'Packing capture',
  PACKAGE_SEALING: 'Package sealing',
  SHIPPING_LABEL_EVIDENCE: 'Shipping label',
  TRACKING_ASSOCIATION: 'Tracking association',
  WEIGHT_OBSERVATION: 'Weight',
  CARRIER_ACCEPTANCE: 'Carrier acceptance',
  DELIVERY_EVIDENCE: 'Delivery observation',
  RECEIVER_CAPTURE: 'Receiver capture',
  RETURN_EVIDENCE: 'Return evidence',
  REFUND_EVIDENCE: 'Refund record',
};

const STATE_LABELS = {
  AVAILABLE: 'Available',
  NOT_AVAILABLE: 'Not available',
  NOT_APPLICABLE: 'Not applicable',
  REVIEW_REQUIRED: 'Review required',
};

const COMPARISON_LABELS = {
  SAME: 'Same as recorded',
  DIFFERENT: 'Different from recorded',
  CONSISTENT_WITH_DECLARED: 'Consistent with declared',
  NOT_CONSISTENT_WITH_DECLARED: 'Not consistent with declared',
  NOT_COMPARED: 'Not compared',
};

const SESSION_LABELS = {
  PENDING_REDEMPTION: 'Capture handoff not yet redeemed',
  READY_FOR_CAPTURE: 'Seller redeemed; capture in progress or recorded',
  EXPIRED: 'Unredeemed capture handoff expired',
  CANCELLED: 'Capture handoff cancelled',
};

export const COMPARISON_FOOTNOTE =
  'Comparisons report relationships between recorded data. They do not establish product authenticity, legal ownership, custody or liability.';

export const REVIEW_FOOTNOTE =
  'Relevance categories reflect the configured receiving-party workflow. PackProof does not determine evidentiary weight or dispute outcome.';

export const APP_BOUNDARY =
  'This panel renders the live Proof JSON from PackProof API. It does not assemble a Proof, authenticate an item, prove custody, decide fraud or fault, or determine a Salesforce, card-network, carrier, marketplace, or payment outcome.';

/**
 * @param {unknown} value
 * @returns {string}
 */
export function factValue(value) {
  if (value && typeof value === 'object' && 'value' in /** @type {object} */ (value)) {
    return displayValue(/** @type {{ value: unknown }} */ (value).value);
  }
  return displayValue(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'NOT AVAILABLE';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && value && 'currency' in value && 'minorUnits' in value) {
    return formatAmount(/** @type {{ currency: string, minorUnits: number }} */ (value));
  }
  return String(value);
}

/**
 * @param {{ currency?: string, minorUnits?: number } | null | undefined} amount
 * @returns {string}
 */
export function formatAmount(amount) {
  if (!amount || typeof amount.minorUnits !== 'number' || !amount.currency) return 'NOT AVAILABLE';
  const currency = String(amount.currency);
  if (ZERO_DECIMAL.has(currency)) return `${currency} ${amount.minorUnits}`;
  return `${currency} ${(amount.minorUnits / 100).toFixed(2)}`;
}

/**
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatTimestamp(iso) {
  if (!iso) return 'NOT AVAILABLE';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

/**
 * @param {string} key
 * @returns {string}
 */
export function humanize(key) {
  return String(key ?? '').replaceAll('_', ' ');
}

/**
 * @param {Record<string, any>} passport
 */
export function projectPassport(passport) {
  const identity = passport?.identity ?? {};
  const integrity = passport?.integrity ?? {};
  const transaction = passport?.transaction ?? {};
  const item = Array.isArray(passport?.items) ? passport.items[0] : null;
  const inventory = Array.isArray(passport?.evidenceInventory) ? passport.evidenceInventory : [];
  const comparisons = Array.isArray(item?.comparisons) ? item.comparisons : [];
  const timeline = Array.isArray(passport?.timeline) ? passport.timeline.slice(-6).reverse() : [];
  const review = passport?.reviewContext ?? null;
  const limitations = passport?.limitations ?? {};

  return {
    displayId: identity.displayId ?? 'Proof',
    passportId: identity.passportId ?? null,
    transactionId: identity.transactionId ?? null,
    verificationUrl: identity.verificationUrl ?? null,
    banner: integrity.banner ?? 'PACKPROOF_RECORD_WITH_LIMITATIONS',
    bannerLabel: String(integrity.banner ?? 'PACKPROOF_RECORD_WITH_LIMITATIONS').replaceAll('_', ' '),
    summary: integrity.summary ?? '',
    meaning: integrity.meaning ?? '',
    limited: integrity.banner !== 'AUTHENTIC_PACKPROOF',
    orderId: factValue(transaction.externalOrderId),
    platform: factValue(transaction.platform),
    amount: factValue(transaction.amount),
    itemTitle: factValue(item?.expected?.title),
    packing: displayValue(passport?.fulfillment?.packingArtifactId),
    seal: displayValue(passport?.fulfillment?.sealArtifactId),
    label: displayValue(passport?.fulfillment?.labelArtifactId),
    trackingObserved: factValue(passport?.fulfillment?.trackingObserved),
    facts: [
      { key: 'order', label: 'Order', value: factValue(transaction.externalOrderId) },
      { key: 'platform', label: 'Platform', value: factValue(transaction.platform) },
      { key: 'item', label: 'Item', value: factValue(item?.expected?.title) },
      { key: 'amount', label: 'Amount', value: factValue(transaction.amount) },
      { key: 'packing', label: 'Packing', value: displayValue(passport?.fulfillment?.packingArtifactId) },
      { key: 'seal', label: 'Seal', value: displayValue(passport?.fulfillment?.sealArtifactId) },
      { key: 'label', label: 'Label', value: displayValue(passport?.fulfillment?.labelArtifactId) },
      { key: 'tracking', label: 'Tracking observed', value: factValue(passport?.fulfillment?.trackingObserved) },
    ],
    inventory: inventory.map((entry) => ({
      category: entry.category,
      label: INVENTORY_LABELS[entry.category] ?? humanize(entry.category),
      state: entry.state,
      stateLabel: STATE_LABELS[entry.state] ?? humanize(entry.state),
      present: entry.state === 'AVAILABLE',
      chipClass: entry.state === 'AVAILABLE' ? 'chip present' : 'chip',
      chip: `${INVENTORY_LABELS[entry.category] ?? humanize(entry.category)} · ${STATE_LABELS[entry.state] ?? humanize(entry.state)}`,
    })),
    comparisons: comparisons.map((row) => ({
      attribute: humanize(row.attribute),
      result: COMPARISON_LABELS[row.result] ?? humanize(row.result),
      expected: displayValue(row.expected),
      observed: displayValue(row.observed),
      line: `${humanize(row.attribute)}: ${COMPARISON_LABELS[row.result] ?? humanize(row.result)}`,
    })),
    timeline: timeline.map((event) => ({
      title: event.title ?? humanize(event.source),
      occurredAt: formatTimestamp(event.occurredAt),
      line: `${formatTimestamp(event.occurredAt)} — ${event.title ?? humanize(event.source)}`,
    })),
    review: review
      ? {
          framework: review.receivingFramework,
          category: humanize(review.disputeCategory),
          heading: `${review.receivingFramework} · ${humanize(review.disputeCategory)}`,
          relevance: (review.relevance ?? []).map((row) => ({
            category: INVENTORY_LABELS[row.category] ?? humanize(row.category),
            stateLabel: STATE_LABELS[row.inventoryState] ?? humanize(row.inventoryState),
            present: row.inventoryState === 'AVAILABLE',
            line: `${INVENTORY_LABELS[row.category] ?? humanize(row.category)}: ${STATE_LABELS[row.inventoryState] ?? humanize(row.inventoryState)}`,
          })),
        }
      : null,
    disclaimer: limitations.humanReviewDisclaimer
      ?? 'These observations are preserved for authorized human review. PackProof does not determine authenticity, custody, fraud, fault, liability, or any commercial or legal outcome.',
    comparisonFootnote: COMPARISON_FOOTNOTE,
    reviewFootnote: REVIEW_FOOTNOTE,
    boundary: APP_BOUNDARY,
  };
}

/**
 * @param {import('./lookup.js').LookupResult} result
 */
export function projectLookup(result) {
  if (result.type === 'proof') {
    return { status: 'ready', view: projectPassport(result.passport), result };
  }
  if (result.type === 'not_ready') {
    return {
      status: 'not_ready',
      title: 'Proof is not ready yet',
      message: result.error.message,
      details: (result.error.details ?? []).map((detail) => detail.message).filter(Boolean),
      session: sessionSummary(result.session),
      transactionId: result.transactionId,
      result,
    };
  }
  if (result.type === 'connect_pending') {
    const status = String(result.session?.status ?? 'PENDING_REDEMPTION');
    return {
      status: 'pending',
      title: 'Proof is not available yet',
      message: SESSION_LABELS[status] ?? humanize(status),
      session: sessionSummary(result.session),
      result,
    };
  }
  if (result.type === 'ambiguous') {
    return {
      status: 'ambiguous',
      title: 'Multiple transactions matched',
      message: 'Choose the PackProof transaction that belongs to this Case. PackProof does not infer which record is the claim.',
      transactions: result.transactions.map((row) => ({
        id: row.id,
        title: row.title ?? row.merchantReference ?? row.id,
        status: humanize(row.status),
        label: `${row.title ?? row.merchantReference ?? row.id} · ${humanize(row.status)}`,
      })),
      result,
    };
  }
  return {
    status: 'not_found',
    title: 'No Proof found',
    message: `PackProof has no Connect session or merchant reference matching “${result.candidate.value}” for this credential’s organization.`,
    result,
  };
}

/**
 * @param {Record<string, any> | null} session
 */
export function sessionSummary(session) {
  if (!session) return null;
  return {
    id: session.id ?? null,
    status: SESSION_LABELS[session.status] ?? humanize(session.status),
    orderId: session.externalOrderId ?? 'NOT AVAILABLE',
    itemTitle: session.itemTitle ?? 'NOT AVAILABLE',
    amount: formatAmount(session.amount),
    transactionId: session.transactionId ?? null,
    facts: [
      { key: 'status', label: 'Connect status', value: SESSION_LABELS[session.status] ?? humanize(session.status) },
      { key: 'order', label: 'Order', value: session.externalOrderId ?? 'NOT AVAILABLE' },
      { key: 'item', label: 'Item', value: session.itemTitle ?? 'NOT AVAILABLE' },
      { key: 'amount', label: 'Amount', value: formatAmount(session.amount) },
    ],
  };
}
