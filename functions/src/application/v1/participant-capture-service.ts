import { randomBytes } from 'node:crypto';
import {
  evidenceSessionDtoSchema,
  evidenceSessionTypes,
  type EvidenceArtifactType,
  type EvidenceSessionDto,
  type EvidenceSessionType,
} from '../../domain/v1/evidence';
import {
  participantClaimDtoSchema,
  type ParticipantClaimDto,
  type ParticipantRole,
} from '../../domain/v1/transactions';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import type { ApiRuntimeConfig, MerchantAuditWriter } from './merchant-ports';
import { canonicalize, MerchantAuthorizationPolicy, sha256 } from './merchant-transaction-service';
import type { ApiScope, MerchantPrincipal } from './merchant-types';

export type ParticipantActorPrincipal = {
  type: 'PACKPROOF_USER';
  actorId: string;
  appId: string;
};

export type ParticipantTransactionSnapshot = {
  id: string;
  organizationId: string;
  status: string;
  commerceContextId: string | null;
  originalArtifactSha256: string | null;
  normalizedSnapshotSha256: string | null;
  participantReferences: Array<{ role: ParticipantRole; externalReference: string }>;
  requiredArtifactTypes: EvidenceArtifactType[];
};

export type ParticipantClaimSnapshot = {
  claim: ParticipantClaimDto;
  organizationId: string;
  externalReferenceHash: string;
  tokenHash: string | null;
  claimedActorId: string | null;
};

export type ParticipantInvitationMutation = {
  organizationId: string;
  operationKey: string;
  requestFingerprint: string;
  externalReferenceHash: string;
  tokenHash: string;
  claim: ParticipantClaimDto;
  event: ApplicationEvent;
};

export type ParticipantClaimDecision =
  | { type: 'REPLAY'; result: ClaimParticipantResult }
  | { type: 'CLAIM'; actorId: string; event: ApplicationEvent };

export type EvidenceSessionSnapshot = {
  session: EvidenceSessionDto;
  organizationId: string;
  actorId: string;
  participantClaimId: string;
  tokenHash: string | null;
};

export type EvidenceSessionMutation = {
  organizationId: string;
  participantClaimId: string;
  actorId: string;
  operationKey: string;
  requestFingerprint: string;
  tokenHash: string;
  session: EvidenceSessionDto;
  event: ApplicationEvent;
};

export type LegacyCaptureSession = {
  id: string;
  evidenceSessionId: string;
  uid: string;
  transactionId: string;
  nonce: string;
  appId: string;
  sessionMode: 'SINGLE' | 'BATCH';
  maxEvidenceCount: number;
  captureProfileId: string | null;
  captureGroupId: string | null;
  allowedEvidenceTypes: EvidenceArtifactType[];
  issuedAt: Date;
  captureWindowEndsAt: Date;
  redemptionExpiresAt: Date;
  runtimeArtifactHash: string | null;
  operationKeyHash: string;
};

export type EvidenceSessionRedemptionDecision =
  | { type: 'REPLAY'; result: RedeemEvidenceSessionResult }
  | { type: 'REDEEM'; captureSession: LegacyCaptureSession; event: ApplicationEvent };

export interface ParticipantCaptureRepository {
  findTransactionForOrganization(transactionId: string, organizationId: string): Promise<ParticipantTransactionSnapshot | null>;
  createOrReplayInvitation(mutation: ParticipantInvitationMutation): Promise<{ created: boolean; claim: ParticipantClaimDto }>;
  claimParticipant(
    claimId: string,
    decide: (snapshot: ParticipantClaimSnapshot | null) => ParticipantClaimDecision,
  ): Promise<ClaimParticipantResult>;
  findClaimForOrganization(claimId: string, organizationId: string): Promise<ParticipantClaimSnapshot | null>;
  createOrReplayEvidenceSession(mutation: EvidenceSessionMutation): Promise<{ created: boolean; session: EvidenceSessionDto }>;
  findEvidenceSessionForOrganization(evidenceSessionId: string, organizationId: string): Promise<EvidenceSessionSnapshot | null>;
  findEvidenceSessionForActor(evidenceSessionId: string, actorId: string): Promise<EvidenceSessionSnapshot | null>;
  redeemEvidenceSession(
    evidenceSessionId: string,
    captureSessionId: string,
    decide: (snapshot: EvidenceSessionSnapshot | null, existingCapture: LegacyCaptureSession | null) => EvidenceSessionRedemptionDecision,
  ): Promise<RedeemEvidenceSessionResult>;
  cancelEvidenceSession(
    evidenceSessionId: string,
    organizationId: string,
    actor: { type: 'MERCHANT_API_CLIENT'; id: string },
    requestId: string,
    now: Date,
  ): Promise<{ session: EvidenceSessionDto; changed: boolean }>;
}

export interface ParticipantHandoffTokenService {
  issue(purpose: 'participant-claim' | 'evidence-session', resourceId: string): string;
  digest(token: string): string;
  verify(token: string, expectedDigest: string): boolean;
}

export type CreateParticipantInvitationInput = {
  role: ParticipantRole;
  externalReference: string;
  expiresInSeconds: number;
};

export type CreateEvidenceSessionInput = {
  participantClaimId: string;
  type: EvidenceSessionType;
  allowedArtifactTypes: EvidenceArtifactType[];
  expiresInSeconds: number;
  maximumRedemptions: number;
  requestedEvidenceCount: number;
  captureProfileId: string | null;
  captureGroupId: string | null;
};

export type RedeemEvidenceSessionInput = {
  operationKey: string;
  token: string;
  runtimeArtifactHash: string | null;
};

export type ClaimParticipantResult = {
  claim: ParticipantClaimDto;
  transactionId: string;
  role: ParticipantRole;
  replayed: boolean;
};

export type RedeemEvidenceSessionResult = {
  evidenceSession: EvidenceSessionDto;
  captureAttestation: {
    mode: 'JIT_APP_CHECK';
    captureSessionId: string;
    nonce: string;
    appId: string;
    issuedAt: string;
    captureWindowEndsAt: string;
    tokenReplayDetected: false;
    reasonCodes: string[];
    sessionMode: 'SINGLE' | 'BATCH';
    maxEvidenceCount: number;
    captureGroupId: string | null;
  };
  replayed: boolean;
};

const roleSessionTypes: Readonly<Record<ParticipantRole, readonly EvidenceSessionType[]>> = {
  SELLER: ['OUTBOUND_PACK', 'PHYSICAL_REFERENCE', 'SUPPORTING_DOCUMENT'],
  BUYER: ['RECEIVER_OPEN', 'PHYSICAL_VERIFICATION', 'SUPPORTING_DOCUMENT'],
  RECEIVER: ['RECEIVER_OPEN', 'PHYSICAL_VERIFICATION', 'SUPPORTING_DOCUMENT'],
  RETURN_SENDER: ['RETURN_PACK', 'PHYSICAL_REFERENCE', 'SUPPORTING_DOCUMENT'],
  RETURN_RECIPIENT: ['RETURN_RECEIVE', 'PHYSICAL_VERIFICATION', 'SUPPORTING_DOCUMENT'],
  WITNESS: ['SUPPORTING_DOCUMENT'],
};

function eventId(type: string, resourceId: string): string {
  return `evt_${sha256(`${type}\n${resourceId}`).slice(0, 40)}`;
}

function requireMerchantScope(
  authorization: MerchantAuthorizationPolicy,
  principal: MerchantPrincipal,
  scope: ApiScope,
  environment: ApiRuntimeConfig,
): void {
  authorization.requireEnvironment(principal, environment.environment);
  authorization.requireScope(principal, scope);
}

function captureAttestation(capture: LegacyCaptureSession, session: EvidenceSessionDto, replayed: boolean): RedeemEvidenceSessionResult {
  return {
    evidenceSession: session,
    captureAttestation: {
      mode: 'JIT_APP_CHECK',
      captureSessionId: capture.id,
      nonce: capture.nonce,
      appId: capture.appId,
      issuedAt: capture.issuedAt.toISOString(),
      captureWindowEndsAt: capture.captureWindowEndsAt.toISOString(),
      tokenReplayDetected: false,
      reasonCodes: [],
      sessionMode: capture.sessionMode,
      maxEvidenceCount: capture.maxEvidenceCount,
      captureGroupId: capture.captureGroupId,
    },
    replayed,
  };
}

export class ParticipantCaptureApplicationService {
  constructor(
    private readonly repository: ParticipantCaptureRepository,
    private readonly tokenService: ParticipantHandoffTokenService,
    private readonly audit: MerchantAuditWriter,
    private readonly authorization: MerchantAuthorizationPolicy,
    private readonly config: ApiRuntimeConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createInvitation(command: {
    principal: MerchantPrincipal;
    transactionId: string;
    input: CreateParticipantInvitationInput;
    operationKey: string;
    requestId: string;
  }): Promise<{ claim: ParticipantClaimDto; token: string; replayed: boolean }> {
    requireMerchantScope(this.authorization, command.principal, 'participant_claims:write', this.config);
    const transaction = await this.repository.findTransactionForOrganization(command.transactionId, command.principal.organizationId);
    if (!transaction) throw new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
    if (transaction.status === 'CANCELLED') throw new ApplicationError('FAILED_PRECONDITION', 'TRANSACTION_CANCELLED', 'A cancelled transaction cannot issue participant invitations.');
    if (command.input.role === 'WITNESS') {
      throw new ApplicationError('FAILED_PRECONDITION', 'PARTICIPANT_ROLE_NOT_ENABLED', 'Witness claims are reserved for a later authorized-witness policy.');
    }
    const declared = transaction.participantReferences.some((entry) => (
      entry.role === command.input.role && entry.externalReference === command.input.externalReference
    ));
    if (!declared) {
      throw new ApplicationError('FAILED_PRECONDITION', 'PARTICIPANT_REFERENCE_NOT_DECLARED', 'The role and external reference must already be declared on the merchant transaction.');
    }

    const timestamp = this.now();
    const operationIdentity = canonicalize({
      organizationId: command.principal.organizationId,
      transactionId: command.transactionId,
      operationKey: command.operationKey,
    });
    const claimId = `claim_${sha256(`participant-claim-v1\n${operationIdentity}`).slice(0, 40)}`;
    const token = this.tokenService.issue('participant-claim', claimId);
    const expiresAt = new Date(timestamp.getTime() + command.input.expiresInSeconds * 1_000);
    const externalReferenceHash = sha256(command.input.externalReference);
    const requestFingerprint = sha256(canonicalize({
      transactionId: command.transactionId,
      role: command.input.role,
      externalReferenceHash,
      expiresInSeconds: command.input.expiresInSeconds,
    }));
    const claim = participantClaimDtoSchema.parse({
      id: claimId,
      object: 'participant_claim',
      schemaVersion: 1,
      transactionId: command.transactionId,
      role: command.input.role,
      status: 'ISSUED',
      expiresAt: expiresAt.toISOString(),
      claimedAt: null,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });
    const event: ApplicationEvent = {
      id: eventId('PARTICIPANT_CLAIM_ISSUED', claimId),
      schemaVersion: 1,
      type: 'PARTICIPANT_CLAIM_ISSUED',
      organizationId: command.principal.organizationId,
      actor: { type: 'MERCHANT_API_CLIENT', id: command.principal.apiClientId },
      resourceType: 'participant_claim',
      resourceId: claimId,
      requestId: command.requestId,
      occurredAt: timestamp,
      data: { transactionId: command.transactionId, role: command.input.role, externalReferenceHash, expiresAt: claim.expiresAt },
    };
    const result = await this.repository.createOrReplayInvitation({
      organizationId: command.principal.organizationId,
      operationKey: command.operationKey,
      requestFingerprint,
      externalReferenceHash,
      tokenHash: this.tokenService.digest(token),
      claim,
      event,
    });
    await this.audit.append({
      eventId: `participant_claim_issued_${claimId}`,
      organizationId: command.principal.organizationId,
      type: 'PARTICIPANT_CLAIM_ISSUED',
      actor: command.principal,
      resourceType: 'PARTICIPANT_CLAIM',
      resourceId: claimId,
      requestId: command.requestId,
      metadata: { transactionId: command.transactionId, role: command.input.role, requestFingerprint, outboxEventId: event.id },
    });
    return { claim: result.claim, token, replayed: !result.created };
  }

  async claimParticipant(command: {
    principal: ParticipantActorPrincipal;
    claimId: string;
    token: string;
    requestId: string;
  }): Promise<ClaimParticipantResult> {
    return this.repository.claimParticipant(command.claimId, (snapshot) => {
      if (!snapshot) throw new ApplicationError('NOT_FOUND', 'PARTICIPANT_CLAIM_NOT_FOUND', 'The participant invitation was not found.');
      const timestamp = this.now();
      if (snapshot.claim.status === 'CLAIMED' && snapshot.claimedActorId === command.principal.actorId) {
        return { type: 'REPLAY', result: {
          claim: snapshot.claim,
          transactionId: snapshot.claim.transactionId,
          role: snapshot.claim.role,
          replayed: true,
        } };
      }
      if (snapshot.claim.status === 'CLAIMED') {
        throw new ApplicationError('CONFLICT', 'PARTICIPANT_CLAIM_ALREADY_USED', 'This invitation was claimed by another PackProof account.');
      }
      if (snapshot.claim.status === 'REVOKED') throw new ApplicationError('FAILED_PRECONDITION', 'PARTICIPANT_CLAIM_REVOKED', 'This invitation was revoked.');
      if (snapshot.claim.status === 'EXPIRED' || Date.parse(snapshot.claim.expiresAt) <= timestamp.getTime()) {
        throw new ApplicationError('DEADLINE_EXCEEDED', 'PARTICIPANT_CLAIM_EXPIRED', 'This participant invitation has expired.');
      }
      if (!snapshot.tokenHash || !this.tokenService.verify(command.token, snapshot.tokenHash)) {
        throw new ApplicationError('FORBIDDEN', 'INVALID_PARTICIPANT_CLAIM_TOKEN', 'The participant invitation token is invalid.');
      }
      const event: ApplicationEvent = {
        id: eventId('PARTICIPANT_CLAIMED', snapshot.claim.id),
        schemaVersion: 1,
        type: 'PARTICIPANT_CLAIMED',
        organizationId: snapshot.organizationId,
        actor: { type: 'USER', id: command.principal.actorId },
        resourceType: 'participant_claim',
        resourceId: snapshot.claim.id,
        requestId: command.requestId,
        occurredAt: timestamp,
        data: { transactionId: snapshot.claim.transactionId, role: snapshot.claim.role, appId: command.principal.appId },
      };
      return { type: 'CLAIM', actorId: command.principal.actorId, event };
    });
  }

  async createEvidenceSession(command: {
    principal: MerchantPrincipal;
    transactionId: string;
    input: CreateEvidenceSessionInput;
    operationKey: string;
    requestId: string;
  }): Promise<{ session: EvidenceSessionDto; token: string; replayed: boolean }> {
    requireMerchantScope(this.authorization, command.principal, 'evidence:write', this.config);
    const [transaction, participantClaim] = await Promise.all([
      this.repository.findTransactionForOrganization(command.transactionId, command.principal.organizationId),
      this.repository.findClaimForOrganization(command.input.participantClaimId, command.principal.organizationId),
    ]);
    if (!transaction) throw new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
    if (!participantClaim || participantClaim.claim.transactionId !== command.transactionId) {
      throw new ApplicationError('NOT_FOUND', 'PARTICIPANT_CLAIM_NOT_FOUND', 'The participant claim was not found for this transaction.');
    }
    if (participantClaim.claim.status !== 'CLAIMED' || !participantClaim.claimedActorId) {
      throw new ApplicationError('FAILED_PRECONDITION', 'PARTICIPANT_NOT_CLAIMED', 'An authenticated participant must claim the invitation before evidence capture can be authorized.');
    }
    if (!evidenceSessionTypes.includes(command.input.type) || !roleSessionTypes[participantClaim.claim.role].includes(command.input.type)) {
      throw new ApplicationError('FAILED_PRECONDITION', 'ROLE_SESSION_TYPE_MISMATCH', 'The participant role is not authorized for this evidence-session type.');
    }
    if (transaction.requiredArtifactTypes.length) {
      const outsideRequirements = command.input.allowedArtifactTypes.filter((type) => !transaction.requiredArtifactTypes.includes(type));
      if (outsideRequirements.length) {
        throw new ApplicationError('FAILED_PRECONDITION', 'ARTIFACT_TYPE_NOT_REQUIRED', 'The evidence session cannot authorize artifact types outside the transaction capture requirements.');
      }
    }
    const physical = command.input.type === 'PHYSICAL_REFERENCE' || command.input.type === 'PHYSICAL_VERIFICATION';
    if (physical) {
      const requiredFrameType = command.input.type === 'PHYSICAL_REFERENCE'
        ? 'PHYSICAL_REFERENCE_FRAME'
        : 'PHYSICAL_VERIFICATION_FRAME';
      if (command.input.allowedArtifactTypes.length !== 1 || command.input.allowedArtifactTypes[0] !== requiredFrameType) {
        throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_PHYSICAL_ARTIFACT_TYPE', `This physical evidence session must authorize only ${requiredFrameType}.`);
      }
      if (command.input.requestedEvidenceCount !== 15 || command.input.captureProfileId !== 'PP-PHYSICAL-MATTE-V1' || !command.input.captureGroupId) {
        throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_PHYSICAL_CAPTURE_PROFILE', 'Physical evidence sessions require the frozen 15-frame capture profile and a capture group identifier.');
      }
    } else if (command.input.requestedEvidenceCount !== 1 || command.input.captureProfileId || command.input.captureGroupId) {
      throw new ApplicationError('INVALID_ARGUMENT', 'CAPTURE_PROFILE_NOT_ALLOWED', 'Capture profile fields are reserved for approved physical evidence sessions.');
    }

    const timestamp = this.now();
    const operationIdentity = canonicalize({
      organizationId: command.principal.organizationId,
      transactionId: command.transactionId,
      operationKey: command.operationKey,
    });
    const evidenceSessionId = `es_${sha256(`evidence-session-v1\n${operationIdentity}`).slice(0, 40)}`;
    const token = this.tokenService.issue('evidence-session', evidenceSessionId);
    const expiresAt = new Date(timestamp.getTime() + command.input.expiresInSeconds * 1_000);
    const requestFingerprint = sha256(canonicalize({ transactionId: command.transactionId, ...command.input }));
    const session = evidenceSessionDtoSchema.parse({
      id: evidenceSessionId,
      object: 'evidence_session',
      schemaVersion: 1,
      transactionId: command.transactionId,
      commerceContextId: transaction.commerceContextId,
      returnPassportId: null,
      actorRole: participantClaim.claim.role,
      type: command.input.type,
      protocolVersion: 'PP-CAPTURE-V1',
      allowedArtifactTypes: command.input.allowedArtifactTypes,
      status: 'READY',
      captureState: 'READY',
      syncState: 'NOT_STARTED',
      processingState: 'NOT_STARTED',
      maximumRedemptions: command.input.maximumRedemptions,
      redemptionCount: 0,
      requestedEvidenceCount: command.input.requestedEvidenceCount,
      captureProfileId: command.input.captureProfileId,
      captureGroupId: command.input.captureGroupId,
      expiresAt: expiresAt.toISOString(),
      startedAt: null,
      completedAt: null,
      originalArtifactSha256: transaction.originalArtifactSha256,
      normalizedSnapshotSha256: transaction.normalizedSnapshotSha256,
      intakeFrozenAt: null,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });
    const event: ApplicationEvent = {
      id: eventId('EVIDENCE_SESSION_CREATED', evidenceSessionId),
      schemaVersion: 1,
      type: 'EVIDENCE_SESSION_CREATED',
      organizationId: command.principal.organizationId,
      actor: { type: 'MERCHANT_API_CLIENT', id: command.principal.apiClientId },
      resourceType: 'evidence_session',
      resourceId: evidenceSessionId,
      requestId: command.requestId,
      occurredAt: timestamp,
      data: {
        transactionId: command.transactionId,
        participantClaimId: participantClaim.claim.id,
        actorRole: participantClaim.claim.role,
        type: command.input.type,
        expiresAt: session.expiresAt,
      },
    };
    const result = await this.repository.createOrReplayEvidenceSession({
      organizationId: command.principal.organizationId,
      participantClaimId: participantClaim.claim.id,
      actorId: participantClaim.claimedActorId,
      operationKey: command.operationKey,
      requestFingerprint,
      tokenHash: this.tokenService.digest(token),
      session,
      event,
    });
    await this.audit.append({
      eventId: `evidence_session_created_${evidenceSessionId}`,
      organizationId: command.principal.organizationId,
      type: 'EVIDENCE_SESSION_CREATED',
      actor: command.principal,
      resourceType: 'EVIDENCE_SESSION',
      resourceId: evidenceSessionId,
      requestId: command.requestId,
      metadata: { transactionId: command.transactionId, participantClaimId: participantClaim.claim.id, requestFingerprint, outboxEventId: event.id },
    });
    return { session: result.session, token, replayed: !result.created };
  }

  async getEvidenceSession(principal: MerchantPrincipal, evidenceSessionId: string): Promise<EvidenceSessionDto> {
    requireMerchantScope(this.authorization, principal, 'evidence:read', this.config);
    const snapshot = await this.repository.findEvidenceSessionForOrganization(evidenceSessionId, principal.organizationId);
    if (!snapshot) throw new ApplicationError('NOT_FOUND', 'EVIDENCE_SESSION_NOT_FOUND', 'The requested evidence session was not found.');
    return snapshot.session;
  }

  async getEvidenceSessionForActor(principal: ParticipantActorPrincipal, evidenceSessionId: string): Promise<EvidenceSessionDto> {
    const snapshot = await this.repository.findEvidenceSessionForActor(evidenceSessionId, principal.actorId);
    if (!snapshot) throw new ApplicationError('NOT_FOUND', 'EVIDENCE_SESSION_NOT_FOUND', 'The evidence session was not found for this participant.');
    if (snapshot.session.status === 'CANCELLED') throw new ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_SESSION_CANCELLED', 'This evidence session was cancelled.');
    if (Date.parse(snapshot.session.expiresAt) <= this.now().getTime()) {
      throw new ApplicationError('DEADLINE_EXCEEDED', 'EVIDENCE_SESSION_EXPIRED', 'This evidence session has expired.');
    }
    return snapshot.session;
  }

  async redeemEvidenceSession(command: {
    principal: ParticipantActorPrincipal;
    evidenceSessionId: string;
    input: RedeemEvidenceSessionInput;
    requestId: string;
  }): Promise<RedeemEvidenceSessionResult> {
    const captureSessionId = `cap_${sha256(canonicalize({
      evidenceSessionId: command.evidenceSessionId,
      actorId: command.principal.actorId,
      operationKey: command.input.operationKey,
    })).slice(0, 40)}`;
    return this.repository.redeemEvidenceSession(command.evidenceSessionId, captureSessionId, (snapshot, existingCapture) => {
      if (!snapshot) throw new ApplicationError('NOT_FOUND', 'EVIDENCE_SESSION_NOT_FOUND', 'The evidence session was not found.');
      if (snapshot.actorId !== command.principal.actorId) {
        throw new ApplicationError('FORBIDDEN', 'EVIDENCE_SESSION_ACTOR_MISMATCH', 'This evidence session belongs to a different PackProof participant.');
      }
      if (existingCapture) {
        if (existingCapture.uid !== command.principal.actorId || existingCapture.evidenceSessionId !== command.evidenceSessionId
          || existingCapture.operationKeyHash !== sha256(command.input.operationKey)) {
          throw new ApplicationError('CONFLICT', 'CAPTURE_SESSION_IDENTITY_CONFLICT', 'The capture-session identity is already bound to another operation.');
        }
        return { type: 'REPLAY', result: captureAttestation(existingCapture, snapshot.session, true) };
      }
      const timestamp = this.now();
      if (snapshot.session.status === 'CANCELLED') throw new ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_SESSION_CANCELLED', 'This evidence session was cancelled.');
      if (Date.parse(snapshot.session.expiresAt) <= timestamp.getTime()) {
        throw new ApplicationError('DEADLINE_EXCEEDED', 'EVIDENCE_SESSION_EXPIRED', 'This evidence session has expired.');
      }
      if (snapshot.session.redemptionCount >= snapshot.session.maximumRedemptions) {
        throw new ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_SESSION_REDEMPTIONS_EXHAUSTED', 'This evidence session has no remaining redemptions.');
      }
      if (!snapshot.tokenHash || !this.tokenService.verify(command.input.token, snapshot.tokenHash)) {
        throw new ApplicationError('FORBIDDEN', 'INVALID_EVIDENCE_SESSION_TOKEN', 'The evidence-session token is invalid.');
      }
      if (command.input.runtimeArtifactHash && !/^[a-f0-9]{64}$/i.test(command.input.runtimeArtifactHash)) {
        throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_RUNTIME_ARTIFACT_HASH', 'runtimeArtifactHash must be a SHA-256 hexadecimal digest.');
      }
      const captureWindowEndsAt = new Date(timestamp.getTime() + 10 * 60_000);
      const capture: LegacyCaptureSession = {
        id: captureSessionId,
        evidenceSessionId: snapshot.session.id,
        uid: command.principal.actorId,
        transactionId: snapshot.session.transactionId,
        nonce: randomBytes(32).toString('base64url'),
        appId: command.principal.appId,
        sessionMode: snapshot.session.requestedEvidenceCount > 1 ? 'BATCH' : 'SINGLE',
        maxEvidenceCount: snapshot.session.requestedEvidenceCount,
        captureProfileId: snapshot.session.captureProfileId,
        captureGroupId: snapshot.session.captureGroupId,
        allowedEvidenceTypes: snapshot.session.allowedArtifactTypes,
        issuedAt: timestamp,
        captureWindowEndsAt,
        redemptionExpiresAt: new Date(timestamp.getTime() + 30 * 86400_000),
        runtimeArtifactHash: command.input.runtimeArtifactHash,
        operationKeyHash: sha256(command.input.operationKey),
      };
      const event: ApplicationEvent = {
        id: eventId('EVIDENCE_SESSION_STARTED', captureSessionId),
        schemaVersion: 1,
        type: 'EVIDENCE_SESSION_STARTED',
        organizationId: snapshot.organizationId,
        actor: { type: 'USER', id: command.principal.actorId },
        resourceType: 'evidence_session',
        resourceId: snapshot.session.id,
        requestId: command.requestId,
        occurredAt: timestamp,
        data: { transactionId: snapshot.session.transactionId, captureSessionId, appId: command.principal.appId },
      };
      return { type: 'REDEEM', captureSession: capture, event };
    });
  }

  async cancelEvidenceSession(command: {
    principal: MerchantPrincipal;
    evidenceSessionId: string;
    requestId: string;
  }): Promise<{ session: EvidenceSessionDto; replayed: boolean }> {
    requireMerchantScope(this.authorization, command.principal, 'evidence:write', this.config);
    const result = await this.repository.cancelEvidenceSession(
      command.evidenceSessionId,
      command.principal.organizationId,
      { type: 'MERCHANT_API_CLIENT', id: command.principal.apiClientId },
      command.requestId,
      this.now(),
    );
    return { session: result.session, replayed: !result.changed };
  }
}
