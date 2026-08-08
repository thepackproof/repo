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

  async createVerification(input, { signal } = {}) {
    const response = await this.fetch(`${this.baseUrl}/api/connect/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PackProofConnectError(body.message || `PackProof Connect returned HTTP ${response.status}.`, {
        status: response.status,
        code: body.error || 'http_error',
        details: body.details || null,
      });
    }
    return body;
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
