/**
 * PackProof Merchant / Connect HTTP helpers for the Zendesk proxy.
 * The iframe never sees the API secret; only {{setting.api_key}} placeholders.
 */

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
 * @param {string} host
 * @returns {string}
 */
export function normalizeApiHost(host) {
  const trimmed = String(host ?? '').trim();
  if (!trimmed) throw new PackProofApiError(0, 'API_HOST_REQUIRED', 'Set the PackProof API host in the app settings.');
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'https:') throw new Error('https');
    return url.host;
  } catch {
    throw new PackProofApiError(0, 'API_HOST_INVALID', 'The PackProof API host must be an https hostname.');
  }
}

/**
 * @param {string} host
 * @param {string} path
 * @returns {string}
 */
export function packproofUrl(host, path) {
  const normalized = normalizeApiHost(host);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `https://${normalized}${suffix}`;
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
 * Zendesk client.request rejects with several shapes depending on status and proxy.
 * @param {unknown} caught
 * @returns {PackProofApiError}
 */
export function errorFromZafFailure(caught) {
  if (caught instanceof PackProofApiError) return caught;
  if (caught && typeof caught === 'object') {
    const record = /** @type {Record<string, unknown>} */ (caught);
    const status = Number(record.status ?? record.statusCode ?? 0) || 0;
    const body = record.responseJSON ?? record.response ?? caught;
    if (body && typeof body === 'object' && 'error' in /** @type {object} */ (body)) {
      return errorFromBody(body, status);
    }
    const message = String(record.responseText ?? record.message ?? 'The PackProof API request failed.');
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
