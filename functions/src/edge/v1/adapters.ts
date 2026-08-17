import { createHash, randomUUID } from 'node:crypto';
import {
  barcodeObservedEventSchema,
  weightStableEventSchema,
  type BarcodeObservedEvent,
  type CameraEvent,
  type WmsOrderAssignedEvent,
  type WmsOrderUnassignedEvent,
  type WeightStableEvent,
} from '../../domain/v1/edge-protocol';

export interface BarcodeScannerAdapter {
  readonly deviceId: string;
  readonly stationId: string;
  observe(rawValue: string, format?: string): BarcodeObservedEvent;
}

export interface ScaleAdapter {
  readonly deviceId: string;
  observeStable(grams: number): WeightStableEvent;
}

export interface CameraAdapter {
  readonly deviceId: string;
  notifyStreamAvailable(sourceStreamId: string): CameraEvent;
  startCapture(sourceStreamId: string, fulfillmentSessionId: string | null): CameraEvent;
  finalizeSegment(sourceStreamId: string, bytes: Buffer, durationMs: number): CameraEvent;
  captureStill(bytes: Buffer): CameraEvent;
  interrupt(sourceStreamId: string, reason: string): CameraEvent;
}

export interface WmsAdapter {
  assignOrder(input: {
    externalOrderId: string;
    stationCode: string;
    expectedItems: { sku: string; quantity: number }[];
    expectedTrackingNumber: string | null;
    transactionId: string | null;
  }): WmsOrderAssignedEvent;
  unassignOrder(input: { externalOrderId: string; stationCode: string }): WmsOrderUnassignedEvent;
  recordEvidenceReady(payload: { type: 'PACKPROOF_EVIDENCE_READY'; externalOrderId: string }): { type: 'PACKPROOF_EVIDENCE_READY'; externalOrderId: string };
}

export interface PrinterEventAdapter {
  readonly deviceId: string;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

const processBootId = randomUUID();
let processEventSequence = 0;

export function edgeCaptureClock(wallClock: () => Date = () => new Date()): {
  wallClockUtc: string;
  monotonicElapsed: number;
  bootId: string;
  eventSequence: number;
} {
  processEventSequence += 1;
  return {
    wallClockUtc: wallClock().toISOString(),
    monotonicElapsed: Number(process.hrtime.bigint() / 1_000_000n),
    bootId: processBootId,
    eventSequence: processEventSequence,
  };
}

export class SimulatedHidScanner implements BarcodeScannerAdapter {
  constructor(readonly deviceId: string, readonly stationId: string) {}

  observe(rawValue: string, format = 'CODE128'): BarcodeObservedEvent {
    const clock = edgeCaptureClock();
    return barcodeObservedEventSchema.parse({
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

export class SimulatedSerialScanner extends SimulatedHidScanner {}

export class SimulatedUsbScale implements ScaleAdapter {
  private sequence = 0;

  constructor(readonly deviceId: string) {}

  observeStable(grams: number): WeightStableEvent {
    this.sequence += 1;
    const clock = edgeCaptureClock();
    return weightStableEventSchema.parse({
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

export class SimulatedUvcCamera implements CameraAdapter {
  constructor(readonly deviceId: string) {}

  notifyStreamAvailable(sourceStreamId: string): CameraEvent {
    const clock = edgeCaptureClock();
    return { type: 'VIDEO_STREAM_AVAILABLE', deviceId: this.deviceId, sourceStreamId, monotonicTimestamp: clock.monotonicElapsed };
  }

  startCapture(sourceStreamId: string, fulfillmentSessionId: string | null): CameraEvent {
    const clock = edgeCaptureClock();
    return {
      type: 'CAPTURE_STARTED',
      deviceId: this.deviceId,
      sourceStreamId,
      fulfillmentSessionId,
      monotonicTimestamp: clock.monotonicElapsed,
    };
  }

  finalizeSegment(sourceStreamId: string, bytes: Buffer, durationMs: number): CameraEvent {
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

  captureStill(bytes: Buffer): CameraEvent {
    const clock = edgeCaptureClock();
    return { type: 'STILL_CAPTURED', deviceId: this.deviceId, sha256: sha256(bytes), monotonicTimestamp: clock.monotonicElapsed };
  }

  interrupt(sourceStreamId: string, reason: string): CameraEvent {
    const clock = edgeCaptureClock();
    return { type: 'STREAM_INTERRUPTED', deviceId: this.deviceId, sourceStreamId, reason, monotonicTimestamp: clock.monotonicElapsed };
  }
}

export class SimulatedRtspCamera extends SimulatedUvcCamera {}

export class SimulatedWmsAdapter implements WmsAdapter {
  lastEvidenceReady: { type: 'PACKPROOF_EVIDENCE_READY'; externalOrderId: string } | null = null;

  assignOrder(input: {
    externalOrderId: string;
    stationCode: string;
    expectedItems: { sku: string; quantity: number }[];
    expectedTrackingNumber: string | null;
    transactionId: string | null;
  }): WmsOrderAssignedEvent {
    return { type: 'ORDER_ASSIGNED', ...input };
  }

  unassignOrder(input: { externalOrderId: string; stationCode: string }): WmsOrderUnassignedEvent {
    return { type: 'ORDER_UNASSIGNED', ...input };
  }

  recordEvidenceReady(payload: { type: 'PACKPROOF_EVIDENCE_READY'; externalOrderId: string }) {
    this.lastEvidenceReady = payload;
    return payload;
  }
}

export function simulatedMp4Container(payload: Buffer): Buffer {
  const header = Buffer.alloc(24);
  header.writeUInt32BE(24, 0);
  header.write('ftyp', 4);
  header.write('isom', 8);
  header.writeUInt32BE(0, 12);
  header.write('isom', 16);
  header.write('mp41', 20);
  return Buffer.concat([header, payload]);
}

export function simulatedJpegStill(payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), payload, Buffer.from([0xff, 0xd9])]);
}

export class RollingChunkBuffer {
  private readonly chunks: { sha256: string; bytes: Buffer }[] = [];

  constructor(private readonly chunkBytes: Buffer = Buffer.from('packproof-edge-rolling-chunk')) {}

  retainPreRoll(count = 1): { sha256: string; bytes: Buffer }[] {
    const retained = [];
    for (let index = 0; index < count; index += 1) {
      const bytes = Buffer.concat([this.chunkBytes, Buffer.from(`pre:${index}:${randomUUID()}`)]);
      const digest = sha256(bytes);
      const chunk = { sha256: digest, bytes };
      this.chunks.push(chunk);
      retained.push(chunk);
    }
    return retained;
  }

  appendLive(count = 1): { sha256: string; bytes: Buffer }[] {
    const added = [];
    for (let index = 0; index < count; index += 1) {
      const bytes = Buffer.concat([this.chunkBytes, Buffer.from(`live:${index}:${randomUUID()}`)]);
      const chunk = { sha256: sha256(bytes), bytes };
      this.chunks.push(chunk);
      added.push(chunk);
    }
    return added;
  }

  retainPostRoll(count = 1): { sha256: string; bytes: Buffer }[] {
    return this.appendLive(count);
  }

  assemble(): { bytes: Buffer; originalSegmentHashes: string[] } {
    return {
      bytes: Buffer.concat(this.chunks.map((chunk) => chunk.bytes)),
      originalSegmentHashes: this.chunks.map((chunk) => chunk.sha256),
    };
  }
}

export { sha256 as edgeSha256 };
