import { packproofUrl, unwrapData, PackProofApiError, pickConnectSession } from './api.js';
import { reviewQueryString } from './dispute-map.js';

/**
 * @typedef {import('./identifiers.js').LookupCandidate} LookupCandidate
 * @typedef {{ framework: string, category: string }} ReviewQuery
 *
 * @typedef {{
 *   type: 'proof',
 *   passport: Record<string, any>,
 *   candidate: LookupCandidate,
 *   transactionId: string | null,
 *   session: Record<string, any> | null,
 * }} ProofReady
 * @typedef {{
 *   type: 'not_ready',
 *   candidate: LookupCandidate,
 *   transactionId: string | null,
 *   session: Record<string, any> | null,
 *   error: PackProofApiError,
 * }} ProofNotReady
 * @typedef {{
 *   type: 'connect_pending',
 *   candidate: LookupCandidate,
 *   session: Record<string, any>,
 * }} ConnectPending
 * @typedef {{
 *   type: 'ambiguous',
 *   candidate: LookupCandidate,
 *   transactions: Array<Record<string, any>>,
 * }} AmbiguousTransactions
 * @typedef {{
 *   type: 'not_found',
 *   candidate: LookupCandidate,
 * }} NotFound
 * @typedef {ProofReady | ProofNotReady | ConnectPending | AmbiguousTransactions | NotFound} LookupResult
 */

/**
 * @param {{ host: string, path: string, method?: string }} input
 * @returns {{ url: string, type: string, headers: Record<string, string>, secure: true, cors: false }}
 */
export function zendeskPackproofRequest(input) {
  return {
    url: packproofUrl(input.host, input.path),
    type: input.method ?? 'GET',
    headers: {
      Authorization: 'Bearer {{setting.api_key}}',
      Accept: 'application/json',
    },
    secure: true,
    cors: false,
  };
}

/**
 * @param {object} input
 * @param {LookupCandidate} input.candidate
 * @param {ReviewQuery} input.reviewQuery
 * @param {(path: string) => Promise<unknown>} input.request
 * @returns {Promise<LookupResult>}
 */
export async function receiveProof(input) {
  const { candidate, reviewQuery, request } = input;
  if (candidate.kind === 'proof') {
    return readProof(request, `/v1/proofs/${encodeURIComponent(candidate.value)}${reviewQueryString(reviewQuery)}`, candidate, null);
  }
  if (candidate.kind === 'transaction') {
    return readProofByTransaction(request, candidate.value, candidate, reviewQuery, null);
  }
  if (candidate.kind === 'connect_session') {
    const session = unwrapData(await request(`/v1/connect/sessions/${encodeURIComponent(candidate.value)}`));
    return fromConnectSession(request, session, candidate, reviewQuery);
  }
  return fromOrder(request, candidate, reviewQuery);
}

/**
 * @param {(path: string) => Promise<unknown>} request
 * @param {LookupCandidate} candidate
 * @param {ReviewQuery} reviewQuery
 * @returns {Promise<LookupResult>}
 */
async function fromOrder(request, candidate, reviewQuery) {
  const sessions = unwrapData(await request(`/v1/connect/sessions?externalOrderId=${encodeURIComponent(candidate.value)}`));
  const session = pickConnectSession(sessions);
  if (session) return fromConnectSession(request, session, candidate, reviewQuery);

  const page = unwrapData(await request(`/v1/transactions?merchantReference=${encodeURIComponent(candidate.value)}&limit=5`));
  const transactions = Array.isArray(page) ? page : [];
  if (transactions.length === 1 && transactions[0]?.id) {
    return readProofByTransaction(request, String(transactions[0].id), candidate, reviewQuery, null);
  }
  if (transactions.length > 1) {
    return { type: 'ambiguous', candidate, transactions };
  }
  return { type: 'not_found', candidate };
}

/**
 * @param {(path: string) => Promise<unknown>} request
 * @param {Record<string, any>} session
 * @param {LookupCandidate} candidate
 * @param {ReviewQuery} reviewQuery
 * @returns {Promise<LookupResult>}
 */
async function fromConnectSession(request, session, candidate, reviewQuery) {
  const transactionId = session?.transactionId ? String(session.transactionId) : null;
  if (!transactionId) {
    return { type: 'connect_pending', candidate, session };
  }
  return readProofByTransaction(request, transactionId, candidate, reviewQuery, session);
}

/**
 * @param {(path: string) => Promise<unknown>} request
 * @param {string} transactionId
 * @param {LookupCandidate} candidate
 * @param {ReviewQuery} reviewQuery
 * @param {Record<string, any> | null} session
 * @returns {Promise<LookupResult>}
 */
async function readProofByTransaction(request, transactionId, candidate, reviewQuery, session) {
  return readProof(
    request,
    `/v1/transactions/${encodeURIComponent(transactionId)}/proof${reviewQueryString(reviewQuery)}`,
    candidate,
    session,
    transactionId,
  );
}

/**
 * @param {(path: string) => Promise<unknown>} request
 * @param {string} path
 * @param {LookupCandidate} candidate
 * @param {Record<string, any> | null} session
 * @param {string | null} [transactionId]
 * @returns {Promise<LookupResult>}
 */
async function readProof(request, path, candidate, session, transactionId = null) {
  try {
    const passport = unwrapData(await request(path));
    if (!passport || typeof passport !== 'object' || passport.object !== 'packproof_passport') {
      throw new PackProofApiError(502, 'PROOF_SHAPE_INVALID', 'PackProof did not return a Proof object.');
    }
    return {
      type: 'proof',
      passport: /** @type {Record<string, any>} */ (passport),
      candidate,
      transactionId: transactionId ?? passport.identity?.transactionId ?? null,
      session,
    };
  } catch (caught) {
    if (caught instanceof PackProofApiError && caught.code === 'PASSPORT_NOT_READY') {
      return { type: 'not_ready', candidate, transactionId, session, error: caught };
    }
    throw caught;
  }
}
