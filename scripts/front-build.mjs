// Builds one variant into a temporary folder for the front-end tests. Astro writes shared files in the project
// (.astro/.prerender), so two builds started at the same time by `node --test` break each other: a lock folder
// in the system temporary directory lets only one build run at a time.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const project = fileURLToPath(new URL('../', import.meta.url));
const lock = path.join(tmpdir(), 'fpb-front-build.lock');
const STALE_MS = 5 * 60 * 1000;

async function acquire() {
  for (;;) {
    try { await mkdir(lock); return; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const age = await stat(lock).then(info => Date.now() - info.mtimeMs, () => 0);
      if (age > STALE_MS) { await rm(lock, { recursive: true, force: true }); continue; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

export async function buildVariant(variant, prefix = 'fpb') {
  const out = await mkdtemp(path.join(tmpdir(), `${prefix}-${variant}-`));
  await acquire();
  try {
    const run = spawnSync(process.execPath, [path.join(project, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', out], { cwd: project, env: { ...process.env, FPB_VARIANT: variant, ASTRO_TELEMETRY_DISABLED: '1' }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally { await rm(lock, { recursive: true, force: true }); }
  return out;
}
