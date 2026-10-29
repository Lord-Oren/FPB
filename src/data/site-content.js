import assert from 'node:assert/strict';
import {prepareStructure,collectionKinds} from './structure.js';
import { editorialDefaults, navigationDefaults, homeLabelDefaults } from './editorial.js';

// Build-time boundary for the public site content edited in Pond Desk (everything except
// Case Studies, which keep their own snapshot). Strings stay data: Astro escapes them.
export const rubrics = {
  works: ['client-work', 'mock-ads', 'presentations', 'photography', 'films-videos', 'music', 'collabs', 'magazine', 'gram', 'prc', 'recognition', 'statements'],
  events: ['events-shows', 'events-launches'],
  press: ['press', 'media-relations', 'influencer-relations'],
};
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/u;
const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const videoHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com'];
const audioHosts = ['open.spotify.com', 'soundcloud.com', 'bandcamp.com'];

function plain(value, keys, where) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype, `${where}: expected an object`);
  const extra = Object.keys(value).filter(key => !keys.includes(key));
  assert(!extra.length, `${where}: unexpected field ${extra[0]}`);
}
function text(value, limit, where, required = true) {
  assert(typeof value === 'string' && value.length <= limit && !controls.test(value), `${where}: text of ${limit} characters at most`);
  assert(!required || value.trim(), `${where}: required`);
  return value.trim();
}
function url(value, where, hosts) {
  if (!value) return '';
  assert(typeof value === 'string' && value.length <= 300, `${where}: invalid link`);
  const parsed = new URL(value);
  assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password, `${where}: HTTPS link required`);
  if (hosts) assert(hosts.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host)) || parsed.hostname === 'example.com', `${where}: unsupported host`);
  return parsed.href;
}
function page(value, where) {
  if (!value) return '';
  assert(typeof value === 'string' && /^[a-z0-9-]+\.html$/.test(value), `${where}: internal page expected`);
  return value;
}
function date(value, where, pattern) {
  assert(typeof value === 'string' && pattern.test(value) && !Number.isNaN(Date.parse(value)), `${where}: invalid date`);
  return value;
}
function id(value, where) {
  assert(typeof value === 'string' && value.length <= 100 && identifier.test(value), `${where}: invalid identifier`);
  return value;
}

// Media are embedded in the standalone HTML, like Case Studies (WebP/PNG/JPEG, 600 KiB each).
function mediaMap(list) {
  assert(Array.isArray(list) && list.length <= 300, 'media: invalid list');
  const map = new Map();
  for (const [index, item] of list.entries()) {
    const where = `media[${index}]`;
    plain(item, ['id', 'mime', 'base64', 'demo'], where);
    const key = id(item.id, where);
    assert(['image/webp', 'image/png', 'image/jpeg'].includes(item.mime), `${where}: unsupported image type`);
    assert(typeof item.base64 === 'string' && item.base64.length <= 820 * 1024 && /^[A-Za-z0-9+/]*={0,2}$/.test(item.base64), `${where}: invalid image data`);
    const bytes = Buffer.from(item.base64, 'base64');
    const signature = item.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : item.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    assert(signature, `${where}: image signature does not match its type`);
    assert(!map.has(key), `${where}: duplicate identifier`);
    map.set(key, `data:${item.mime};base64,${item.base64}`);
  }
  return map;
}
// `prefer` = 'pixel' (Ruben's pixel version, A): use the retro twin `<mediaId>-pixel` when the snapshot has one
// (generated sample pictures). Owners' own pictures have no twin and are shown as they are.
let prefer = '';
function picture(value, media, where, required = false) {
  if (value == null && !required) return null;
  plain(value, ['mediaId', 'alt'], where);
  const key = id(value.mediaId, where);
  const src = (prefer && media.get(`${key}-${prefer}`)) || media.get(key);
  assert(src, `${where}: image missing`);
  return { src, alt: text(value.alt, 200, `${where}.alt`) };
}

export function prepareSiteContent(snapshot, options = {}) {
  prefer = options.prefer === 'pixel' ? 'pixel' : '';
  plain(snapshot, ['schemaVersion', 'demo', 'home', 'intros', 'works', 'events', 'press', 'about', 'contact', 'join', 'media', 'structure'], 'content');
  assert(snapshot.schemaVersion === 1, 'content: unsupported schema');
  const structure = prepareStructure(snapshot.structure, snapshot.home);
  const sectionKinds = Object.fromEntries(structure.nodes.map(n=>[n.id,n.kind]));
  const media = mediaMap(snapshot.media);
  const seen = new Set();
  const unique = (key, where) => { assert(!seen.has(key), `${where}: duplicate identifier`); seen.add(key); return key; };

  plain(snapshot.home, ['announcement', 'gram', 'editorial', 'navigation'], 'home');
  plain(snapshot.home.announcement, ['title', 'text', 'link'], 'home.announcement');
  plain(snapshot.home.gram, ['label', 'url'], 'home.gram');
  const editorial = { ...editorialDefaults, ...snapshot.home.editorial };
  plain(editorial, Object.keys(editorialDefaults), 'home.editorial');
  for (const key of Object.keys(editorial)) editorial[key] = key === 'croakUrl' ? url(editorial[key], key, audioHosts) : text(editorial[key], key.startsWith('legal') ? 4000 : key in homeLabelDefaults ? 120 : 240, key, key in homeLabelDefaults && key.endsWith('Title'));
  const navigation = { ...navigationDefaults, ...snapshot.home.navigation };
  plain(navigation, Object.keys(navigationDefaults), 'home.navigation');
  for (const key of Object.keys(navigation)) navigation[key] = text(navigation[key], 40, key);
  const home = {
    editorial, navigation,
    announcement: { title: text(snapshot.home.announcement.title, 60, 'home.announcement.title'), text: text(snapshot.home.announcement.text, 140, 'home.announcement.text'), link: page(snapshot.home.announcement.link, 'home.announcement.link') },
    gram: { label: text(snapshot.home.gram.label, 40, 'home.gram.label'), url: url(snapshot.home.gram.url, 'home.gram.url') },
  };

  assert(Array.isArray(snapshot.works) && snapshot.works.length <= 400, 'works: invalid list');
  const works = snapshot.works.map((item, index) => {
    const where = `works[${index}]`;
    plain(item, ['id', 'rubric', 'title', 'date', 'summary', 'image', 'gallery', 'link', 'video', 'audio', 'client', 'demo'], where);
    assert((rubrics.works.includes(item.rubric) || sectionKinds[item.rubric] === 'works'), `${where}: unknown rubric`);
    assert(Array.isArray(item.gallery) && item.gallery.length <= 12, `${where}: gallery of 12 images at most`);
    return {
      id: unique(id(item.id, where), where), rubric: item.rubric, title: text(item.title, 90, `${where}.title`), date: date(item.date, `${where}.date`, /^\d{4}-\d{2}$/),
      summary: text(item.summary, 240, `${where}.summary`), image: picture(item.image, media, `${where}.image`, true),
      gallery: item.gallery.map((image, n) => picture(image, media, `${where}.gallery[${n}]`, true)),
      link: url(item.link, `${where}.link`), video: url(item.video, `${where}.video`, videoHosts), audio: url(item.audio, `${where}.audio`, audioHosts),
      client: text(item.client ?? '', 90, `${where}.client`, false),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  assert(Array.isArray(snapshot.events) && snapshot.events.length <= 200, 'events: invalid list');
  const events = snapshot.events.map((item, index) => {
    const where = `events[${index}]`;
    plain(item, ['id', 'rubric', 'title', 'start', 'end', 'venue', 'city', 'description', 'link', 'image', 'demo'], where);
    assert((rubrics.events.includes(item.rubric) || sectionKinds[item.rubric] === 'events'), `${where}: unknown rubric`);
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    return {
      id: unique(id(item.id, where), where), rubric: item.rubric, title: text(item.title, 90, `${where}.title`), start: date(item.start, `${where}.start`, iso),
      end: item.end ? date(item.end, `${where}.end`, iso) : '', venue: text(item.venue, 90, `${where}.venue`), city: text(item.city ?? '', 90, `${where}.city`, false),
      description: text(item.description ?? '', 1500, `${where}.description`, false), link: url(item.link, `${where}.link`), image: picture(item.image, media, `${where}.image`),
    };
  }).sort((a, b) => a.start.localeCompare(b.start));

  assert(Array.isArray(snapshot.press) && snapshot.press.length <= 300, 'press: invalid list');
  const press = snapshot.press.map((item, index) => {
    const where = `press[${index}]`;
    plain(item, ['id', 'rubric', 'title', 'outlet', 'date', 'url', 'quote', 'demo'], where);
    assert((rubrics.press.includes(item.rubric) || sectionKinds[item.rubric] === 'press'), `${where}: unknown rubric`);
    return {
      id: unique(id(item.id, where), where), rubric: item.rubric, title: text(item.title, 160, `${where}.title`), outlet: text(item.outlet, 90, `${where}.outlet`),
      date: date(item.date, `${where}.date`, /^\d{4}-\d{2}-\d{2}$/), url: url(item.url, `${where}.url`), quote: text(item.quote ?? '', 200, `${where}.quote`, false),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  plain(snapshot.about, ['story', 'ethos', 'photos', 'team'], 'about');
  assert(Array.isArray(snapshot.about.photos ?? []) && (snapshot.about.photos ?? []).length <= 6, 'about.photos: 6 photos at most');
  assert(Array.isArray(snapshot.about.team) && snapshot.about.team.length <= 24, 'about.team: 24 people at most');
  const about = {
    story: text(snapshot.about.story, 4000, 'about.story'), ethos: text(snapshot.about.ethos, 4000, 'about.ethos'),
    photos: (snapshot.about.photos ?? []).map((image, n) => picture(image, media, `about.photos[${n}]`, true)),
    team: snapshot.about.team.map((person, n) => { const where = `about.team[${n}]`; plain(person, ['name', 'role', 'photo', 'demo'], where); return { name: text(person.name, 90, `${where}.name`), role: text(person.role, 90, `${where}.role`), photo: picture(person.photo, media, `${where}.photo`) }; }),
  };

  plain(snapshot.contact, ['intro', 'email', 'socials'], 'contact');
  const email = text(snapshot.contact.email ?? '', 254, 'contact.email', false);
  assert(!email || /^[^\s@?&#%]+@[^\s@?&#%]+\.[^\s@?&#%]+$/.test(email), 'contact.email: invalid address');
  assert(Array.isArray(snapshot.contact.socials) && snapshot.contact.socials.length <= 6, 'contact.socials: 6 links at most');
  const contact = {
    intro: text(snapshot.contact.intro, 600, 'contact.intro'), email,
    socials: snapshot.contact.socials.map((link, n) => { const where = `contact.socials[${n}]`; plain(link, ['label', 'url'], where); return { label: text(link.label, 40, `${where}.label`), url: url(link.url, `${where}.url`) }; }),
  };

  plain(snapshot.join, ['intro', 'positions'], 'join');
  assert(Array.isArray(snapshot.join.positions) && snapshot.join.positions.length <= 10, 'join.positions: 10 at most');
  const join = {
    intro: text(snapshot.join.intro, 1200, 'join.intro'),
    positions: snapshot.join.positions.map((job, n) => { const where = `join.positions[${n}]`; plain(job, ['title', 'place', 'type', 'demo'], where); return { title: text(job.title, 90, `${where}.title`), place: text(job.place ?? '', 60, `${where}.place`, false), type: text(job.type ?? '', 40, `${where}.type`, false) }; }),
  };
  plain(snapshot.intros ?? {}, [...rubrics.works, ...rubrics.events, ...rubrics.press, 'case-studies', ...structure.nodes.map(n=>n.id)], 'intros');
  const intros = Object.fromEntries(Object.entries(snapshot.intros ?? {}).map(([slug, value]) => [slug, text(value, 240, `intros.${slug}`, false)]));
  return { structure, home, intros, works, events, press, about, contact, join };
}

// Events move to "Past" on the day after they end (or start). The site rebuilds nightly.
export function splitEvents(list, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const upcoming = [], past = [];
  for (const event of list) ((event.end || event.start).slice(0, 10) >= today ? upcoming : past).push(event);
  return { upcoming, past: past.reverse() };
}
