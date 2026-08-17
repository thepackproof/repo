import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError, EnterpriseFulfillmentApplicationService } from '../lib/application/v1/index.js';
import { createSoftwareWrappedSpoolKey, EncryptedEdgeQueue, PackProofEdgeStationRuntime } from '../lib/edge/v1/index.js';

const now = new Date('2026-08-17T12:00:00.000Z');

class MemoryEnterpriseRepository {
  stations = new Map();
  sessions = new Map();
  byOrder = new Map();

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
}

async function boot(mode = 'OBSERVE') {
  const repository = new MemoryEnterpriseRepository();
  let current = now;
  const service = new EnterpriseFulfillmentApplicationService(repository, () => current);
  const station = await service.bootstrapStation({
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
  const network = { online: true };
  const runtime = new PackProofEdgeStationRuntime({
    service,
    station,
    queue,
    online: () => network.online,
    clock: () => current,
  });
  return { repository, service, station, queue, network, runtime, advance: (ms) => { current = new Date(current.getTime() + ms); } };
}

test('single-station OBSERVE pilot preserves offline capture and requires independent server finalization', async () => {
  const { service, station, queue, network, runtime } = await boot('OBSERVE');
  const assigned = await runtime.assignOrder({
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-928182', quantity: 1 }],
    expectedTrackingNumber: '1Z999AA',
  });
  assert.equal(assigned.fulfillment.state, 'ACQUIRING');
  assert.equal(assigned.evidenceSession.maxArtifacts, 8);
  await runtime.scan('SKU-928182');
  await runtime.scan('1Z999AA');
  await runtime.weigh(842);
  const captured = await runtime.completePackingAndCapture();
  assert.equal(captured.session.fulfillment.state, 'PACKING_COMPLETE');
  assert.equal(queue.list('pending').length, 2);
  network.online = false;
  await runtime.syncUploads();
  assert.equal(queue.list('pending').length, 2);
  assert.equal(queue.label(queue.list('pending')[0].clientEvidenceId), 'ONLINE_ASSURED');
  network.online = true;
  await runtime.syncUploads();
  assert.equal(queue.list('awaiting-finalization').length, 2);
  assert.equal(queue.list('finalized').length, 0);
  const uploaded = await service.getSession(captured.session.fulfillment.id);
  assert.ok(uploaded.artifacts.every((item) => item.status === 'UPLOADED'));
  await assert.rejects(
    () => service.applyServerFinalization(captured.session.fulfillment.id, captured.videoId, { type: 'EDGE_AGENT', id: station.edgeAgent.id }),
    (error) => error instanceof ApplicationError && error.code === 'EDGE_CANNOT_FINALIZE',
  );
  assert.throws(() => service.attemptFinalizeFromEdge(), (error) => error instanceof ApplicationError && error.code === 'EDGE_CANNOT_FINALIZE');
  await service.applyServerFinalization(captured.session.fulfillment.id, captured.videoId, { type: 'SYSTEM', id: 'evidence-finalizer' });
  await service.applyServerFinalization(captured.session.fulfillment.id, captured.sealId, { type: 'SYSTEM', id: 'evidence-finalizer' });
  for (const item of queue.list('awaiting-finalization')) runtime.acknowledgeServerFinalization(item.clientEvidenceId);
  assert.equal(queue.list('finalized').length, 2);
  await service.beginFinalizing(captured.session.fulfillment.id, { type: 'SYSTEM', id: 'evidence-finalizer' }, 'request-finalize');
  const ready = await service.markEvidenceReady(captured.session.fulfillment.id, { type: 'SYSTEM', id: 'evidence-finalizer' }, 'request-ready');
  assert.equal(ready.fulfillment.state, 'EVIDENCE_READY');
  const released = await service.release(captured.session.fulfillment.id, { type: 'SYSTEM', id: 'evidence-finalizer' }, 'request-release');
  assert.equal(released.fulfillment.state, 'RELEASED');
  assert.ok(released.events.some((item) => item.type === 'PACKPROOF_EVIDENCE_READY'));
  const { evaluation } = service.evaluate(released);
  assert.ok(evaluation.statements.includes('Packing video server-finalized'));
  assert.ok(evaluation.statements.includes('Seal reference server-finalized'));
  assert.ok(evaluation.statements.some((item) => item.includes('SKU-928182')));
  assert.ok(evaluation.statements.some((item) => item.includes('1Z999AA')));
  assert.ok(evaluation.statements.includes('Final package weight 842 g'));
  assert.ok(evaluation.statements.includes('No recorded byte-integrity mismatch'));
});

test('duplicate WMS assignment replays the same fulfillment session', async () => {
  const { service, station } = await boot('OBSERVE');
  const command = {
    organizationId: station.organization.organizationId,
    siteCode: station.site.code,
    stationCode: station.station.code,
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-928182', quantity: 1 }],
    expectedTrackingNumber: '1Z999AA',
    commandKey: '84721',
    requestId: 'request-wms-1',
  };
  const first = await service.assignOrder(command, { type: 'EDGE_AGENT', id: station.edgeAgent.id });
  const replay = await service.assignOrder({ ...command, requestId: 'request-wms-2' }, { type: 'EDGE_AGENT', id: station.edgeAgent.id });
  assert.equal(replay.fulfillment.id, first.fulfillment.id);
  await assert.rejects(
    () => service.assignOrder({ ...command, expectedTrackingNumber: 'OTHER' }, { type: 'EDGE_AGENT', id: station.edgeAgent.id }),
    (error) => error instanceof ApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('ENFORCE mode will not release an incomplete session while OBSERVE still records the gap', async () => {
  const observe = await boot('OBSERVE');
  await observe.runtime.assignOrder({
    externalOrderId: '84721',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-1', quantity: 1 }],
    expectedTrackingNumber: '1Z1',
  });
  const packedObserve = await observe.runtime.completePackingAndCapture();
  await observe.service.beginFinalizing(packedObserve.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-finalizing-observe');
  const incompleteObserve = await observe.service.markEvidenceReady(packedObserve.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-ready-observe');
  assert.equal(incompleteObserve.fulfillment.state, 'EVIDENCE_INCOMPLETE');
  const released = await observe.service.release(packedObserve.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-release-observe');
  assert.equal(released.fulfillment.state, 'RELEASED');

  const enforce = await boot('ENFORCE');
  await enforce.runtime.assignOrder({
    externalOrderId: '84722',
    transactionId: 'txn_12345678',
    expectedItems: [{ sku: 'SKU-1', quantity: 1 }],
    expectedTrackingNumber: '1Z1',
  });
  const packedEnforce = await enforce.runtime.completePackingAndCapture();
  await enforce.service.beginFinalizing(packedEnforce.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-finalizing-enforce');
  const incompleteEnforce = await enforce.service.markEvidenceReady(packedEnforce.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-ready-enforce');
  assert.equal(incompleteEnforce.fulfillment.state, 'EVIDENCE_INCOMPLETE');
  await assert.rejects(
    () => enforce.service.release(packedEnforce.session.fulfillment.id, { type: 'SYSTEM', id: 'finalizer' }, 'request-release-enforce'),
    (error) => error instanceof ApplicationError && error.code === 'FULFILLMENT_GATE_BLOCKING',
  );
});

test('encrypted Edge spool decrypts exact bytes and refuses to treat upload as finalization', () => {
  const queue = new EncryptedEdgeQueue(createSoftwareWrappedSpoolKey());
  const plaintext = Buffer.from('station-packing-segment');
  const record = queue.enqueue({
    fulfillmentSessionId: 'fs_12345678',
    artifactType: 'STATION_PACKING_VIDEO',
    plaintext,
    plaintextSha256: 'a'.repeat(64),
    onlineAtCapture: false,
    clientEvidenceId: 'client-evidence-1',
  });
  assert.equal(record.folder, 'pending');
  assert.equal(queue.label(record.clientEvidenceId), 'OFFLINE_PENDING_SYNC');
  assert.deepEqual(queue.decrypt(record.clientEvidenceId), plaintext);
  queue.markUploading(record.clientEvidenceId);
  const uploaded = queue.markUploaded(record.clientEvidenceId);
  assert.equal(uploaded.folder, 'awaiting-finalization');
  assert.equal(uploaded.transportState, 'AWAITING_FINALIZATION');
  assert.notEqual(uploaded.transportState, 'SERVER_FINALIZED');
});
