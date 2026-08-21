/**
 * PackProof Merchant / Connect HTTP helpers for Salesforce Apex Named Credential callouts.
 * The LWC never sees the API secret; Apex injects {!$Credential.PackProof_API.api_key}.
 */

export const NAMED_CREDENTIAL = 'PackProof_API';
export const AUTHORIZATION_MERGE_FIELD = 'Bearer {!$Credential.PackProof_API.api_key}';

export class PackProofApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Array<{ field?: string, code: string, message: string }>} [details]
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'PackProofApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {unknown} body
 * @returns {any}
 */
export function unwrapData(body) {
  if (body && typeof body === 'object' && 'data' in body) return /** @type {{ data: unknown }} */ (body).data;
  return body;
}

/**
 * @param {unknown} payload
 * @param {number} [status]
 * @returns {PackProofApiError}
 */
export function errorFromBody(payload, status = 0) {
  const envelope = payload && typeof payload === 'object' ? payload : {};
  const error = /** @type {{ error?: { code?: string, message?: string, details?: unknown[] } }} */ (envelope).error;
  return new PackProofApiError(
    status,
    String(error?.code ?? 'REQUEST_FAILED'),
    String(error?.message ?? 'The PackProof API request failed.'),
    Array.isArray(error?.details) ? /** @type {any} */ (error.details) : [],
  );
}

/**
 * Apex / Lightning error shapes. The Named Credential merge field must never appear as a resolved secret here.
 * @param {unknown} caught
 * @returns {PackProofApiError}
 */
export function errorFromSalesforceFailure(caught) {
  if (caught instanceof PackProofApiError) return caught;
  if (caught && typeof caught === 'object') {
    const record = /** @type {Record<string, unknown>} */ (caught);
    const status = Number(record.status ?? 0) || 0;
    if (record.body && typeof record.body === 'object' && 'error' in /** @type {object} */ (record.body)) {
      return errorFromBody(record.body, status);
    }
    const aura = record.body && typeof record.body === 'object'
      ? /** @type {Record<string, unknown>} */ (record.body)
      : record;
    const message = String(aura.message ?? record.message ?? 'The PackProof API request failed.');
    return new PackProofApiError(status, 'REQUEST_FAILED', message);
  }
  return new PackProofApiError(0, 'REQUEST_FAILED', caught instanceof Error ? caught.message : 'The PackProof API request failed.');
}

/**
 * @param {unknown} sessions
 * @returns {Record<string, unknown> | null}
 */
export function pickConnectSession(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const withTransaction = list.filter((session) => session && session.transactionId);
  const ready = withTransaction.filter((session) => session.status === 'READY_FOR_CAPTURE');
  const pool = ready.length ? ready : withTransaction.length ? withTransaction : list;
  return pool.slice().sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')))[0] ?? null;
}

/**
 * Documents the Apex Named Credential callout. The LWC must not set Authorization.
 * @param {string} path
 * @returns {{ namedCredential: string, method: 'GET', path: string, authorization: string }}
 */
export function salesforceNamedCredentialCallout(path) {
  return {
    namedCredential: NAMED_CREDENTIAL,
    method: 'GET',
    path,
    authorization: AUTHORIZATION_MERGE_FIELD,
  };
}
