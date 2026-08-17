"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollingChunkBuffer = exports.SimulatedWmsAdapter = exports.SimulatedRtspCamera = exports.SimulatedUvcCamera = exports.SimulatedUsbScale = exports.SimulatedSerialScanner = exports.SimulatedHidScanner = void 0;
exports.edgeCaptureClock = edgeCaptureClock;
exports.simulatedMp4Container = simulatedMp4Container;
exports.simulatedJpegStill = simulatedJpegStill;
exports.edgeSha256 = sha256;
const node_crypto_1 = require("node:crypto");
const edge_protocol_1 = require("../../domain/v1/edge-protocol");
function sha256(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
const processBootId = (0, node_crypto_1.randomUUID)();
let processEventSequence = 0;
function edgeCaptureClock(wallClock = () => new Date()) {
    processEventSequence += 1;
    return {
        wallClockUtc: wallClock().toISOString(),
        monotonicElapsed: Number(process.hrtime.bigint() / 1000000n),
        bootId: processBootId,
        eventSequence: processEventSequence,
    };
}
class SimulatedHidScanner {
    deviceId;
    stationId;
    constructor(deviceId, stationId) {
        this.deviceId = deviceId;
        this.stationId = stationId;
    }
    observe(rawValue, format = 'CODE128') {
        const clock = edgeCaptureClock();
        return edge_protocol_1.barcodeObservedEventSchema.parse({
            type: 'BARCODE_OBSERVED',
            format,
            normalizedValue: rawValue.trim(),
            rawValueHash: sha256(rawValue),
            deviceId: this.deviceId,
            stationId: this.stationId,
            monotonicTimestamp: clock.monotonicElapsed,
            wallClockUtc: clock.wallClockUtc,
            bootId: clock.bootId,
            eventSequence: clock.eventSequence,
        });
    }
}
exports.SimulatedHidScanner = SimulatedHidScanner;
class SimulatedSerialScanner extends SimulatedHidScanner {
}
exports.SimulatedSerialScanner = SimulatedSerialScanner;
class SimulatedUsbScale {
    deviceId;
    sequence = 0;
    constructor(deviceId) {
        this.deviceId = deviceId;
    }
    observeStable(grams) {
        this.sequence += 1;
        const clock = edgeCaptureClock();
        return edge_protocol_1.weightStableEventSchema.parse({
            type: 'WEIGHT_STABLE',
            grams,
            deviceId: this.deviceId,
            measurementSequence: this.sequence,
            monotonicTimestamp: clock.monotonicElapsed,
            wallClockUtc: clock.wallClockUtc,
            bootId: clock.bootId,
            eventSequence: clock.eventSequence,
        });
    }
}
exports.SimulatedUsbScale = SimulatedUsbScale;
class SimulatedUvcCamera {
    deviceId;
    constructor(deviceId) {
        this.deviceId = deviceId;
    }
    notifyStreamAvailable(sourceStreamId) {
        const clock = edgeCaptureClock();
        return { type: 'VIDEO_STREAM_AVAILABLE', deviceId: this.deviceId, sourceStreamId, monotonicTimestamp: clock.monotonicElapsed };
    }
    startCapture(sourceStreamId, fulfillmentSessionId) {
        const clock = edgeCaptureClock();
        return {
            type: 'CAPTURE_STARTED',
            deviceId: this.deviceId,
            sourceStreamId,
            fulfillmentSessionId,
            monotonicTimestamp: clock.monotonicElapsed,
        };
    }
    finalizeSegment(sourceStreamId, bytes, durationMs) {
        const clock = edgeCaptureClock();
        return {
            type: 'CAPTURE_SEGMENT_FINALIZED',
            deviceId: this.deviceId,
            sourceStreamId,
            segmentSha256: sha256(bytes),
            durationMs,
            monotonicTimestamp: clock.monotonicElapsed,
        };
    }
    captureStill(bytes) {
        const clock = edgeCaptureClock();
        return { type: 'STILL_CAPTURED', deviceId: this.deviceId, sha256: sha256(bytes), monotonicTimestamp: clock.monotonicElapsed };
    }
    interrupt(sourceStreamId, reason) {
        const clock = edgeCaptureClock();
        return { type: 'STREAM_INTERRUPTED', deviceId: this.deviceId, sourceStreamId, reason, monotonicTimestamp: clock.monotonicElapsed };
    }
}
exports.SimulatedUvcCamera = SimulatedUvcCamera;
class SimulatedRtspCamera extends SimulatedUvcCamera {
}
exports.SimulatedRtspCamera = SimulatedRtspCamera;
class SimulatedWmsAdapter {
    lastEvidenceReady = null;
    assignOrder(input) {
        return { type: 'ORDER_ASSIGNED', ...input };
    }
    unassignOrder(input) {
        return { type: 'ORDER_UNASSIGNED', ...input };
    }
    recordEvidenceReady(payload) {
        this.lastEvidenceReady = payload;
        return payload;
    }
}
exports.SimulatedWmsAdapter = SimulatedWmsAdapter;
function simulatedMp4Container(payload) {
    const header = Buffer.alloc(24);
    header.writeUInt32BE(24, 0);
    header.write('ftyp', 4);
    header.write('isom', 8);
    header.writeUInt32BE(0, 12);
    header.write('isom', 16);
    header.write('mp41', 20);
    return Buffer.concat([header, payload]);
}
function simulatedJpegStill(payload) {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), payload, Buffer.from([0xff, 0xd9])]);
}
class RollingChunkBuffer {
    chunkBytes;
    chunks = [];
    constructor(chunkBytes = Buffer.from('packproof-edge-rolling-chunk')) {
        this.chunkBytes = chunkBytes;
    }
    retainPreRoll(count = 1) {
        const retained = [];
        for (let index = 0; index < count; index += 1) {
            const bytes = Buffer.concat([this.chunkBytes, Buffer.from(`pre:${index}:${(0, node_crypto_1.randomUUID)()}`)]);
            const digest = sha256(bytes);
            const chunk = { sha256: digest, bytes };
            this.chunks.push(chunk);
            retained.push(chunk);
        }
        return retained;
    }
    appendLive(count = 1) {
        const added = [];
        for (let index = 0; index < count; index += 1) {
            const bytes = Buffer.concat([this.chunkBytes, Buffer.from(`live:${index}:${(0, node_crypto_1.randomUUID)()}`)]);
            const chunk = { sha256: sha256(bytes), bytes };
            this.chunks.push(chunk);
            added.push(chunk);
        }
        return added;
    }
    retainPostRoll(count = 1) {
        return this.appendLive(count);
    }
    assemble() {
        return {
            bytes: Buffer.concat(this.chunks.map((chunk) => chunk.bytes)),
            originalSegmentHashes: this.chunks.map((chunk) => chunk.sha256),
        };
    }
}
exports.RollingChunkBuffer = RollingChunkBuffer;
//# sourceMappingURL=adapters.js.map