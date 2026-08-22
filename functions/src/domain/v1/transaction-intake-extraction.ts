import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import type { ConsumerIntakeSourceType } from './commerce';
import { DomainValidationError } from './runtime';
import {
  CONFIRMED_FIELDS_V1,
  MAX_INTAKE_ARTIFACT_CHARS,
  PDF_IMPORT_V1,
  SCREENSHOT_IMPORT_V1,
  parseCommerceArtifact,
  type CommerceArtifactParseResult,
} from './transaction-intake-parsers';

export const MAX_INTAKE_ARTIFACT_BYTES = 1_048_576;
export const PDF_TEXT_LAYER_V1 = 'PDF_TEXT_LAYER_V1';
export const SCREENSHOT_BYTES_V1 = 'SCREENSHOT_BYTES_V1';

export type IntakeExtraction = CommerceArtifactParseResult & {
  extractionMethod: string;
  hasTextLayer: boolean;
  extractedText: string | null;
  originalArtifactSha256: string | null;
};

export function sha256ArtifactBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function decodeIntakeArtifactBytes(base64: string): Uint8Array {
  const compact = base64.replace(/\s+/g, '');
  if (!compact || compact.length > Math.ceil(MAX_INTAKE_ARTIFACT_BYTES * 4 / 3) + 8) {
    throw new DomainValidationError({
      path: 'artifactBytes',
      code: 'FORMAT',
      message: `artifact bytes must be at most ${MAX_INTAKE_ARTIFACT_BYTES} bytes`,
    });
  }
  const bytes = Buffer.from(compact, 'base64');
  if (!bytes.length || bytes.length > MAX_INTAKE_ARTIFACT_BYTES) {
    throw new DomainValidationError({
      path: 'artifactBytes',
      code: 'FORMAT',
      message: `artifact bytes must be at most ${MAX_INTAKE_ARTIFACT_BYTES} bytes`,
    });
  }
  return new Uint8Array(bytes);
}

export function extractPdfTextLayer(bytes: Uint8Array): { text: string; hasTextLayer: boolean } {
  if (bytes.length < 5) return { text: '', hasTextLayer: false };
  const header = Buffer.from(bytes.subarray(0, 8)).toString('latin1');
  if (!header.startsWith('%PDF')) return { text: '', hasTextLayer: false };
  const latin1 = Buffer.from(bytes).toString('latin1');
  const lines: string[] = [];
  for (const match of latin1.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const payload = Buffer.from(match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, ''), 'latin1');
    let decoded = '';
    try {
      decoded = inflateSync(payload).toString('latin1');
    } catch {
      decoded = match[1];
    }
    const extracted = textOperatorsToLines(decoded);
    if (extracted.length) lines.push(...extracted);
  }
  const text = lines.join('\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, MAX_INTAKE_ARTIFACT_CHARS);
  return { text, hasTextLayer: text.length > 0 };
}

export function extractIntakeArtifact(input: {
  intakeSourceType: ConsumerIntakeSourceType;
  artifactText?: string | null;
  artifactBytes?: Uint8Array | null;
}): IntakeExtraction {
  if (input.artifactBytes && input.artifactBytes.length > MAX_INTAKE_ARTIFACT_BYTES) {
    throw new DomainValidationError({
      path: 'artifactBytes',
      code: 'FORMAT',
      message: `artifact bytes must be at most ${MAX_INTAKE_ARTIFACT_BYTES} bytes`,
    });
  }
  const originalArtifactSha256 = input.artifactBytes ? sha256ArtifactBytes(input.artifactBytes) : null;
  if (input.intakeSourceType === 'SCREENSHOT_IMPORT') {
    const parsed = parseCommerceArtifact(null, 'SCREENSHOT_IMPORT');
    return {
      ...parsed,
      parserVersion: SCREENSHOT_IMPORT_V1,
      extractionMethod: SCREENSHOT_BYTES_V1,
      hasTextLayer: false,
      extractedText: null,
      originalArtifactSha256,
    };
  }
  if (input.intakeSourceType === 'PDF_IMPORT') {
    const layer = input.artifactBytes ? extractPdfTextLayer(input.artifactBytes) : { text: '', hasTextLayer: false };
    const parsed = parseCommerceArtifact(layer.text || null, 'PDF_IMPORT');
    return {
      ...parsed,
      parserVersion: layer.hasTextLayer ? parsed.parserVersion : PDF_IMPORT_V1,
      extractionMethod: layer.hasTextLayer ? PDF_TEXT_LAYER_V1 : PDF_IMPORT_V1,
      hasTextLayer: layer.hasTextLayer,
      extractedText: layer.text || null,
      originalArtifactSha256,
    };
  }
  const parsed = parseCommerceArtifact(input.artifactText ?? null, input.intakeSourceType);
  return {
    ...parsed,
    extractionMethod: parsed.parserVersion,
    hasTextLayer: Boolean(input.artifactText?.trim()),
    extractedText: input.artifactText?.trim() ? input.artifactText : null,
    originalArtifactSha256,
  };
}

export function confirmedExtractionMethod(): typeof CONFIRMED_FIELDS_V1 {
  return CONFIRMED_FIELDS_V1;
}

function textOperatorsToLines(content: string): string[] {
  if (!/(?:Tj|TJ|T\*|')/.test(content)) return [];
  const lines: string[] = [];
  const tj = /(?:(\((?:\\.|[^\\)])*\))|(<[0-9A-Fa-f]+>))\s*(Tj|'|TJ)/g;
  let match: RegExpExecArray | null;
  while ((match = tj.exec(content))) {
    const token = decodePdfStringToken(match[1] ?? match[2] ?? '');
    if (!token) continue;
    if (match[3] === "'") lines.push(token);
    else lines.push(token);
  }
  for (const arrayMatch of content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
    const combined = [...arrayMatch[1].matchAll(/(\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f]+)>)/g)]
      .map((item) => decodePdfStringToken(item[1] ?? ''))
      .join('');
    if (combined.trim()) lines.push(combined);
  }
  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function decodePdfStringToken(token: string): string {
  const hex = /^<([0-9A-Fa-f]+)>$/.exec(token);
  if (hex) {
    const payload = hex[1].length % 2 === 0 ? hex[1] : `${hex[1]}0`;
    return Buffer.from(payload, 'hex').toString('latin1');
  }
  const literal = /^\(([\s\S]*)\)$/.exec(token);
  if (!literal) return '';
  return literal[1]
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_match, oct: string) => String.fromCharCode(Number.parseInt(oct, 8)));
}
