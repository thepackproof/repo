"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnterpriseConsoleApplicationService = void 0;
exports.queueHealthFromCounts = queueHealthFromCounts;
const enterprise_1 = require("../../domain/v1/enterprise");
const errors_1 = require("./errors");
const CONSOLE_LIMITATIONS = [
    'Administrators may view station and queue health. This console does not alter finalized evidence.',
    'These rows are observations. They are not fraud, authenticity, custody, or claim-disposition verdicts.',
    'An Edge upload is not server finalization.',
];
function queueHealthFromCounts(stationId, counts) {
    return { stationId, ...counts };
}
class EnterpriseConsoleApplicationService {
    fulfillment;
    repository;
    clock;
    constructor(fulfillment, repository, clock = () => new Date()) {
        this.fulfillment = fulfillment;
        this.repository = repository;
        this.clock = clock;
    }
    async snapshot(organizationId, queues = []) {
        const stations = await this.repository.listStations(organizationId);
        const sessions = await this.repository.listSessions(organizationId);
        const mappings = await this.repository.listWmsMappings(organizationId);
        const queueByStation = new Map(queues.map((item) => [item.stationId, item]));
        return {
            object: 'enterprise_console_snapshot',
            schemaVersion: 1,
            organizationId,
            generatedAt: this.clock().toISOString(),
            stations: stations.map((graph) => this.row(graph, sessions, queueByStation.get(graph.station.id))),
            mappings,
            audit: sessions.flatMap((session) => session.events.map((item) => ({
                type: item.type,
                actorType: item.actor.type,
                actorId: item.actor.id,
                resourceId: item.resourceId,
                occurredAt: item.occurredAt.toISOString(),
            }))).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
            limitations: [...CONSOLE_LIMITATIONS],
        };
    }
    async registerWmsMapping(mapping, actor, requestId) {
        const station = await this.repository.findStationByCode(mapping.organizationId, mapping.siteCode, mapping.stationCode);
        if (!station)
            throw new errors_1.ApplicationError('NOT_FOUND', 'STATION_NOT_FOUND', 'Packing station was not found for this organization.');
        const recorded = {
            ...mapping,
            inboundEvents: ['ORDER_ASSIGNED', 'ORDER_UNASSIGNED'],
            outboundEvents: ['PACKPROOF_EVIDENCE_READY', 'FULFILLMENT_RELEASED', 'FULFILLMENT_RELEASED_WITH_EVIDENCE_LIMITATIONS'],
        };
        await this.repository.saveWmsMapping(recorded);
        const open = (await this.repository.listSessions(mapping.organizationId)).find((item) => item.fulfillment.stationId === station.station.id);
        if (open) {
            open.events.push({
                id: `evt_wms_map_${requestId}`.slice(0, 80),
                schemaVersion: 1,
                type: 'WMS_MAPPING_REGISTERED',
                organizationId: mapping.organizationId,
                actor,
                resourceType: 'packing_station',
                resourceId: station.station.id,
                requestId,
                occurredAt: this.clock(),
                data: { externalStationCode: mapping.externalStationCode, stationCode: mapping.stationCode },
            });
            await this.repository.saveSession(open);
        }
        return recorded;
    }
    async overrideIncompleteRelease(fulfillmentSessionId, actor, requestId) {
        if (actor.type !== 'CONSOLE_OPERATOR') {
            throw new errors_1.ApplicationError('FORBIDDEN', 'CONSOLE_OPERATOR_REQUIRED', 'Only a console operator may record an ASSIST override.');
        }
        const current = await this.fulfillment.getSession(fulfillmentSessionId);
        if (!current)
            throw new errors_1.ApplicationError('NOT_FOUND', 'FULFILLMENT_SESSION_NOT_FOUND', 'Fulfillment session was not found.');
        let record = current;
        if (record.fulfillment.state === 'PACKING_COMPLETE') {
            record = await this.fulfillment.beginFinalizing(fulfillmentSessionId, actor, `${requestId}:finalizing`);
        }
        if (record.fulfillment.state === 'FINALIZING') {
            record = await this.fulfillment.markEvidenceReady(fulfillmentSessionId, actor, `${requestId}:ready`, true);
        }
        if (record.fulfillment.state !== 'RELEASED') {
            record = await this.fulfillment.release(fulfillmentSessionId, actor, `${requestId}:release`, true);
        }
        record.events.push({
            id: `evt_override_${requestId}`.replace(/[^A-Za-z0-9_]/g, '').slice(0, 80),
            schemaVersion: 1,
            type: 'CONSOLE_OPERATOR_OVERRIDE',
            organizationId: record.fulfillment.organizationId,
            actor,
            resourceType: 'fulfillment_session',
            resourceId: fulfillmentSessionId,
            requestId,
            occurredAt: this.clock(),
            data: { operatingMode: record.fulfillment.operatingMode, state: record.fulfillment.state },
        });
        await this.repository.saveSession(record);
        return record;
    }
    attemptRewriteFinalizedArtifact() {
        throw new errors_1.ApplicationError('FORBIDDEN', 'CONSOLE_CANNOT_ALTER_FINALIZED', 'Administrators may not alter finalized evidence.');
    }
    renderHtml(snapshot) {
        const rows = snapshot.stations.map((station) => (`<tr><th scope="row">${escapeHtml(station.stationCode)}</th><td>${escapeHtml(station.health)}</td><td>${escapeHtml(station.operatingMode)}</td><td>${station.queue.awaitingFinalization}</td><td>${station.queue.finalized}</td></tr>`)).join('');
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PackProof Enterprise console</title>
</head>
<body>
  <p>Enterprise Pilot — Observe Mode</p>
  <h1>PackProof Enterprise console</h1>
  <p>${escapeHtml(snapshot.limitations[0] ?? '')}</p>
  <table>
    <caption>Station health</caption>
    <thead><tr><th>Station</th><th>Health</th><th>Mode</th><th>Awaiting finalization</th><th>Server-finalized</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
    }
    row(graph, sessions, queue) {
        const healthQueue = queue ?? {
            stationId: graph.station.id,
            pending: 0,
            uploading: 0,
            awaitingFinalization: 0,
            finalized: 0,
            attention: 0,
        };
        const stationSessions = sessions.filter((item) => item.fulfillment.stationId === graph.station.id);
        const exceptions = stationSessions.flatMap((item) => {
            const labels = [];
            if (item.fulfillment.state === 'INTEGRITY_FAILURE')
                labels.push('Integrity mismatch quarantined');
            if (item.artifacts.some((artifact) => artifact.status === 'QUARANTINED'))
                labels.push('Artifact quarantined');
            if (item.fulfillment.state === 'EVIDENCE_INCOMPLETE')
                labels.push('Evidence incomplete');
            return labels;
        });
        return {
            stationCode: graph.station.code,
            siteCode: graph.site.code,
            siteName: graph.site.name,
            health: (0, enterprise_1.enterpriseStationHealthLabel)({
                devices: graph.devices,
                pending: healthQueue.pending,
                uploading: healthQueue.uploading,
                awaitingFinalization: healthQueue.awaitingFinalization,
                attention: healthQueue.attention,
            }),
            operatingMode: graph.organization.operatingMode,
            policyId: graph.station.policyId,
            edgeInstallationIdentity: graph.edgeAgent.installationIdentity,
            queue: healthQueue,
            openSessions: stationSessions.filter((item) => !['RELEASED', 'CANCELLED', 'EXPIRED'].includes(item.fulfillment.state)).length,
            exceptions,
        };
    }
}
exports.EnterpriseConsoleApplicationService = EnterpriseConsoleApplicationService;
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[character] ?? character));
}
//# sourceMappingURL=enterprise-console-service.js.map