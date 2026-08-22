"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HC1_ENTERPRISE_PILOT = void 0;
exports.enterprisePilotReady = enterprisePilotReady;
exports.startingEnterpriseMode = startingEnterpriseMode;
exports.enforceAllowed = enforceAllowed;
exports.HC1_ENTERPRISE_PILOT = {
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
function enterprisePilotReady(checklist) {
    return Object.values(checklist).every(Boolean);
}
function startingEnterpriseMode(checklist) {
    return enterprisePilotReady(checklist) ? 'OBSERVE' : 'OBSERVE';
}
function enforceAllowed(checklist) {
    return enterprisePilotReady(checklist);
}
//# sourceMappingURL=enterprise-pilot.js.map