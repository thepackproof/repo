"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicConnectSessionStatus = publicConnectSessionStatus;
function publicConnectSessionStatus(status, expiresAt, now) {
    if (status === 'CANCELLED')
        return 'CANCELLED';
    if (status === 'READY_FOR_CAPTURE')
        return 'READY_FOR_CAPTURE';
    if (status === 'EXPIRED' || (status === 'PENDING_REDEMPTION' && expiresAt.getTime() < now.getTime())) {
        return 'EXPIRED';
    }
    return 'PENDING_REDEMPTION';
}
//# sourceMappingURL=merchant-evidence-ports.js.map