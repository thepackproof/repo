import { ApplicationError } from './errors';

function enabled(name: string, fallback = true): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

export type PackProofFeatureFlags = {
  receiptIntake: boolean;
  screenshotIntake: boolean;
  pdfIntake: boolean;
  shareSheetIntake: boolean;
  browserExtensionIntake: boolean;
  newParserVersion: boolean;
  newCarrierIntegration: boolean;
  newCapturePolicy: boolean;
  newProofRenderer: boolean;
  enterpriseAcquisition: boolean;
};

export function packProofFeatureFlags(): PackProofFeatureFlags {
  return {
    receiptIntake: enabled('PACKPROOF_FLAG_RECEIPT_INTAKE'),
    screenshotIntake: enabled('PACKPROOF_FLAG_SCREENSHOT_INTAKE'),
    pdfIntake: enabled('PACKPROOF_FLAG_PDF_INTAKE'),
    shareSheetIntake: enabled('PACKPROOF_FLAG_SHARE_SHEET_INTAKE'),
    browserExtensionIntake: enabled('PACKPROOF_FLAG_BROWSER_EXTENSION_INTAKE'),
    newParserVersion: enabled('PACKPROOF_FLAG_NEW_PARSER_VERSION', false),
    newCarrierIntegration: enabled('PACKPROOF_FLAG_NEW_CARRIER_INTEGRATION', false),
    newCapturePolicy: enabled('PACKPROOF_FLAG_NEW_CAPTURE_POLICY', false),
    newProofRenderer: enabled('PACKPROOF_FLAG_NEW_PROOF_RENDERER', false),
    enterpriseAcquisition: enabled('PACKPROOF_FLAG_ENTERPRISE_ACQUISITION', false),
  };
}

export function assertIntakeEnabled(intakeSourceType: string): void {
  const flags = packProofFeatureFlags();
  const allowed = {
    EMAIL_RECEIPT: flags.receiptIntake,
    SCREENSHOT_IMPORT: flags.screenshotIntake,
    PDF_IMPORT: flags.pdfIntake,
    SHARE_SHEET: flags.shareSheetIntake,
    BROWSER_EXTENSION: flags.browserExtensionIntake,
  } as const;
  if (intakeSourceType in allowed && !allowed[intakeSourceType as keyof typeof allowed]) {
    throw new ApplicationError('FAILED_PRECONDITION', 'INTAKE_DISABLED', 'This intake adapter is temporarily disabled.');
  }
}
