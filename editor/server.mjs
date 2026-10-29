// Local workstation tool. Never expose this development identity to the Internet.
import { createV2 } from './backend/api.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { changeCatalog, migrateCatalog, selectedSnapshot } from './catalog.mjs';
import { validatePublicMedia } from '../src/data/validate-public-media.js';

export async function createEditor({ root = fileURLToPath(new URL('../', import.meta.url)), port = 4323, v2Options = {}, legacyWrites = false, formOrigins = ['http://127.0.0.1:4321','http://127.0.0.1:4322'] } = {}) {
  if (!formOrigins.every(value => /^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(value))) throw new Error('Local test addresses are required.');
  const token = randomBytes(32).toString('hex');
  const folder = path.join(root, '.local-editor');
  const publicFile = path.join(root, 'src/data/case-studies-public.json');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const atomic = async (file, value) => { const temp = file + '.tmp'; await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await rename(temp, file); };
  const readPublic = async () => JSON.parse(await readFile(publicFile, 'utf8'));
  const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const published = await readPublic();
  await validatePublicMedia(published);
  let legacy;
  try { legacy = JSON.parse(await readFile(path.join(folder, 'draft.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let state = migrateCatalog(legacy, published);
  if (legacy?.schemaVersion !== 2) {
    if (legacy) {
      const backup = path.join(folder, 'draft-v1-backup.json');
      try { await writeFile(backup, JSON.stringify(legacy, null, 2), { flag:'wx', mode:0o600 }); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (JSON.stringify(JSON.parse(await readFile(backup,'utf8'))) !== JSON.stringify(legacy))
          await writeFile(path.join(folder, `draft-v1-backup-${randomBytes(8).toString('hex')}.json`), JSON.stringify(legacy,null,2), { flag:'wx',mode:0o600 });
      }
    }
    await atomic(path.join(folder, 'draft.json'), state);
  }
  const view = async () => { const live = await readPublic(); return { catalog: state, publicFingerprint: fingerprint(live), applied: live.cases.map(item => ({ id:item.id, slug:item.slug, title:item.content.title, content:item.content })) }; };
  let queue = Promise.resolve();
  const respond = (res, status, data, mime = 'application/json') => { res.writeHead(status, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" }); res.end(mime === 'application/json' ? JSON.stringify(data) : data); };
  const v2 = createV2({ root, token, ...v2Options });
  const server = createServer(async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const form = req.method === 'POST' && ['/api/v2/forms/contact','/api/v2/forms/join'].includes(req.url);
      const siteOrigin = form && formOrigins.includes(req.headers.origin);
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin && !siteOrigin) || req.headers['sec-fetch-site'] === 'cross-site') return respond(res, 403, { error: 'This request came from an unapproved page.' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/favicon.ico') return respond(res, 204, '', 'image/x-icon');
      if (req.method === 'GET' && url.pathname === '/') { res.writeHead(302, {Location:'/v2/', 'Cache-Control':'no-store'}); res.end(); return; }
      if (await v2.handler(req,res,url)) return;
      if ((!legacyWrites || v2.active()) && req.method === 'POST' && url.pathname.startsWith('/api/')) return respond(res,409,{error:'Pond Desk v2 is using this data. Open /v2/ to edit the current catalog.'});
      const assets = { '/diagnostics.js':['diagnostics.js','text/javascript'] };
      if (req.method === 'GET' && Object.hasOwn(assets, url.pathname)) { const [file, mime] = assets[url.pathname]; return respond(res, 200, await readFile(new URL(file, import.meta.url), 'utf8'), mime); }
      if (req.method === 'GET' && url.pathname === '/api/session') return respond(res, 200, { token });
      if (req.headers['x-editor-token'] !== token) return respond(res, 403, { error: 'Reload the editor to start a session.' });
      if (req.method === 'GET' && url.pathname === '/api/state') return respond(res, 200, await view());
      if (req.method !== 'POST' || !['save','apply','image','create','select','deselect','withdraw','restore','recover','reorder'].some(action => url.pathname === '/api/' + action)) return respond(res, 404, { error: 'Page or action not found.' });
      if (req.headers['content-type'] !== 'application/json') return respond(res, 415, { error: 'Send the data as JSON.' });
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 20 * 1024 * 1024) { res.setHeader('Connection','close'); respond(res, 413, { error: 'This data is too large. The limit is 20 MiB.' }); return; } chunks.push(chunk); }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      const operation = async () => {
        if (url.pathname === '/api/image') {
          if (typeof body.base64 !== 'string' || body.base64.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)) throw new Error('This image is invalid or larger than 5 MiB.');
          const input = Buffer.from(body.base64, 'base64');
          if (input.length > 5 * 1024 * 1024) throw new Error('This image is larger than 5 MiB.');
          const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
          if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) throw new Error('Choose a non-animated PNG, JPEG, or WebP image.');
          const output = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          if (output.length > 600 * 1024) throw new Error('This image is still too large. Make it smaller and try again.');
          return { id: `image-${randomBytes(8).toString('hex')}`, mime: 'image/webp', base64: output.toString('base64') };
        }
        const action = url.pathname.slice('/api/'.length);
        if (action !== 'apply') {
          if (action === 'save') await validatePublicMedia({ schemaVersion:1, cases:[], media:body.media ?? [] });
          const next = changeCatalog(state, action, body);
          if (action === 'select') await validatePublicMedia(selectedSnapshot(next));
          await atomic(path.join(folder, 'draft.json'), next); state = next;
          return { ...await view(), ...(action==='create'?{createdId:next.records.at(-1).id}:{}) };
        }
        if (body.revision !== state.revision) { const error = new Error('The catalog changed. Reload and review your selection.'); error.status=409; throw error; }
        const snapshot = selectedSnapshot(state);
        await validatePublicMedia(snapshot);
        const previous = await readPublic();
        if (body.publicFingerprint !== fingerprint(previous)) { const error = new Error('The public content changed. Reload and review it before applying your selection.'); error.status=409; throw error; }
        if (JSON.stringify(previous) !== JSON.stringify(snapshot)) {
          await atomic(path.join(folder, 'previous-public.json'), previous);
          await atomic(publicFile, snapshot);
        }
        return { ...await view(), message:'Selection applied to the local A and B source files. Nothing was uploaded or exported automatically.' };

      };
      const result = queue.then(operation); queue = result.catch(() => {});
      respond(res, 200, await result);
    } catch (error) {
      const imageError=req.url === '/api/image';
      const message=imageError ? 'Choose a non-animated PNG, JPEG, or WebP image up to 5 MiB. Saved images are limited to 2,000 pixels and 600 KiB.' : error instanceof SyntaxError ? 'Invalid JSON data.' : error.message;
      respond(res,error.status ?? 400,{error:message,...(error.diagnostics?{diagnostics:error.diagnostics}:imageError?{diagnostics:[{caseId:'',field:'image',code:'image_refused'}]}:{})});
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const purgeTimer=setInterval(()=>v2.purge(),3600000);purgeTimer.unref();
  const closeServer=server.close.bind(server);
  server.close=callback=>{clearInterval(purgeTimer);closeServer(async error=>{await v2.close();callback?.(error);});return server;};
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await createEditor();
  console.log(`Local Pond Desk: http://127.0.0.1:${server.address().port}/v2/ — local session, simulated emails - Ctrl+C to stop.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
