import type { EnterpriseOperatingMode } from './enterprise';

export type EnterprisePilotChecklist = {
  persistentEdgeCredentials: boolean;
  nonceReplayProtection: boolean;
  hardwareKeyProtection: boolean;
  credentialRotation: boolean;
  revocation: boolean;
  restartSurvival: boolean;
  realCamera: boolean;
  realScanner: boolean;
  realScale: boolean;
  realWms: boolean;
  liveBackendFinalization: boolean;
  offlineRecovery: boolean;
  multiStationCollisionTests: boolean;
};

export const HC1_ENTERPRISE_PILOT: EnterprisePilotChecklist = {
  persistentEdgeCredentials: false,
  nonceReplayProtection: false,
  hardwareKeyProtection: false,
  credentialRotation: false,
  revocation: false,
  restartSurvival: false,
  realCamera: false,
  realScanner: false,
  realScale: false,
  realWms: false,
  liveBackendFinalization: false,
  offlineRecovery: false,
  multiStationCollisionTests: false,
};

export function enterprisePilotReady(checklist: EnterprisePilotChecklist): boolean {
  return Object.values(checklist).every(Boolean);
}

export function startingEnterpriseMode(checklist: EnterprisePilotChecklist): EnterpriseOperatingMode {
  return enterprisePilotReady(checklist) ? 'OBSERVE' : 'OBSERVE';
}

export function enforceAllowed(checklist: EnterprisePilotChecklist): boolean {
  return enterprisePilotReady(checklist);
}
