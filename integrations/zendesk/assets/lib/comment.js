import { APP_BOUNDARY, COMPARISON_FOOTNOTE } from './passport-view.js';

/**
 * Internal Zendesk note. It organizes recorded facts; it does not recommend a disposition.
 * @param {ReturnType<import('./passport-view.js').projectPassport>} view
 * @returns {string}
 */
export function internalNoteBody(view) {
  const lines = [
    `PackProof Proof ${view.displayId}`,
    view.summary,
    '',
    `Order: ${view.orderId}`,
    `Platform: ${view.platform}`,
    `Item: ${view.itemTitle}`,
    `Amount: ${view.amount}`,
    `Transaction: ${view.transactionId ?? 'NOT AVAILABLE'}`,
    '',
    'Evidence inventory (presence only; absence is not a finding):',
    ...view.inventory.map((entry) => `- ${entry.label}: ${entry.stateLabel}`),
  ];
  if (view.comparisons.length) {
    lines.push('', 'Expected ↔ observed:', COMPARISON_FOOTNOTE, ...view.comparisons.map((row) => `- ${row.attribute}: ${row.result} (expected ${row.expected}; observed ${row.observed})`));
  }
  if (view.review) {
    lines.push('', `Review overlay: ${view.review.framework} / ${view.review.category}`, ...view.review.relevance.map((row) => `- ${row.category}: ${row.stateLabel}`));
  }
  lines.push(
    '',
    `Packing artifact: ${view.packing}`,
    `Seal artifact: ${view.seal}`,
    `Label artifact: ${view.label}`,
    `Tracking observed: ${view.trackingObserved}`,
    '',
    view.disclaimer,
    APP_BOUNDARY,
  );
  if (view.verificationUrl) lines.push('', `Proof URL: ${view.verificationUrl}`);
  return lines.join('\n');
}
