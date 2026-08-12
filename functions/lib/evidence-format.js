"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUNDLE_BINDING_PROFILE = exports.CANONICALIZATION_PROFILE = exports.EVIDENCE_MANIFEST_SCHEMA_VERSION = void 0;
exports.detectSupportedMediaType = detectSupportedMediaType;
exports.canonicalizeJson = canonicalizeJson;
exports.sha256Hex = sha256Hex;
exports.createEvidenceBundleSha256 = createEvidenceBundleSha256;
exports.deterministicUploadId = deterministicUploadId;
const node_crypto_1 = require("node:crypto");
exports.EVIDENCE_MANIFEST_SCHEMA_VERSION = 2;
exports.CANONICALIZATION_PROFILE = 'PACKPROOF_JCS_1';
exports.BUNDLE_BINDING_PROFILE = 'PACKPROOF_EVIDENCE_BUNDLE_V2';
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const MP4_BRANDS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', 'mp71', 'dash']);
function detectSupportedMediaType(prefix) {
    if (prefix.length >= 4 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff)
        return 'image/jpeg';
    if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'image/png';
    if (prefix.length >= 12 && prefix.subarray(4, 8).toString('ascii') === 'ftyp') {
        const brands = [prefix.subarray(8, 12).toString('ascii')];
        for (let offset = 16; offset + 4 <= prefix.length; offset += 4)
            brands.push(prefix.subarray(offset, offset + 4).toString('ascii'));
        if (brands.some((brand) => MP4_BRANDS.has(brand)))
            return 'video/mp4';
    }
    if (prefix.length >= 5 && prefix.subarray(0, 5).toString('ascii') === '%PDF-')
        return 'application/pdf';
    return null;
}
/**
 * Canonicalize JSON using the JSON primitives and ECMAScript serialization
 * rules required by RFC 8785, with a strict I-JSON input gate. Object property
 * names are sorted by UTF-16 code units, which is JavaScript's default sort
 * order and the ordering required by JCS.
 *
 * Undefined values, sparse arrays, non-finite numbers, BigInt, functions and
 * symbols are rejected instead of being silently rewritten. Callers must
 * explicitly choose null or omit an object member before canonicalization.
 */
function canonicalizeJson(value, path = '$') {
    if (value === null)
        return 'null';
    if (typeof value === 'string') {
        assertWellFormedUnicode(value, path);
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new TypeError(`${path} must be a finite JSON number.`);
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        const items = [];
        for (let index = 0; index < value.length; index += 1) {
            if (!(index in value) || value[index] === undefined)
                throw new TypeError(`${path}[${index}] must be an explicit JSON value.`);
            items.push(canonicalizeJson(value[index], `${path}[${index}]`));
        }
        return `[${items.join(',')}]`;
    }
    if (typeof value === 'object') {
        const record = value;
        const prototype = Object.getPrototypeOf(record);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError(`${path} must be a plain JSON object.`);
        }
        const keys = Object.keys(record).sort();
        return `{${keys.map((key) => {
            assertWellFormedUnicode(key, `${path} object key`);
            const item = record[key];
            if (item === undefined)
                throw new TypeError(`${path}.${key} must be omitted or set to an explicit JSON value.`);
            return `${JSON.stringify(key)}:${canonicalizeJson(item, `${path}.${key}`)}`;
        }).join(',')}}`;
    }
    throw new TypeError(`${path} contains a value that JSON cannot represent.`);
}
function assertWellFormedUnicode(value, path) {
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff)
                throw new TypeError(`${path} contains an unpaired Unicode surrogate.`);
            index += 1;
        }
        else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
            throw new TypeError(`${path} contains an unpaired Unicode surrogate.`);
        }
    }
}
function sha256Hex(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
/**
 * Version 2 binds two fixed-length binary SHA-256 digests with an explicit
 * domain and algorithm labels. This avoids relying on a human-readable
 * delimiter while keeping the historical version-1 verifier possible.
 */
function createEvidenceBundleSha256(fileSha256, manifestSha256) {
    const fileDigest = normalizedDigest(fileSha256, 'fileSha256');
    const manifestDigest = normalizedDigest(manifestSha256, 'manifestSha256');
    return sha256Hex(Buffer.concat([
        Buffer.from('PACKPROOF-EVIDENCE-BUNDLE\0v2\0sha256\0', 'utf8'),
        Buffer.from(fileDigest, 'hex'),
        Buffer.from('\0sha256\0', 'utf8'),
        Buffer.from(manifestDigest, 'hex'),
    ]));
}
function deterministicUploadId(input) {
    return sha256Hex(Buffer.from(`PACKPROOF-UPLOAD-ID\0v1\0${input.transactionId}\0${input.uploaderId}\0${input.clientEvidenceId}`, 'utf8'));
}
function normalizedDigest(value, label) {
    const normalized = value.toLowerCase();
    if (!HEX_SHA256.test(normalized))
        throw new TypeError(`${label} must be a hexadecimal SHA-256 digest.`);
    return normalized;
}
//# sourceMappingURL=evidence-format.js.map