import { HttpsError } from 'firebase-functions/v2/https';
import { ApplicationError } from '../../../application/v1/errors';

export function throwCallableError(error: unknown): never {
  if (!(error instanceof ApplicationError)) throw error;
  const codeByCategory = {
    INVALID_ARGUMENT: 'invalid-argument',
    UNAUTHENTICATED: 'unauthenticated',
    FORBIDDEN: 'permission-denied',
    NOT_FOUND: 'not-found',
    CONFLICT: 'already-exists',
    DEADLINE_EXCEEDED: 'deadline-exceeded',
    FAILED_PRECONDITION: 'failed-precondition',
    RESOURCE_EXHAUSTED: 'resource-exhausted',
    RETRYABLE_CONFLICT: 'aborted',
  } as const;
  throw new HttpsError(codeByCategory[error.category], error.message, {
    applicationCode: error.code,
    details: error.details,
    retryAfterSeconds: error.retryAfterSeconds ?? null,
  });
}
