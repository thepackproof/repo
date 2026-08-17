"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackProofEdgeStationRuntime = void 0;
exports.contentAddressedClientEvidenceId = contentAddressedClientEvidenceId;
const node_crypto_1 = require("node:crypto");
const enterprise_1 = require("../../domain/v1/enterprise");
const edge_authentication_1 = require("../../application/v1/edge-authentication");
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
    signer;
    constructor(options) {
        this.options = options;
        this.scanner = new adapters_1.SimulatedHidScanner(device(options.station, 'BARCODE_SCANNER').id, options.station.station.id);
        this.scale = new adapters_1.SimulatedUsbScale(device(options.station, 'SCALE').id);
        this.overheadCamera = new adapters_1.SimulatedUvcCamera(device(options.station, 'OVERHEAD_CAMERA').id);
        this.labelCamera = new adapters_1.SimulatedRtspCamera(device(options.station, 'LABEL_CAMERA').id);
        this.signer = new edge_authentication_1.EdgeRequestSigner(options.edgePrivateKeyPkcs8);
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
        const acquireBody = { action: 'BEGIN_ACQUIRING', fulfillmentSessionId: assigned.fulfillment.id };
        const principal = this.authenticate(acquireBody, assigned.fulfillment.id);
        this.session = await this.options.service.beginAcquiring(assigned.fulfillment.id, principal, `req_acquire_${assigned.fulfillment.id}`);
        this.overheadCamera.startCapture(this.sourceStreamId, this.session.fulfillment.id);
        return this.session;
    }
    async scan(rawValue) {
        const session = this.requireSession();
        const event = this.scanner.observe(rawValue);
        const command = {
            fulfillmentSessionId: session.fulfillment.id,
            deviceId: device(this.options.station, 'BARCODE_SCANNER').id,
            source: 'BARCODE_OBSERVED',
            format: event.format,
            normalizedValue: event.normalizedValue,
            grams: null,
            rawValueHash: event.rawValueHash,
            monotonicTimestampMs: event.monotonicTimestamp,
            wallClockUtc: event.wallClockUtc,
            bootId: event.bootId,
            eventSequence: event.eventSequence,
            requestId: `req_scan_${event.rawValueHash}`,
        };
        const principal = this.authenticate({ action: 'RECORD_OBSERVATION', ...command }, session.fulfillment.id);
        await this.options.service.recordObservation(principal, command);
        this.session = await this.reload();
        return this.session;
    }
    async weigh(grams) {
        const session = this.requireSession();
        const event = this.scale.observeStable(grams);
        const command = {
            fulfillmentSessionId: session.fulfillment.id,
            deviceId: device(this.options.station, 'SCALE').id,
            source: 'WEIGHT_STABLE',
            format: null,
            normalizedValue: null,
            grams: event.grams,
            rawValueHash: (0, adapters_1.edgeSha256)(String(event.grams)),
            monotonicTimestampMs: event.monotonicTimestamp,
            wallClockUtc: event.wallClockUtc,
            bootId: event.bootId,
            eventSequence: event.eventSequence,
            requestId: `req_weight_${event.measurementSequence}`,
        };
        const principal = this.authenticate({ action: 'RECORD_OBSERVATION', ...command }, session.fulfillment.id);
        await this.options.service.recordObservation(principal, command);
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
        const videoBytes = (0, adapters_1.simulatedMp4Container)(assembled.bytes);
        this.overheadCamera.finalizeSegment(this.sourceStreamId, videoBytes, 45_000);
        const sealBytes = (0, adapters_1.simulatedJpegStill)(Buffer.from(`seal:${session.fulfillment.id}`));
        this.labelCamera.captureStill(sealBytes);
        const video = this.options.queue.enqueue({
            fulfillmentSessionId: session.fulfillment.id,
            artifactType: 'STATION_PACKING_VIDEO',
            plaintext: videoBytes,
            plaintextSha256: (0, adapters_1.edgeSha256)(videoBytes),
            onlineAtCapture: this.options.online(),
            clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_PACKING_VIDEO', (0, adapters_1.edgeSha256)(videoBytes)),
        });
        const seal = this.options.queue.enqueue({
            fulfillmentSessionId: session.fulfillment.id,
            artifactType: 'STATION_SEAL_REFERENCE',
            plaintext: sealBytes,
            plaintextSha256: (0, adapters_1.edgeSha256)(sealBytes),
            onlineAtCapture: this.options.online(),
            clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_SEAL_REFERENCE', (0, adapters_1.edgeSha256)(sealBytes)),
        });
        const videoCommand = {
            fulfillmentSessionId: session.fulfillment.id,
            deviceId: device(this.options.station, 'OVERHEAD_CAMERA').id,
            clientEvidenceId: video.clientEvidenceId,
            type: 'STATION_PACKING_VIDEO',
            contentType: 'video/mp4',
            sizeBytes: videoBytes.length,
            sha256: video.plaintextSha256,
            rollingCapture,
            requestId: `req_video_${video.clientEvidenceId}`,
        };
        const sealCommand = {
            fulfillmentSessionId: session.fulfillment.id,
            deviceId: device(this.options.station, 'LABEL_CAMERA').id,
            clientEvidenceId: seal.clientEvidenceId,
            type: 'STATION_SEAL_REFERENCE',
            contentType: 'image/jpeg',
            sizeBytes: sealBytes.length,
            sha256: seal.plaintextSha256,
            rollingCapture: null,
            requestId: `req_seal_${seal.clientEvidenceId}`,
        };
        const videoPrincipal = this.authenticate({ action: 'RESERVE_ARTIFACT', ...videoCommand }, session.fulfillment.id);
        const videoArtifact = await this.options.service.reserveArtifact(videoPrincipal, videoCommand);
        const sealPrincipal = this.authenticate({ action: 'RESERVE_ARTIFACT', ...sealCommand }, session.fulfillment.id);
        const sealArtifact = await this.options.service.reserveArtifact(sealPrincipal, sealCommand);
        const packedBody = { action: 'COMPLETE_PACKING', fulfillmentSessionId: session.fulfillment.id };
        const packedPrincipal = this.authenticate(packedBody, session.fulfillment.id);
        this.session = await this.options.service.completePacking(session.fulfillment.id, packedPrincipal, `req_packed_${session.fulfillment.id}`);
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
            if (!artifact) {
                this.options.queue.markAttention(record.clientEvidenceId);
                continue;
            }
            const ingressBody = { action: 'ACCEPT_INGRESS', fulfillmentSessionId: record.fulfillmentSessionId, artifactId: artifact.id };
            const principal = this.authenticate(ingressBody, record.fulfillmentSessionId);
            await this.options.service.acceptIngress(record.fulfillmentSessionId, artifact.id, principal, plaintext);
            const uploadedBody = { action: 'MARK_UPLOADED', fulfillmentSessionId: record.fulfillmentSessionId, artifactId: artifact.id };
            const uploadedPrincipal = this.authenticate(uploadedBody, record.fulfillmentSessionId);
            await this.options.service.markUploaded(record.fulfillmentSessionId, artifact.id, uploadedPrincipal);
            this.options.queue.markUploaded(record.clientEvidenceId);
        }
        this.session = this.session ? await this.reload() : this.session;
    }
    acknowledgeServerFinalization(clientEvidenceId) {
        this.options.queue.markServerFinalized(clientEvidenceId);
    }
    authenticate(body, sessionId) {
        const clock = this.options.clock ?? (() => new Date());
        const request = this.signer.sign({
            organizationId: this.options.station.organization.organizationId,
            siteId: this.options.station.site.id,
            edgeAgentId: this.options.station.edgeAgent.id,
            stationId: this.options.station.station.id,
            sessionId: sessionId ? (0, enterprise_1.parseEnterpriseResourceId)('fulfillment_session', sessionId) : null,
            requestId: `req_${(0, node_crypto_1.randomUUID)()}`,
            timestamp: clock().toISOString(),
            nonce: (0, node_crypto_1.randomBytes)(16).toString('base64url'),
        }, body);
        return this.options.service.authenticateEdge(request, body);
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