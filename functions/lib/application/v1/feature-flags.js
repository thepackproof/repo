"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.packProofFeatureFlags = packProofFeatureFlags;
exports.assertIntakeEnabled = assertIntakeEnabled;
const errors_1 = require("./errors");
function enabled(name, fallback = true) {
    const value = process.env[name]?.trim().toLowerCase();
    if (value == null || value === '')
        return fallback;
    return value === 'true' || value === '1' || value === 'yes';
}
function packProofFeatureFlags() {
    return {
        receiptIntake: enabled('PACKPROOF_FLAG_RECEIPT_INTAKE'),
        screenshotIntake: enabled('PACKPROOF_FLAG_SCREENSHOT_INTAKE'),
        pdfIntake: enabled('PACKPROOF_FLAG_PDF_INTAKE'),
        shareSheetIntake: enabled('PACKPROOF_FLAG_SHARE_SHEET_INTAKE'),
        browserExtensionIntake: enabled('PACKPROOF_FLAG_BROWSER_EXTENSION_INTAKE'),
        newParserVersion: enabled('PACKPROOF_FLAG_NEW_PARSER_VERSION', false),
        enterpriseAcquisition: enabled('PACKPROOF_FLAG_ENTERPRISE_ACQUISITION', false),
    };
}
function assertIntakeEnabled(intakeSourceType) {
    const flags = packProofFeatureFlags();
    const allowed = {
        EMAIL_RECEIPT: flags.receiptIntake,
        SCREENSHOT_IMPORT: flags.screenshotIntake,
        PDF_IMPORT: flags.pdfIntake,
        SHARE_SHEET: flags.shareSheetIntake,
        BROWSER_EXTENSION: flags.browserExtensionIntake,
    };
    if (intakeSourceType in allowed && !allowed[intakeSourceType]) {
        throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'INTAKE_DISABLED', 'This intake adapter is temporarily disabled.');
    }
}
//# sourceMappingURL=feature-flags.js.map