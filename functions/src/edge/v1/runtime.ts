import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RollingCaptureProvenance } from '../../domain/v1/enterprise';
import { parseEnterpriseResourceId } from '../../domain/v1/enterprise';
import { EdgeRequestSigner } from '../../application/v1/edge-authentication';
import type { EnterpriseFulfillmentApplicationService } from '../../application/v1/enterprise-fulfillment-service';
import type { EdgePrincipal } from '../../application/v1/edge-authentication';
import type { EnterpriseSessionRecord, EnterpriseStationGraph } from '../../application/v1/enterprise-ports';
import type { SignedEdgeRequest } from '../../domain/v1/edge-protocol';
import {
  RollingChunkBuffer,
  SimulatedHidScanner,
  SimulatedRtspCamera,
  SimulatedUsbScale,
  SimulatedUvcCamera,
  SimulatedWmsAdapter,
  edgeSha256,
  simulatedJpegStill,
  simulatedMp4Container,
} from './adapters';
import { EncryptedEdgeQueue } from './queue';

export type StationRuntimeOptions = {
  service: EnterpriseFulfillmentApplicationService;
  station: EnterpriseStationGraph;
  queue: EncryptedEdgeQueue;
  online: () => boolean;
  clock?: () => Date;
  edgePrivateKeyPkcs8: Buffer;
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
  private readonly signer: EdgeRequestSigner;

  constructor(private readonly options: StationRuntimeOptions) {
    this.scanner = new SimulatedHidScanner(device(options.station, 'BARCODE_SCANNER').id, options.station.station.id);
    this.scale = new SimulatedUsbScale(device(options.station, 'SCALE').id);
    this.overheadCamera = new SimulatedUvcCamera(device(options.station, 'OVERHEAD_CAMERA').id);
    this.labelCamera = new SimulatedRtspCamera(device(options.station, 'LABEL_CAMERA').id);
    this.signer = new EdgeRequestSigner(options.edgePrivateKeyPkcs8);
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
    const acquireBody = { action: 'BEGIN_ACQUIRING', fulfillmentSessionId: assigned.fulfillment.id };
    const principal = this.authenticate(acquireBody, assigned.fulfillment.id);
    this.session = await this.options.service.beginAcquiring(
      assigned.fulfillment.id,
      principal,
      `req_acquire_${assigned.fulfillment.id}`,
    );
    this.overheadCamera.startCapture(this.sourceStreamId, this.session.fulfillment.id);
    return this.session;
  }

  async scan(rawValue: string): Promise<EnterpriseSessionRecord> {
    const session = this.requireSession();
    const event = this.scanner.observe(rawValue);
    const command = {
      fulfillmentSessionId: session.fulfillment.id,
      deviceId: device(this.options.station, 'BARCODE_SCANNER').id,
      source: 'BARCODE_OBSERVED' as const,
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

  async weigh(grams: number): Promise<EnterpriseSessionRecord> {
    const session = this.requireSession();
    const event = this.scale.observeStable(grams);
    const command = {
      fulfillmentSessionId: session.fulfillment.id,
      deviceId: device(this.options.station, 'SCALE').id,
      source: 'WEIGHT_STABLE' as const,
      format: null,
      normalizedValue: null,
      grams: event.grams,
      rawValueHash: edgeSha256(String(event.grams)),
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
    const videoBytes = simulatedMp4Container(assembled.bytes);
    this.overheadCamera.finalizeSegment(this.sourceStreamId, videoBytes, 45_000);
    const sealBytes = simulatedJpegStill(Buffer.from(`seal:${session.fulfillment.id}`));
    this.labelCamera.captureStill(sealBytes);
    const video = this.options.queue.enqueue({
      fulfillmentSessionId: session.fulfillment.id,
      artifactType: 'STATION_PACKING_VIDEO',
      plaintext: videoBytes,
      plaintextSha256: edgeSha256(videoBytes),
      onlineAtCapture: this.options.online(),
      clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_PACKING_VIDEO', edgeSha256(videoBytes)),
    });
    const seal = this.options.queue.enqueue({
      fulfillmentSessionId: session.fulfillment.id,
      artifactType: 'STATION_SEAL_REFERENCE',
      plaintext: sealBytes,
      plaintextSha256: edgeSha256(sealBytes),
      onlineAtCapture: this.options.online(),
      clientEvidenceId: contentAddressedClientEvidenceId(session.fulfillment.id, 'STATION_SEAL_REFERENCE', edgeSha256(sealBytes)),
    });
    const videoCommand = {
      fulfillmentSessionId: session.fulfillment.id,
      deviceId: device(this.options.station, 'OVERHEAD_CAMERA').id,
      clientEvidenceId: video.clientEvidenceId,
      type: 'STATION_PACKING_VIDEO' as const,
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
      type: 'STATION_SEAL_REFERENCE' as const,
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
    this.session = await this.options.service.completePacking(
      session.fulfillment.id,
      packedPrincipal,
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

  acknowledgeServerFinalization(clientEvidenceId: string): void {
    this.options.queue.markServerFinalized(clientEvidenceId);
  }

  private authenticate(body: unknown, sessionId: string | null): EdgePrincipal {
    const clock = this.options.clock ?? (() => new Date());
    const request: SignedEdgeRequest = this.signer.sign({
      organizationId: this.options.station.organization.organizationId,
      siteId: this.options.station.site.id,
      edgeAgentId: this.options.station.edgeAgent.id,
      stationId: this.options.station.station.id,
      sessionId: sessionId ? parseEnterpriseResourceId('fulfillment_session', sessionId) : null,
      requestId: `req_${randomUUID()}`,
      timestamp: clock().toISOString(),
      nonce: randomBytes(16).toString('base64url'),
    }, body);
    return this.options.service.authenticateEdge(request, body);
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
