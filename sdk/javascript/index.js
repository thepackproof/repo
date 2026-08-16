import { createHmac, timingSafeEqual } from 'node:crypto';

export class PackProofConnectError extends Error {
  constructor(message, { status = 0, code = 'packproof_error', details = null } = {}) {
    super(message);
    this.name = 'PackProofConnectError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class PackProofConnect {
  constructor({ apiKey, baseUrl, fetchImpl = globalThis.fetch }) {
    if (!apiKey || typeof apiKey !== 'string') throw new TypeError('apiKey is required.');
    if (!baseUrl || typeof baseUrl !== 'string') throw new TypeError('baseUrl is required.');
    if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible implementation is required.');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async request(path, { method = 'GET', body, idempotencyKey, signal } = {}) {
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload.error && typeof payload.error === 'object' ? payload.error : payload;
      throw new PackProofConnectError(error.message || `PackProof Connect returned HTTP ${response.status}.`, {
        status: response.status,
        code: error.code || error.error || 'http_error',
        details: error.details || payload.details || null,
      });
    }
    return payload;
  }

  async createEvidenceSession(input, { signal } = {}) {
    return this.request('/api/connect/orders', { method: 'POST', body: input, signal });
  }

  async createConnectSession(input, { idempotencyKey, signal } = {}) {
    const key = idempotencyKey || input.idempotencyKey;
    if (!key) throw new TypeError('idempotencyKey is required for v1 Connect sessions.');
    const body = { ...input };
    delete body.idempotencyKey;
    return this.request('/v1/connect/sessions', {
      method: 'POST',
      body: { schemaVersion: 1, ...body },
      idempotencyKey: key,
      signal,
    });
  }

  async getConnectSession(sessionId, options = {}) {
    return this.request(`/v1/connect/sessions/${encodeURIComponent(sessionId)}`, options);
  }

  async listConnectSessions(externalOrderId, options = {}) {
    if (!externalOrderId) throw new TypeError('externalOrderId is required to list Connect sessions.');
    return this.request(`/v1/connect/sessions?externalOrderId=${encodeURIComponent(externalOrderId)}`, options);
  }

  async cancelConnectSession(sessionId, { signal } = {}) {
    return this.request(`/v1/connect/sessions/${encodeURIComponent(sessionId)}/cancel`, {
      method: 'POST',
      body: { schemaVersion: 1 },
      signal,
    });
  }

  async listEvidence(transactionId, options = {}) {
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/evidence`, options);
  }

  async getEvidence(transactionId, artifactId, options = {}) {
    return this.request(
      `/v1/transactions/${encodeURIComponent(transactionId)}/evidence/${encodeURIComponent(artifactId)}`,
      options,
    );
  }

  async getReviewPackage(transactionId, options = {}) {
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/review-package`, options);
  }

  async createEvidenceReport(transactionId, { idempotencyKey, signal } = {}) {
    if (!idempotencyKey) throw new TypeError('idempotencyKey is required for evidence reports.');
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/reports`, {
      method: 'POST',
      body: { schemaVersion: 1 },
      idempotencyKey,
      signal,
    });
  }

  async getEvidenceReport(transactionId, reportId, options = {}) {
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/reports/${encodeURIComponent(reportId)}`, options);
  }

  async getTimeline(transactionId, options = {}) {
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/timeline`, options);
  }

  async associateShipment(transactionId, input, { idempotencyKey, signal } = {}) {
    if (!idempotencyKey) throw new TypeError('idempotencyKey is required for shipment association.');
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/shipment`, {
      method: 'POST',
      body: { schemaVersion: 1, ...input },
      idempotencyKey,
      signal,
    });
  }

  async getShipment(transactionId, options = {}) {
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/shipment`, options);
  }

  async listReturns(transactionId, options = {}) {
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/returns`, options);
  }

  async createReturn(transactionId, input, { idempotencyKey, signal } = {}) {
    if (!idempotencyKey) throw new TypeError('idempotencyKey is required to request a return passport.');
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/returns`, {
      method: 'POST',
      body: { schemaVersion: 1, ...input },
      idempotencyKey,
      signal,
    });
  }

  async getReturn(transactionId, returnPassportId, options = {}) {
    return this.request(
      `/v1/transactions/${encodeURIComponent(transactionId)}/returns/${encodeURIComponent(returnPassportId)}`,
      options,
    );
  }

  async associateReturnShipment(transactionId, returnPassportId, input, { idempotencyKey, signal } = {}) {
    if (!idempotencyKey) throw new TypeError('idempotencyKey is required for return shipment association.');
    return this.request(
      `/v1/transactions/${encodeURIComponent(transactionId)}/returns/${encodeURIComponent(returnPassportId)}/shipment`,
      {
        method: 'POST',
        body: { schemaVersion: 1, ...input },
        idempotencyKey,
        signal,
      },
    );
  }

  async getDelivery(transactionId, options = {}) {
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/delivery`, options);
  }

  async associateDelivery(transactionId, input, { idempotencyKey, signal } = {}) {
    if (!idempotencyKey) throw new TypeError('idempotencyKey is required for delivery association.');
    return this.request(`/v1/transactions/${encodeURIComponent(transactionId)}/delivery`, {
      method: 'POST',
      body: { schemaVersion: 1, ...input },
      idempotencyKey,
      signal,
    });
  }

  // Backward-compatible alias for v0.2 clients. The response is an evidence
  // capture handoff, not a product-authenticity or legal verification result.
  async createVerification(input, options = {}) {
    return this.createEvidenceSession(input, options);
  }
}

export function verifyPackProofWebhook({ rawBody, timestamp, signature, secret, toleranceSeconds = 300, now = Date.now() }) {
  if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) throw new TypeError('rawBody must be the exact request body string or Buffer.');
  if (!/^\d{10,}$/.test(String(timestamp ?? ''))) return false;
  const received = String(signature ?? '').replace(/^v1=/, '');
  if (!/^[a-f0-9]{64}$/i.test(received) || !secret) return false;
  const ageSeconds = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const actualBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function parsePackProofWebhook(input) {
  if (!verifyPackProofWebhook(input)) {
    throw new PackProofConnectError('PackProof webhook signature verification failed.', {
      status: 400,
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
  }
  const text = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new PackProofConnectError('PackProof webhook body is not valid JSON.', {
      status: 400,
      code: 'INVALID_WEBHOOK_JSON',
    });
  }
  if (!payload || payload.event !== 'packproof.evidence.finalized') {
    throw new PackProofConnectError('Unsupported PackProof webhook event.', {
      status: 400,
      code: 'UNSUPPORTED_WEBHOOK_EVENT',
    });
  }
  return payload;
}
