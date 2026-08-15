/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseHttpRequest } from './core/BaseHttpRequest';
import type { OpenAPIConfig } from './core/OpenAPI';
import { FetchHttpRequest } from './core/FetchHttpRequest';
import { ClaimsReviewService } from './services/ClaimsReviewService';
import { CommerceHandoffsService } from './services/CommerceHandoffsService';
import { ConnectSessionsService } from './services/ConnectSessionsService';
import { EvidenceService } from './services/EvidenceService';
import { EvidenceSessionsService } from './services/EvidenceSessionsService';
import { ParticipantClaimsService } from './services/ParticipantClaimsService';
import { ReportsService } from './services/ReportsService';
import { ReturnsService } from './services/ReturnsService';
import { ShipmentsService } from './services/ShipmentsService';
import { SystemService } from './services/SystemService';
import { TransactionsService } from './services/TransactionsService';
type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;
export class PackProofApiClient {
    public readonly claimsReview: ClaimsReviewService;
    public readonly commerceHandoffs: CommerceHandoffsService;
    public readonly connectSessions: ConnectSessionsService;
    public readonly evidence: EvidenceService;
    public readonly evidenceSessions: EvidenceSessionsService;
    public readonly participantClaims: ParticipantClaimsService;
    public readonly reports: ReportsService;
    public readonly returns: ReturnsService;
    public readonly shipments: ShipmentsService;
    public readonly system: SystemService;
    public readonly transactions: TransactionsService;
    public readonly request: BaseHttpRequest;
    constructor(config?: Partial<OpenAPIConfig>, HttpRequest: HttpRequestConstructor = FetchHttpRequest) {
        this.request = new HttpRequest({
            BASE: config?.BASE ?? 'https://YOUR_PACKPROOF_DOMAIN.example',
            VERSION: config?.VERSION ?? '1.0.0',
            WITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,
            CREDENTIALS: config?.CREDENTIALS ?? 'include',
            TOKEN: config?.TOKEN,
            USERNAME: config?.USERNAME,
            PASSWORD: config?.PASSWORD,
            HEADERS: config?.HEADERS,
            ENCODE_PATH: config?.ENCODE_PATH,
        });
        this.claimsReview = new ClaimsReviewService(this.request);
        this.commerceHandoffs = new CommerceHandoffsService(this.request);
        this.connectSessions = new ConnectSessionsService(this.request);
        this.evidence = new EvidenceService(this.request);
        this.evidenceSessions = new EvidenceSessionsService(this.request);
        this.participantClaims = new ParticipantClaimsService(this.request);
        this.reports = new ReportsService(this.request);
        this.returns = new ReturnsService(this.request);
        this.shipments = new ShipmentsService(this.request);
        this.system = new SystemService(this.request);
        this.transactions = new TransactionsService(this.request);
    }
}

