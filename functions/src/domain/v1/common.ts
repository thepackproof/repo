import { DomainValidationError, integerValue, strictObject, stringValue } from './runtime';

declare const resourceIdBrand: unique symbol;
export type ResourceId<K extends ResourceKind> = string & { readonly [resourceIdBrand]: K };

export const resourceKinds = [
  'organization',
  'organization_membership',
  'integration',
  'api_client',
  'commerce_context',
  'passport_draft',
  'transaction',
  'participant_claim',
  'evidence_session',
  'evidence_artifact',
  'evidence_manifest',
  'shipment',
  'return_passport',
  'evidence_report',
  'webhook_endpoint',
  'webhook_event',
  'webhook_delivery',
  'audit_event',
] as const;

export type ResourceKind = (typeof resourceKinds)[number];

export const resourceIdPrefixes: Readonly<Record<ResourceKind, string>> = {
  organization: 'org_',
  organization_membership: 'membership_',
  integration: 'int_',
  api_client: 'client_',
  commerce_context: 'ctx_',
  passport_draft: 'draft_',
  transaction: 'txn_',
  participant_claim: 'claim_',
  evidence_session: 'es_',
  evidence_artifact: 'art_',
  evidence_manifest: 'manifest_',
  shipment: 'shipment_',
  return_passport: 'return_',
  evidence_report: 'report_',
  webhook_endpoint: 'wh_',
  webhook_event: 'evt_',
  webhook_delivery: 'delivery_',
  audit_event: 'audit_',
};

const canonicalIdPattern = /^[a-z][a-z_]*[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const legacyFirestoreIdPattern = /^[A-Za-z0-9_-]{10,128}$/;

export function parseResourceId<K extends ResourceKind>(
  kind: K,
  value: unknown,
  path = `${kind}Id`,
  options: { allowLegacy?: boolean } = {},
): ResourceId<K> {
  const result = stringValue(value, path, { min: 10, max: 160 });
  const prefix = resourceIdPrefixes[kind];
  const canonical = result.startsWith(prefix) && canonicalIdPattern.test(result);
  if (!canonical && !(options.allowLegacy && legacyFirestoreIdPattern.test(result))) {
    throw new DomainValidationError({ path, code: 'FORMAT', message: `must use the ${prefix} identifier format${options.allowLegacy ? ' or an accepted legacy identifier' : ''}` });
  }
  return result as ResourceId<K>;
}

export type ApiEnvironment = 'sandbox' | 'live';
export type ResourceLifecycle = { createdAt: Date; updatedAt: Date };
export type PublicLifecycle = { createdAt: string; updatedAt: string };

export type Money = {
  currency: string;
  minorUnits: number;
};

export function parseMoney(value: unknown, path: string): Money {
  const input = strictObject(value, path, ['currency', 'minorUnits']);
  return {
    currency: stringValue(input.currency, `${path}.currency`, { min: 3, max: 3, pattern: /^[A-Z]{3}$/ }),
    minorUnits: integerValue(input.minorUnits, `${path}.minorUnits`, 0, 10_000_000_000),
  };
}

export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export function canTransition<S extends string>(table: TransitionTable<S>, from: S, to: S): boolean {
  return table[from].includes(to);
}

export function assertTransition<S extends string>(table: TransitionTable<S>, from: S, to: S, resource: string): void {
  if (!canTransition(table, from, to)) {
    throw new DomainValidationError({ path: `${resource}.status`, code: 'FORMAT', message: `cannot transition from ${from} to ${to}` });
  }
}

export const assertionSources = [
  'MERCHANT_API',
  'PLATFORM_API',
  'MERCHANT_PAGE_STRUCTURED_DATA',
  'SELLER_ENTERED',
  'BUYER_ENTERED',
  'PACKPROOF_OBSERVED',
  'EXTERNAL_ADAPTER',
  'EMAIL_RECEIPT',
  'SHARE_SHEET',
  'BROWSER_EXTENSION',
  'SCREENSHOT_IMPORT',
  'PDF_IMPORT',
] as const;

export type AssertionSource = (typeof assertionSources)[number];

export type AssertionConfidence = 'ASSERTED' | 'OBSERVED' | 'DERIVED';

export const extractionQualities = ['EXACT_LABELED', 'FORMAT_MATCH', 'HEURISTIC'] as const;
export type ExtractionQuality = (typeof extractionQualities)[number];

export type FieldProvenance = {
  source: AssertionSource;
  confidence: AssertionConfidence;
  importedAt: Date;
  sourceReference: string | null;
  extractionMethod: string | null;
  sourceArtifactSha256: string | null;
  extractionQuality: ExtractionQuality | null;
};

export type FieldProvenanceDto = Omit<FieldProvenance, 'importedAt'> & { importedAt: string };

export type VersionedResource<K extends ResourceKind> = ResourceLifecycle & {
  id: ResourceId<K>;
  schemaVersion: 1;
};

export type OrganizationScopedResource<K extends ResourceKind> = VersionedResource<K> & {
  organizationId: ResourceId<'organization'>;
};

export type PublicResource<K extends ResourceKind, O extends string> = PublicLifecycle & {
  id: ResourceId<K>;
  object: O;
  schemaVersion: 1;
};
