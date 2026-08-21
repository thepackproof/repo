import assert from 'node:assert/strict';
import { describeCallableError, shouldKeepSignedInAfterCallableFailure } from '../src/lib/callable-error.ts';

const appCheck = describeCallableError(
  { code: 'functions/unauthenticated', message: 'Unauthenticated' },
  { functionName: 'getLegalAcceptanceStatus', signedIn: true },
);
assert.match(appCheck, /App Check/);
assert.equal(shouldKeepSignedInAfterCallableFailure({ code: 'functions/unauthenticated', message: 'Unauthenticated' }, true), true);

const signedOut = describeCallableError(
  { code: 'functions/unauthenticated', message: 'Unauthenticated' },
  { functionName: 'ensureUserProfile', signedIn: false },
);
assert.equal(signedOut, 'Sign in is required.');

const missing = describeCallableError(
  { code: 'functions/not-found', message: 'NOT_FOUND' },
  { functionName: 'acceptLegalPolicies', signedIn: true },
);
assert.match(missing, /acceptLegalPolicies/);
assert.match(missing, /Deploy Cloud Functions/);

const playIntegrity = describeCallableError(
  { code: 'appCheck/token-error', message: 'Play Integrity API error' },
  { functionName: 'appCheck', signedIn: true },
);
assert.match(playIntegrity, /App Check/);

console.log('Callable error classification passed (4 cases).');
