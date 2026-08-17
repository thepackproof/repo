import { createHash, randomUUID } from 'node:crypto';
import { classifyBarcode } from '../../domain/v1/edge-protocol';
import type { RollingCaptureProvenance } from '../../domain/v1/enterprise';
import type { EnterpriseFulfillmentApplicationService } from '../../application/v1/enterprise-fulfillment-service';
import type { EnterpriseSessionRecord, EnterpriseStationGraph } from '../../application/v1/enterprise-ports';
import {
  RollingChunkBuffer,
  SimulatedHidScanner,
  SimulatedRtspCamera,
  SimulatedUsbScale,
  SimulatedUvcCamera,
  SimulatedWmsAdapter,
  edgeSha256,
} from './adapters';
import { EncryptedEdgeQueue } from './queue';

export type StationRuntimeOptions = {
  service: EnterpriseFulfillmentApplicationService;
  station: EnterpriseStationGraph;
  queue: EncryptedEdgeQueue;
  online: () => boolean;
  clock?: () => Date;
};

function device(station: EnterpriseStationGraph, kind: EnterpriseStationGraph['devices'][number]['kind']) {
  const match = station.devices.find((item) => item.kind === kind);
  if (!match) throw new Error(`Station is missing ${kind}`);
  return match;
}

export class PackProofEdgeStationRuntime {
  readonly scanner: SimulatedHidScanner;
  readonly scale: SimulatedUsbScale;
  readonly overheadCamera: SimulatedUvcCamera;
  readonly labelCamera: SimulatedRtspCamera;
  readonly wms = new SimulatedWmsAdapter();
  private session: EnterpriseSessionRecord | null = null;
  private buffer = new RollingChunkBuffer();
  private sourceStreamId = 'stream-overhead-1';

  constructor(private readonly options: StationRuntimeOptions) {
    this.scanner = new SimulatedHidScanner(device(options.station, 'BARCODE_SCANNER').id, options.station.station.id);
    this.scale = new SimulatedUsbScale(device(options.station, 'SCALE').id);
    this.overheadCamera = new SimulatedUvcCamera(device(options.station, 'OVERHEAD_CAMERA').id);
    this.labelCamera = new SimulatedRtspCamera(device(options.station, 'LABEL_CAMERA').id);
  }

  get currentSession(): EnterpriseSessionRecord | null {
    return this.session;
  }

  async assignOrder(input: {
    externalOrderId: string;
    transactionId: string;
    expectedItems: { sku: string; quantity: number }[];
    expectedTrackingNumber: string | null;
    commandKey?: string;
    requestId?: string;
  }): Promise<EnterpriseSessionRecord> {
    this.wms.assignOrder({
      ...input,
      stationCode: this.options.station.station.code,
      transactionId: input.transactionId,
    });
    this.buffer = new RollingChunkBuffer();
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
      requestId: input.requestId ?? `req_${randomUUID()}`,
    }, { type: 'EDGE_AGENT', id: this.options.station.edgeAgent.id });
    this.session = await this.options.service.beginAcquiring(
      assigned.fulfillment.id,
      this.options.station.edgeAgent.id,
      `req_acquire_${assigned.fulfillment.id}`,
    );
    this.overheadCamera.startCapture(this.sourceStreamId, this.session.fulfillment.id);
    return this.session;
  }

  async scan(rawValue: string): Promise<EnterpriseSessionRecord> {
    const session = this.requireSession();
    const event = this.scanner.observe(rawValue);
    const classified = classifyBarcode(
      event.normalizedValue,
      session.fulfillment.expectedItems.map((item) => item.sku),
      session.fulfillment.expectedTrackingNumber,
    );
    if (classified === 'UNRECOGNIZED') return session;
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

  async weigh(grams: number): Promise<EnterpriseSessionRecord> {
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
      rawValueHash: edgeSha256(String(event.grams)),
      monotonicTimestampMs: event.monotonicTimestamp,
      requestId: `req_weight_${event.measurementSequence}`,
    });
    this.session = await this.reload();
    return this.session;
  }

  async completePackingAndCapture(): Promise<{ session: EnterpriseSessionRecord; videoId: string; sealId: string }> {
    const session = this.requireSession();
    this.buffer.appendLive(2);
    this.buffer.retainPostRoll(1);
    const assembled = this.buffer.assemble();
    const clock = this.options.clock ?? (() => new Date());
    const segmentEnd = clock();
    const segmentStart = new Date(segmentEnd.getTime() - 45_000);
    const rollingCapture: RollingCaptureProvenance = {
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
      plaintextSha256: edgeSha256(assembled.bytes),
      onlineAtCapture: this.options.online(),
      clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_PACKING_VIDEO', edgeSha256(assembled.bytes)),
    });
    const seal = this.options.queue.enqueue({
      fulfillmentSessionId: session.fulfillment.id,
      artifactType: 'STATION_SEAL_REFERENCE',
      plaintext: sealBytes,
      plaintextSha256: edgeSha256(sealBytes),
      onlineAtCapture: this.options.online(),
      clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_SEAL_REFERENCE', edgeSha256(sealBytes)),
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
    this.session = await this.options.service.completePacking(
      session.fulfillment.id,
      this.options.station.edgeAgent.id,
      `req_packed_${session.fulfillment.id}`,
    );
    return { session: this.session, videoId: videoArtifact.id, sealId: sealArtifact.id };
  }

  async syncUploads(): Promise<void> {
    if (!this.options.online()) return;
    for (const record of this.options.queue.list('pending')) {
      this.options.queue.markUploading(record.clientEvidenceId);
      const plaintext = this.options.queue.decrypt(record.clientEvidenceId);
      if (edgeSha256(plaintext) !== record.plaintextSha256) {
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

  acknowledgeServerFinalization(clientEvidenceId: string): void {
    this.options.queue.markServerFinalized(clientEvidenceId);
  }

  private requireSession(): EnterpriseSessionRecord {
    if (!this.session) throw new Error('No fulfillment session is bound to this station.');
    return this.session;
  }

  private async reload(): Promise<EnterpriseSessionRecord> {
    const current = this.requireSession();
    const latest = await this.options.service.getSession(current.fulfillment.id);
    if (!latest) throw new Error('Fulfillment session disappeared during reload.');
    return latest;
  }
}

export function contentAddressedClientEvidenceId(fulfillmentSessionId: string, artifactType: string, sha256Hex: string): string {
  return createHash('sha256').update(`edge-evidence-v1\n${fulfillmentSessionId}\n${artifactType}\n${sha256Hex}`).digest('hex');
}
