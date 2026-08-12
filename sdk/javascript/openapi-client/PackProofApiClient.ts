/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseHttpRequest } from './core/BaseHttpRequest';
import type { OpenAPIConfig } from './core/OpenAPI';
import { FetchHttpRequest } from './core/FetchHttpRequest';
import { CommerceHandoffsService } from './services/CommerceHandoffsService';
import { EvidenceSessionsService } from './services/EvidenceSessionsService';
import { ParticipantClaimsService } from './services/ParticipantClaimsService';
import { SystemService } from './services/SystemService';
import { TransactionsService } from './services/TransactionsService';
type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;
export class PackProofApiClient {
    public readonly commerceHandoffs: CommerceHandoffsService;
    public readonly evidenceSessions: EvidenceSessionsService;
    public readonly participantClaims: ParticipantClaimsService;
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
        this.commerceHandoffs = new CommerceHandoffsService(this.request);
        this.evidenceSessions = new EvidenceSessionsService(this.request);
        this.participantClaims = new ParticipantClaimsService(this.request);
        this.system = new SystemService(this.request);
        this.transactions = new TransactionsService(this.request);
    }
}

