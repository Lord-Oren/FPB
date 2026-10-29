import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';


// Exact comparison of trusted, bundled SVG paths; not an untrusted-content sanitizer.
export async function checkOriginalArtwork(directory) {
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  const pixel = /<section[^>]+data-artwork-mode="original"/.test(html);
  assert.match(html, /<section[^>]+data-artwork-mode="(?:original|adapted)"/);
  const assets = new URL(pixel ? '../src/assets/ruben/' : '../src/assets/ruben-smooth/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('source-manifest.json', assets), 'utf8'));
  for (const asset of manifest.assets) {
    const svg = await readFile(new URL(`${asset.name}.svg`, assets), 'utf8');
    assert.equal(createHash('sha256').update(svg).digest('hex'), asset.sha256, `Source changed: ${asset.name}`);
    const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const matches = [...html.matchAll(new RegExp(`<symbol id="art-${asset.name}"[^>]*>([\\s\\S]*?)<\/symbol>`, 'g'))];
    assert.equal(matches.length, 1, `Missing or duplicated artwork: ${asset.name}`);
    assert.equal(pixel || asset.name !== 'frog' ? matches[0][1] : matches[0][1].replace(/ style="fill:color-mix\(in srgb,var\(--frog-skin\)[^"]*"/g, ''), body, `Paths or colours changed in export: ${asset.name}`);
  }
  const tv = await readFile(new URL(pixel ? '../src/assets/television-pixel.svg' : '../src/assets/television.svg', import.meta.url), 'utf8');
  const tvBody = tv.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  assert.equal(html.match(/<symbol id="art-television"[^>]*>([\s\S]*?)<\/symbol>/)?.[1], tvBody, 'Television must match its variant');
  assert.match(html, new RegExp('shape-rendering="' + (pixel ? 'crispEdges' : 'geometricPrecision') + '"'));
  const result = { variant: pixel ? 'a' : 'b', original_artworks: manifest.assets.length, original_paths: manifest.assets.reduce((sum, a) => sum + a.paths, 0) };
  console.log(`Original artwork verified: ${JSON.stringify(result)}`);
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkOriginalArtwork(path.resolve(process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url))));
}
