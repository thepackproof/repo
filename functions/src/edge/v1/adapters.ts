import { createHash, randomUUID } from 'node:crypto';
import {
  barcodeObservedEventSchema,
  weightStableEventSchema,
  type BarcodeObservedEvent,
  type CameraEvent,
  type WmsOrderAssignedEvent,
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
}

export interface PrinterEventAdapter {
  readonly deviceId: string;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function monotonic(): number {
  return Date.now();
}

export class SimulatedHidScanner implements BarcodeScannerAdapter {
  constructor(readonly deviceId: string, readonly stationId: string) {}

  observe(rawValue: string, format = 'CODE128'): BarcodeObservedEvent {
    return barcodeObservedEventSchema.parse({
      type: 'BARCODE_OBSERVED',
      format,
      normalizedValue: rawValue.trim(),
      rawValueHash: sha256(rawValue),
      deviceId: this.deviceId,
      stationId: this.stationId,
      monotonicTimestamp: monotonic(),
    });
  }
}

export class SimulatedSerialScanner extends SimulatedHidScanner {}

export class SimulatedUsbScale implements ScaleAdapter {
  private sequence = 0;

  constructor(readonly deviceId: string) {}

  observeStable(grams: number): WeightStableEvent {
    this.sequence += 1;
    return weightStableEventSchema.parse({
      type: 'WEIGHT_STABLE',
      grams,
      deviceId: this.deviceId,
      measurementSequence: this.sequence,
      monotonicTimestamp: monotonic(),
    });
  }
}

export class SimulatedUvcCamera implements CameraAdapter {
  constructor(readonly deviceId: string) {}

  notifyStreamAvailable(sourceStreamId: string): CameraEvent {
    return { type: 'VIDEO_STREAM_AVAILABLE', deviceId: this.deviceId, sourceStreamId, monotonicTimestamp: monotonic() };
  }

  startCapture(sourceStreamId: string, fulfillmentSessionId: string | null): CameraEvent {
    return {
      type: 'CAPTURE_STARTED',
      deviceId: this.deviceId,
      sourceStreamId,
      fulfillmentSessionId,
      monotonicTimestamp: monotonic(),
    };
  }

  finalizeSegment(sourceStreamId: string, bytes: Buffer, durationMs: number): CameraEvent {
    return {
      type: 'CAPTURE_SEGMENT_FINALIZED',
      deviceId: this.deviceId,
      sourceStreamId,
      segmentSha256: sha256(bytes),
      durationMs,
      monotonicTimestamp: monotonic(),
    };
  }

  captureStill(bytes: Buffer): CameraEvent {
    return { type: 'STILL_CAPTURED', deviceId: this.deviceId, sha256: sha256(bytes), monotonicTimestamp: monotonic() };
  }

  interrupt(sourceStreamId: string, reason: string): CameraEvent {
    return { type: 'STREAM_INTERRUPTED', deviceId: this.deviceId, sourceStreamId, reason, monotonicTimestamp: monotonic() };
  }
}

export class SimulatedRtspCamera extends SimulatedUvcCamera {}

export class SimulatedWmsAdapter implements WmsAdapter {
  assignOrder(input: {
    externalOrderId: string;
    stationCode: string;
    expectedItems: { sku: string; quantity: number }[];
    expectedTrackingNumber: string | null;
    transactionId: string | null;
  }): WmsOrderAssignedEvent {
    return { type: 'ORDER_ASSIGNED', ...input };
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
