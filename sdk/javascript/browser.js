const PRODUCT_TYPE = 'Product';

function hostedApiOrigin() {
  try {
    const moduleUrl = new URL(import.meta.url);
    if (moduleUrl.protocol === 'https:' || moduleUrl.protocol === 'http:') return moduleUrl.origin;
  } catch {
    // Fall through to the production link origin when a bundler removes module metadata.
  }
  return 'https://packproof.link';
}

function text(value, max, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized.slice(0, max) || fallback;
}

function nullableText(value, max) {
  const normalized = text(value, max);
  return normalized || null;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function productNodes(value) {
  if (Array.isArray(value)) return value.flatMap(productNodes);
  if (!value || typeof value !== 'object') return [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(productNodes) : [];
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  return types.includes(PRODUCT_TYPE) ? [value, ...graph] : graph;
}

function meta(documentRef, selector) {
  return documentRef?.querySelector?.(selector)?.getAttribute?.('content')?.trim() || '';
}

function parseJsonLdProducts(documentRef) {
  const scripts = [...(documentRef?.querySelectorAll?.('script[type="application/ld+json"]') ?? [])];
  const products = [];
  for (const script of scripts) {
    try {
      products.push(...productNodes(JSON.parse(script.textContent || 'null')));
    } catch {
      // Invalid third-party JSON-LD is ignored; explicit data and metadata remain available.
    }
  }
  return products;
}

function offerFor(product) {
  const offer = first(product?.offers);
  return offer && typeof offer === 'object' ? offer : {};
}

function amountFrom(price, currency) {
  if (price === null || price === undefined || price === '') return null;
  const decimal = Number(String(price).replace(/[^0-9.-]/g, ''));
  const code = text(currency, 3).toUpperCase();
  if (!Number.isFinite(decimal) || decimal < 0 || !/^[A-Z]{3}$/.test(code)) return null;
  return { currency: code, minorUnits: Math.round(decimal * 100) };
}

function imageReferences(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();
  const result = [];
  for (const entry of values) {
    const url = text(typeof entry === 'object' ? entry.url ?? entry.contentUrl : entry, 2_000);
    if (!url || seen.has(url)) continue;
    try {
      const parsed = new URL(url, globalThis.location?.href);
      if (parsed.protocol !== 'https:') continue;
      seen.add(parsed.href);
      result.push({ url: parsed.href, altText: nullableText(typeof entry === 'object' ? entry.caption ?? entry.name : null, 500) });
    } catch {
      // Non-URL image metadata is not sent.
    }
    if (result.length === 20) break;
  }
  return result;
}

function selectedOptions(product) {
  const raw = Array.isArray(product?.additionalProperty) ? product.additionalProperty : [];
  return raw.map((property) => ({ name: text(property?.name, 120), value: text(property?.value, 300) }))
    .filter(({ name, value }) => name && value)
    .slice(0, 30);
}

function identifiers(product) {
  const values = [];
  const add = (type, value) => {
    const normalized = nullableText(value, 300);
    if (normalized && !values.some((entry) => entry.type === type && entry.value === normalized)) values.push({ type, value: normalized });
  };
  add('SKU', product?.sku);
  add('GTIN', product?.gtin ?? product?.gtin13 ?? product?.gtin12 ?? product?.gtin14 ?? product?.gtin8);
  add('MPN', product?.mpn);
  if (product?.productID) add('PRODUCT_ID', product.productID);
  return values.slice(0, 30);
}

function inferredPlatform(documentRef) {
  const generator = meta(documentRef, 'meta[name="generator"]').toLowerCase();
  if (generator.includes('shopify')) return 'SHOPIFY';
  if (generator.includes('woocommerce')) return 'WOOCOMMERCE';
  if (generator.includes('magento')) return 'MAGENTO';
  return 'STRUCTURED_PAGE_DATA';
}

export function extractStructuredProduct(documentRef = globalThis.document, locationRef = globalThis.location) {
  const product = parseJsonLdProducts(documentRef)[0] ?? {};
  const offer = offerFor(product);
  const title = text(product.name, 300) || text(meta(documentRef, 'meta[property="og:title"]'), 300) || text(documentRef?.title, 300);
  const description = text(product.description, 10_000) || text(meta(documentRef, 'meta[name="description"]'), 10_000)
    || text(meta(documentRef, 'meta[property="og:description"]'), 10_000);
  const productUrl = text(product.url, 2_000) || text(meta(documentRef, 'meta[property="og:url"]'), 2_000) || text(locationRef?.href, 2_000);
  const image = product.image ?? meta(documentRef, 'meta[property="og:image"]');
  const gtin = product.gtin ?? product.gtin13 ?? product.gtin12 ?? product.gtin14 ?? product.gtin8;
  const item = {
    title,
    description,
    category: nullableText(product.category, 160),
    brand: nullableText(typeof product.brand === 'object' ? product.brand.name : product.brand, 160),
    model: nullableText(product.model, 160),
    sku: nullableText(product.sku, 160),
    gtin: nullableText(gtin, 14),
    upc: nullableText(product.gtin12, 14),
    mpn: nullableText(product.mpn, 160),
    serialNumber: nullableText(product.serialNumber, 200),
    selectedOptions: selectedOptions(product),
    identifiers: identifiers(product),
    quantity: 1,
    amount: amountFrom(offer.price ?? meta(documentRef, 'meta[property="product:price:amount"]'), offer.priceCurrency ?? meta(documentRef, 'meta[property="product:price:currency"]')),
    imageReferences: imageReferences(image),
  };
  return {
    schemaVersion: 1,
    source: {
      platform: inferredPlatform(documentRef),
      productUrl,
      externalProductId: nullableText(product.productID ?? product.sku, 200),
      externalListingId: null,
      externalVariantId: nullableText(offer.sku, 200),
    },
    item,
  };
}

function mergedItem(base, override = {}) {
  return {
    ...base,
    ...override,
    selectedOptions: override.selectedOptions ?? base.selectedOptions,
    identifiers: override.identifiers ?? base.identifiers,
    imageReferences: override.imageReferences ?? base.imageReferences,
    amount: override.amount === undefined ? base.amount : override.amount,
  };
}

export function buildCommerceContext({ data, documentRef = globalThis.document, locationRef = globalThis.location } = {}) {
  const extracted = extractStructuredProduct(documentRef, locationRef);
  const result = data ? {
    schemaVersion: 1,
    source: { ...extracted.source, ...(data.source ?? {}) },
    item: mergedItem(extracted.item, data.item),
  } : extracted;
  if (!result.item.title) throw new PackProofButtonError('No product title was found. Provide data.item.title or Product JSON-LD.', { code: 'missing_product_title' });
  if (!result.source.productUrl) throw new PackProofButtonError('No product URL was found. Provide data.source.productUrl.', { code: 'missing_product_url' });
  return result;
}

function randomId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export class PackProofButtonError extends Error {
  constructor(message, { status = 0, code = 'packproof_button_error', details = null } = {}) {
    super(message);
    this.name = 'PackProofButtonError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function createCommerceHandoff({
  publishableKey,
  context,
  operationKey = randomId('button'),
  apiBaseUrl = hostedApiOrigin(),
  fetchImpl = globalThis.fetch,
  signal,
}) {
  if (!/^pp_pub_(?:sandbox|live)_[A-Za-z0-9_-]{20,80}$/.test(publishableKey ?? '')) throw new TypeError('A valid PackProof publishableKey is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible implementation is required.');
  const url = `${String(apiBaseUrl).replace(/\/$/, '')}/v1/public/integrations/${encodeURIComponent(publishableKey)}/handoffs`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': operationKey,
      'X-Request-Id': randomId('browser'),
    },
    credentials: 'omit',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: JSON.stringify(context),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PackProofButtonError(body?.error?.message || `PackProof Button returned HTTP ${response.status}.`, {
      status: response.status,
      code: body?.error?.code || 'http_error',
      details: body?.error?.details || null,
    });
  }
  return body.data;
}

function styleButton(button) {
  Object.assign(button.style, {
    appearance: 'none', border: '0', borderRadius: '10px', background: '#21d4b4', color: '#06111f',
    cursor: 'pointer', font: '700 15px/1.2 system-ui, sans-serif', padding: '13px 18px', minHeight: '44px',
  });
}

export function mountPackProofButton({
  target,
  publishableKey,
  data,
  apiBaseUrl,
  label = 'Create with PackProof',
  documentRef = globalThis.document,
  locationRef = globalThis.location,
  fetchImpl = globalThis.fetch,
  openWindow = globalThis.open?.bind(globalThis),
  onHandoff,
  onError,
} = {}) {
  const host = typeof target === 'string' ? documentRef?.querySelector?.(target) : target;
  if (!host) throw new TypeError('PackProof Button target was not found.');
  const button = host.tagName === 'BUTTON' ? host : documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('data-packproof-mounted', 'v1');
  button.setAttribute('aria-label', label);
  const originalLabel = label;
  styleButton(button);
  if (button !== host) host.appendChild(button);
  const operationKey = randomId('button');
  const click = async (event) => {
    event?.preventDefault?.();
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    let failed = false;
    button.textContent = 'Opening PackProof…';
    const reviewWindow = typeof openWindow === 'function' ? openWindow('about:blank', '_blank') : null;
    try { if (reviewWindow) reviewWindow.opener = null; } catch { /* Browser policy already isolated the window. */ }
    try {
      const context = buildCommerceContext({ data, documentRef, locationRef });
      const handoff = await createCommerceHandoff({ publishableKey, context, operationKey, apiBaseUrl, fetchImpl });
      if (reviewWindow) reviewWindow.location.replace(handoff.reviewUrl);
      else locationRef.assign(handoff.reviewUrl);
      onHandoff?.(handoff);
      host.dispatchEvent?.(new CustomEvent('packproof:handoff', { detail: handoff }));
    } catch (error) {
      failed = true;
      reviewWindow?.close?.();
      onError?.(error);
      host.dispatchEvent?.(new CustomEvent('packproof:error', { detail: error }));
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = failed ? 'Try PackProof again' : originalLabel;
    }
  };
  button.addEventListener('click', click);
  return { button, destroy: () => button.removeEventListener('click', click), operationKey };
}

export function autoMountPackProofButtons(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const hosts = [...(documentRef?.querySelectorAll?.('[data-packproof-button]') ?? [])];
  return hosts.map((host) => mountPackProofButton({
    ...options,
    target: host,
    publishableKey: host.getAttribute('data-packproof-publishable-key') || options.publishableKey,
    apiBaseUrl: host.getAttribute('data-packproof-api-base-url') || options.apiBaseUrl,
    label: host.getAttribute('data-packproof-label') || options.label,
  }));
}

if (typeof globalThis === 'object') {
  globalThis.PackProofButtonV1 = Object.freeze({
    PackProofButtonError,
    extractStructuredProduct,
    buildCommerceContext,
    createCommerceHandoff,
    mountPackProofButton,
    autoMountPackProofButtons,
  });
}
