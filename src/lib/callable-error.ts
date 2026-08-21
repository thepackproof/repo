function firebaseCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code: unknown }).code).toLowerCase();
}

function firebaseMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return error instanceof Error ? error.message : String(error ?? '');
}

export function describeCallableError(error: unknown, context: { functionName: string; signedIn: boolean }): string {
  const code = firebaseCode(error);
  const message = firebaseMessage(error).replace(/^\[[^\]]+\]\s*/, '');
  const combined = `${code} ${message}`.toLowerCase();
  const appCheckFailed = /app-?check|play integrity|attestation|integrity.?token/.test(combined);
  const unauthenticated = combined.includes('unauthenticated') || code.endsWith('/unauthenticated');
  const notFound = combined.includes('not-found') || combined.includes('not_found') || code.endsWith('/not-found');

  if (appCheckFailed || (unauthenticated && context.signedIn)) {
    return 'Google sign-in succeeded, but Firebase App Check rejected this installation. Install from the Play internal-test link, register Play Integrity for com.thepackproof.app, and for a sideloaded preview APK allow sideload integrity labels in App Check.';
  }
  if (unauthenticated) return 'Sign in is required.';
  if (notFound) {
    return `PackProof backend does not have ${context.functionName} yet. Deploy Cloud Functions from this branch, including getLegalAcceptanceStatus and acceptLegalPolicies.`;
  }
  return message || 'Something went wrong. Please try again.';
}

export function shouldKeepSignedInAfterCallableFailure(error: unknown, signedIn: boolean): boolean {
  if (!signedIn) return false;
  const described = describeCallableError(error, { functionName: 'callable', signedIn });
  return described.includes('App Check') || described.includes('does not have');
}
