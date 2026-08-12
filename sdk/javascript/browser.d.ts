export type Money = { currency: string; minorUnits: number };
export type ItemDescriptor = {
  title: string;
  description: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  sku: string | null;
  gtin: string | null;
  upc: string | null;
  mpn: string | null;
  serialNumber: string | null;
  selectedOptions: Array<{ name: string; value: string }>;
  identifiers: Array<{ type: string; value: string }>;
  quantity: number;
  amount: Money | null;
  imageReferences: Array<{ url: string; altText: string | null }>;
};
export type PageCommerceContext = {
  schemaVersion: 1;
  source: {
    platform: 'SHOPIFY' | 'WOOCOMMERCE' | 'MAGENTO' | 'CUSTOM' | 'MARKETPLACE' | 'STRUCTURED_PAGE_DATA';
    productUrl: string;
    externalProductId: string | null;
    externalListingId: string | null;
    externalVariantId: string | null;
  };
  item: ItemDescriptor;
};
export type CommerceHandoff = {
  id: string;
  object: 'commerce_handoff';
  schemaVersion: 1;
  commerceContextId: string;
  passportDraftId: string;
  trustLevel: 'PAGE_DECLARED';
  status: 'PENDING_CLAIM';
  reviewUrl: string;
  expiresAt: string;
};
export class PackProofButtonError extends Error {
  status: number;
  code: string;
  details: unknown;
}
export function extractStructuredProduct(documentRef?: Document, locationRef?: Location): PageCommerceContext;
export function buildCommerceContext(options?: { data?: { source?: Partial<PageCommerceContext['source']>; item?: Partial<ItemDescriptor> }; documentRef?: Document; locationRef?: Location }): PageCommerceContext;
export function createCommerceHandoff(options: { publishableKey: string; context: PageCommerceContext; operationKey?: string; apiBaseUrl?: string; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<CommerceHandoff>;
export function mountPackProofButton(options: { target: string | HTMLElement; publishableKey: string; data?: { source?: Partial<PageCommerceContext['source']>; item?: Partial<ItemDescriptor> }; apiBaseUrl?: string; label?: string; documentRef?: Document; locationRef?: Location; fetchImpl?: typeof fetch; openWindow?: typeof open; onHandoff?: (handoff: CommerceHandoff) => void; onError?: (error: unknown) => void }): { button: HTMLButtonElement; destroy(): void; operationKey: string };
export function autoMountPackProofButtons(options?: Record<string, unknown>): Array<{ button: HTMLButtonElement; destroy(): void; operationKey: string }>;
