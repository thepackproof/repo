import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { ApplicationError } from '../../application/v1/errors';
import { PublicCommerceHandoffApplicationService, type PublicCommerceIntegration } from '../../application/v1/public-commerce-handoff-service';
import { ParticipantCaptureApplicationService, type ParticipantActorPrincipal } from '../../application/v1/participant-capture-service';
import { ApiError, InputValidationError, sha256, type MerchantPrincipal } from './core';
import type { MerchantAuthenticator, RateLimitPolicy, RateLimiter, ReadinessChecker } from './ports';
import type { ParticipantAuthenticator } from './participant-security';
import { MerchantConnectApplicationService } from '../../application/v1/merchant-connect-service';
import { MerchantEvidenceApplicationService } from '../../application/v1/merchant-evidence-service';
import { TransactionService } from './transaction-service';
import {
  parseAccessibleTransactionId,
  parseAssociateShipment,
  parseBrowserOrigin,
  parseClaimParticipant,
  parseConnectSessionId,
  parseCreateConnectSession,
  parseCreateEvidenceReport,
  parseCreateEvidenceSession,
  parseCreateParticipantInvitation,
  parseCreatePublicCommerceHandoff,
  parseCreateTransaction,
  parseEvidenceArtifactId,
  parseEvidenceReportId,
  parseIdempotencyKey,
  parseEvidenceSessionId,
  parseListTransactions,
  parsePublishableKey,
  parseRedeemEvidenceSession,
  parseReturnPassportId,
  parseTransactionId,
} from './validation';

type ApiAppDependencies = {
  authenticator: MerchantAuthenticator;
  rateLimiter: RateLimiter;
  readiness: ReadinessChecker;
  transactionService: TransactionService;
  participantAuthenticator: ParticipantAuthenticator;
  participantCaptureService: ParticipantCaptureApplicationService;
  publicCommerceHandoffService: PublicCommerceHandoffApplicationService;
  merchantEvidenceService: MerchantEvidenceApplicationService;
  merchantConnectService: MerchantConnectApplicationService;
  publicHandoffReviewBaseUrl: () => string;
  participantHandoffBaseUrl: () => string;
};

type ApiLocals = {
  requestId: string;
  principal?: MerchantPrincipal;
  participantPrincipal?: ParticipantActorPrincipal;
  operation?: string;
  publicAuthorization?: { integration: PublicCommerceIntegration; origin: string };
  publicPublishableKey?: string;
};

const ratePolicies = {
  authentication: { name: 'authentication', limit: 120, windowSeconds: 60 },
  transactionCreate: { name: 'transaction-create', limit: 30, windowSeconds: 60 },
  transactionRead: { name: 'transaction-read', limit: 120, windowSeconds: 60 },
  transactionList: { name: 'transaction-list', limit: 60, windowSeconds: 60 },
  publicHandoffNetwork: { name: 'public-handoff-network', limit: 120, windowSeconds: 60 },
  publicHandoffCreate: { name: 'public-handoff-create', limit: 30, windowSeconds: 60 },
  participantAuthentication: { name: 'participant-authentication', limit: 60, windowSeconds: 60 },
  participantClaim: { name: 'participant-claim', limit: 10, windowSeconds: 60 },
  evidenceSessionRedeem: { name: 'evidence-session-redeem', limit: 10, windowSeconds: 60 },
  participantInvitationCreate: { name: 'participant-invitation-create', limit: 30, windowSeconds: 60 },
  evidenceSessionCreate: { name: 'evidence-session-create', limit: 30, windowSeconds: 60 },
  evidenceSessionRead: { name: 'evidence-session-read', limit: 120, windowSeconds: 60 },
  evidenceSessionCancel: { name: 'evidence-session-cancel', limit: 30, windowSeconds: 60 },
  evidenceRead: { name: 'evidence-read', limit: 120, windowSeconds: 60 },
  evidenceReportCreate: { name: 'evidence-report-create', limit: 10, windowSeconds: 60 },
  shipmentRead: { name: 'shipment-read', limit: 120, windowSeconds: 60 },
  shipmentWrite: { name: 'shipment-write', limit: 30, windowSeconds: 60 },
  connectCreate: { name: 'connect-session-create', limit: 30, windowSeconds: 60 },
  connectRead: { name: 'connect-session-read', limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

function asyncHandler(handler: (req: Request, res: Response<unknown, ApiLocals>, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => { void handler(req, res as Response<unknown, ApiLocals>, next).catch(next); };
}

function acceptedRequestId(value: string | undefined): string {
  if (value && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(value)) return value;
  return randomUUID();
}

function setRateHeaders(res: Response, decision: { limit: number; remaining: number; resetAt: Date }): void {
  res.setHeader('RateLimit-Limit', String(decision.limit));
  res.setHeader('RateLimit-Remaining', String(decision.remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(decision.resetAt.getTime() / 1_000)));
}

async function enforceRateLimitForKey(
  limiter: RateLimiter,
  principalId: string,
  policy: RateLimitPolicy,
  res: Response,
): Promise<void> {
  const decision = await limiter.consume(principalId, policy);
  setRateHeaders(res, decision);
  if (!decision.allowed) {
    const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1_000));
    throw new ApiError(429, 'RATE_LIMIT_EXCEEDED', 'The rate limit for this operation was exceeded.', [], { 'Retry-After': String(retryAfter) });
  }
}

async function enforcePrincipalRateLimit(
  limiter: RateLimiter,
  principal: MerchantPrincipal,
  policy: RateLimitPolicy,
  res: Response,
): Promise<void> {
  await enforceRateLimitForKey(limiter, `${principal.organizationId}:${principal.apiClientId}`, policy, res);
}

function requireJson(req: Request): void {
  if (!req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'This endpoint requires Content-Type: application/json.');
  }
}

function setPublicCors(res: Response, origin: string): void {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
}

function apiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ApplicationError) {
    const statusByCategory = {
      INVALID_ARGUMENT: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      DEADLINE_EXCEEDED: 410,
      FAILED_PRECONDITION: 409,
      RESOURCE_EXHAUSTED: 429,
      RETRYABLE_CONFLICT: 409,
    } as const;
    return new ApiError(
      statusByCategory[error.category],
      error.code,
      error.message,
      error.details,
      error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {},
    );
  }
  if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
    return new ApiError(413, 'REQUEST_TOO_LARGE', 'The request body exceeds the 256 KiB API limit.');
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    return new InputValidationError([{ field: 'body', code: 'INVALID_JSON', message: 'The request body is not valid JSON.' }]);
  }
  return new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
}

export function createApiV1App(dependencies: ApiAppDependencies): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res: Response<unknown, ApiLocals>, next) => {
    const requestId = acceptedRequestId(req.get('x-request-id'));
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const principal = res.locals.principal;
      const participantPrincipal = res.locals.participantPrincipal;
      console.info(JSON.stringify({
        severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
        message: 'packproof_api_request',
        requestId,
        apiVersion: 'v1',
        operation: res.locals.operation ?? 'unmatched',
        method: req.method,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        principalType: principal?.type ?? participantPrincipal?.type ?? 'UNAUTHENTICATED',
        organizationId: principal?.organizationId ?? null,
        apiClientId: principal?.apiClientId ?? null,
      }));
    });
    next();
  });
  app.get('/v1/health', (req, res: Response<unknown, ApiLocals>) => {
    res.locals.operation = 'health';
    res.status(200).json({ data: { service: 'packproof-api', apiVersion: 'v1', status: 'OK' } });
  });

  app.get('/v1/ready', asyncHandler(async (_req, res) => {
    res.locals.operation = 'readiness';
    try {
      await dependencies.readiness.check();
      res.status(200).json({ data: { service: 'packproof-api', apiVersion: 'v1', status: 'READY' } });
    } catch {
      throw new ApiError(503, 'SERVICE_NOT_READY', 'A required service dependency is unavailable.', [], { 'Retry-After': '5' });
    }
  }));

  const publicHandoffPath = '/v1/public/integrations/:publishableKey/handoffs';
  app.options(publicHandoffPath, asyncHandler(async (req, res) => {
    res.locals.operation = 'preflightPublicCommerceHandoff';
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `public-network:${sha256(req.ip || 'unavailable')}`,
      ratePolicies.publicHandoffNetwork,
      res,
    );
    const publishableKey = parsePublishableKey(req.params.publishableKey);
    const origin = parseBrowserOrigin(req.get('origin'));
    const authorization = await dependencies.publicCommerceHandoffService.authorizeOrigin(publishableKey, origin);
    setPublicCors(res, authorization.origin);
    res.status(204).end();
  }));

  app.post(publicHandoffPath, asyncHandler(async (req, res, next) => {
    res.locals.operation = 'createPublicCommerceHandoff';
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `public-network:${sha256(req.ip || 'unavailable')}`,
      ratePolicies.publicHandoffNetwork,
      res,
    );
    const publishableKey = parsePublishableKey(req.params.publishableKey);
    const origin = parseBrowserOrigin(req.get('origin'));
    const authorization = await dependencies.publicCommerceHandoffService.authorizeOrigin(publishableKey, origin);
    setPublicCors(res, authorization.origin);
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `public-installation:${authorization.integration.id}:${sha256(authorization.origin)}`,
      ratePolicies.publicHandoffCreate,
      res,
    );
    res.locals.publicAuthorization = authorization;
    res.locals.publicPublishableKey = publishableKey;
    next();
  }), express.json({ limit: '256kb', strict: true, type: 'application/json' }), asyncHandler(async (req, res) => {
    const authorization = res.locals.publicAuthorization!;
    const publishableKey = res.locals.publicPublishableKey!;
    const origin = authorization.origin;
    requireJson(req);
    const input = parseCreatePublicCommerceHandoff(req.body);
    const operationKey = parseIdempotencyKey(req.get('idempotency-key'));
    const result = await dependencies.publicCommerceHandoffService.issue({
      publishableKey,
      origin,
      operationKey,
      input,
      requestId: res.locals.requestId,
      authorization,
    });
    const reviewUrl = `${dependencies.publicHandoffReviewBaseUrl().replace(/\/$/, '')}/handoff/review?handoff=${encodeURIComponent(result.handoffId)}&token=${encodeURIComponent(result.token)}`;
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({
      data: {
        id: result.handoffId,
        object: 'commerce_handoff',
        schemaVersion: 1,
        commerceContextId: result.commerceContextId,
        passportDraftId: result.passportDraftId,
        trustLevel: 'PAGE_DECLARED',
        status: 'PENDING_CLAIM',
        reviewUrl,
        expiresAt: result.expiresAt.toISOString(),
      },
    });
  }));

  app.all(publicHandoffPath, (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST, OPTIONS' }));
  });

  const participantRouter = express.Router();
  const authenticateParticipant = asyncHandler(async (req, res, next) => {
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `participant-network:${sha256(req.ip || 'unavailable')}`,
      ratePolicies.participantAuthentication,
      res,
    );
    res.locals.participantPrincipal = await dependencies.participantAuthenticator.authenticate(
      req.get('authorization'),
      req.get('x-firebase-appcheck'),
    );
    next();
  });
  const participantJson = express.json({ limit: '256kb', strict: true, type: 'application/json' });

  participantRouter.post('/participant-claims', authenticateParticipant, participantJson, asyncHandler(async (req, res) => {
    res.locals.operation = 'claimParticipant';
    requireJson(req);
    const principal = res.locals.participantPrincipal!;
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `participant:${principal.actorId}`,
      ratePolicies.participantClaim,
      res,
    );
    const input = parseClaimParticipant(req.body);
    const result = await dependencies.participantCaptureService.claimParticipant({
      principal,
      claimId: input.claimId,
      token: input.token,
      requestId: res.locals.requestId,
    });
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({ data: result.claim, transactionId: result.transactionId, role: result.role });
  }));

  participantRouter.post('/evidence-sessions/:evidenceSessionId/redeem', authenticateParticipant, participantJson, asyncHandler(async (req, res) => {
    res.locals.operation = 'redeemEvidenceSession';
    requireJson(req);
    const principal = res.locals.participantPrincipal!;
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `participant:${principal.actorId}`,
      ratePolicies.evidenceSessionRedeem,
      res,
    );
    const result = await dependencies.participantCaptureService.redeemEvidenceSession({
      principal,
      evidenceSessionId: parseEvidenceSessionId(req.params.evidenceSessionId),
      input: parseRedeemEvidenceSession(req.body),
      requestId: res.locals.requestId,
    });
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({ data: result.evidenceSession, captureAttestation: result.captureAttestation });
  }));

  participantRouter.all('/participant-claims', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST' }));
  });
  participantRouter.all('/evidence-sessions/:evidenceSessionId/redeem', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST' }));
  });
  app.use('/v1', participantRouter);

  const merchantRouter = express.Router();
  merchantRouter.use(asyncHandler(async (req, res, next) => {
    // The hash is a rate-limit key only; raw network addresses are not persisted.
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `network:${sha256(req.ip || 'unavailable')}`,
      ratePolicies.authentication,
      res,
    );
    res.locals.principal = await dependencies.authenticator.authenticate(req.get('authorization'));
    next();
  }));
  // Authenticate before parsing merchant bodies so invalid credentials cannot
  // consume JSON parsing work outside the authentication rate boundary.
  merchantRouter.use(express.json({ limit: '256kb', strict: true, type: 'application/json' }));

  merchantRouter.post('/transactions', asyncHandler(async (req, res) => {
    res.locals.operation = 'createTransaction';
    requireJson(req);
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.transactionCreate, res);
    const input = parseCreateTransaction(req.body);
    const idempotencyKey = parseIdempotencyKey(req.get('idempotency-key'));
    const result = await dependencies.transactionService.create(principal, input, idempotencyKey, res.locals.requestId);
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({
      data: result.transaction,
      captureInstructions: result.captureInstructions,
    });
  }));

  merchantRouter.get('/transactions', asyncHandler(async (req, res) => {
    res.locals.operation = 'listTransactions';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.transactionList, res);
    const input = parseListTransactions(req.query as Record<string, unknown>);
    const result = await dependencies.transactionService.list(principal, input);
    res.status(200).json({
      data: result.transactions,
      pagination: { nextCursor: result.nextCursor },
    });
  }));

  merchantRouter.get('/transactions/:transactionId', asyncHandler(async (req, res) => {
    res.locals.operation = 'getTransaction';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.transactionRead, res);
    const transaction = await dependencies.transactionService.get(principal, parseTransactionId(req.params.transactionId));
    res.status(200).json({ data: transaction });
  }));

  merchantRouter.post('/transactions/:transactionId/participant-invitations', asyncHandler(async (req, res) => {
    res.locals.operation = 'createParticipantInvitation';
    requireJson(req);
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.participantInvitationCreate, res);
    const transactionId = parseTransactionId(req.params.transactionId);
    const result = await dependencies.participantCaptureService.createInvitation({
      principal,
      transactionId,
      input: parseCreateParticipantInvitation(req.body),
      operationKey: parseIdempotencyKey(req.get('idempotency-key')),
      requestId: res.locals.requestId,
    });
    const claimUrl = `${dependencies.participantHandoffBaseUrl().replace(/\/$/, '')}/claim/participant?claim=${encodeURIComponent(result.claim.id)}&token=${encodeURIComponent(result.token)}`;
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({
      data: result.claim,
      claimInstructions: { state: 'ISSUED', claimUrl, token: result.token, expiresAt: result.claim.expiresAt },
    });
  }));

  merchantRouter.post('/transactions/:transactionId/evidence-sessions', asyncHandler(async (req, res) => {
    res.locals.operation = 'createEvidenceSession';
    requireJson(req);
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceSessionCreate, res);
    const transactionId = parseTransactionId(req.params.transactionId);
    const result = await dependencies.participantCaptureService.createEvidenceSession({
      principal,
      transactionId,
      input: parseCreateEvidenceSession(req.body),
      operationKey: parseIdempotencyKey(req.get('idempotency-key')),
      requestId: res.locals.requestId,
    });
    const redemptionUrl = `${dependencies.participantHandoffBaseUrl().replace(/\/$/, '')}/evidence-session/redeem?session=${encodeURIComponent(result.session.id)}&token=${encodeURIComponent(result.token)}`;
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({
      data: result.session,
      redemptionInstructions: { state: 'READY', redemptionUrl, token: result.token, expiresAt: result.session.expiresAt },
    });
  }));

  merchantRouter.get('/evidence-sessions/:evidenceSessionId', asyncHandler(async (req, res) => {
    res.locals.operation = 'getEvidenceSession';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceSessionRead, res);
    const session = await dependencies.participantCaptureService.getEvidenceSession(
      principal,
      parseEvidenceSessionId(req.params.evidenceSessionId),
    );
    res.status(200).json({ data: session });
  }));

  merchantRouter.post('/evidence-sessions/:evidenceSessionId/cancel', asyncHandler(async (req, res) => {
    res.locals.operation = 'cancelEvidenceSession';
    requireJson(req);
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceSessionCancel, res);
    const body = req.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'schemaVersion')
      || (body as { schemaVersion?: unknown }).schemaVersion !== 1) {
      throw new InputValidationError([{ field: 'schemaVersion', code: 'INVALID_REQUEST', message: 'The cancellation body must contain only schemaVersion: 1.' }]);
    }
    const result = await dependencies.participantCaptureService.cancelEvidenceSession({
      principal,
      evidenceSessionId: parseEvidenceSessionId(req.params.evidenceSessionId),
      requestId: res.locals.requestId,
    });
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(200).json({ data: result.session });
  }));

  merchantRouter.get('/transactions/:transactionId/evidence', asyncHandler(async (req, res) => {
    res.locals.operation = 'listEvidence';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceRead, res);
    const artifacts = await dependencies.merchantEvidenceService.listEvidence(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
    );
    res.status(200).json({ data: artifacts });
  }));

  merchantRouter.get('/transactions/:transactionId/evidence/:artifactId', asyncHandler(async (req, res) => {
    res.locals.operation = 'getEvidence';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceRead, res);
    const artifact = await dependencies.merchantEvidenceService.getEvidence(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
      parseEvidenceArtifactId(req.params.artifactId),
    );
    res.status(200).json({ data: artifact });
  }));

  merchantRouter.get('/transactions/:transactionId/timeline', asyncHandler(async (req, res) => {
    res.locals.operation = 'getTimeline';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.transactionRead, res);
    const events = await dependencies.merchantEvidenceService.getTimeline(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
    );
    res.status(200).json({ data: events });
  }));

  merchantRouter.get('/transactions/:transactionId/review-package', asyncHandler(async (req, res) => {
    res.locals.operation = 'getReviewPackage';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceRead, res);
    const reviewPackage = await dependencies.merchantEvidenceService.getReviewPackage(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
    );
    res.status(200).json({ data: reviewPackage });
  }));

  merchantRouter.post('/transactions/:transactionId/reports', asyncHandler(async (req, res) => {
    res.locals.operation = 'createEvidenceReport';
    requireJson(req);
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceReportCreate, res);
    parseCreateEvidenceReport(req.body);
    const result = await dependencies.merchantEvidenceService.createReport(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
      parseIdempotencyKey(req.get('idempotency-key')),
      res.locals.requestId,
    );
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({ data: result.report });
  }));

  merchantRouter.get('/transactions/:transactionId/reports/:reportId', asyncHandler(async (req, res) => {
    res.locals.operation = 'getEvidenceReport';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.evidenceRead, res);
    const report = await dependencies.merchantEvidenceService.getReport(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
      parseEvidenceReportId(req.params.reportId),
    );
    res.status(200).json({ data: report });
  }));

  merchantRouter.get('/transactions/:transactionId/shipment', asyncHandler(async (req, res) => {
    res.locals.operation = 'getShipment';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.shipmentRead, res);
    const shipment = await dependencies.merchantEvidenceService.getShipment(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
    );
    res.status(200).json({ data: shipment });
  }));

  merchantRouter.post('/transactions/:transactionId/shipment', asyncHandler(async (req, res) => {
    res.locals.operation = 'associateShipment';
    requireJson(req);
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.shipmentWrite, res);
    const result = await dependencies.merchantEvidenceService.associateShipment(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
      parseAssociateShipment(req.body),
      parseIdempotencyKey(req.get('idempotency-key')),
      res.locals.requestId,
    );
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({ data: result.shipment });
  }));

  merchantRouter.get('/transactions/:transactionId/returns', asyncHandler(async (req, res) => {
    res.locals.operation = 'listReturns';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.transactionRead, res);
    const returns = await dependencies.merchantEvidenceService.listReturns(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
    );
    res.status(200).json({ data: returns });
  }));

  merchantRouter.get('/transactions/:transactionId/returns/:returnPassportId', asyncHandler(async (req, res) => {
    res.locals.operation = 'getReturn';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.transactionRead, res);
    const returnPassport = await dependencies.merchantEvidenceService.getReturn(
      principal,
      parseAccessibleTransactionId(req.params.transactionId),
      parseReturnPassportId(req.params.returnPassportId),
    );
    res.status(200).json({ data: returnPassport });
  }));

  merchantRouter.post('/connect/sessions', asyncHandler(async (req, res) => {
    res.locals.operation = 'createConnectSession';
    requireJson(req);
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.connectCreate, res);
    const result = await dependencies.merchantConnectService.createSession(
      principal,
      parseCreateConnectSession(req.body),
      parseIdempotencyKey(req.get('idempotency-key')),
      res.locals.requestId,
    );
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(result.replayed ? 200 : 201).json({
      data: result.session,
      captureInstructions: {
        state: 'PENDING_REDEMPTION',
        captureUrl: result.captureUrl,
        token: result.token,
        expiresAt: result.session.expiresAt,
      },
    });
  }));

  merchantRouter.get('/connect/sessions/:sessionId', asyncHandler(async (req, res) => {
    res.locals.operation = 'getConnectSession';
    const principal = res.locals.principal!;
    await enforcePrincipalRateLimit(dependencies.rateLimiter, principal, ratePolicies.connectRead, res);
    const session = await dependencies.merchantConnectService.getSession(
      principal,
      parseConnectSessionId(req.params.sessionId),
    );
    res.status(200).json({ data: session });
  }));

  merchantRouter.all('/transactions', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET, POST' }));
  });
  merchantRouter.all('/transactions/:transactionId', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/transactions/:transactionId/participant-invitations', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST' }));
  });
  merchantRouter.all('/transactions/:transactionId/evidence-sessions', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST' }));
  });
  merchantRouter.all('/evidence-sessions/:evidenceSessionId', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/evidence-sessions/:evidenceSessionId/cancel', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST' }));
  });
  merchantRouter.all('/transactions/:transactionId/evidence', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/transactions/:transactionId/evidence/:artifactId', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/transactions/:transactionId/timeline', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/transactions/:transactionId/review-package', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/transactions/:transactionId/reports', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST' }));
  });
  merchantRouter.all('/transactions/:transactionId/reports/:reportId', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/transactions/:transactionId/shipment', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET, POST' }));
  });
  merchantRouter.all('/transactions/:transactionId/returns', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/transactions/:transactionId/returns/:returnPassportId', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  merchantRouter.all('/connect/sessions', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'POST' }));
  });
  merchantRouter.all('/connect/sessions/:sessionId', (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'This HTTP method is not supported for the resource.', [], { Allow: 'GET' }));
  });
  app.use('/v1', merchantRouter);

  app.use((req, _res, next) => {
    next(new ApiError(404, 'ENDPOINT_NOT_FOUND', 'The requested API endpoint was not found.'));
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const locals = res.locals as ApiLocals;
    const mapped = apiError(error);
    for (const [name, value] of Object.entries(mapped.headers)) res.setHeader(name, value);
    if (mapped.status >= 500 && !(error instanceof ApiError)) {
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'packproof_api_unhandled_error',
        requestId: locals.requestId,
        errorType: error instanceof Error ? error.name : typeof error,
      }));
    }
    res.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: locals.requestId,
        details: mapped.details,
      },
    });
  };
  app.use(errorHandler);
  return app;
}
