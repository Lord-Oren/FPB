import assert from 'node:assert/strict';

// Build-time boundary for an explicitly public snapshot. Never pass a CMS catalog
// (with drafts, accounts, or private media) to this module.
const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
function object(value, keys) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype, 'Expected a plain object');
  assert(Object.keys(value).every(key => keys.includes(key)), 'Unexpected field in public snapshot');
}
function text(value, required = true, limit = 4000, field = "text") {
  assert(typeof value === 'string' && value.length <= limit && !controls.test(value), `Invalid public text: ${field} (maximum ${limit})`);
  assert(!required || value.trim(), `Required public text: ${field}`);
  return value.trim();
}
function id(value) {
  assert(typeof value === 'string' && value.length <= 100 && identifier.test(value), 'Invalid public identifier');
  return value;
}
function mediaData(value) {
  object(value, ['id', 'mime', 'base64']);
  const key = id(value.id);
  assert(['image/png', 'image/jpeg', 'image/webp'].includes(value.mime), 'Unsupported image type');
  assert(typeof value.base64 === 'string' && value.base64.length <= 800 * 1024, 'Image exceeds build limit');
  assert(/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64) && value.base64.length % 4 === 0, 'Invalid image encoding');
  const bytes = Buffer.from(value.base64, 'base64');
  assert(bytes.length > 0 && bytes.length <= 600 * 1024 && bytes.toString('base64') === value.base64, 'Invalid image bytes');
  const signature = value.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : value.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  assert(signature, 'Image signature does not match MIME type');
  // Signature checks are not an upload scanner or decoder. The future service
  // must decode/re-encode and authorize images before creating this snapshot.
  return { id: key, src: `data:${value.mime};base64,${value.base64}` };
}
export function caseStudyHref(slug) { return `case-study-${id(slug)}.html`; }

export function preparePublicCases(snapshot) {
  object(snapshot, ['schemaVersion', 'cases', 'media']);
  assert(snapshot.schemaVersion === 1, 'Unsupported public snapshot schema');
  assert(Array.isArray(snapshot.cases) && snapshot.cases.length <= 100, 'Invalid case collection');
  assert(Array.isArray(snapshot.media) && snapshot.media.length <= 200, 'Invalid media collection');
  const media = new Map();
  for (const item of snapshot.media) {
    const asset = mediaData(item);
    assert(!media.has(asset.id), 'Duplicate media identifier');
    media.set(asset.id, asset.src);
  }
  const ids = new Set(), slugs = new Set();
  const image = (value, field) => {
    try {
    object(value, ['assetId', 'alt', 'caption', 'credit']);
    const src = media.get(id(value.assetId));
    assert(src, 'Missing public image');
    return { src, alt: text(value.alt, true, 200, 'image.alt'), caption: text(value.caption ?? '', false, 200, 'image.caption'), credit: text(value.credit ?? '', false, 120, 'image.credit') };
    } catch (error) { throw new Error(`${field}: ${error.message}`); }
  };
  return snapshot.cases.map(item => {
    try {
    object(item, ['id', 'slug', 'status', 'content']);
    assert(item.status === 'published', 'Only explicitly published content may be exported');
    const key = id(item.id), slug = id(item.slug);
    assert(!ids.has(key) && !slugs.has(slug), 'Duplicate case identifier or slug');
    ids.add(key); slugs.add(slug);
    const content = item.content;
    object(content, ['title', 'summary', 'context', 'work', 'cover', 'gallery', 'client', 'results']);
    assert(Array.isArray(content.gallery) && content.gallery.length <= 12, 'Invalid gallery');
    return {
      id: key, slug, href: caseStudyHref(slug), title: text(content.title, true, 90, 'title'), summary: text(content.summary, true, 240, 'summary'),
      context: text(content.context, true, 4000, 'context'), work: text(content.work, true, 4000, 'work'), client: text(content.client ?? '', false, 90, 'client'),
      results: text(content.results ?? '', false, 1500, 'results'), cover: image(content.cover, 'cover'), gallery: content.gallery.map((value,index) => image(value, `gallery[${index+1}]`)),
    };
    } catch (error) { throw new Error(`${item?.id ?? "case"}: ${error.message}`); }
  });
}
