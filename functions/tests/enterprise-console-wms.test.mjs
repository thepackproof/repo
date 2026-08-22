import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApplicationError,
  createEnterpriseTestService,
  EnterpriseConsoleApplicationService,
  EnterpriseWmsApplicationService,
} from '../lib/application/v1/index.js';
import { createSoftwareWrappedSpoolKey, EncryptedEdgeQueue, PackProofEdgeStationRuntime } from '../lib/edge/v1/index.js';

const now = new Date('2026-08-17T12:00:00.000Z');

class MemoryEnterpriseRepository {
  stations = new Map();
  sessions = new Map();
  byOrder = new Map();
  ingress = new Map();
  mappings = new Map();

  async saveStation(graph) {
    this.stations.set(`${graph.organization.organizationId}:${graph.station.id}`, graph);
    this.stations.set(`${graph.organization.organizationId}:${graph.site.code}:${graph.station.code}`, graph);
  }
  async getStation(organizationId, stationId) {
    return this.stations.get(`${organizationId}:${stationId}`) ?? null;
  }
  async findStationByCode(organizationId, siteCode, stationCode) {
    return this.stations.get(`${organizationId}:${siteCode}:${stationCode}`) ?? null;
  }
  async saveSession(record) {
    this.sessions.set(record.fulfillment.id, structuredClone(record));
    this.byOrder.set(`${record.fulfillment.organizationId}:${record.fulfillment.stationId}:${record.fulfillment.externalOrderId}`, structuredClone(record));
  }
  async getSession(id) {
    const record = this.sessions.get(id);
    return record ? structuredClone(record) : null;
  }
  async findSessionByOrder(organizationId, stationId, externalOrderId) {
    const record = this.byOrder.get(`${organizationId}:${stationId}:${externalOrderId}`);
    return record ? structuredClone(record) : null;
  }
  async saveIngress(uploadId, bytes) {
    this.ingress.set(uploadId, Buffer.from(bytes));
  }
  async getIngress(uploadId) {
    const bytes = this.ingress.get(uploadId);
    return bytes ? Buffer.from(bytes) : null;
  }
  async listStations(organizationId) {
    const unique = new Map();
    for (const graph of this.stations.values()) {
      if (graph.organization.organizationId === organizationId) unique.set(graph.station.id, graph);
    }
    return [...unique.values()].map((item) => structuredClone(item));
  }
  async listSessions(organizationId) {
    return [...this.sessions.values()].filter((item) => item.fulfillment.organizationId === organizationId).map((item) => structuredClone(item));
  }
  async saveWmsMapping(mapping) {
    this.mappings.set(`${mapping.organizationId}:${mapping.externalStationCode}`, structuredClone(mapping));
  }
  async listWmsMappings(organizationId) {
    return [...this.mappings.values()].filter((item) => item.organizationId === organizationId).map((item) => structuredClone(item));
  }
  async findWmsMapping(organizationId, externalStationCode) {
    const mapping = this.mappings.get(`${organizationId}:${externalStationCode}`);
    return mapping ? structuredClone(mapping) : null;
  }
}

async function boot(mode = 'OBSERVE') {
  const repository = new MemoryEnterpriseRepository();
  let current = now;
  const fulfillment = createEnterpriseTestService(repository, () => current);
  const consoleService = new EnterpriseConsoleApplicationService(fulfillment, repository, () => current);
  const wms = new EnterpriseWmsApplicationService(fulfillment, repository);
  const station = await fulfillment.bootstrapStation({
    organizationId: 'org_12345678',
    siteCode: 'CMH-FC-01',
    siteName: 'Columbus',
    stationCode: 'PACK-042',
    edgeInstallationIdentity: 'EDGE-CMH-03',
    policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1',
    operatingMode: mode,
    requestId: 'request-boot',
  }, { type: 'MERCHANT_API_CLIENT', id: 'client_12345678' });
  const queue = new EncryptedEdgeQueue(createSoftwareWrappedSpoolKey());
  const runtime = new PackProofEdgeStationRuntime({
    service: fulfillment,
    station,
    queue,
    online: () => true,
    clock: () => current,
    edgePrivateKeyPkcs8: station.edgePrivateKeyPkcs8,
  });
  return { repository, fulfillment, consoleService, wms, station, queue, runtime };
}

function queueHealth(station, queue) {
  const records = queue.list();
  return [{
    stationId: station.station.id,
    pending: records.filter((item) => item.folder === 'pending').length,
    uploading: records.filter((item) => item.folder === 'uploading').length,
    awaitingFinalization: records.filter((item) => item.folder === 'awaiting-finalization').length,
    finalized: records.filter((item) => item.folder === 'finalized').length,
    attention: records.filter((item) => item.folder === 'attention').length,
  }];
}

test('Enterprise console shows station health and cannot rewrite finalized evidence', async () => {
  const { fulfillment, consoleService, station, queue, runtime } = await boot('OBSERVE');
  let snapshot = await consoleService.snapshot(station.organization.organizationId, queueHealth(station, queue));
  assert.equal(snapshot.stations[0].health, 'Healthy');
  assert.ok(snapshot.limitations.some((item) => item.includes('does not alter finalized evidence')));
  const html = consoleService.renderHtml(snapshot);
  assert.match(html, /PACK-042/);
  assert.match(html, /Enterprise Pilot — Observe Mode/);
  assert.doesNotMatch(html, /fraud/i);

  const camera = station.devices.find((item) => item.kind === 'OVERHEAD_CAMERA');
  await fulfillment.setDeviceStatus(station.organization.organizationId, station.station.id, camera.id, 'OFFLINE', {
    type: 'CONSOLE_OPERATOR', id: 'ops-1',
  }, 'request-camera-offline');
  snapshot = await consoleService.snapshot(station.organization.organizationId, [{
    stationId: station.station.id, pending: 14, uploading: 0, awaitingFinalization: 0, finalized: 0, attention: 0,
  }]);
  assert.equal(snapshot.stations[0].health, 'Camera offline');
  await fulfillment.setDeviceStatus(station.organization.organizationId, station.station.id, camera.id, 'ONLINE', {
    type: 'CONSOLE_OPERATOR', id: 'ops-1',
  }, 'request-camera-online');

  await runtime.assignOrder({
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-1', quantity: 1 }],
    expectedTrackingNumber: '1Z1',
  });
  await runtime.completePackingAndCapture();
  snapshot = await consoleService.snapshot(station.organization.organizationId, [{
    stationId: station.station.id, pending: 0, uploading: 0, awaitingFinalization: 2, finalized: 0, attention: 0,
  }]);
  assert.equal(snapshot.stations[0].health, '2 evidence objects awaiting finalization');
  assert.notEqual(snapshot.stations[0].queue.finalized, snapshot.stations[0].queue.awaitingFinalization);

  await assert.throws(
    () => consoleService.attemptRewriteFinalizedArtifact(),
    (error) => error instanceof ApplicationError && error.code === 'CONSOLE_CANNOT_ALTER_FINALIZED',
  );
});

test('ASSIST console override is audited and ENFORCE stays blocking', async () => {
  const assist = await boot('ASSIST');
  await assist.runtime.assignOrder({
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-1', quantity: 1 }],
    expectedTrackingNumber: '1Z1',
  });
  const packed = await assist.runtime.completePackingAndCapture();
  await assist.fulfillment.beginFinalizing(packed.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-finalizing');
  const incomplete = await assist.fulfillment.markEvidenceReady(packed.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-ready');
  assert.equal(incomplete.fulfillment.state, 'EVIDENCE_INCOMPLETE');
  const released = await assist.consoleService.overrideIncompleteRelease(
    packed.session.fulfillment.id,
    { type: 'CONSOLE_OPERATOR', id: 'ops-1' },
    'request-override',
  );
  assert.equal(released.fulfillment.state, 'RELEASED');
  assert.ok(released.events.some((item) => item.type === 'CONSOLE_OPERATOR_OVERRIDE'));

  const enforce = await boot('ENFORCE');
  await enforce.runtime.assignOrder({
    externalOrderId: '84722',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-1', quantity: 1 }],
    expectedTrackingNumber: '1Z1',
  });
  const packedEnforce = await enforce.runtime.completePackingAndCapture();
  await enforce.fulfillment.beginFinalizing(packedEnforce.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-finalizing-enforce');
  await enforce.fulfillment.markEvidenceReady(packedEnforce.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-ready-enforce');
  await assert.rejects(
    () => enforce.consoleService.overrideIncompleteRelease(
      packedEnforce.session.fulfillment.id,
      { type: 'CONSOLE_OPERATOR', id: 'ops-1' },
      'request-override-enforce',
    ),
    (error) => error instanceof ApplicationError && error.code === 'FULFILLMENT_GATE_BLOCKING',
  );
});

test('WMS ingest binds and unassigns sessions through a station mapping', async () => {
  const { consoleService, wms, station, fulfillment } = await boot('OBSERVE');
  await consoleService.registerWmsMapping({
    organizationId: station.organization.organizationId,
    siteCode: station.site.code,
    stationCode: station.station.code,
    externalStationCode: '42',
  }, { type: 'CONSOLE_OPERATOR', id: 'ops-1' }, 'request-map');
  const assigned = await wms.ingest({
    type: 'ORDER_ASSIGNED',
    organizationId: station.organization.organizationId,
    externalStationCode: '42',
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-928182', quantity: 1 }],
    expectedTrackingNumber: '1Z999AA',
    commandKey: '84721',
    requestId: 'request-wms-assigned',
  }, { type: 'WMS_INTEGRATION', id: 'wms-cmh' });
  assert.equal(assigned.fulfillment.state, 'STATION_BOUND');
  assert.equal(assigned.fulfillment.externalOrderId, '84721');
  const replay = await wms.ingest({
    type: 'ORDER_ASSIGNED',
    organizationId: station.organization.organizationId,
    externalStationCode: '42',
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-928182', quantity: 1 }],
    expectedTrackingNumber: '1Z999AA',
    commandKey: '84721',
    requestId: 'request-wms-replay',
  }, { type: 'WMS_INTEGRATION', id: 'wms-cmh' });
  assert.equal(replay.fulfillment.id, assigned.fulfillment.id);
  await assert.rejects(
    () => wms.ingest({
      type: 'ORDER_ASSIGNED',
      organizationId: station.organization.organizationId,
      externalStationCode: '42',
      externalOrderId: '84721',
      transactionId: 'txn_12345678',
      expectedItems: [{ sku: 'SKU-928182', quantity: 1 }],
      expectedTrackingNumber: 'OTHER',
      commandKey: '84721',
      requestId: 'request-wms-conflict',
    }, { type: 'WMS_INTEGRATION', id: 'wms-cmh' }),
    (error) => error instanceof ApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
  const cancelled = await wms.ingest({
    type: 'ORDER_UNASSIGNED',
    organizationId: station.organization.organizationId,
    externalStationCode: '42',
    externalOrderId: '84721',
    transactionId: null,
    expectedItems: [],
    expectedTrackingNumber: null,
    commandKey: '84721',
    requestId: 'request-wms-unassign',
  }, { type: 'WMS_INTEGRATION', id: 'wms-cmh' });
  assert.equal(cancelled.fulfillment.state, 'CANCELLED');
  await assert.rejects(
    () => wms.ingest({
      type: 'ORDER_UNASSIGNED',
      organizationId: station.organization.organizationId,
      externalStationCode: '42',
      externalOrderId: 'missing',
      transactionId: null,
      expectedItems: [],
      expectedTrackingNumber: null,
      commandKey: 'missing',
      requestId: 'request-wms-missing',
    }, { type: 'WMS_INTEGRATION', id: 'wms-cmh' }),
    (error) => error instanceof ApplicationError && error.code === 'WMS_SESSION_NOT_FOUND',
  );
  await assert.rejects(
    () => wms.ingest({
      type: 'ORDER_ASSIGNED',
      organizationId: station.organization.organizationId,
      externalStationCode: '42',
      externalOrderId: '84799',
      transactionId: 'txn_12345678',
      expectedItems: [{ sku: 'SKU-1', quantity: 1 }],
      expectedTrackingNumber: '1Z1',
      commandKey: '84799',
      requestId: 'request-wms-edge',
    }, { type: 'EDGE_AGENT', id: station.edgeAgent.id }),
    (error) => error instanceof ApplicationError && error.code === 'WMS_INGEST_NOT_EDGE',
  );
  assert.equal((await fulfillment.getSession(assigned.fulfillment.id)).fulfillment.state, 'CANCELLED');
});

test('WMS receives PACKPROOF_EVIDENCE_READY only after independent server finalization', async () => {
  const { wms, station, runtime, fulfillment, queue } = await boot('OBSERVE');
  await runtime.assignOrder({
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-928182', quantity: 1 }],
    expectedTrackingNumber: '1Z999AA',
  });
  await runtime.scan('SKU-928182');
  await runtime.scan('1Z999AA');
  await runtime.weigh(842);
  const captured = await runtime.completePackingAndCapture();
  await runtime.syncUploads();
  await fulfillment.applyServerFinalization(captured.session.fulfillment.id, captured.videoId, { type: 'SYSTEM', id: 'evidence-finalizer' });
  await fulfillment.applyServerFinalization(captured.session.fulfillment.id, captured.sealId, { type: 'SYSTEM', id: 'evidence-finalizer' });
  for (const item of queue.list('awaiting-finalization')) runtime.acknowledgeServerFinalization(item.clientEvidenceId);
  await fulfillment.beginFinalizing(captured.session.fulfillment.id, { type: 'SYSTEM', id: 'evidence-finalizer' }, 'request-finalize');
  await fulfillment.markEvidenceReady(captured.session.fulfillment.id, { type: 'SYSTEM', id: 'evidence-finalizer' }, 'request-ready');
  const beforeRelease = await fulfillment.getSession(captured.session.fulfillment.id);
  await assert.throws(
    () => wms.evidenceReadyCallback(beforeRelease, station.station.code),
    (error) => error instanceof ApplicationError && error.code === 'EVIDENCE_NOT_READY',
  );
  const released = await fulfillment.release(captured.session.fulfillment.id, { type: 'SYSTEM', id: 'evidence-finalizer' }, 'request-release');
  const callback = wms.evidenceReadyCallback(released, station.station.code);
  assert.equal(callback.type, 'PACKPROOF_EVIDENCE_READY');
  assert.equal(callback.externalOrderId, '84721');
  assert.equal(callback.acquisitionClass, 'ENTERPRISE_EDGE');
  assert.ok(callback.statements.includes('Packing video server-finalized'));
  assert.equal(runtime.wms.recordEvidenceReady({ type: callback.type, externalOrderId: callback.externalOrderId }).externalOrderId, '84721');
});
