import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import express from 'express';
import { sha256 } from './core';
import { ApiError } from './core';
import type { PortalAuthenticator } from './portal-security';
import type { PortalPrincipal } from './portal-principal';
import type { RateLimitPolicy, RateLimiter } from './ports';
import { parseAccessibleTransactionId, parsePortalHandoffAction } from './validation';
import { PortalWorkspaceApplicationService } from '../../application/v1/portal-workspace-service';

type PortalLocals = {
  requestId: string;
  portalPrincipal?: PortalPrincipal;
  operation?: string;
};

const ratePolicies = {
  authentication: { name: 'portal-authentication', limit: 60, windowSeconds: 60 },
  read: { name: 'portal-read', limit: 120, windowSeconds: 60 },
  handoff: { name: 'portal-handoff', limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

function asyncHandler(handler: (req: Request, res: Response<unknown, PortalLocals>, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => { void handler(req, res as Response<unknown, PortalLocals>, next).catch(next); };
}

function requireJson(req: Request): void {
  if (!req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'This endpoint requires Content-Type: application/json.');
  }
}

async function enforceRateLimitForKey(
  limiter: RateLimiter,
  principalId: string,
  policy: RateLimitPolicy,
  res: Response,
): Promise<void> {
  const decision = await limiter.consume(principalId, policy);
  res.setHeader('RateLimit-Limit', String(decision.limit));
  res.setHeader('RateLimit-Remaining', String(decision.remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(decision.resetAt.getTime() / 1_000)));
  if (!decision.allowed) {
    const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1_000));
    throw new ApiError(429, 'RATE_LIMIT_EXCEEDED', 'The rate limit for this operation was exceeded.', [], { 'Retry-After': String(retryAfter) });
  }
}

export function createPortalRouter(dependencies: {
  authenticator: PortalAuthenticator;
  rateLimiter: RateLimiter;
  workspace: PortalWorkspaceApplicationService;
}): Router {
  const router = express.Router();
  router.use(asyncHandler(async (req, res, next) => {
    await enforceRateLimitForKey(
      dependencies.rateLimiter,
      `portal-network:${sha256(req.ip || 'unavailable')}`,
      ratePolicies.authentication,
      res,
    );
    res.locals.portalPrincipal = await dependencies.authenticator.authenticate(
      req.get('authorization'),
      req.get('x-firebase-appcheck'),
    );
    next();
  }));

  router.get('/session', asyncHandler(async (_req, res) => {
    res.locals.operation = 'getPortalSession';
    const principal = res.locals.portalPrincipal!;
    await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.read, res);
    const session = await dependencies.workspace.session(principal);
    res.status(200).json({ data: session });
  }));

  router.get('/home', asyncHandler(async (_req, res) => {
    res.locals.operation = 'getPortalHome';
    const principal = res.locals.portalPrincipal!;
    await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.read, res);
    const transactions = await dependencies.workspace.listTransactions(principal);
    res.status(200).json({ data: { viewerId: principal.actorId, channel: 'WEB_PORTAL', transactions } });
  }));

  router.get('/transactions', asyncHandler(async (_req, res) => {
    res.locals.operation = 'listPortalTransactions';
    const principal = res.locals.portalPrincipal!;
    await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.read, res);
    const transactions = await dependencies.workspace.listTransactions(principal);
    res.status(200).json({ data: transactions });
  }));

  router.get('/transactions/:transactionId', asyncHandler(async (req, res) => {
    res.locals.operation = 'getPortalTransaction';
    const principal = res.locals.portalPrincipal!;
    await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.read, res);
    const transaction = await dependencies.workspace.getTransaction(principal, parseAccessibleTransactionId(req.params.transactionId));
    res.status(200).json({ data: transaction });
  }));

  router.get('/transactions/:transactionId/timeline', asyncHandler(async (req, res) => {
    res.locals.operation = 'getPortalTimeline';
    const principal = res.locals.portalPrincipal!;
    await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.read, res);
    const timeline = await dependencies.workspace.getTimeline(principal, parseAccessibleTransactionId(req.params.transactionId));
    res.status(200).json({ data: timeline });
  }));

  router.get('/transactions/:transactionId/evidence', asyncHandler(async (req, res) => {
    res.locals.operation = 'listPortalEvidence';
    const principal = res.locals.portalPrincipal!;
    await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.read, res);
    const evidence = await dependencies.workspace.listEvidence(principal, parseAccessibleTransactionId(req.params.transactionId));
    res.status(200).json({ data: evidence });
  }));

  router.get('/transactions/:transactionId/passport', asyncHandler(async (req, res) => {
    res.locals.operation = 'getPortalPassport';
    const principal = res.locals.portalPrincipal!;
    await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.read, res);
    const passport = await dependencies.workspace.getPassport(principal, parseAccessibleTransactionId(req.params.transactionId));
    res.status(200).json({ data: passport });
  }));

  router.post(
    '/transactions/:transactionId/mobile-handoff',
    express.json({ limit: '256kb', strict: true, type: 'application/json' }),
    asyncHandler(async (req, res) => {
      res.locals.operation = 'createPortalMobileHandoff';
      requireJson(req);
      const principal = res.locals.portalPrincipal!;
      await enforceRateLimitForKey(dependencies.rateLimiter, `portal:${principal.actorId}`, ratePolicies.handoff, res);
      const handoff = await dependencies.workspace.createMobileHandoff(
        principal,
        parseAccessibleTransactionId(req.params.transactionId),
        parsePortalHandoffAction(req.body),
        res.locals.requestId,
      );
      res.status(200).json({ data: handoff });
    }),
  );

  return router;
}
