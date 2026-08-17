"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackProofEdgeStationRuntime = void 0;
exports.contentAddressedClientEvidenceId = contentAddressedClientEvidenceId;
const node_crypto_1 = require("node:crypto");
const edge_protocol_1 = require("../../domain/v1/edge-protocol");
const adapters_1 = require("./adapters");
function device(station, kind) {
    const match = station.devices.find((item) => item.kind === kind);
    if (!match)
        throw new Error(`Station is missing ${kind}`);
    return match;
}
class PackProofEdgeStationRuntime {
    options;
    scanner;
    scale;
    overheadCamera;
    labelCamera;
    wms = new adapters_1.SimulatedWmsAdapter();
    session = null;
    buffer = new adapters_1.RollingChunkBuffer();
    sourceStreamId = 'stream-overhead-1';
    constructor(options) {
        this.options = options;
        this.scanner = new adapters_1.SimulatedHidScanner(device(options.station, 'BARCODE_SCANNER').id, options.station.station.id);
        this.scale = new adapters_1.SimulatedUsbScale(device(options.station, 'SCALE').id);
        this.overheadCamera = new adapters_1.SimulatedUvcCamera(device(options.station, 'OVERHEAD_CAMERA').id);
        this.labelCamera = new adapters_1.SimulatedRtspCamera(device(options.station, 'LABEL_CAMERA').id);
    }
    get currentSession() {
        return this.session;
    }
    async assignOrder(input) {
        this.wms.assignOrder({
            ...input,
            stationCode: this.options.station.station.code,
            transactionId: input.transactionId,
        });
        this.buffer = new adapters_1.RollingChunkBuffer();
        this.buffer.retainPreRoll(1);
        this.overheadCamera.notifyStreamAvailable(this.sourceStreamId);
        const assigned = await this.options.service.assignOrder({
            organizationId: this.options.station.organization.organizationId,
            siteCode: this.options.station.site.code,
            stationCode: this.options.station.station.code,
            externalOrderId: input.externalOrderId,
            transactionId: input.transactionId,
            expectedItems: input.expectedItems,
            expectedTrackingNumber: input.expectedTrackingNumber,
            commandKey: input.commandKey ?? input.externalOrderId,
            requestId: input.requestId ?? `req_${(0, node_crypto_1.randomUUID)()}`,
        }, { type: 'EDGE_AGENT', id: this.options.station.edgeAgent.id });
        this.session = await this.options.service.beginAcquiring(assigned.fulfillment.id, this.options.station.edgeAgent.id, `req_acquire_${assigned.fulfillment.id}`);
        this.overheadCamera.startCapture(this.sourceStreamId, this.session.fulfillment.id);
        return this.session;
    }
    async scan(rawValue) {
        const session = this.requireSession();
        const event = this.scanner.observe(rawValue);
        const classified = (0, edge_protocol_1.classifyBarcode)(event.normalizedValue, session.fulfillment.expectedItems.map((item) => item.sku), session.fulfillment.expectedTrackingNumber);
        if (classified === 'UNRECOGNIZED')
            return session;
        await this.options.service.recordObservation({
            fulfillmentSessionId: session.fulfillment.id,
            edgeAgentId: this.options.station.edgeAgent.id,
            deviceId: device(this.options.station, 'BARCODE_SCANNER').id,
            type: classified === 'ITEM_OBSERVED' ? 'ITEM_BARCODE_OBSERVATION' : 'TRACKING_BARCODE_OBSERVATION',
            acquisitionClass: 'ENTERPRISE_EDGE',
            normalizedValue: event.normalizedValue,
            grams: null,
            rawValueHash: event.rawValueHash,
            monotonicTimestampMs: event.monotonicTimestamp,
            requestId: `req_scan_${event.rawValueHash}`,
        });
        this.session = await this.reload();
        return this.session;
    }
    async weigh(grams) {
        const session = this.requireSession();
        const event = this.scale.observeStable(grams);
        await this.options.service.recordObservation({
            fulfillmentSessionId: session.fulfillment.id,
            edgeAgentId: this.options.station.edgeAgent.id,
            deviceId: device(this.options.station, 'SCALE').id,
            type: 'PACKAGE_WEIGHT_OBSERVATION',
            acquisitionClass: 'ENTERPRISE_EDGE',
            normalizedValue: null,
            grams: event.grams,
            rawValueHash: (0, adapters_1.edgeSha256)(String(event.grams)),
            monotonicTimestampMs: event.monotonicTimestamp,
            requestId: `req_weight_${event.measurementSequence}`,
        });
        this.session = await this.reload();
        return this.session;
    }
    async completePackingAndCapture() {
        const session = this.requireSession();
        this.buffer.appendLive(2);
        this.buffer.retainPostRoll(1);
        const assembled = this.buffer.assemble();
        const clock = this.options.clock ?? (() => new Date());
        const segmentEnd = clock();
        const segmentStart = new Date(segmentEnd.getTime() - 45_000);
        const rollingCapture = {
            captureSource: 'ENTERPRISE_EDGE',
            sourceStreamId: this.sourceStreamId,
            segmentStart: segmentStart.toISOString(),
            segmentEnd: segmentEnd.toISOString(),
            preRollDurationMs: 15_000,
            postRollDurationMs: 15_000,
            codec: 'avc1',
            originalSegmentHashes: assembled.originalSegmentHashes,
            assemblyMethod: 'DETERMINISTIC_CHUNK_CONCAT',
            captureKind: 'DERIVED_TRANSACTION_SEGMENT',
        };
        this.overheadCamera.finalizeSegment(this.sourceStreamId, assembled.bytes, 45_000);
        const sealBytes = Buffer.from(`seal:${session.fulfillment.id}`);
        this.labelCamera.captureStill(sealBytes);
        const video = this.options.queue.enqueue({
            fulfillmentSessionId: session.fulfillment.id,
            artifactType: 'STATION_PACKING_VIDEO',
            plaintext: assembled.bytes,
            plaintextSha256: (0, adapters_1.edgeSha256)(assembled.bytes),
            onlineAtCapture: this.options.online(),
            clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_PACKING_VIDEO', (0, adapters_1.edgeSha256)(assembled.bytes)),
        });
        const seal = this.options.queue.enqueue({
            fulfillmentSessionId: session.fulfillment.id,
            artifactType: 'STATION_SEAL_REFERENCE',
            plaintext: sealBytes,
            plaintextSha256: (0, adapters_1.edgeSha256)(sealBytes),
            onlineAtCapture: this.options.online(),
            clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_SEAL_REFERENCE', (0, adapters_1.edgeSha256)(sealBytes)),
        });
        const videoArtifact = await this.options.service.reserveArtifact({
            fulfillmentSessionId: session.fulfillment.id,
            edgeAgentId: this.options.station.edgeAgent.id,
            deviceId: device(this.options.station, 'OVERHEAD_CAMERA').id,
            clientEvidenceId: video.clientEvidenceId,
            type: 'STATION_PACKING_VIDEO',
            contentType: 'video/mp4',
            sizeBytes: assembled.bytes.length,
            sha256: video.plaintextSha256,
            rollingCapture,
            requestId: `req_video_${video.clientEvidenceId}`,
        });
        const sealArtifact = await this.options.service.reserveArtifact({
            fulfillmentSessionId: session.fulfillment.id,
            edgeAgentId: this.options.station.edgeAgent.id,
            deviceId: device(this.options.station, 'LABEL_CAMERA').id,
            clientEvidenceId: seal.clientEvidenceId,
            type: 'STATION_SEAL_REFERENCE',
            contentType: 'image/jpeg',
            sizeBytes: sealBytes.length,
            sha256: seal.plaintextSha256,
            rollingCapture: null,
            requestId: `req_seal_${seal.clientEvidenceId}`,
        });
        this.session = await this.options.service.completePacking(session.fulfillment.id, this.options.station.edgeAgent.id, `req_packed_${session.fulfillment.id}`);
        return { session: this.session, videoId: videoArtifact.id, sealId: sealArtifact.id };
    }
    async syncUploads() {
        if (!this.options.online())
            return;
        for (const record of this.options.queue.list('pending')) {
            this.options.queue.markUploading(record.clientEvidenceId);
            const plaintext = this.options.queue.decrypt(record.clientEvidenceId);
            if ((0, adapters_1.edgeSha256)(plaintext) !== record.plaintextSha256) {
                this.options.queue.markAttention(record.clientEvidenceId);
                continue;
            }
            const artifact = this.session?.artifacts.find((item) => item.sha256 === record.plaintextSha256);
            if (artifact) {
                await this.options.service.markUploaded(record.fulfillmentSessionId, artifact.id, this.options.station.edgeAgent.id);
            }
            this.options.queue.markUploaded(record.clientEvidenceId);
        }
        this.session = this.session ? await this.reload() : this.session;
    }
    acknowledgeServerFinalization(clientEvidenceId) {
        this.options.queue.markServerFinalized(clientEvidenceId);
    }
    requireSession() {
        if (!this.session)
            throw new Error('No fulfillment session is bound to this station.');
        return this.session;
    }
    async reload() {
        const current = this.requireSession();
        const latest = await this.options.service.getSession(current.fulfillment.id);
        if (!latest)
            throw new Error('Fulfillment session disappeared during reload.');
        return latest;
    }
}
exports.PackProofEdgeStationRuntime = PackProofEdgeStationRuntime;
function contentAddressedClientEvidenceId(fulfillmentSessionId, artifactType, sha256Hex) {
    return (0, node_crypto_1.createHash)('sha256').update(`edge-evidence-v1\n${fulfillmentSessionId}\n${artifactType}\n${sha256Hex}`).digest('hex');
}
//# sourceMappingURL=runtime.js.map