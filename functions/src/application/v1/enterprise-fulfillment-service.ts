import { canonicalizeJson, deterministicUploadId, sha256Hex } from '../../evidence-format';
import { finalizeReceivedEvidence, hmacManifestSigner, type ManifestSigner } from '../../evidence-finalization';
import {
  assertFulfillmentTransition,
  assertNeutralEnterpriseStatement,
  acquisitionCompatibleFulfillmentStates,
  deviceCredentialDtoSchema,
  edgeAgentDtoSchema,
  enterpriseArtifactDtoSchema,
  enterpriseEvidenceSessionDtoSchema,
  enterpriseOrganizationDtoSchema,
  enterpriseSiteDtoSchema,
  enterpriseWorkflowPolicies,
  evaluateEnterprisePolicy,
  fulfillmentSessionDtoSchema,
  hardwareObservationDtoSchema,
  itemBarcodeObservationCompleteness,
  packingStationDtoSchema,
  parseEnterpriseResourceId,
  requirementSatisfier,
  resolveWorkflowPolicy,
  stationDeviceDtoSchema,
  trackingObservationSatisfied,
  canTransitionFulfillment,
  type EnterpriseArtifactDto,
  type FulfillmentSessionStatus,
  type HardwareObservationDto,
  type PolicyEvidenceFact,
} from '../../domain/v1/enterprise';
import { classifyBarcode } from '../../domain/v1/edge-protocol';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import { canonicalize, sha256 } from './merchant-transaction-service';
import type {
  ActorRef,
  AssignOrderCommand,
  BootstrapStationCommand,
  BootstrapStationResult,
  EnterpriseFulfillmentRepository,
  EnterpriseSessionRecord,
  EnterpriseStationGraph,
  EnterpriseUploadGrant,
  RecordObservationCommand,
  ReserveArtifactCommand,
} from './enterprise-ports';
import {
  EdgeAuthenticationService,
  generateEdgeDeviceKeyPair,
  MemoryEdgeCredentialDirectory,
  MemoryNonceStore,
  sha256Buffer,
  type EdgePrincipal,
} from './edge-authentication';
import type { SignedEdgeRequest } from '../../domain/v1/edge-protocol';

function iso(date: Date): string {
  return date.toISOString();
}

function stableId(prefix: string, namespace: string, value: unknown): string {
  return `${prefix}${sha256(`${namespace}\n${canonicalize(value)}`).slice(0, 40)}`;
}

function event(
  type: string,
  actor: ActorRef,
  resourceType: string,
  resourceId: string,
  requestId: string,
  organizationId: string,
  occurredAt: Date,
  data: ApplicationEvent['data'] = {},
): ApplicationEvent {
  return {
    id: `evt_${sha256(`${type}:${resourceId}:${requestId}`).slice(0, 40)}`,
    schemaVersion: 1,
    type,
    organizationId,
    actor,
    resourceType,
    resourceId,
    requestId,
    occurredAt,
    data,
  };
}

export function createEnterpriseTestService(
  repository: EnterpriseFulfillmentRepository,
  clock: () => Date = () => new Date(),
): EnterpriseFulfillmentApplicationService {
  return new EnterpriseFulfillmentApplicationService(
    repository,
    clock,
    hmacManifestSigner('packproof-enterprise-test-manifest-mac-key-32b', 'manifest-hmac-v1'),
    new EdgeAuthenticationService(new MemoryEdgeCredentialDirectory(), new MemoryNonceStore(), clock),
  );
}

export class EnterpriseFulfillmentApplicationService {
  private readonly reservationLocks = new Map<string, Promise<void>>();
  private readonly issuedPrincipals = new WeakSet<EdgePrincipal>();

  constructor(
    private readonly repository: EnterpriseFulfillmentRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly signer: ManifestSigner,
    private readonly edgeAuth: EdgeAuthenticationService,
  ) {}

  authenticateEdge(request: SignedEdgeRequest, body: unknown): EdgePrincipal {
    const principal = this.edgeAuth.authenticate(request, body);
    this.issuedPrincipals.add(principal);
    return principal;
  }

  async bootstrapStation(command: BootstrapStationCommand, actor: ActorRef): Promise<BootstrapStationResult> {
    const now = iso(this.clock());
    const policy = resolveWorkflowPolicy(command.policyId);
    const organizationId = command.organizationId;
    const organization = enterpriseOrganizationDtoSchema.parse({
      id: stableId('entorg_', 'enterprise-organization-v1', organizationId),
      object: 'enterprise_organization',
      schemaVersion: 1,
      organizationId,
      status: 'ACTIVE',
      operatingMode: command.operatingMode,
      defaultPolicyId: policy.policyId,
      createdAt: now,
      updatedAt: now,
    });
    const site = enterpriseSiteDtoSchema.parse({
      id: stableId('site_', 'enterprise-site-v1', { organizationId, code: command.siteCode }),
      object: 'enterprise_site',
      schemaVersion: 1,
      organizationId,
      code: command.siteCode,
      name: command.siteName,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    const station = packingStationDtoSchema.parse({
      id: stableId('station_', 'packing-station-v1', { siteId: site.id, code: command.stationCode }),
      object: 'packing_station',
      schemaVersion: 1,
      organizationId,
      siteId: site.id,
      code: command.stationCode,
      status: 'ACTIVE',
      policyId: policy.policyId,
      createdAt: now,
      updatedAt: now,
    });
    const edgeAgent = edgeAgentDtoSchema.parse({
      id: stableId('edge_', 'edge-agent-v1', { organizationId, installation: command.edgeInstallationIdentity }),
      object: 'edge_agent',
      schemaVersion: 1,
      organizationId,
      siteId: site.id,
      stationId: station.id,
      installationIdentity: command.edgeInstallationIdentity,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    const keys = generateEdgeDeviceKeyPair();
    const credential = deviceCredentialDtoSchema.parse({
      id: stableId('dcred_', 'device-credential-v1', edgeAgent.id),
      object: 'device_credential',
      schemaVersion: 1,
      edgeAgentId: edgeAgent.id,
      publicKeySpkiSha256: sha256Buffer(keys.publicKeySpki),
      keyStorage: 'SOFTWARE_WRAPPED',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    this.edgeAuth.register({
      credentialId: credential.id,
      edgeAgentId: edgeAgent.id,
      organizationId,
      siteId: site.id,
      stationId: station.id,
      publicKeySpki: keys.publicKeySpki,
      status: 'ACTIVE',
    });
    const deviceSpecs = [
      { kind: 'OVERHEAD_CAMERA', code: 'CAM-A', adapter: 'UVC' },
      { kind: 'LABEL_CAMERA', code: 'CAM-B', adapter: 'UVC' },
      { kind: 'BARCODE_SCANNER', code: 'SCAN', adapter: 'USB_HID' },
      { kind: 'SCALE', code: 'SCALE', adapter: 'SERIAL' },
    ] as const;
    const devices = deviceSpecs.map((spec) => stationDeviceDtoSchema.parse({
      id: stableId('sdev_', 'station-device-v1', { stationId: station.id, code: spec.code }),
      object: 'station_device',
      schemaVersion: 1,
      organizationId,
      stationId: station.id,
      kind: spec.kind,
      code: spec.code,
      adapter: spec.adapter,
      status: 'ONLINE',
      createdAt: now,
      updatedAt: now,
    }));
    const graph = { organization, site, station, edgeAgent, devices, credential };
    await this.repository.saveStation(graph);
    return { ...graph, edgePrivateKeyPkcs8: keys.privateKeyPkcs8 };
  }

  async assignOrder(command: AssignOrderCommand, actor: ActorRef): Promise<EnterpriseSessionRecord> {
    const station = await this.repository.findStationByCode(command.organizationId, command.siteCode, command.stationCode);
    if (!station) throw new ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
    const existing = await this.repository.findSessionByOrder(command.organizationId, station.station.id, command.externalOrderId);
    if (existing) {
      const same = existing.fulfillment.transactionId === command.transactionId
        && existing.fulfillment.expectedTrackingNumber === command.expectedTrackingNumber
        && JSON.stringify(existing.fulfillment.expectedItems) === JSON.stringify(command.expectedItems);
      if (!same) {
        throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'The WMS order assignment was replayed with a different fingerprint.');
      }
      return existing;
    }
    const nowDate = this.clock();
    const now = iso(nowDate);
    const policy = resolveWorkflowPolicy(station.station.policyId);
    const captureWindowEndsAt = iso(new Date(nowDate.getTime() + 30 * 60 * 1000));
    const fulfillment = fulfillmentSessionDtoSchema.parse({
      id: stableId('fs_', 'fulfillment-session-v1', {
        organizationId: command.organizationId,
        stationId: station.station.id,
        externalOrderId: command.externalOrderId,
        commandKey: command.commandKey,
      }),
      object: 'fulfillment_session',
      schemaVersion: 1,
      organizationId: command.organizationId,
      siteId: station.site.id,
      stationId: station.station.id,
      transactionId: command.transactionId,
      edgeAgentId: station.edgeAgent.id,
      externalOrderId: command.externalOrderId,
      expectedItems: command.expectedItems,
      expectedTrackingNumber: command.expectedTrackingNumber,
      authorizedDeviceIds: station.devices.map((device) => device.id),
      requiredEvidence: policy.requirements.filter((item) => item.required).map((item) => item.key),
      openedAt: now,
      captureWindowEndsAt,
      state: 'STATION_BOUND',
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      acquisitionClass: 'ENTERPRISE_EDGE',
      operatingMode: station.organization.operatingMode,
      createdAt: now,
      updatedAt: now,
    });
    const evidenceSession = enterpriseEvidenceSessionDtoSchema.parse({
      id: stableId('ees_', 'enterprise-evidence-session-v1', fulfillment.id),
      object: 'enterprise_evidence_session',
      schemaVersion: 1,
      organizationId: command.organizationId,
      siteId: station.site.id,
      stationId: station.station.id,
      edgeAgentId: station.edgeAgent.id,
      transactionId: command.transactionId,
      fulfillmentSessionId: fulfillment.id,
      allowedDeviceIds: station.devices.map((device) => device.id),
      allowedArtifactTypes: ['STATION_PACKING_VIDEO', 'STATION_SEAL_REFERENCE', 'ITEM_REFERENCE_PHOTO'],
      maxArtifacts: 8,
      captureWindowEndsAt,
      policyId: policy.policyId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    const record: EnterpriseSessionRecord = {
      fulfillment,
      evidenceSession,
      observations: [],
      artifacts: [],
      events: [
        event('FULFILLMENT_SESSION_CREATED', actor, 'fulfillment_session', fulfillment.id, command.requestId, command.organizationId, nowDate, {
          externalOrderId: command.externalOrderId,
        }),
        event('ENTERPRISE_EVIDENCE_SESSION_ISSUED', actor, 'enterprise_evidence_session', evidenceSession.id, command.requestId, command.organizationId, nowDate, {
          maxArtifacts: evidenceSession.maxArtifacts,
        }),
      ],
      grants: [],
    };
    await this.repository.saveSession(record);
    return record;
  }

  async getSession(fulfillmentSessionId: string): Promise<EnterpriseSessionRecord | null> {
    return this.repository.getSession(fulfillmentSessionId);
  }

  async beginAcquiring(fulfillmentSessionId: string, principal: EdgePrincipal, requestId: string): Promise<EnterpriseSessionRecord> {
    return this.transition(fulfillmentSessionId, principal, 'ACQUIRING', requestId, { type: 'EDGE_AGENT', id: principal.edgeAgentId });
  }

  async completePacking(fulfillmentSessionId: string, principal: EdgePrincipal, requestId: string): Promise<EnterpriseSessionRecord> {
    return this.transition(fulfillmentSessionId, principal, 'PACKING_COMPLETE', requestId, { type: 'EDGE_AGENT', id: principal.edgeAgentId });
  }

  async recordObservation(principal: EdgePrincipal, command: RecordObservationCommand): Promise<HardwareObservationDto> {
    const record = await this.requireSession(command.fulfillmentSessionId);
    this.assertPrincipal(record, principal);
    this.assertDevice(record, command.deviceId);
    if (!acquisitionCompatibleFulfillmentStates.includes(record.fulfillment.state as typeof acquisitionCompatibleFulfillmentStates[number])) {
      throw new ApplicationError('FAILED_PRECONDITION', 'SESSION_NOT_ACQUIRING', 'Observations are only accepted during an open capture window.');
    }
    const now = iso(this.clock());
    let type: HardwareObservationDto['type'];
    let classification: HardwareObservationDto['classification'];
    let matchStatus: HardwareObservationDto['matchStatus'];
    let normalizedValue = command.normalizedValue;
    let grams = command.grams;
    if (command.source === 'WEIGHT_STABLE') {
      if (command.grams === null) {
        throw new ApplicationError('INVALID_ARGUMENT', 'WEIGHT_GRAMS_REQUIRED', 'A stable weight observation requires grams.');
      }
      type = 'PACKAGE_WEIGHT_OBSERVATION';
      classification = 'NOT_APPLICABLE';
      matchStatus = 'NOT_APPLICABLE';
      normalizedValue = null;
      grams = command.grams;
    } else {
      if (!command.normalizedValue) {
        throw new ApplicationError('INVALID_ARGUMENT', 'BARCODE_VALUE_REQUIRED', 'A barcode observation requires a normalized value.');
      }
      const classified = classifyBarcode(
        command.normalizedValue,
        record.fulfillment.expectedItems.map((item) => item.sku),
        record.fulfillment.expectedTrackingNumber,
      );
      type = classified.observationType;
      classification = classified.classification;
      matchStatus = classified.matchStatus;
      grams = null;
    }
    const observation = hardwareObservationDtoSchema.parse({
      id: stableId('hob_', 'hardware-observation-v1', {
        fulfillmentSessionId: command.fulfillmentSessionId,
        deviceId: command.deviceId,
        type,
        classification,
        rawValueHash: command.rawValueHash,
        monotonicTimestampMs: command.monotonicTimestampMs,
      }),
      object: 'hardware_observation',
      schemaVersion: 1,
      fulfillmentSessionId: command.fulfillmentSessionId,
      deviceId: command.deviceId,
      type,
      acquisitionClass: 'ENTERPRISE_EDGE',
      classification,
      matchStatus,
      normalizedValue,
      grams,
      rawValueHash: command.rawValueHash,
      monotonicTimestampMs: command.monotonicTimestampMs,
      wallClockUtc: command.wallClockUtc ?? null,
      bootId: command.bootId ?? null,
      eventSequence: command.eventSequence ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const existing = record.observations.find((item) => item.id === observation.id);
    if (existing) return existing;
    record.observations.push(observation);
    record.fulfillment = { ...record.fulfillment, updatedAt: now };
    await this.repository.saveSession(record);
    return observation;
  }

  async reserveArtifact(principal: EdgePrincipal, command: ReserveArtifactCommand): Promise<EnterpriseArtifactDto> {
    return this.withReservationLock(command.fulfillmentSessionId, async () => {
      const record = await this.requireSession(command.fulfillmentSessionId);
      this.assertPrincipal(record, principal);
      this.assertDevice(record, command.deviceId);
      await this.assertReservationLifecycle(record, principal);
      const capability = record.evidenceSession;
      if (!capability) throw new ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_SESSION_REQUIRED', 'A bounded Enterprise evidence session is required before upload reservation.');
      if (capability.edgeAgentId !== principal.edgeAgentId) {
        throw new ApplicationError('FORBIDDEN', 'EDGE_AGENT_MISMATCH', 'This Edge agent is not authorized for the evidence session.');
      }
      if (!capability.allowedDeviceIds.includes(parseEnterpriseResourceId('station_device', command.deviceId))) {
        throw new ApplicationError('FORBIDDEN', 'DEVICE_NOT_ALLOWED', 'The device is not in the evidence-session allow list.');
      }
      if (!capability.allowedArtifactTypes.includes(command.type)) {
        throw new ApplicationError('FORBIDDEN', 'ARTIFACT_TYPE_NOT_ALLOWED', 'The artifact type is not in the evidence-session allow list.');
      }
      if (record.artifacts.filter((item) => item.status !== 'FAILED').length >= capability.maxArtifacts) {
        throw new ApplicationError('RESOURCE_EXHAUSTED', 'MAX_ARTIFACTS_EXCEEDED', 'The evidence session has no remaining artifact reservations.');
      }
      if (Date.parse(iso(this.clock())) > Date.parse(capability.captureWindowEndsAt)) {
        throw new ApplicationError('FAILED_PRECONDITION', 'CAPTURE_WINDOW_CLOSED', 'The Enterprise capture window has ended.');
      }
      const now = iso(this.clock());
      const transactionId = record.fulfillment.transactionId;
      if (!transactionId) throw new ApplicationError('FAILED_PRECONDITION', 'TRANSACTION_REQUIRED', 'A fulfillment session must be bound to a transaction before evidence can be reserved.');
      const artifact = enterpriseArtifactDtoSchema.parse({
        id: stableId('eart_', 'enterprise-artifact-v1', { fulfillmentSessionId: command.fulfillmentSessionId, clientEvidenceId: command.clientEvidenceId }),
        object: 'enterprise_artifact',
        schemaVersion: 1,
        fulfillmentSessionId: command.fulfillmentSessionId,
        evidenceSessionId: capability.id,
        type: command.type,
        status: 'RESERVED',
        acquisitionClass: 'ENTERPRISE_EDGE',
        contentType: command.contentType,
        sizeBytes: command.sizeBytes,
        sha256: command.sha256,
        rollingCapture: command.rollingCapture,
        uploadId: null,
        manifestSha256: null,
        evidenceBundleSha256: null,
        attestationStatus: null,
        serverFinalizedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const existing = record.artifacts.find((item) => item.id === artifact.id);
      if (existing) {
        if (existing.sha256 !== artifact.sha256 || existing.type !== artifact.type) {
          throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'The retry-stable evidence identity was reused with a different fingerprint.');
        }
        return existing;
      }
      const uploadId = deterministicUploadId({
        transactionId,
        uploaderId: principal.edgeAgentId,
        clientEvidenceId: command.clientEvidenceId,
      });
      const reserved = enterpriseArtifactDtoSchema.parse({ ...artifact, uploadId });
      const grant: EnterpriseUploadGrant = {
        uploadId,
        storagePath: `evidence/${transactionId}/${principal.edgeAgentId}/${uploadId}`,
        clientEvidenceId: command.clientEvidenceId,
        artifactId: reserved.id,
        requestFingerprint: sha256Hex(canonicalizeJson({
          transactionId,
          evidenceType: command.type,
          contentType: command.contentType,
          clientEvidenceId: command.clientEvidenceId,
          clientSha256: command.sha256,
          clientSizeBytes: command.sizeBytes,
        })),
        acquisitionClass: 'ENTERPRISE_EDGE',
        edgeAgentId: principal.edgeAgentId,
        organizationId: record.fulfillment.organizationId,
        fulfillmentSessionId: command.fulfillmentSessionId,
        transactionId,
        evidenceType: command.type,
        contentType: command.contentType,
        originalName: `${command.type.toLowerCase()}`,
        clientSha256: command.sha256,
        clientSizeBytes: command.sizeBytes,
        expiresAt: iso(new Date(this.clock().getTime() + 6 * 3600 * 1000)),
      };
      record.artifacts.push(reserved);
      record.grants = [...(record.grants ?? []), grant];
      await this.repository.saveSession(record);
      return reserved;
    });
  }

  async acceptIngress(fulfillmentSessionId: string, artifactId: string, principal: EdgePrincipal, bytes: Buffer): Promise<void> {
    const record = await this.requireSession(fulfillmentSessionId);
    this.assertPrincipal(record, principal);
    const artifact = record.artifacts.find((item) => item.id === artifactId);
    if (!artifact?.uploadId) throw new ApplicationError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', 'Enterprise artifact reservation was not found.');
    const grant = record.grants.find((item) => item.artifactId === artifactId);
    if (!grant || grant.edgeAgentId !== principal.edgeAgentId) {
      throw new ApplicationError('FORBIDDEN', 'UPLOAD_GRANT_MISMATCH', 'The Edge agent does not hold this upload reservation.');
    }
    await this.repository.saveIngress(artifact.uploadId, bytes);
  }

  async markUploaded(fulfillmentSessionId: string, artifactId: string, principal: EdgePrincipal): Promise<EnterpriseArtifactDto> {
    const record = await this.requireSession(fulfillmentSessionId);
    this.assertPrincipal(record, principal);
    const artifact = record.artifacts.find((item) => item.id === artifactId);
    if (!artifact?.uploadId) throw new ApplicationError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', 'Enterprise artifact was not found.');
    const received = await this.repository.getIngress(artifact.uploadId);
    if (!received) throw new ApplicationError('FAILED_PRECONDITION', 'INGRESS_REQUIRED', 'Bytes must be received against the reservation before upload can be marked complete.');
    if (artifact.status === 'UPLOADED' || artifact.status === 'FINALIZED' || artifact.status === 'QUARANTINED') return artifact;
    const uploaded = enterpriseArtifactDtoSchema.parse({
      ...artifact,
      status: 'UPLOADED',
      updatedAt: iso(this.clock()),
    });
    record.artifacts = record.artifacts.map((item) => item.id === artifactId ? uploaded : item);
    await this.repository.saveSession(record);
    return uploaded;
  }

  async applyServerFinalization(fulfillmentSessionId: string, artifactId: string, actor: ActorRef): Promise<EnterpriseArtifactDto> {
    if (actor.type === 'EDGE_AGENT') {
      throw new ApplicationError('FORBIDDEN', 'EDGE_CANNOT_FINALIZE', 'Acquisition source does not authorize evidence finalization.');
    }
    const record = await this.requireSession(fulfillmentSessionId);
    const artifact = record.artifacts.find((item) => item.id === artifactId);
    if (!artifact?.uploadId) throw new ApplicationError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', 'Enterprise artifact was not found.');
    const grant = record.grants.find((item) => item.artifactId === artifactId);
    if (!grant) throw new ApplicationError('FAILED_PRECONDITION', 'UPLOAD_GRANT_REQUIRED', 'Server finalization requires a retry-stable upload reservation.');
    const bytes = await this.repository.getIngress(artifact.uploadId);
    if (!bytes) throw new ApplicationError('FAILED_PRECONDITION', 'INGRESS_REQUIRED', 'Server finalization requires independently received bytes.');
    const now = this.clock();
    const finalizedCore = finalizeReceivedEvidence({
      bytes,
      pending: {
        transactionId: grant.transactionId,
        uploaderId: grant.edgeAgentId,
        uploadId: grant.uploadId,
        clientEvidenceId: grant.clientEvidenceId,
        evidenceType: grant.evidenceType,
        contentType: grant.contentType,
        originalName: grant.originalName,
        clientSha256: grant.clientSha256,
        clientSizeBytes: grant.clientSizeBytes,
        storagePath: grant.storagePath,
        captureSessionId: record.evidenceSession?.id ?? null,
        returnPassportId: null,
        connectSessionId: null,
        clientManifest: {
          schemaVersion: 2,
          acquisitionClass: 'ENTERPRISE_EDGE',
          captureStartedAt: record.fulfillment.openedAt ?? iso(now),
          captureFinishedAt: iso(now),
          rollingCapture: artifact.rollingCapture,
          attestation: { mode: 'ENTERPRISE_EDGE', reasonCodes: ['NOT_NATIVE_APP_CHECK'] },
        },
        attestationSnapshot: {
          mode: 'ENTERPRISE_EDGE',
          deviceKeySignatureValid: false,
          captureSessionId: record.evidenceSession?.id ?? null,
          nonce: grant.uploadId.slice(0, 16),
          issuedAt: artifact.createdAt,
          captureWindowEndsAt: record.fulfillment.captureWindowEndsAt,
          tokenReplayDetected: false,
          reasonCodes: ['NOT_NATIVE_APP_CHECK'],
        },
        carrierContext: null,
        requestFingerprint: grant.requestFingerprint,
        acquisitionClass: 'ENTERPRISE_EDGE',
        edgeAgentId: grant.edgeAgentId,
        organizationId: grant.organizationId,
        fulfillmentSessionId: grant.fulfillmentSessionId,
        ingressNetwork: null,
      },
      object: {
        bucket: 'packproof-enterprise-ingress',
        storagePath: grant.storagePath,
        generation: '1',
        timeCreated: iso(now),
        size: bytes.length,
        contentType: grant.contentType,
      },
      uploaderRole: 'ENTERPRISE_STATION',
      signer: this.signer,
    });
    const status = finalizedCore.integrityAccepted ? 'FINALIZED' : 'QUARANTINED';
    const finalized = enterpriseArtifactDtoSchema.parse({
      ...artifact,
      sha256: finalizedCore.digest,
      sizeBytes: bytes.length,
      status,
      manifestSha256: finalizedCore.manifestSha256,
      evidenceBundleSha256: finalizedCore.evidenceBundleSha256,
      attestationStatus: finalizedCore.attestationStatus,
      serverFinalizedAt: iso(now),
      updatedAt: iso(now),
    });
    record.artifacts = record.artifacts.map((item) => item.id === artifactId ? finalized : item);
    if (!finalizedCore.integrityAccepted) {
      record.fulfillment = this.withState(record.fulfillment, 'INTEGRITY_FAILURE', iso(now));
    }
    record.events.push(event(
      finalizedCore.integrityAccepted ? 'EVIDENCE_FINALIZED' : 'EVIDENCE_INTEGRITY_MISMATCH',
      actor,
      'enterprise_artifact',
      artifactId,
      grant.uploadId,
      record.fulfillment.organizationId,
      now,
      {
        uploadId: grant.uploadId,
        attestationStatus: finalizedCore.attestationStatus,
        acquisitionClass: 'ENTERPRISE_EDGE',
      },
    ));
    await this.repository.saveSession(record);
    return finalized;
  }

  attemptFinalizeFromEdge(): never {
    throw new ApplicationError('FORBIDDEN', 'EDGE_CANNOT_FINALIZE', 'Acquisition source does not authorize evidence finalization.');
  }

  evaluate(record: EnterpriseSessionRecord, operatorOverride = false) {
    const facts = this.facts(record);
    const evaluation = evaluateEnterprisePolicy({
      policyId: record.fulfillment.policyId,
      operatingMode: record.fulfillment.operatingMode,
      facts,
      operatorOverride,
    });
    if (record.artifacts.every((item) => item.status !== 'QUARANTINED')) {
      evaluation.statements.push(assertNeutralEnterpriseStatement('No recorded byte-integrity mismatch'));
    }
    return { evaluation, facts };
  }

  async beginFinalizing(fulfillmentSessionId: string, actor: ActorRef, requestId: string): Promise<EnterpriseSessionRecord> {
    return this.transition(fulfillmentSessionId, undefined, 'FINALIZING', requestId, actor);
  }

  async markEvidenceReady(fulfillmentSessionId: string, actor: ActorRef, requestId: string, operatorOverride = false): Promise<EnterpriseSessionRecord> {
    const record = await this.requireSession(fulfillmentSessionId);
    const { evaluation } = this.evaluate(record, operatorOverride);
    if (evaluation.workflowMissing.length) {
      return this.transition(fulfillmentSessionId, undefined, 'EVIDENCE_INCOMPLETE', requestId, actor);
    }
    return this.transition(fulfillmentSessionId, undefined, 'EVIDENCE_READY', requestId, actor);
  }

  async release(fulfillmentSessionId: string, actor: ActorRef, requestId: string, operatorOverride = false): Promise<EnterpriseSessionRecord> {
    const record = await this.requireSession(fulfillmentSessionId);
    const { evaluation } = this.evaluate(record, operatorOverride);
    if (!evaluation.fulfillmentAdvanceAllowed) {
      throw new ApplicationError('FAILED_PRECONDITION', 'FULFILLMENT_GATE_BLOCKING', 'ENFORCE mode will not release an incomplete fulfillment session.');
    }
    const released = await this.transition(fulfillmentSessionId, undefined, 'RELEASED', requestId, actor);
    const evidenceComplete = evaluation.workflowMissing.length === 0;
    released.events.push(event(
      'FULFILLMENT_RELEASED',
      actor,
      'fulfillment_session',
      fulfillmentSessionId,
      `${requestId}:released`,
      record.fulfillment.organizationId,
      this.clock(),
      { policyId: record.fulfillment.policyId, operatingMode: record.fulfillment.operatingMode },
    ));
    if (evidenceComplete) {
      released.events.push(event(
        'PACKPROOF_EVIDENCE_READY',
        actor,
        'fulfillment_session',
        fulfillmentSessionId,
        requestId,
        record.fulfillment.organizationId,
        this.clock(),
        { policyId: record.fulfillment.policyId, operatingMode: record.fulfillment.operatingMode },
      ));
    } else {
      released.events.push(event(
        'FULFILLMENT_RELEASED_WITH_EVIDENCE_LIMITATIONS',
        actor,
        'fulfillment_session',
        fulfillmentSessionId,
        requestId,
        record.fulfillment.organizationId,
        this.clock(),
        {
          policyId: record.fulfillment.policyId,
          operatingMode: record.fulfillment.operatingMode,
          workflowMissing: evaluation.workflowMissing.join(','),
        },
      ));
    }
    await this.repository.saveSession(released);
    return released;
  }

  async unassignOrder(command: Pick<AssignOrderCommand, 'organizationId' | 'siteCode' | 'stationCode' | 'externalOrderId' | 'requestId'>, actor: ActorRef): Promise<EnterpriseSessionRecord> {
    const station = await this.repository.findStationByCode(command.organizationId, command.siteCode, command.stationCode);
    if (!station) throw new ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
    const existing = await this.repository.findSessionByOrder(command.organizationId, station.station.id, command.externalOrderId);
    if (!existing) throw new ApplicationError('NOT_FOUND', 'WMS_SESSION_NOT_FOUND', 'No fulfillment session exists for that WMS order.');
    if (existing.fulfillment.state === 'CANCELLED') return existing;
    if (!canTransitionFulfillment(existing.fulfillment.state, 'CANCELLED')) {
      throw new ApplicationError('FAILED_PRECONDITION', 'WMS_UNASSIGN_TOO_LATE', 'The fulfillment session can no longer be cancelled from a WMS unassignment.');
    }
    return this.transition(existing.fulfillment.id, undefined, 'CANCELLED', command.requestId, actor);
  }

  async setDeviceStatus(
    organizationId: string,
    stationId: string,
    deviceId: string,
    status: EnterpriseStationGraph['devices'][number]['status'],
    actor: ActorRef,
    requestId: string,
  ): Promise<EnterpriseStationGraph> {
    const graph = await this.repository.getStation(organizationId, stationId);
    if (!graph) throw new ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
    const now = iso(this.clock());
    const devices = graph.devices.map((device) => (
      device.id === deviceId
        ? stationDeviceDtoSchema.parse({ ...device, status, updatedAt: now })
        : device
    ));
    if (!devices.some((device) => device.id === deviceId)) {
      throw new ApplicationError('NOT_FOUND', 'DEVICE_NOT_FOUND', 'The station device was not found.');
    }
    const next = { ...graph, devices };
    await this.repository.saveStation(next);
    const open = (await this.repository.listSessions(organizationId)).find((item) => (
      item.fulfillment.stationId === stationId && !['RELEASED', 'CANCELLED', 'EXPIRED'].includes(item.fulfillment.state)
    ));
    if (open) {
      open.events.push(event('STATION_DEVICE_STATUS', actor, 'station_device', deviceId, requestId, organizationId, this.clock(), { status }));
      await this.repository.saveSession(open);
    }
    return next;
  }

  private facts(record: EnterpriseSessionRecord): PolicyEvidenceFact[] {
    const policy = resolveWorkflowPolicy(record.fulfillment.policyId);
    return policy.requirements.map((requirement) => {
      const satisfier = requirementSatisfier(requirement.key);
      if (satisfier.artifact) {
        const artifact = record.artifacts.find((item) => item.type === satisfier.artifact);
        const ready = artifact?.status === 'FINALIZED';
        const mismatch = artifact?.status === 'QUARANTINED';
        return {
          requirement: requirement.key,
          acquisitionClass: artifact?.acquisitionClass ?? 'ENTERPRISE_EDGE',
          captured: Boolean(artifact),
          serverFinalized: ready,
          integrityMismatch: mismatch,
          detail: ready ? this.artifactStatement(artifact) : null,
        };
      }
      const observationSatisfied = satisfier.observation === 'ITEM_BARCODE_OBSERVATION'
        ? itemBarcodeObservationCompleteness(record.fulfillment.expectedItems, record.observations).complete
        : satisfier.observation === 'TRACKING_BARCODE_OBSERVATION'
          ? trackingObservationSatisfied(record.observations)
          : Boolean(record.observations.find((item) => item.type === satisfier.observation));
      const observation = satisfier.observation === 'ITEM_BARCODE_OBSERVATION'
        ? record.observations.find((item) => item.type === 'ITEM_BARCODE_OBSERVATION' && item.matchStatus === 'MATCHED')
        : satisfier.observation === 'TRACKING_BARCODE_OBSERVATION'
          ? record.observations.find((item) => item.type === 'TRACKING_BARCODE_OBSERVATION' && item.matchStatus === 'MATCHED')
          : record.observations.find((item) => item.type === satisfier.observation);
      const detail = satisfier.observation === 'ITEM_BARCODE_OBSERVATION'
        ? this.itemBarcodeStatement(record)
        : observation ? this.observationStatement(observation) : null;
      return {
        requirement: requirement.key,
        acquisitionClass: observation?.acquisitionClass ?? 'ENTERPRISE_EDGE',
        captured: observationSatisfied,
        serverFinalized: observationSatisfied,
        integrityMismatch: false,
        detail,
      };
    });
  }

  private artifactStatement(artifact: EnterpriseArtifactDto | undefined): string | null {
    if (!artifact) return null;
    if (artifact.type === 'STATION_PACKING_VIDEO') return 'Packing video server-finalized';
    if (artifact.type === 'STATION_SEAL_REFERENCE') return 'Seal reference server-finalized';
    if (artifact.type === 'ITEM_REFERENCE_PHOTO') return 'Item reference photograph server-finalized';
    return null;
  }

  private itemBarcodeStatement(record: EnterpriseSessionRecord): string | null {
    const completeness = itemBarcodeObservationCompleteness(record.fulfillment.expectedItems, record.observations);
    if (completeness.complete && completeness.observed.length) {
      return `Expected SKU barcode observed: ${completeness.observed.map((item) => `${item.sku} × ${item.quantity}`).join(', ')}`;
    }
    if (!completeness.complete && completeness.missing.length) {
      return `Item barcode observation incomplete: ${completeness.missing.map((item) => `${item.sku} × ${item.quantity}`).join(', ')} remaining`;
    }
    return null;
  }

  private observationStatement(observation: HardwareObservationDto): string | null {
    if (observation.type === 'ITEM_BARCODE_OBSERVATION' && observation.matchStatus === 'MATCHED' && observation.normalizedValue) {
      return `Expected SKU barcode observed: ${observation.normalizedValue}`;
    }
    if (observation.type === 'TRACKING_BARCODE_OBSERVATION' && observation.matchStatus === 'MATCHED' && observation.normalizedValue) {
      return `Expected tracking identifier observed: ${observation.normalizedValue}`;
    }
    if (observation.type === 'PACKAGE_WEIGHT_OBSERVATION' && observation.grams !== null) {
      return `Final package weight ${observation.grams} g`;
    }
    return null;
  }

  private async transition(
    fulfillmentSessionId: string,
    principal: EdgePrincipal | undefined,
    to: FulfillmentSessionStatus,
    requestId: string,
    actor: ActorRef,
  ): Promise<EnterpriseSessionRecord> {
    const record = await this.requireSession(fulfillmentSessionId);
    if (principal) this.assertPrincipal(record, principal);
    assertFulfillmentTransition(record.fulfillment.state, to);
    const now = iso(this.clock());
    record.fulfillment = this.withState(record.fulfillment, to, now);
    record.events.push(event('FULFILLMENT_SESSION_TRANSITIONED', actor, 'fulfillment_session', fulfillmentSessionId, requestId, record.fulfillment.organizationId, this.clock(), {
      state: to,
    }));
    await this.repository.saveSession(record);
    return record;
  }

  private withState(fulfillment: EnterpriseSessionRecord['fulfillment'], state: FulfillmentSessionStatus, updatedAt: string) {
    return fulfillmentSessionDtoSchema.parse({ ...fulfillment, state, updatedAt });
  }

  private async requireSession(id: string): Promise<EnterpriseSessionRecord> {
    const record = await this.repository.getSession(id);
    if (!record) throw new ApplicationError('NOT_FOUND', 'FULFILLMENT_SESSION_NOT_FOUND', 'Fulfillment session was not found.');
    record.grants ??= [];
    return record;
  }

  private async assertReservationLifecycle(record: EnterpriseSessionRecord, principal: EdgePrincipal): Promise<void> {
    if (record.evidenceSession?.status !== 'ACTIVE') {
      throw new ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_SESSION_NOT_ACTIVE', 'Artifact reservation requires an active Enterprise evidence session.');
    }
    if (!acquisitionCompatibleFulfillmentStates.includes(record.fulfillment.state as typeof acquisitionCompatibleFulfillmentStates[number])) {
      throw new ApplicationError('FAILED_PRECONDITION', 'FULFILLMENT_STATE_NOT_ACQUISITION_COMPATIBLE', 'Artifact reservation is only accepted during an acquisition-compatible fulfillment state.');
    }
    const graph = await this.repository.getStation(record.fulfillment.organizationId, record.fulfillment.stationId);
    if (!graph) throw new ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
    if (graph.organization.status !== 'ACTIVE') {
      throw new ApplicationError('FORBIDDEN', 'ORGANIZATION_NOT_ACTIVE', 'The Enterprise organization is not active.');
    }
    if (graph.site.status !== 'ACTIVE') {
      throw new ApplicationError('FORBIDDEN', 'SITE_NOT_ACTIVE', 'The Enterprise site is not active.');
    }
    if (graph.station.status !== 'ACTIVE') {
      throw new ApplicationError('FORBIDDEN', 'STATION_NOT_ACTIVE', 'The packing station is not active.');
    }
    if (graph.edgeAgent.status !== 'ACTIVE') {
      throw new ApplicationError('FORBIDDEN', 'EDGE_AGENT_NOT_ACTIVE', 'The Edge agent is not active.');
    }
    if (graph.credential.status === 'REVOKED' || principal.credentialStatus !== 'ACTIVE') {
      throw new ApplicationError('FORBIDDEN', 'EDGE_CREDENTIAL_REVOKED', 'The Edge installation credential has been revoked.');
    }
    if (graph.credential.status !== 'ACTIVE' && graph.credential.status !== 'ROTATING') {
      throw new ApplicationError('FORBIDDEN', 'EDGE_CREDENTIAL_NOT_ACTIVE', 'The Edge installation credential is not active.');
    }
  }

  private async withReservationLock<T>(fulfillmentSessionId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.reservationLocks.get(fulfillmentSessionId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.reservationLocks.set(fulfillmentSessionId, previous.then(() => current));
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.reservationLocks.get(fulfillmentSessionId) === current) this.reservationLocks.delete(fulfillmentSessionId);
    }
  }

  private assertPrincipal(record: EnterpriseSessionRecord, principal: EdgePrincipal): void {
    if (!this.issuedPrincipals.has(principal)) {
      throw new ApplicationError('UNAUTHENTICATED', 'EDGE_PRINCIPAL_REQUIRED', 'Capture operations require an authenticated Edge principal.');
    }
    if (record.fulfillment.edgeAgentId !== principal.edgeAgentId) {
      throw new ApplicationError('FORBIDDEN', 'EDGE_AGENT_MISMATCH', 'This Edge agent is not bound to the fulfillment session.');
    }
    if (record.fulfillment.organizationId !== principal.organizationId || record.fulfillment.stationId !== principal.stationId) {
      throw new ApplicationError('FORBIDDEN', 'EDGE_BINDING_MISMATCH', 'The authenticated Edge principal is not bound to this fulfillment session.');
    }
    if (principal.sessionId && principal.sessionId !== record.fulfillment.id) {
      throw new ApplicationError('FORBIDDEN', 'EDGE_SESSION_MISMATCH', 'The signed Edge request is bound to a different fulfillment session.');
    }
  }

  private assertDevice(record: EnterpriseSessionRecord, deviceId: string): void {
    if (!record.fulfillment.authorizedDeviceIds.includes(parseEnterpriseResourceId('station_device', deviceId))) {
      throw new ApplicationError('FORBIDDEN', 'DEVICE_NOT_AUTHORIZED', 'The device is not authorized for this fulfillment session.');
    }
  }
}

export const defaultEnterprisePolicyId = Object.keys(enterpriseWorkflowPolicies)[0];
