import { createHash } from 'node:crypto';

const HEX_SHA256 = /^[a-f0-9]{64}$/;

// Independent verifier implementation of PACKPROOF_JCS_1. Keep this module
// separate from the Cloud Functions implementation so conformance tests can
// detect accidental drift between producer and verifier.
export function canonicalizeJson(value, path = '$') {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    assertWellFormedUnicode(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite JSON number.`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value) || value[index] === undefined) throw new TypeError(`${path}[${index}] must be an explicit JSON value.`);
      items.push(canonicalizeJson(value[index], `${path}[${index}]`));
    }
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain JSON object.`);
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => {
      assertWellFormedUnicode(key, `${path} object key`);
      if (value[key] === undefined) throw new TypeError(`${path}.${key} must be omitted or explicit.`);
      return `${JSON.stringify(key)}:${canonicalizeJson(value[key], `${path}.${key}`)}`;
    }).join(',')}}`;
  }
  throw new TypeError(`${path} contains a non-JSON value.`);
}

function assertWellFormedUnicode(value, path) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) throw new TypeError(`${path} contains an unpaired Unicode surrogate.`);
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`${path} contains an unpaired Unicode surrogate.`);
    }
  }
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createEvidenceBundleSha256(fileSha256, manifestSha256) {
  const fileDigest = normalizeDigest(fileSha256, 'fileSha256');
  const manifestDigest = normalizeDigest(manifestSha256, 'manifestSha256');
  return sha256Hex(Buffer.concat([
    Buffer.from('PACKPROOF-EVIDENCE-BUNDLE\0v2\0sha256\0', 'utf8'),
    Buffer.from(fileDigest, 'hex'),
    Buffer.from('\0sha256\0', 'utf8'),
    Buffer.from(manifestDigest, 'hex'),
  ]));
}

export function deterministicUploadId({ transactionId, uploaderId, clientEvidenceId }) {
  return sha256Hex(Buffer.from(
    `PACKPROOF-UPLOAD-ID\0v1\0${transactionId}\0${uploaderId}\0${clientEvidenceId}`,
    'utf8',
  ));
}

function normalizeDigest(value, label) {
  const normalized = String(value).toLowerCase();
  if (!HEX_SHA256.test(normalized)) throw new TypeError(`${label} must be a hexadecimal SHA-256 digest.`);
  return normalized;
}
