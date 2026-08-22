"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCREENSHOT_BYTES_V1 = exports.PDF_TEXT_LAYER_V1 = exports.MAX_INTAKE_ARTIFACT_BYTES = void 0;
exports.sha256ArtifactBytes = sha256ArtifactBytes;
exports.decodeIntakeArtifactBytes = decodeIntakeArtifactBytes;
exports.extractPdfTextLayer = extractPdfTextLayer;
exports.extractIntakeArtifact = extractIntakeArtifact;
exports.confirmedExtractionMethod = confirmedExtractionMethod;
const node_crypto_1 = require("node:crypto");
const node_zlib_1 = require("node:zlib");
const runtime_1 = require("./runtime");
const transaction_intake_parsers_1 = require("./transaction-intake-parsers");
exports.MAX_INTAKE_ARTIFACT_BYTES = 1_048_576;
exports.PDF_TEXT_LAYER_V1 = 'PDF_TEXT_LAYER_V1';
exports.SCREENSHOT_BYTES_V1 = 'SCREENSHOT_BYTES_V1';
function sha256ArtifactBytes(bytes) {
    return (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
}
function decodeIntakeArtifactBytes(base64) {
    const compact = base64.replace(/\s+/g, '');
    if (!compact || compact.length > Math.ceil(exports.MAX_INTAKE_ARTIFACT_BYTES * 4 / 3) + 8) {
        throw new runtime_1.DomainValidationError({
            path: 'artifactBytes',
            code: 'FORMAT',
            message: `artifact bytes must be at most ${exports.MAX_INTAKE_ARTIFACT_BYTES} bytes`,
        });
    }
    const bytes = Buffer.from(compact, 'base64');
    if (!bytes.length || bytes.length > exports.MAX_INTAKE_ARTIFACT_BYTES) {
        throw new runtime_1.DomainValidationError({
            path: 'artifactBytes',
            code: 'FORMAT',
            message: `artifact bytes must be at most ${exports.MAX_INTAKE_ARTIFACT_BYTES} bytes`,
        });
    }
    return new Uint8Array(bytes);
}
function extractPdfTextLayer(bytes) {
    if (bytes.length < 5)
        return { text: '', hasTextLayer: false };
    const header = Buffer.from(bytes.subarray(0, 8)).toString('latin1');
    if (!header.startsWith('%PDF'))
        return { text: '', hasTextLayer: false };
    const latin1 = Buffer.from(bytes).toString('latin1');
    const lines = [];
    for (const match of latin1.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
        const payload = Buffer.from(match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, ''), 'latin1');
        let decoded = '';
        try {
            decoded = (0, node_zlib_1.inflateSync)(payload).toString('latin1');
        }
        catch {
            decoded = match[1];
        }
        const extracted = textOperatorsToLines(decoded);
        if (extracted.length)
            lines.push(...extracted);
    }
    const text = lines.join('\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, transaction_intake_parsers_1.MAX_INTAKE_ARTIFACT_CHARS);
    return { text, hasTextLayer: text.length > 0 };
}
function extractIntakeArtifact(input) {
    if (input.artifactBytes && input.artifactBytes.length > exports.MAX_INTAKE_ARTIFACT_BYTES) {
        throw new runtime_1.DomainValidationError({
            path: 'artifactBytes',
            code: 'FORMAT',
            message: `artifact bytes must be at most ${exports.MAX_INTAKE_ARTIFACT_BYTES} bytes`,
        });
    }
    const originalArtifactSha256 = input.artifactBytes ? sha256ArtifactBytes(input.artifactBytes) : null;
    if (input.intakeSourceType === 'SCREENSHOT_IMPORT') {
        const parsed = (0, transaction_intake_parsers_1.parseCommerceArtifact)(null, 'SCREENSHOT_IMPORT');
        return {
            ...parsed,
            parserVersion: transaction_intake_parsers_1.SCREENSHOT_IMPORT_V1,
            extractionMethod: exports.SCREENSHOT_BYTES_V1,
            hasTextLayer: false,
            extractedText: null,
            originalArtifactSha256,
        };
    }
    if (input.intakeSourceType === 'PDF_IMPORT') {
        const layer = input.artifactBytes ? extractPdfTextLayer(input.artifactBytes) : { text: '', hasTextLayer: false };
        const parsed = (0, transaction_intake_parsers_1.parseCommerceArtifact)(layer.text || null, 'PDF_IMPORT');
        return {
            ...parsed,
            parserVersion: layer.hasTextLayer ? parsed.parserVersion : transaction_intake_parsers_1.PDF_IMPORT_V1,
            extractionMethod: layer.hasTextLayer ? exports.PDF_TEXT_LAYER_V1 : transaction_intake_parsers_1.PDF_IMPORT_V1,
            hasTextLayer: layer.hasTextLayer,
            extractedText: layer.text || null,
            originalArtifactSha256,
        };
    }
    const parsed = (0, transaction_intake_parsers_1.parseCommerceArtifact)(input.artifactText ?? null, input.intakeSourceType);
    return {
        ...parsed,
        extractionMethod: parsed.parserVersion,
        hasTextLayer: Boolean(input.artifactText?.trim()),
        extractedText: input.artifactText?.trim() ? input.artifactText : null,
        originalArtifactSha256,
    };
}
function confirmedExtractionMethod() {
    return transaction_intake_parsers_1.CONFIRMED_FIELDS_V1;
}
function textOperatorsToLines(content) {
    if (!/(?:Tj|TJ|T\*|')/.test(content))
        return [];
    const lines = [];
    const tj = /(?:(\((?:\\.|[^\\)])*\))|(<[0-9A-Fa-f]+>))\s*(Tj|'|TJ)/g;
    let match;
    while ((match = tj.exec(content))) {
        const token = decodePdfStringToken(match[1] ?? match[2] ?? '');
        if (!token)
            continue;
        if (match[3] === "'")
            lines.push(token);
        else
            lines.push(token);
    }
    for (const arrayMatch of content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
        const combined = [...arrayMatch[1].matchAll(/(\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f]+)>)/g)]
            .map((item) => decodePdfStringToken(item[1] ?? ''))
            .join('');
        if (combined.trim())
            lines.push(combined);
    }
    return lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function decodePdfStringToken(token) {
    const hex = /^<([0-9A-Fa-f]+)>$/.exec(token);
    if (hex) {
        const payload = hex[1].length % 2 === 0 ? hex[1] : `${hex[1]}0`;
        return Buffer.from(payload, 'hex').toString('latin1');
    }
    const literal = /^\(([\s\S]*)\)$/.exec(token);
    if (!literal)
        return '';
    return literal[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t')
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\(\d{1,3})/g, (_match, oct) => String.fromCharCode(Number.parseInt(oct, 8)));
}
//# sourceMappingURL=transaction-intake-extraction.js.map