import { ApplicationError } from './errors';
import { EnterpriseFulfillmentApplicationService } from './enterprise-fulfillment-service';
import type {
  ActorRef,
  EnterpriseFulfillmentRepository,
  EnterpriseSessionRecord,
  WmsEvidenceReadyCallback,
  WmsIngestCommand,
} from './enterprise-ports';

export class EnterpriseWmsApplicationService {
  constructor(
    private readonly fulfillment: EnterpriseFulfillmentApplicationService,
    private readonly repository: EnterpriseFulfillmentRepository,
  ) {}

  async ingest(command: WmsIngestCommand, actor: ActorRef): Promise<EnterpriseSessionRecord> {
    if (actor.type === 'EDGE_AGENT') {
      throw new ApplicationError('FORBIDDEN', 'WMS_INGEST_NOT_EDGE', 'WMS events are not Edge finalization and must not be submitted as Edge capabilities.');
    }
    const location = await this.resolveLocation(command);
    if (command.type === 'ORDER_UNASSIGNED') {
      return this.fulfillment.unassignOrder({
        organizationId: command.organizationId,
        siteCode: location.siteCode,
        stationCode: location.stationCode,
        externalOrderId: command.externalOrderId,
        requestId: command.requestId,
      }, actor);
    }
    if (!command.transactionId) {
      throw new ApplicationError('INVALID_ARGUMENT', 'TRANSACTION_REQUIRED', 'ORDER_ASSIGNED requires a PackProof transaction identity.');
    }
    return this.fulfillment.assignOrder({
      organizationId: command.organizationId,
      siteCode: location.siteCode,
      stationCode: location.stationCode,
      externalOrderId: command.externalOrderId,
      transactionId: command.transactionId,
      expectedItems: command.expectedItems,
      expectedTrackingNumber: command.expectedTrackingNumber,
      commandKey: command.commandKey,
      requestId: command.requestId,
    }, actor);
  }

  evidenceReadyCallback(record: EnterpriseSessionRecord, stationCode: string): WmsEvidenceReadyCallback {
    const ready = record.events.some((item) => item.type === 'PACKPROOF_EVIDENCE_READY');
    if (!ready) {
      throw new ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_NOT_READY', 'WMS is notified only after independent server finalization produces PACKPROOF_EVIDENCE_READY.');
    }
    const { evaluation } = this.fulfillment.evaluate(record);
    return {
      type: 'PACKPROOF_EVIDENCE_READY',
      externalOrderId: record.fulfillment.externalOrderId,
      stationCode,
      transactionId: record.fulfillment.transactionId ?? '',
      fulfillmentSessionId: record.fulfillment.id,
      operatingMode: record.fulfillment.operatingMode,
      statements: evaluation.statements,
      acquisitionClass: 'ENTERPRISE_EDGE',
    };
  }

  private async resolveLocation(command: WmsIngestCommand): Promise<{ siteCode: string; stationCode: string }> {
    if (command.siteCode && command.stationCode) {
      return { siteCode: command.siteCode, stationCode: command.stationCode };
    }
    if (!command.externalStationCode) {
      throw new ApplicationError('INVALID_ARGUMENT', 'STATION_REQUIRED', 'WMS ingest requires a station code or a registered external station mapping.');
    }
    const mapping = await this.repository.findWmsMapping(command.organizationId, command.externalStationCode);
    if (!mapping) {
      throw new ApplicationError('NOT_FOUND', 'WMS_MAPPING_NOT_FOUND', 'No PackProof station is mapped to that WMS station code.');
    }
    return { siteCode: mapping.siteCode, stationCode: mapping.stationCode };
  }
}
