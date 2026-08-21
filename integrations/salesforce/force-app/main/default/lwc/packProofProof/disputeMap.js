/**
 * Map Salesforce Case language onto Passport reviewContext query params.
 * reviewContext is a filing overlay only; it does not decide a claim.
 */

const TAG_CATEGORY = [
  { pattern: /\b(?:inr|item[\s_-]*not[\s_-]*received|merchandise[\s_-]*not[\s_-]*received|not[\s_-]*received)\b/i, visa: 'MERCHANDISE_NOT_RECEIVED', mastercard: 'MERCHANDISE_NOT_RECEIVED', paypal: 'ITEM_NOT_RECEIVED', generic: 'DEFAULT' },
  { pattern: /\b(?:snad|not[\s_-]*as[\s_-]*described|significantly[\s_-]*not[\s_-]*as[\s_-]*described|item[\s_-]*not[\s_-]*as[\s_-]*described)\b/i, visa: 'NOT_AS_DESCRIBED', mastercard: 'NOT_AS_DESCRIBED', paypal: 'SIGNIFICANTLY_NOT_AS_DESCRIBED', generic: 'DEFAULT' },
];

const FRAMEWORKS = new Set(['VISA', 'MASTERCARD', 'PAYPAL', 'GENERIC']);

/**
 * @param {string | null | undefined} value
 * @returns {'VISA' | 'MASTERCARD' | 'PAYPAL' | 'GENERIC'}
 */
export function normalizeFramework(value) {
  const framework = String(value ?? 'GENERIC').trim().toUpperCase();
  return FRAMEWORKS.has(framework) ? /** @type {'VISA' | 'MASTERCARD' | 'PAYPAL' | 'GENERIC'} */ (framework) : 'GENERIC';
}

/**
 * @param {object} input
 * @param {string | null | undefined} input.framework
 * @param {string | null | undefined} input.subject
 * @param {string | null | undefined} input.description
 * @param {string[] | null | undefined} input.tags
 * @returns {{ framework: string, category: string }}
 */
export function reviewQueryFromRecord(input) {
  const framework = normalizeFramework(input?.framework);
  const haystack = [input?.subject, input?.description, ...(input?.tags ?? [])].filter(Boolean).join(' ');
  const key = framework === 'MASTERCARD' ? 'mastercard' : framework === 'PAYPAL' ? 'paypal' : framework === 'VISA' ? 'visa' : 'generic';
  for (const rule of TAG_CATEGORY) {
    if (rule.pattern.test(haystack)) {
      return { framework, category: rule[key] };
    }
  }
  return { framework, category: 'DEFAULT' };
}

/**
 * @param {object} input
 * @returns {{ framework: string, category: string }}
 */
export function reviewQueryFromCase(input) {
  return reviewQueryFromRecord({
    framework: input?.framework,
    subject: input?.subject,
    description: input?.description,
    tags: [input?.type, input?.reason, ...(input?.tags ?? [])].filter(Boolean),
  });
}

/**
 * @param {{ framework: string, category: string }} query
 * @returns {string}
 */
export function reviewQueryString(query) {
  const params = new URLSearchParams();
  if (query?.framework) params.set('framework', query.framework);
  if (query?.category) params.set('category', query.category);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}
