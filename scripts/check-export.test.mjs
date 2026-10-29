import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkExport } from './check-export.mjs';

const cache = fileURLToPath(new URL('../.cache/export-tests/', import.meta.url));
await mkdir(cache, { recursive: true });
async function fixture(files, run) {
  const root = await mkdtemp(path.join(cache, 'case-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(root, name);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, typeof content === 'string' && name.endsWith('.html') ? '<!doctype html>\n' + content : content);
    }
    return await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('accepts standalone pages, anchors and page links', () => fixture({
  'index.html': '<style>body{color:green}</style><a href="about.html#team">About</a><script>const x = 1;</script>',
  'about.html': '<h1 id="team">Team</h1><a href="index.html">Home</a>',
}, async root => assert.deepEqual(await checkExport(root), { pages: 2, localLinks: 2 })));

test('rejects sidecar resources even when present on disk', () => fixture({
  'index.html': '<link rel="stylesheet" href="site.css">', 'site.css': 'body{}',
}, root => assert.rejects(checkExport(root), /Sidecar file/)));

test('rejects macOS metadata and hidden files even with an HTML extension', async () => {
  await fixture({ 'index.html': '<p>A</p>', '._index.html': '\u0000\u0005\u0016\u0007Mac OS X' }, root => assert.rejects(checkExport(root), /Hidden files/));
  await fixture({ 'index.html': '<p>A</p>', '.DS_Store': 'x' }, root => assert.rejects(checkExport(root), /Hidden files/));
  await fixture({ 'index.html': '<p>A</p>', '.hidden/page.html': '<p>B</p>' }, root => assert.rejects(checkExport(root), /Hidden files/));
});
test('rejects binary or non-UTF-8 content named .html', () => fixture({
  'index.html': Buffer.from([0x3c, 0x70, 0x3e, 0xff, 0xfe, 0x00]),
}, root => assert.rejects(checkExport(root), /Binary or non-UTF-8 content/)));

for (const [name, html, message] of [
  ['external script', '<script src="app.js"></script>', /External script/],
  ['module', '<script type="module">export {};</script>', /JavaScript modules/],
  ['external image', '<img src="https://example.com/a.png">', /Sidecar resource/],
  ['external CSS', '<style>body{background:url(image.png)}</style>', /Sidecar CSS/],
  ['missing anchor', '<a href="#absent">Open</a>', /Missing anchor/],
  ['missing page', '<a href="missing.html">Open</a>', /ENOENT|Missing page/],
  ['duplicate IDs', '<p id="same">A</p><p id="same">B</p>', /Duplicate IDs/],
  ['invalid script', '<script>const = ;</script>', /Unexpected token/],
]) test(`rejects ${name}`, () => fixture({ 'index.html': html }, root => assert.rejects(checkExport(root), message)));

test('accepts embedded media and intentional external links', () => fixture({
  'index.html': '<img src="data:image/png;base64,AAAA"><a href="https://example.com">Visit</a>',
}, async root => assert.equal((await checkExport(root)).pages, 1)));


test('accepts embedded shared SVG illustrations', () => fixture({
  'index.html': '<svg><defs><symbol id="frog"><path d="M0 0h1v1z"/></symbol></defs><use href="#frog"/></svg>',
}, async root => assert.equal((await checkExport(root)).pages, 1)));

test('rejects SVG illustrations missing from HTML', () => fixture({
  'index.html': '<svg><use href="#missing-art"/></svg>',
}, root => assert.rejects(checkExport(root), /Missing embedded illustration/)));


test('preview forms have no endpoint and cannot submit', () => fixture({
  'index.html': '<form method="dialog" data-ready="false"><button disabled>Send</button></form>',
}, async root => assert.equal((await checkExport(root)).pages, 1)));

test('rejects active endpoints hidden in preview forms', () => fixture({
  'index.html': '<form method="post" action="https://example.com/send" data-ready="false"></form>',
}, root => assert.rejects(checkExport(root), /Preview form can submit/)));

test('accepts explicit HTTPS POST with attachments', () => fixture({
  'index.html': '<form method="post" action="https://example.com/send" enctype="multipart/form-data" data-ready="true"><input type="file" name="cv"></form>',
}, async root => assert.equal((await checkExport(root)).pages, 1)));

for (const [method, action] of [['get', 'https://example.com/send'], ['post', 'http://example.com/send']]) {
  test(`rejects form ${method} ${action}`, () => fixture({
    'index.html': `<form method="${method}" action="${action}" data-ready="true"></form>`,
  }, root => assert.rejects(checkExport(root), /Form:|Unsafe form endpoint/)));
}

for (const [name, html, message] of [
  ['endpoint overridden by a button', '<form method="dialog" data-ready="false"><button formaction="https://example.com/send" formmethod="post">Send</button></form>', /Form override/],
  ['validation bypassed with a boolean attribute', '<button formnovalidate>Send</button>', /Form override/],
  ['inline handler', '<button onclick="alert(1)">Open</button>', /Inline event handler/],
  ['boolean event', '<svg onload></svg>', /Inline event handler/],
  ['attribute after a quoted angle bracket', '<button title="a > b" onclick="alert(1)">Open</button>', /Inline event handler/],
  ['embedded iframe', '<iframe srcdoc="<p>Text</p>"></iframe>', /Unexpected active content/],
  ['embedded object', '<object data="data:text/html,hello"></object>', /Unexpected active content/],
  ['HTML in SVG', '<svg><foreignObject><p>Text</p></foreignObject></svg>', /Unexpected active content/],
  ['SVG link mutation', '<svg><animate attributeName="href" values="javascript:alert(1)"></animate></svg>', /Unexpected active content/],
  ['srcdoc attribute', '<div srcdoc="text"></div>', /Unexpected active attribute/],
  ['ping tracking', '<a href="https://example.com" ping="https://example.com/track">Visit</a>', /Unexpected active attribute/],
  ['automatic redirect', '<meta http-equiv="Refresh" content="0;url=https://example.com">', /Automatic redirect/],
  ['beacon transmission', '<script>navigator.sendBeacon("https://example.com", "data");</script>', /Dynamic loading/],
  ['dynamic evaluation', '<script>eval("1+1");</script>', /Code or HTML injection/],
  ['dynamic HTML insertion', '<script>element.innerHTML = value;</script>', /Code or HTML injection/],
  ['mixed-case module type', '<script type="MODULE">const x=1;</script>', /JavaScript modules/],
  ['HTTP link', '<a href="http://example.com">Visit</a>', /Nonportable link/],
  ['credentials in a link', '<a href="https://user:pass@example.com">Visit</a>', /Credentials in a public link/],
  ['newline in mailto', '<a href="mailto:hello@example.com%0aBcc:other@example.com">Write</a>', /Forbidden control character/],
]) test(`security: rejects ${name}`, () => fixture({ 'index.html': html }, root => assert.rejects(checkExport(root), message)));

test('accepts angle brackets and escaped text without treating them as markup', () => fixture({
  'index.html': '<p title="a > b">&lt;img onerror=example&gt;</p><input disabled>',
}, async root => assert.equal((await checkExport(root)).pages, 1)));

test('rejects fake HTML without a doctype', () => fixture({ 'index.html': Buffer.from('<p>fragment</p>') }, root => assert.rejects(checkExport(root), /doctype/)));
test('checks the exact route list', () => fixture({ 'index.html': '<p>ok</p>' }, root => assert.rejects(checkExport(root, { expectedRoutes: ['index.html', 'about.html'] }), /routes/)));
test('rejects pages exceeding the size budget', () => fixture({ 'index.html': '<p>ok</p>' }, root => assert.rejects(checkExport(root, { maxPageBytes: 2 }), /budget/)));

test('hosted mode does not authorize arbitrary network scripts or form destinations',async()=>{
 await fixture({'index.html':'<script>fetch("https://evil.example/data")</script>'},root=>assert.rejects(checkExport(root,{hostedForms:true})));
 await fixture({'index.html':'<form method="post" action="/api/v2/settings"></form>'},root=>assert.rejects(checkExport(root,{hostedForms:true})));
 await fixture({'index.html':'<form method="post" action="/api/v2/forms/contact" onsubmit="evil()"></form>'},root=>assert.rejects(checkExport(root,{hostedForms:true})));
 await fixture({'index.html':'<form method="post" action="/api/v2/forms/contact"></form>'},root=>assert.rejects(checkExport(root)));
});
