"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultEnterprisePolicyId = exports.EnterpriseFulfillmentApplicationService = void 0;
const evidence_format_1 = require("../../evidence-format");
const evidence_finalization_1 = require("../../evidence-finalization");
const enterprise_1 = require("../../domain/v1/enterprise");
const errors_1 = require("./errors");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
function iso(date) {
    return date.toISOString();
}
function stableId(prefix, namespace, value) {
    return `${prefix}${(0, merchant_transaction_service_1.sha256)(`${namespace}\n${(0, merchant_transaction_service_1.canonicalize)(value)}`).slice(0, 40)}`;
}
function event(type, actor, resourceType, resourceId, requestId, organizationId, occurredAt, data = {}) {
    return {
        id: `evt_${(0, merchant_transaction_service_1.sha256)(`${type}:${resourceId}:${requestId}`).slice(0, 40)}`,
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
class EnterpriseFulfillmentApplicationService {
    repository;
    clock;
    signer;
    constructor(repository, clock = () => new Date(), signer = (0, evidence_finalization_1.hmacManifestSigner)('packproof-enterprise-test-manifest-mac-key-32b', 'manifest-hmac-v1')) {
        this.repository = repository;
        this.clock = clock;
        this.signer = signer;
    }
    async bootstrapStation(command, actor) {
        const now = iso(this.clock());
        const policy = (0, enterprise_1.resolveWorkflowPolicy)(command.policyId);
        const organizationId = command.organizationId;
        const organization = enterprise_1.enterpriseOrganizationDtoSchema.parse({
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
        const site = enterprise_1.enterpriseSiteDtoSchema.parse({
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
        const station = enterprise_1.packingStationDtoSchema.parse({
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
        const edgeAgent = enterprise_1.edgeAgentDtoSchema.parse({
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
        enterprise_1.deviceCredentialDtoSchema.parse({
            id: stableId('dcred_', 'device-credential-v1', edgeAgent.id),
            object: 'device_credential',
            schemaVersion: 1,
            edgeAgentId: edgeAgent.id,
            publicKeySpkiSha256: (0, merchant_transaction_service_1.sha256)(`spki:${edgeAgent.id}`),
            keyStorage: 'SOFTWARE_WRAPPED',
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
        });
        const deviceSpecs = [
            { kind: 'OVERHEAD_CAMERA', code: 'CAM-A', adapter: 'UVC' },
            { kind: 'LABEL_CAMERA', code: 'CAM-B', adapter: 'UVC' },
            { kind: 'BARCODE_SCANNER', code: 'SCAN', adapter: 'USB_HID' },
            { kind: 'SCALE', code: 'SCALE', adapter: 'SERIAL' },
        ];
        const devices = deviceSpecs.map((spec) => enterprise_1.stationDeviceDtoSchema.parse({
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
        const graph = { organization, site, station, edgeAgent, devices };
        await this.repository.saveStation(graph);
        return graph;
    }
    async assignOrder(command, actor) {
        const station = await this.repository.findStationByCode(command.organizationId, command.siteCode, command.stationCode);
        if (!station)
            throw new errors_1.ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
        const existing = await this.repository.findSessionByOrder(command.organizationId, station.station.id, command.externalOrderId);
        if (existing) {
            const same = existing.fulfillment.transactionId === command.transactionId
                && existing.fulfillment.expectedTrackingNumber === command.expectedTrackingNumber
                && JSON.stringify(existing.fulfillment.expectedItems) === JSON.stringify(command.expectedItems);
            if (!same) {
                throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'The WMS order assignment was replayed with a different fingerprint.');
            }
            return existing;
        }
        const nowDate = this.clock();
        const now = iso(nowDate);
        const policy = (0, enterprise_1.resolveWorkflowPolicy)(station.station.policyId);
        const captureWindowEndsAt = iso(new Date(nowDate.getTime() + 30 * 60 * 1000));
        const fulfillment = enterprise_1.fulfillmentSessionDtoSchema.parse({
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
        const evidenceSession = enterprise_1.enterpriseEvidenceSessionDtoSchema.parse({
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
        const record = {
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
    async getSession(fulfillmentSessionId) {
        return this.repository.getSession(fulfillmentSessionId);
    }
    async beginAcquiring(fulfillmentSessionId, edgeAgentId, requestId) {
        return this.transition(fulfillmentSessionId, edgeAgentId, 'ACQUIRING', requestId, { type: 'EDGE_AGENT', id: edgeAgentId });
    }
    async completePacking(fulfillmentSessionId, edgeAgentId, requestId) {
        return this.transition(fulfillmentSessionId, edgeAgentId, 'PACKING_COMPLETE', requestId, { type: 'EDGE_AGENT', id: edgeAgentId });
    }
    async recordObservation(command) {
        const record = await this.requireSession(command.fulfillmentSessionId);
        this.assertEdge(record, command.edgeAgentId);
        this.assertDevice(record, command.deviceId);
        if (!['ACQUIRING', 'PACKING_COMPLETE', 'INTERRUPTED'].includes(record.fulfillment.state)) {
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'SESSION_NOT_ACQUIRING', 'Observations are only accepted during an open capture window.');
        }
        const now = iso(this.clock());
        const observation = enterprise_1.hardwareObservationDtoSchema.parse({
            id: stableId('hob_', 'hardware-observation-v1', {
                fulfillmentSessionId: command.fulfillmentSessionId,
                deviceId: command.deviceId,
                type: command.type,
                rawValueHash: command.rawValueHash,
                monotonicTimestampMs: command.monotonicTimestampMs,
            }),
            object: 'hardware_observation',
            schemaVersion: 1,
            fulfillmentSessionId: command.fulfillmentSessionId,
            deviceId: command.deviceId,
            type: command.type,
            acquisitionClass: command.acquisitionClass,
            normalizedValue: command.normalizedValue,
            grams: command.grams,
            rawValueHash: command.rawValueHash,
            monotonicTimestampMs: command.monotonicTimestampMs,
            createdAt: now,
            updatedAt: now,
        });
        const existing = record.observations.find((item) => item.id === observation.id);
        if (existing)
            return existing;
        record.observations.push(observation);
        record.fulfillment = { ...record.fulfillment, updatedAt: now };
        await this.repository.saveSession(record);
        return observation;
    }
    async reserveArtifact(command) {
        const record = await this.requireSession(command.fulfillmentSessionId);
        this.assertEdge(record, command.edgeAgentId);
        this.assertDevice(record, command.deviceId);
        const capability = record.evidenceSession;
        if (!capability)
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_SESSION_REQUIRED', 'A bounded Enterprise evidence session is required before upload reservation.');
        if (capability.edgeAgentId !== command.edgeAgentId) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'EDGE_AGENT_MISMATCH', 'This Edge agent is not authorized for the evidence session.');
        }
        if (!capability.allowedDeviceIds.includes((0, enterprise_1.parseEnterpriseResourceId)('station_device', command.deviceId))) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'DEVICE_NOT_ALLOWED', 'The device is not in the evidence-session allow list.');
        }
        if (!capability.allowedArtifactTypes.includes(command.type)) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'ARTIFACT_TYPE_NOT_ALLOWED', 'The artifact type is not in the evidence-session allow list.');
        }
        if (record.artifacts.filter((item) => item.status !== 'FAILED').length >= capability.maxArtifacts) {
            throw new errors_1.ApplicationError('RESOURCE_EXHAUSTED', 'MAX_ARTIFACTS_EXCEEDED', 'The evidence session has no remaining artifact reservations.');
        }
        if (Date.parse(iso(this.clock())) > Date.parse(capability.captureWindowEndsAt)) {
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'CAPTURE_WINDOW_CLOSED', 'The Enterprise capture window has ended.');
        }
        const now = iso(this.clock());
        const transactionId = record.fulfillment.transactionId;
        if (!transactionId)
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'TRANSACTION_REQUIRED', 'A fulfillment session must be bound to a transaction before evidence can be reserved.');
        const artifact = enterprise_1.enterpriseArtifactDtoSchema.parse({
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
                throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'The retry-stable evidence identity was reused with a different fingerprint.');
            }
            return existing;
        }
        const uploadId = (0, evidence_format_1.deterministicUploadId)({
            transactionId,
            uploaderId: command.edgeAgentId,
            clientEvidenceId: command.clientEvidenceId,
        });
        const reserved = enterprise_1.enterpriseArtifactDtoSchema.parse({ ...artifact, uploadId });
        const grant = {
            uploadId,
            storagePath: `evidence/${transactionId}/${command.edgeAgentId}/${uploadId}`,
            clientEvidenceId: command.clientEvidenceId,
            artifactId: reserved.id,
            requestFingerprint: (0, evidence_format_1.sha256Hex)((0, evidence_format_1.canonicalizeJson)({
                transactionId,
                evidenceType: command.type,
                contentType: command.contentType,
                clientEvidenceId: command.clientEvidenceId,
                clientSha256: command.sha256,
                clientSizeBytes: command.sizeBytes,
            })),
            acquisitionClass: 'ENTERPRISE_EDGE',
            edgeAgentId: command.edgeAgentId,
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
    }
    async acceptIngress(fulfillmentSessionId, artifactId, edgeAgentId, bytes) {
        const record = await this.requireSession(fulfillmentSessionId);
        this.assertEdge(record, edgeAgentId);
        const artifact = record.artifacts.find((item) => item.id === artifactId);
        if (!artifact?.uploadId)
            throw new errors_1.ApplicationError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', 'Enterprise artifact reservation was not found.');
        const grant = record.grants.find((item) => item.artifactId === artifactId);
        if (!grant || grant.edgeAgentId !== edgeAgentId) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'UPLOAD_GRANT_MISMATCH', 'The Edge agent does not hold this upload reservation.');
        }
        await this.repository.saveIngress(artifact.uploadId, bytes);
    }
    async markUploaded(fulfillmentSessionId, artifactId, edgeAgentId) {
        const record = await this.requireSession(fulfillmentSessionId);
        this.assertEdge(record, edgeAgentId);
        const artifact = record.artifacts.find((item) => item.id === artifactId);
        if (!artifact?.uploadId)
            throw new errors_1.ApplicationError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', 'Enterprise artifact was not found.');
        const received = await this.repository.getIngress(artifact.uploadId);
        if (!received)
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'INGRESS_REQUIRED', 'Bytes must be received against the reservation before upload can be marked complete.');
        if (artifact.status === 'UPLOADED' || artifact.status === 'FINALIZED' || artifact.status === 'QUARANTINED')
            return artifact;
        const uploaded = enterprise_1.enterpriseArtifactDtoSchema.parse({
            ...artifact,
            status: 'UPLOADED',
            updatedAt: iso(this.clock()),
        });
        record.artifacts = record.artifacts.map((item) => item.id === artifactId ? uploaded : item);
        await this.repository.saveSession(record);
        return uploaded;
    }
    async applyServerFinalization(fulfillmentSessionId, artifactId, actor) {
        if (actor.type === 'EDGE_AGENT') {
            throw new errors_1.ApplicationError('FORBIDDEN', 'EDGE_CANNOT_FINALIZE', 'Acquisition source does not authorize evidence finalization.');
        }
        const record = await this.requireSession(fulfillmentSessionId);
        const artifact = record.artifacts.find((item) => item.id === artifactId);
        if (!artifact?.uploadId)
            throw new errors_1.ApplicationError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', 'Enterprise artifact was not found.');
        const grant = record.grants.find((item) => item.artifactId === artifactId);
        if (!grant)
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'UPLOAD_GRANT_REQUIRED', 'Server finalization requires a retry-stable upload reservation.');
        const bytes = await this.repository.getIngress(artifact.uploadId);
        if (!bytes)
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'INGRESS_REQUIRED', 'Server finalization requires independently received bytes.');
        const now = this.clock();
        const finalizedCore = (0, evidence_finalization_1.finalizeReceivedEvidence)({
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
        const finalized = enterprise_1.enterpriseArtifactDtoSchema.parse({
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
        record.events.push(event(finalizedCore.integrityAccepted ? 'EVIDENCE_FINALIZED' : 'EVIDENCE_INTEGRITY_MISMATCH', actor, 'enterprise_artifact', artifactId, grant.uploadId, record.fulfillment.organizationId, now, {
            uploadId: grant.uploadId,
            attestationStatus: finalizedCore.attestationStatus,
            acquisitionClass: 'ENTERPRISE_EDGE',
        }));
        await this.repository.saveSession(record);
        return finalized;
    }
    attemptFinalizeFromEdge() {
        throw new errors_1.ApplicationError('FORBIDDEN', 'EDGE_CANNOT_FINALIZE', 'Acquisition source does not authorize evidence finalization.');
    }
    evaluate(record, operatorOverride = false) {
        const facts = this.facts(record);
        const evaluation = (0, enterprise_1.evaluateEnterprisePolicy)({
            policyId: record.fulfillment.policyId,
            operatingMode: record.fulfillment.operatingMode,
            facts,
            operatorOverride,
        });
        if (record.artifacts.every((item) => item.status !== 'QUARANTINED')) {
            evaluation.statements.push((0, enterprise_1.assertNeutralEnterpriseStatement)('No recorded byte-integrity mismatch'));
        }
        return { evaluation, facts };
    }
    async beginFinalizing(fulfillmentSessionId, actor, requestId) {
        return this.transition(fulfillmentSessionId, undefined, 'FINALIZING', requestId, actor);
    }
    async markEvidenceReady(fulfillmentSessionId, actor, requestId, operatorOverride = false) {
        const record = await this.requireSession(fulfillmentSessionId);
        const { evaluation } = this.evaluate(record, operatorOverride);
        if (evaluation.workflowMissing.length) {
            return this.transition(fulfillmentSessionId, undefined, 'EVIDENCE_INCOMPLETE', requestId, actor);
        }
        return this.transition(fulfillmentSessionId, undefined, 'EVIDENCE_READY', requestId, actor);
    }
    async release(fulfillmentSessionId, actor, requestId, operatorOverride = false) {
        const record = await this.requireSession(fulfillmentSessionId);
        const { evaluation } = this.evaluate(record, operatorOverride);
        if (!evaluation.fulfillmentAdvanceAllowed) {
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'FULFILLMENT_GATE_BLOCKING', 'ENFORCE mode will not release an incomplete fulfillment session.');
        }
        const released = await this.transition(fulfillmentSessionId, undefined, 'RELEASED', requestId, actor);
        released.events.push(event('PACKPROOF_EVIDENCE_READY', actor, 'fulfillment_session', fulfillmentSessionId, requestId, record.fulfillment.organizationId, this.clock(), { policyId: record.fulfillment.policyId, operatingMode: record.fulfillment.operatingMode }));
        await this.repository.saveSession(released);
        return released;
    }
    async unassignOrder(command, actor) {
        const station = await this.repository.findStationByCode(command.organizationId, command.siteCode, command.stationCode);
        if (!station)
            throw new errors_1.ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
        const existing = await this.repository.findSessionByOrder(command.organizationId, station.station.id, command.externalOrderId);
        if (!existing)
            throw new errors_1.ApplicationError('NOT_FOUND', 'WMS_SESSION_NOT_FOUND', 'No fulfillment session exists for that WMS order.');
        if (existing.fulfillment.state === 'CANCELLED')
            return existing;
        if (!(0, enterprise_1.canTransitionFulfillment)(existing.fulfillment.state, 'CANCELLED')) {
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'WMS_UNASSIGN_TOO_LATE', 'The fulfillment session can no longer be cancelled from a WMS unassignment.');
        }
        return this.transition(existing.fulfillment.id, undefined, 'CANCELLED', command.requestId, actor);
    }
    async setDeviceStatus(organizationId, stationId, deviceId, status, actor, requestId) {
        const graph = await this.repository.getStation(organizationId, stationId);
        if (!graph)
            throw new errors_1.ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
        const now = iso(this.clock());
        const devices = graph.devices.map((device) => (device.id === deviceId
            ? enterprise_1.stationDeviceDtoSchema.parse({ ...device, status, updatedAt: now })
            : device));
        if (!devices.some((device) => device.id === deviceId)) {
            throw new errors_1.ApplicationError('NOT_FOUND', 'DEVICE_NOT_FOUND', 'The station device was not found.');
        }
        const next = { ...graph, devices };
        await this.repository.saveStation(next);
        const open = (await this.repository.listSessions(organizationId)).find((item) => (item.fulfillment.stationId === stationId && !['RELEASED', 'CANCELLED', 'EXPIRED'].includes(item.fulfillment.state)));
        if (open) {
            open.events.push(event('STATION_DEVICE_STATUS', actor, 'station_device', deviceId, requestId, organizationId, this.clock(), { status }));
            await this.repository.saveSession(open);
        }
        return next;
    }
    facts(record) {
        const policy = (0, enterprise_1.resolveWorkflowPolicy)(record.fulfillment.policyId);
        return policy.requirements.map((requirement) => {
            const satisfier = (0, enterprise_1.requirementSatisfier)(requirement.key);
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
            const observation = record.observations.find((item) => item.type === satisfier.observation);
            const detail = observation ? this.observationStatement(observation) : null;
            return {
                requirement: requirement.key,
                acquisitionClass: observation?.acquisitionClass ?? 'ENTERPRISE_EDGE',
                captured: Boolean(observation),
                serverFinalized: Boolean(observation),
                integrityMismatch: false,
                detail,
            };
        });
    }
    artifactStatement(artifact) {
        if (!artifact)
            return null;
        if (artifact.type === 'STATION_PACKING_VIDEO')
            return 'Packing video server-finalized';
        if (artifact.type === 'STATION_SEAL_REFERENCE')
            return 'Seal reference server-finalized';
        if (artifact.type === 'ITEM_REFERENCE_PHOTO')
            return 'Item reference photograph server-finalized';
        return null;
    }
    observationStatement(observation) {
        if (observation.type === 'ITEM_BARCODE_OBSERVATION' && observation.normalizedValue) {
            return `Expected SKU barcode observed: ${observation.normalizedValue}`;
        }
        if (observation.type === 'TRACKING_BARCODE_OBSERVATION' && observation.normalizedValue) {
            return `Expected tracking identifier observed: ${observation.normalizedValue}`;
        }
        if (observation.type === 'PACKAGE_WEIGHT_OBSERVATION' && observation.grams !== null) {
            return `Final package weight ${observation.grams} g`;
        }
        return null;
    }
    async transition(fulfillmentSessionId, edgeAgentId, to, requestId, actor) {
        const record = await this.requireSession(fulfillmentSessionId);
        if (edgeAgentId)
            this.assertEdge(record, edgeAgentId);
        (0, enterprise_1.assertFulfillmentTransition)(record.fulfillment.state, to);
        const now = iso(this.clock());
        record.fulfillment = this.withState(record.fulfillment, to, now);
        record.events.push(event('FULFILLMENT_SESSION_TRANSITIONED', actor, 'fulfillment_session', fulfillmentSessionId, requestId, record.fulfillment.organizationId, this.clock(), {
            state: to,
        }));
        await this.repository.saveSession(record);
        return record;
    }
    withState(fulfillment, state, updatedAt) {
        return enterprise_1.fulfillmentSessionDtoSchema.parse({ ...fulfillment, state, updatedAt });
    }
    async requireSession(id) {
        const record = await this.repository.getSession(id);
        if (!record)
            throw new errors_1.ApplicationError('NOT_FOUND', 'FULFILLMENT_SESSION_NOT_FOUND', 'Fulfillment session was not found.');
        record.grants ??= [];
        return record;
    }
    assertEdge(record, edgeAgentId) {
        if (record.fulfillment.edgeAgentId !== edgeAgentId) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'EDGE_AGENT_MISMATCH', 'This Edge agent is not bound to the fulfillment session.');
        }
    }
    assertDevice(record, deviceId) {
        if (!record.fulfillment.authorizedDeviceIds.includes((0, enterprise_1.parseEnterpriseResourceId)('station_device', deviceId))) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'DEVICE_NOT_AUTHORIZED', 'The device is not authorized for this fulfillment session.');
        }
    }
}
exports.EnterpriseFulfillmentApplicationService = EnterpriseFulfillmentApplicationService;
exports.defaultEnterprisePolicyId = Object.keys(enterprise_1.enterpriseWorkflowPolicies)[0];
//# sourceMappingURL=enterprise-fulfillment-service.js.map