"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingLabelStillCaptureStatuses = exports.shippingTrackerLookupStatuses = exports.SHIPPING_OBSERVATION_INTERPRETATION = void 0;
exports.asShippingTrackerObservation = asShippingTrackerObservation;
exports.identifyTrackingNumber = identifyTrackingNumber;
exports.canonicalShippingObservationV1 = canonicalShippingObservationV1;
exports.hashShippingObservation = hashShippingObservation;
const node_crypto_1 = require("node:crypto");
const ts_tracking_number_1 = require("ts-tracking-number");
exports.SHIPPING_OBSERVATION_INTERPRETATION = 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY';
exports.shippingTrackerLookupStatuses = ['DATASET_VALIDATED', 'UNRECOGNIZED', 'LOOKUP_INCOMPLETE'];
exports.shippingLabelStillCaptureStatuses = ['CAPTURED', 'FAILED', 'UNAVAILABLE_WHILE_RECORDING', 'NOT_ATTEMPTED'];
function optionalSha256(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}
function asShippingTrackerObservation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const input = value;
    const observationSha256 = optionalSha256(input.observationSha256);
    if (!observationSha256)
        return null;
    const lookupStatus = exports.shippingTrackerLookupStatuses.includes(input.lookupStatus)
        ? input.lookupStatus
        : 'LOOKUP_INCOMPLETE';
    const stillCaptureStatus = exports.shippingLabelStillCaptureStatuses.includes(input.stillCaptureStatus)
        ? input.stillCaptureStatus
        : null;
    return {
        lookupStatus,
        courierCode: typeof input.courierCode === 'string' ? input.courierCode.slice(0, 20) : null,
        courierName: typeof input.courierName === 'string' ? input.courierName.slice(0, 80) : null,
        publicTrackingUrl: typeof input.publicTrackingUrl === 'string' ? input.publicTrackingUrl.slice(0, 1000) : null,
        stillSha256: optionalSha256(input.stillSha256),
        stillCaptureStatus,
        observationSha256,
        clientObservationSha256: optionalSha256(input.clientObservationSha256),
        hashMatched: typeof input.hashMatched === 'boolean' ? input.hashMatched : null,
        interpretation: exports.SHIPPING_OBSERVATION_INTERPRETATION,
    };
}
function interpolateTrackingUrl(url, trackingNumber) {
    if (!url)
        return null;
    try {
        const filled = url.replace('%s', encodeURIComponent(trackingNumber));
        return new URL(filled).toString().slice(0, 1000);
    }
    catch {
        return null;
    }
}
function addMatch(matches, seen, item) {
    if (!item)
        return;
    const key = `${item.courier.code}:${item.trackingNumber}`;
    if (seen.has(key))
        return;
    seen.add(key);
    matches.push(item);
}
function identifyTrackingNumber(rawDecodedValue, normalizedTrackingNumber) {
    try {
        const matches = [];
        const seen = new Set();
        addMatch(matches, seen, (0, ts_tracking_number_1.getTracking)(normalizedTrackingNumber));
        addMatch(matches, seen, (0, ts_tracking_number_1.getTracking)(rawDecodedValue.trim()));
        for (const item of (0, ts_tracking_number_1.findTracking)(rawDecodedValue))
            addMatch(matches, seen, item);
        for (const item of (0, ts_tracking_number_1.findTracking)(normalizedTrackingNumber))
            addMatch(matches, seen, item);
        const primary = matches[0];
        if (!primary) {
            return {
                identified: false,
                checksumValid: false,
                courierCode: null,
                courierName: null,
                trackerName: null,
                publicTrackingUrl: null,
                lookupStatus: 'UNRECOGNIZED',
            };
        }
        const trackingNumber = primary.trackingNumber || normalizedTrackingNumber;
        return {
            identified: true,
            checksumValid: true,
            courierCode: primary.courier.code.slice(0, 20),
            courierName: primary.courier.name.slice(0, 80),
            trackerName: primary.name.slice(0, 80),
            publicTrackingUrl: interpolateTrackingUrl(primary.trackingUrl, trackingNumber),
            lookupStatus: 'DATASET_VALIDATED',
        };
    }
    catch {
        return {
            identified: false,
            checksumValid: false,
            courierCode: null,
            courierName: null,
            trackerName: null,
            publicTrackingUrl: null,
            lookupStatus: 'LOOKUP_INCOMPLETE',
        };
    }
}
function canonicalShippingObservationV1(input) {
    return [
        'PACKPROOF_SHIPPING_OBSERVATION_V1',
        input.trackingNumber,
        input.rawDecodedValue,
        input.symbology,
        input.courierCode ?? '',
        input.trackerName ?? '',
        input.checksumValid ? '1' : '0',
        input.publicTrackingUrl ?? '',
        input.stillSha256 ?? '',
    ].join('\n');
}
function hashShippingObservation(input) {
    return (0, node_crypto_1.createHash)('sha256').update(canonicalShippingObservationV1(input), 'utf8').digest('hex');
}
//# sourceMappingURL=shipping-tracker.js.map