import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const project = fileURLToPath(new URL('../', import.meta.url));
// Structural checks for trusted generated files; this is not an HTML sanitizer.
const attrs = text => Object.fromEntries([...text.matchAll(/([^\s=<>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '']));

export async function checkExport(directory, { expectedRoutes, maxPageBytes = 10 * 1024 * 1024, hostedForms = false } = {}) {
  const receiverSource=hostedForms?(await readFile(path.join(project,'src/scripts/local-forms.js'),'utf8')).trim():null;
  const output = path.resolve(directory);
  const files = [];
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      assert(!item.isSymbolicLink(), `Symbolic links forbidden in export : ${full}`);
      // Reject system metadata and hidden files even with an HTML extension.
      assert(!item.name.startsWith('.'), `Hidden files or system metadata forbidden : ${full}`);
      if (item.isDirectory()) await walk(full);
      else {
        assert(item.isFile() && item.name.endsWith('.html'), `Sidecar file forbidden : ${full}`);
        files.push(full);
      }
    }
  }
  await walk(output);
  assert(files.length > 0, 'No HTML pages exported');
  if (expectedRoutes) assert.deepEqual(files.map(file => path.relative(output, file)).sort(), [...expectedRoutes].sort(), "Unexpected exported routes");
  const pages = new Map();
  for (const file of files) {
    const bytes = await readFile(file);
    assert(bytes.length <= maxPageBytes, `Page budget exceeded : ${file}`);
    let html;
    try { html = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error(`Binary or non-UTF-8 content : ${file}`); }
    assert(!html.includes('\u0000'), `Binary content : ${file}`);
    assert(/^\s*<!doctype html>/i.test(html), `Missing HTML doctype : ${file}`);
    for (const [, attributes, js] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const properties = attrs(attributes);
      assert(!properties.src, `External script forbidden : ${file}`);
      assert(properties.type?.toLowerCase() !== 'module', `JavaScript modules forbidden in this preview : ${file}`);
      if (!properties.type || /^(?:text|application)\/javascript$/i.test(properties.type)) {
        new Script(js, { filename: file });
        assert(!/\b(?:eval|Function)\s*\(|\.\s*(?:innerHTML|outerHTML|insertAdjacentHTML|write|writeln)\b/.test(js), `Code or HTML injection requires review : ${file}`);
        assert((hostedForms && js.trim()===receiverSource) || !/\b(?:fetch|import)\s*\(|\b(?:XMLHttpRequest|WebSocket|sendBeacon)\b/.test(js), `Dynamic loading must be resolved before export : ${file}`);
      }
    }
    const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(m => m[1]);
    const markup = html.replace(/<!--[^]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const elements = [...markup.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)].map(m => ({ tag: m[1].toLowerCase(), properties: attrs(m[2]) }));
    styles.push(...elements.map(e => e.properties.style || ''));
    for (const css of styles) {
      assert(!/@import\b/i.test(css), `External CSS import forbidden : ${file}`);
      for (const [, url] of css.matchAll(/url\(\s*['"]?([^)'"\s]+)/gi)) {
        assert(/^(?:data:|#)/i.test(url), `Sidecar CSS resource forbidden : ${url}`);
      }
    }
    const idList = elements.map(e => e.properties.id).filter(Boolean);
    assert.equal(new Set(idList).size, idList.length, `Duplicate IDs : ${file}`);
    pages.set(file, { elements, ids: new Set(idList) });
  }
  let localLinks = 0;
  for (const [file, { elements }] of pages) {
    for (const { tag, properties } of elements) {
      assert(tag !== 'base', `Base URL forbidden in this preview : ${file}`);
      assert(!['iframe', 'object', 'embed', 'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set'].includes(tag), `Unexpected active content : ${tag} dans ${file}`);
      for (const attribute of Object.keys(properties)) {
        assert(!/^on/i.test(attribute), `Inline event handler forbidden : ${attribute} dans ${file}`);
        assert(!['formaction', 'formmethod', 'formenctype', 'formtarget', 'formnovalidate'].includes(attribute), `Form override forbidden : ${attribute} dans ${file}`);
        assert(!['srcdoc', 'ping'].includes(attribute), `Unexpected active attribute : ${attribute} dans ${file}`);
      }
      assert(!(tag === 'meta' && properties['http-equiv']?.toLowerCase() === 'refresh'), `Automatic redirect forbidden : ${file}`);
      if (tag === 'form') {
        if (properties['data-ready'] === 'false') {
          assert(properties.method === 'dialog' && !properties.action, `Preview form can submit : ${file}`);
        } else {
          assert(properties.method === 'post', `Form: use POST for personal data : ${file}`);
          if(hostedForms && ['/api/v2/forms/contact','/api/v2/forms/join'].includes(properties.action))continue;
          const action = new URL(properties.action);
          assert(action.protocol === 'https:' && !action.username && !action.password, `Unsafe form endpoint : ${file}`);
        }
      }
      assert(!('srcset' in properties), `srcset requires adaptation before export : ${file}`);
      for (const attribute of ['src', 'poster', 'data', 'background', 'xlink:href']) {
        const value = properties[attribute];
        if (value !== undefined) assert(/^(?:data:|#)/i.test(value), `Sidecar resource forbidden : ${value}`);
      }
      const value = properties.href;
      if (value === undefined) continue;
      if (tag !== 'a') {
        assert(/^(?:data:|#)/i.test(value), `External resource link forbidden : ${value}`);
        if (value.startsWith("#")) assert(pages.get(file).ids.has(value.slice(1)), `Missing embedded illustration : ${value}`);
        continue;
      }
      if (/^https:/i.test(value)) {
        const destination = new URL(value);
        assert(!destination.username && !destination.password, `Credentials in a public link : ${file}`);
        continue;
      }
      if (/^(?:mailto:|tel:)/i.test(value)) {
        assert(!/[\u0000-\u001f\u007f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value), `Forbidden control character in a contact link : ${file}`);
        continue;
      }
      assert(!/^(?:\/|[a-z]+:)/i.test(value), `Nonportable link : ${value}`);
      const [resource, fragment] = value.split('#');
      const target = resource ? path.resolve(path.dirname(file), decodeURIComponent(resource.split('?')[0])) : file;
      assert(target.startsWith(output + path.sep), `Link outside export : ${value}`);
      assert((await stat(target)).isFile() && pages.has(target), `Missing page : ${value}`);
      if (fragment) assert(pages.get(target).ids.has(decodeURIComponent(fragment)), `Missing anchor : ${value}`);
      localLinks++;
    }
  }
  return { pages: pages.size, localLinks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkExport(path.resolve(project, process.argv[2] || 'dist'));
  console.log(`${result.pages} standalone HTML page(s), ${result.localLinks} local links verified. Structural check; browser acceptance is separate.`);
}
