#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(resolve(root, 'docs', 'DEPENDENCY_ADVISORY_POLICY.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

function collect(cwd) {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  const parsed = JSON.parse(result.stdout || '{}');
  const advisories = new Map();
  for (const vuln of Object.values(parsed.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (!via || typeof via !== 'object') continue;
      const match = String(via.url ?? '').match(/GHSA-[a-z0-9-]+/i);
      const id = via.ghsa || match?.[0];
      if (!id) continue;
      if (!advisories.has(id)) {
        advisories.set(id, {
          id,
          severity: via.severity,
          title: via.title,
          package: via.name,
          url: via.url,
        });
      }
    }
  }
  return {
    metadata: parsed.metadata,
    advisories: [...advisories.values()],
  };
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function evaluate(treeName, cwd) {
  const treePolicy = policy.trees[treeName];
  const { metadata, advisories } = collect(cwd);
  const acceptedHigh = new Map((treePolicy.acceptedHigh ?? []).map((item) => [item.id, item]));
  const highOrCritical = advisories.filter((item) => item.severity === 'high' || item.severity === 'critical');
  const unexpected = [];
  const expired = [];
  for (const advisory of highOrCritical) {
    if (advisory.severity === 'critical') {
      unexpected.push(advisory);
      continue;
    }
    const acceptance = acceptedHigh.get(advisory.id);
    if (!acceptance) {
      unexpected.push(advisory);
      continue;
    }
    if (acceptance.expiresOn && acceptance.expiresOn < today) expired.push({ ...advisory, expiresOn: acceptance.expiresOn });
  }
  console.log(`${treeName}: ${metadata?.vulnerabilities?.total ?? advisories.length} npm nodes; ${advisories.length} unique GHSA advisories.`);
  if (unexpected.length) {
    fail(`${treeName} has unaccepted high/critical advisories: ${unexpected.map((item) => `${item.id} (${item.package})`).join(', ')}`);
  }
  if (expired.length) {
    fail(`${treeName} accepted high advisories have expired: ${expired.map((item) => `${item.id} expired ${item.expiresOn}`).join(', ')}`);
  }
}

evaluate('root', root);
evaluate('functions', resolve(root, 'functions'));
evaluate('portal', resolve(root, 'portal'));
console.log('Dependency advisory policy gate passed.');
