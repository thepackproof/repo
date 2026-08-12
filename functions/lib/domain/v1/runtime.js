"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainValidationError = void 0;
exports.schema = schema;
exports.strictObject = strictObject;
exports.stringValue = stringValue;
exports.optionalString = optionalString;
exports.booleanValue = booleanValue;
exports.integerValue = integerValue;
exports.enumValue = enumValue;
exports.literalValue = literalValue;
exports.isoDateTime = isoDateTime;
exports.optionalIsoDateTime = optionalIsoDateTime;
exports.sha256Value = sha256Value;
exports.urlValue = urlValue;
exports.arrayValue = arrayValue;
exports.recordValue = recordValue;
exports.jsonValue = jsonValue;
class DomainValidationError extends Error {
    issues;
    constructor(issue) {
        const issues = Array.isArray(issue) ? issue : [issue];
        super(issues.map((item) => `${item.path}: ${item.message}`).join('; '));
        this.name = 'DomainValidationError';
        this.issues = issues;
    }
}
exports.DomainValidationError = DomainValidationError;
function schema(parse) {
    return { parse };
}
function fail(path, code, message) {
    throw new DomainValidationError({ path, code, message });
}
function strictObject(value, path, allowedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        fail(path, 'TYPE', 'must be an object');
    const result = value;
    const unknown = Object.keys(result).filter((key) => !allowedKeys.includes(key));
    if (unknown.length)
        fail(`${path}.${unknown[0]}`, 'UNKNOWN_FIELD', 'is not allowed');
    return result;
}
function stringValue(value, path, options = { max: 1000 }) {
    if (typeof value !== 'string')
        fail(path, value === undefined ? 'REQUIRED' : 'TYPE', 'must be a string');
    const result = options.trim === false ? value : value.trim();
    for (let index = 0; index < result.length; index += 1) {
        const codeUnit = result.charCodeAt(index);
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
            const next = result.charCodeAt(index + 1);
            if (index + 1 >= result.length || next < 0xdc00 || next > 0xdfff)
                fail(path, 'FORMAT', 'must contain well-formed Unicode');
            index += 1;
        }
        else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
            fail(path, 'FORMAT', 'must contain well-formed Unicode');
        }
    }
    if (result.length < (options.min ?? 0) || result.length > options.max) {
        fail(path, 'RANGE', `must contain ${options.min ?? 0}-${options.max} characters`);
    }
    if (options.pattern && !options.pattern.test(result))
        fail(path, 'FORMAT', 'has an invalid format');
    return result;
}
function optionalString(value, path, options) {
    if (value === undefined || value === null)
        return null;
    return stringValue(value, path, options);
}
function booleanValue(value, path) {
    if (typeof value !== 'boolean')
        fail(path, value === undefined ? 'REQUIRED' : 'TYPE', 'must be a boolean');
    return value;
}
function integerValue(value, path, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value))
        fail(path, value === undefined ? 'REQUIRED' : 'TYPE', 'must be a safe integer');
    if (value < minimum || value > maximum)
        fail(path, 'RANGE', `must be between ${minimum} and ${maximum}`);
    return value;
}
function enumValue(value, path, allowed) {
    if (typeof value !== 'string' || !allowed.includes(value))
        fail(path, value === undefined ? 'REQUIRED' : 'FORMAT', `must be one of: ${allowed.join(', ')}`);
    return value;
}
function literalValue(value, path, expected) {
    if (value !== expected)
        fail(path, value === undefined ? 'REQUIRED' : 'FORMAT', `must equal ${String(expected)}`);
    return expected;
}
function isoDateTime(value, path) {
    const text = stringValue(value, path, { min: 20, max: 40 });
    const milliseconds = Date.parse(text);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(milliseconds))
        fail(path, 'FORMAT', 'must be an ISO-8601 timestamp');
    return new Date(milliseconds).toISOString();
}
function optionalIsoDateTime(value, path) {
    if (value === undefined || value === null)
        return null;
    return isoDateTime(value, path);
}
function sha256Value(value, path) {
    return stringValue(value, path, { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ });
}
function urlValue(value, path, maximum = 2000) {
    const result = stringValue(value, path, { min: 1, max: maximum });
    let parsed;
    try {
        parsed = new URL(result);
    }
    catch {
        return fail(path, 'FORMAT', 'must be a valid URL');
    }
    if (parsed.protocol !== 'https:' || !parsed.host)
        fail(path, 'FORMAT', 'must use an absolute HTTPS URL');
    return result;
}
function arrayValue(value, path, options) {
    if (!Array.isArray(value))
        fail(path, value === undefined ? 'REQUIRED' : 'TYPE', 'must be an array');
    if (value.length < (options.min ?? 0) || value.length > options.max)
        fail(path, 'RANGE', `must contain ${options.min ?? 0}-${options.max} entries`);
    const result = value.map((item, index) => options.parse(item, `${path}[${index}]`));
    if (options.uniqueBy) {
        const keys = result.map(options.uniqueBy);
        if (new Set(keys).size !== keys.length)
            fail(path, 'DUPLICATE', 'must not contain duplicate entries');
    }
    return result;
}
function recordValue(value, path, options) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        fail(path, value === undefined ? 'REQUIRED' : 'TYPE', 'must be an object');
    const entries = Object.entries(value);
    if (entries.length > options.maxKeys)
        fail(path, 'RANGE', `must contain no more than ${options.maxKeys} keys`);
    return Object.fromEntries(entries.map(([key, item]) => {
        const parsedKey = stringValue(key, `${path} key`, { min: 1, max: 200, pattern: /^[A-Za-z0-9_.-]+$/ });
        return [parsedKey, options.parse(item, `${path}.${parsedKey}`)];
    }));
}
function jsonValue(value, path, depth = 0) {
    if (depth > 8)
        fail(path, 'RANGE', 'must not exceed eight nested levels');
    if (value === null || typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            fail(path, 'FORMAT', 'must contain only finite numbers');
        return value;
    }
    if (typeof value === 'string')
        return stringValue(value, path, { max: 20_000, trim: false });
    if (Array.isArray(value)) {
        if (value.length > 200)
            fail(path, 'RANGE', 'must contain no more than 200 entries');
        return value.map((item, index) => jsonValue(item, `${path}[${index}]`, depth + 1));
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length > 200)
            fail(path, 'RANGE', 'must contain no more than 200 keys');
        return Object.fromEntries(entries.map(([key, item]) => [
            stringValue(key, `${path} key`, { min: 1, max: 200 }),
            jsonValue(item, `${path}.${key}`, depth + 1),
        ]));
    }
    return fail(path, 'TYPE', 'must be a JSON value');
}
//# sourceMappingURL=runtime.js.map