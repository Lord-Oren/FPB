// Pond Desk v2 client. API implementation: editor/backend/api.mjs.
// Desk only works with its server: when the API does not answer, it says so and retries. There is no offline example mode.
'use strict';

const API = '/api/v2';
const $ = selector => document.querySelector(selector);
const state = { mode: '', mail: '', token: '', space: 'site', section: null, item: null, conversation: null, dirty: false };

// ---------- Small DOM helper: text is always set as text, never parsed as HTML ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'text') el.textContent = value;
    // Strict CSP (default-src 'self') blocks style attributes; the CSSOM is allowed.
    else if (key === 'style') for (const part of String(value).split(';')) { const at = part.indexOf(':'); if (at > 0) el.style.setProperty(part.slice(0, at).trim(), part.slice(at + 1).trim()); }
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return el;
}
function toast(text, { stay = false } = {}) {
  if (progressCard.take(text)) return;
  const box = $('#toast'); box.textContent = text; box.hidden = false; box.classList.toggle('above', progressCard.visible()); toast.staying = stay;
  clearTimeout(toast.timer); if (!stay) toast.timer = setTimeout(() => { box.hidden = true; }, 3200);
}
// ---------- Progress of an action, step by step ----------
// progress:start
// A step only turns done when the server (or the browser, for reading and sending bytes) has confirmed it.
// Never a timer, never an invented percentage: a step whose length is unknown shows "In progress" and a moving
// stripe (still when the visitor asks for reduced motion). "Done" only comes from finish(), after real success.
// If the action ends without finish(), the card shows the step that stopped and the last message, or simply closes
// when nothing was sent (a cancelled confirmation, a form with problems shown in red).
// When the server's answer was lost or could not be read, nobody knows whether the action happened: the card then
// ends as "Result unknown" (never "Done", never "Stopped") and its message says where to check.
// For long server operations (publishing, checking a PDF or a video), the server reports its own steps: server()
// replaces the card's last step with them, and a step turns done only when the server says so.
const progressCard = (() => {
  let run = null, hideTimer = 0, card = null;
  // The card lives in the content pane, right under its header: on a computer it floats in the corner, on a phone it
  // takes its own place between the header and the form, so it never covers a button. A new screen keeps it.
  const attach = box => { const pane = $('#main'); if (!pane || box.parentElement === pane && box.previousElementSibling?.classList.contains('top')) return; const top = pane.querySelector(':scope > .top'); if (top) top.after(box); else pane.prepend(box); };
  const hide = () => { run = null; if (card) card.hidden = true; };
  const percent = (sent, total) => Math.max(0, Math.min(100, Math.floor(sent / total * 100)));
  const COUNT_UNITS = { processing: 'pages' };
  const draw = () => {
    if (!run) return;
    const box = card ??= h('section', { class: 'progress', id: 'progress', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
    attach(box);
    const total = run.steps.length, doneCount = run.state === 'done' ? total : run.current;
    const measured = run.state !== 'running' ? 0 : run.bytes ? run.bytes.sent / run.bytes.total : run.count ? run.count.done / run.count.total : 0;
    const fill = run.state === 'done' ? 100 : Math.floor((doneCount + measured) / total * 100);
    const label = run.state === 'done' ? 'Done' : run.state === 'failed' ? 'Stopped at step ' + (run.current + 1) + ' of ' + total : run.state === 'unknown' ? 'Result unknown' : 'Step ' + (run.current + 1) + ' of ' + total;
    const stepState = index => run.state === 'done' || index < run.current ? 'done' : index > run.current ? 'todo' : run.state === 'failed' ? 'failed' : run.state === 'unknown' ? 'unknown' : 'current';
    const mark = { done: '✓', current: '●', todo: '○', failed: '✕', unknown: '?' };
    const note = { done: 'done', current: 'in progress', todo: 'to do', failed: 'stopped here', unknown: 'result unknown' };
    const detail = () => run.bytes ? `${percent(run.bytes.sent, run.bytes.total)}%` : run.count ? `${run.count.done} of ${run.count.total}${run.count.unit ? ' ' + run.count.unit : ''}` : run.waiting ? 'Waiting…' : 'In progress…';
    box.dataset.state = run.state; box.hidden = false;
    box.replaceChildren(...[
      h('div', { class: 'progress-head' }, h('b', { text: run.title }), h('span', { class: 'progress-count', text: label })),
      h('div', { class: 'progress-track', role: 'progressbar', 'aria-label': run.title, 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(doneCount), 'aria-valuetext': label + ': ' + (run.steps[Math.min(run.current, total - 1)] || '') },
        h('span', { class: 'progress-fill', style: `width:${fill}%` }),
        run.state === 'running' && !run.bytes && !run.count ? h('span', { class: 'progress-pending', style: `left:${doneCount / total * 100}%;width:${100 / total}%` }) : null),
      h('ol', { class: 'progress-steps' }, ...run.steps.map((step, index) => { const s = stepState(index); return h('li', { 'data-state': s },
        h('span', { class: 'progress-mark', 'aria-hidden': 'true', text: mark[s] }), h('span', { text: step }),
        h('small', { class: 'sr-only', text: ' — ' + note[s] }),
        s === 'current' ? h('small', { class: 'progress-bytes', 'aria-hidden': 'true', text: detail() }) : null); })),
      run.message ? h('p', { class: 'progress-message', text: run.message }) : null,
      run.state !== 'running' ? h('button', { class: 'btn soft progress-close', type: 'button', onclick: () => hide() }, 'Close') : null].filter(Boolean));
  };
  const end = (state, message) => {
    if (!run || run.state !== 'running') return;
    if (state === 'failed' && run.unknown) state = 'unknown';
    run.state = state; run.bytes = null; run.count = null; if (message) run.message = message; draw();
    clearTimeout(hideTimer); if (state === 'done') { const ended = run; hideTimer = setTimeout(() => { if (run === ended) hide(); }, 5000); }
  };
  return {
    start(plan) {
      clearTimeout(hideTimer);
      run = { title: plan.title, steps: [...plan.steps], current: 0, state: 'running', bytes: null, count: null, waiting: false, message: '', said: false, unknown: false, base: -1 };
      $('#toast').hidden = true; draw();
      return {
        step(index) { if (run?.state === 'running' && index > run.current && index < run.steps.length) { run.current = index; run.bytes = null; run.count = null; run.message = ''; draw(); } },
        measure(sent, total) { if (run?.state === 'running' && total > 0) { run.bytes = { sent: Math.min(sent, total), total }; draw(); } },
        // The server's own steps ({ id, label, state, done?, total? }), from GET /jobs/:id. The first report replaces
        // the card's current step and the ones after it; the current step is the first one the server has not finished.
        server(list) {
          if (run?.state !== 'running' || !Array.isArray(list) || !list.length) return;
          if (run.base < 0) { run.base = run.current; run.steps = [...run.steps.slice(0, run.base), ...list.map(item => String(item.label))]; }
          let index = list.findIndex(item => item.state !== 'done'); if (index < 0) index = list.length - 1;
          const item = list[index], counted = Number.isInteger(item.done) && Number.isInteger(item.total) && item.total > 0 && item.done >= 0 && item.done <= item.total;
          if (run.base + index !== run.current) run.message = '';
          run.current = run.base + index; run.bytes = null; run.count = counted ? { done: item.done, total: item.total, unit: COUNT_UNITS[item.id] || '' } : null;
          run.waiting = item.state === 'waiting'; draw();
        },
        finish(message) { end('done', message); },
        fail(message) { end('failed', message); },
        settle() { if (run?.state === 'running') { if (run.said) end('failed', run.message); else hide(); } },
      };
    },
    // While an action runs, its messages go into its card. Other messages show above a card that stays open.
    take(text) {
      if (!run || text === WAIT_TEXT) return false;
      if (run.state === 'done') { hide(); return false; }
      if (run.state !== 'running') return false;
      run.message = text; run.said = true; draw(); return true;
    },
    visible() { return Boolean(run); },
    // The server's answer was lost or unreadable: whatever message follows, the card cannot end as a plain failure.
    uncertain() { if (run?.state === 'running') run.unknown = true; },
    keep() { if (run && card) attach(card); },
  };
})();
// progress:end
// AUD-C09: one lock for every action that writes (save, publish, upload, restore, reply).
// While one runs, every other writing control of the screen is disabled and a second action is refused,
// so Publish and Save on the same form, or an upload during a publish, can never send two requests.
// lock:start
const WAIT_TEXT = 'Please wait: the previous action is still running.';
const WRITING_CONTROLS = '.bar button, .bar-inline button, .top .btn, .top .menu > button, .compose button, .drop input, .file-actions button, .person button, label.check input';
const lock = { active: false };
async function busy(control, work, waitText = '') {
  if (lock.active) { toast(WAIT_TEXT); return undefined; }
  lock.active = true;
  const scope = $('#main');
  const frozen = [...new Set([control, ...(scope ? scope.querySelectorAll(WRITING_CONTROLS) : [])])].filter(el => el && !el.disabled);
  for (const el of frozen) el.disabled = true;
  control?.setAttribute('aria-busy', 'true'); scope?.setAttribute('aria-busy', 'true');
  // A plan ({ title, steps }) shows a step-by-step card; a plain text keeps the simple waiting message.
  const steps = waitText && typeof waitText === 'object' ? progressCard.start(waitText) : null;
  if (waitText && !steps) toast(waitText, { stay: true });
  try { return await work(steps); }
  catch (error) { const text = error.message || 'The server could not do that. Please try again.'; if (steps) steps.fail(text); else toast(text, { stay: Boolean(error.unknown) }); return undefined; }
  finally {
    steps?.settle();
    lock.active = false;
    for (const el of frozen) el.disabled = false;
    control?.removeAttribute('aria-busy'); scope?.removeAttribute('aria-busy');
    if (waitText && !steps && toast.staying) { toast.staying = false; $('#toast').hidden = true; }
  }
}
// lock:end
const writer = (work, waitText) => event => busy(event.currentTarget, steps => work(event, steps), waitText);
// Step plans. Each step name says what is being confirmed; the server confirms each one before the next starts.
// The last step of a publication, a restore or a file check is replaced by the server's own steps when it reports
// them (content check, build and check of each version, then install; or format, pages, saving for a file).
const PLAN = {
  save: { title: 'Saving', steps: ['Saving the draft'] },
  publish: { title: 'Publishing', steps: ['Saving the draft', 'Publishing the site'] },
  publishOnly: { title: 'Publishing', steps: ['Publishing the site'] },
  restore: { title: 'Going back to this version', steps: ['Restoring and publishing the site'] },
  file: { title: 'Adding the file', steps: ['Reading the file', 'Uploading', 'Checking the file on the server'] },
  photo: { title: 'Adding the photo', steps: ['Reading the photo', 'Uploading', 'Preparing the photo on the server'] },
};
// Reading the chosen file happens inside the lock too, so a publish cannot start between choosing and sending it.
// onProgress receives the bytes the browser has really read (FileReader progress events).
const readBase64 = (file, onProgress) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('This file could not be read. Please choose it again.')); if (onProgress) reader.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded, event.total); }; reader.readAsDataURL(file); });
const when = iso => { const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const initials = name => { const words = name.trim().split(/\s+/).filter(Boolean); return ((words[0]?.[0] || '') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase(); };

// ---------- What the site contains, in the order the owners see it on the site ----------
const SECTIONS = [
  { group: 'Home', items: [{ slug: 'home', title: 'Home titles, text and Croak', hint: 'Headings, TV screens and menu labels', kind: 'page' }, { slug: 'legal', title: 'Legal', hint: 'Short text and the PDF', kind: 'page' }] },
  { group: 'Advertising', items: [
    { slug: 'case-studies', title: 'Case Studies', hint: 'Your case studies', kind: 'case' },
    { slug: 'client-work', title: 'Client Work', hint: 'Work for your clients', kind: 'work' },
    { slug: 'mock-ads', title: 'Mock Ads', hint: 'Ads you imagined', kind: 'work' }] },
  { group: 'Creative', items: [
    { slug: 'photography', title: 'Photography', hint: 'Photos', kind: 'work' },
    { slug: 'films-videos', title: 'Films & Videos', hint: 'YouTube or Vimeo videos', kind: 'work' },
    { slug: 'music', title: 'Music', hint: 'Spotify, SoundCloud or Bandcamp links', kind: 'work' },
    { slug: 'magazine', title: 'Magazine', hint: 'Articles and zines', kind: 'work' },
    { slug: 'collabs', title: 'Collabs', hint: 'Collaborations', kind: 'work' },
    { slug: 'events-shows', title: 'Events & Shows', hint: 'Dates and places', kind: 'event' }] },
  { group: 'PR', items: [
    { slug: 'press', title: 'Press', hint: 'Where people talk about you', kind: 'press' },
    { slug: 'media-relations', title: 'Media Relations', hint: 'Media relations', kind: 'press' },
    { slug: 'influencer-relations', title: 'Influencer Relations', hint: 'Creators and influencers', kind: 'press' },
    { slug: 'events-launches', title: 'Events & Launches', hint: 'Launches', kind: 'event' }] },
  { group: 'The pond', items: [
    { slug: 'about', title: 'About', hint: 'Your story and the team', kind: 'page' },
    { slug: 'contact', title: 'Contact', hint: 'Email and social links', kind: 'page' },
    { slug: 'join', title: 'Join Us', hint: 'Intro and open positions', kind: 'page' }] },
];
const retired = new Set(['music','media-relations','influencer-relations','events-launches']);
const archiveItems = SECTIONS.flatMap(group=>group.items).filter(item=>retired.has(item.slug));
for(const group of SECTIONS) group.items=group.items.filter(item=>!retired.has(item.slug));
SECTIONS.find(g=>g.group==='PR').items.push(...['prc','recognition','statements'].map(slug=>({slug,title:slug==='prc'?'PRC':slug[0].toUpperCase()+slug.slice(1),hint:'Studio updates',kind:'work'})));
SECTIONS.find(g=>g.group==='Home').items.push({slug:'gram',title:'Gram',hint:'Behind-the-scenes photos and videos',kind:'work'});
SECTIONS.push({group:'Archived sections — existing content preserved',items:archiveItems});
for(const group of SECTIONS) group.items.sort((a,b)=>a.title.localeCompare(b.title,'en'));
const sectionOf = slug => siteTree?.fields.nodes.some(n=>n.id===slug)?nodeSection(siteTree.fields.nodes.find(n=>n.id===slug)):SECTIONS.flatMap(group => group.items).find(item => item.slug === slug);
const NOUN = { case: 'case study', work: 'project', event: 'event', press: 'article' };

// Fields, in plain words. Limits mirror the public validator (src/data/site-content.js and case-studies.js).
const FIELDS = {
  case: [
    { name: 'title', label: 'Title', max: 90, required: true },
    { name: 'summary', label: 'One sentence', max: 240, required: true, area: true, hint: 'Shown under the thumbnail.' },
    { name: 'cover', label: 'Thumbnail', type: 'image', required: true, hint: 'The picture visitors see in the grid, like a video thumbnail. A first page of the PDF works well.' },
    { name: 'brandLogo', label: 'Brand logo', type: 'image', optional: true, hint: 'Shown in the corner of the thumbnail.' },
    { name: 'documentId', label: 'Full case study (PDF)', type: 'file', kind: 'pdf', optional: true, hint: 'Visitors open it by clicking the thumbnail. One PDF, up to 10 MB and 100 pages. Word files are not accepted: save them as PDF first.' },
    { name: 'client', label: 'Which client?', max: 90, optional: true },
    { name: 'context', label: 'The background', max: 4000, required: true, unlessFilled: 'documentId', area: true, hint: 'Not needed when you add the full case study as a PDF.' },
    { name: 'work', label: 'What you did', max: 4000, required: true, unlessFilled: 'documentId', area: true, hint: 'Not needed when you add the full case study as a PDF.' },
    { name: 'gallery', label: 'More photos', type: 'gallery', optional: true, hint: 'Up to 12 photos.' },
    { name: 'results', label: 'The results', max: 1500, optional: true, area: true }],
  work: [
    { name: 'title', label: 'Title', max: 90, required: true },
    { name: 'date', label: 'When?', type: 'month', required: true, hint: 'The most recent show first.' },
    { name: 'summary', label: 'In one or two sentences', max: 240, required: true, area: true },
    { name: 'image', label: 'Photo', type: 'image', required: true },
    { name: 'client', label: 'Which client?', max: 90, optional: true },
    { name: 'gallery', label: 'More photos', type: 'gallery', optional: true, hint: 'Up to 12 photos.' },
    { name: 'videoId', label: 'Video file', type: 'file', kind: 'video', optional: true, hint: 'MP4 (H.264) or WebM, up to 10 MB and 60 seconds. For a longer video, use a YouTube or Vimeo link below.' },
    { name: 'video', label: 'Video link', type: 'url', optional: true, hint: 'A YouTube or Vimeo link.' },
    { name: 'audio', label: 'Listening link', type: 'url', optional: true, hint: 'A Spotify, SoundCloud or Bandcamp link.' },
    { name: 'link', label: 'Project link', type: 'url', optional: true }],
  event: [
    { name: 'title', label: 'Event name', max: 90, required: true },
    { name: 'start', label: 'Starts', type: 'datetime-local', required: true },
    { name: 'end', label: 'Ends', type: 'datetime-local', optional: true },
    { name: 'venue', label: 'Venue', max: 90, required: true },
    { name: 'city', label: 'City', max: 90, optional: true },
    { name: 'description', label: 'A few words', max: 1500, optional: true, area: true },
    { name: 'image', label: 'Poster or photo', type: 'image', optional: true },
    { name: 'link', label: 'Tickets or info link', type: 'url', optional: true }],
  press: [
    { name: 'title', label: 'Article title', max: 160, required: true },
    { name: 'outlet', label: 'Outlet or partner', max: 90, required: true },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'url', label: 'Article link', type: 'url', required: true },
    { name: 'quote', label: 'A line to quote', max: 200, optional: true }],
};
const PAGES = {
  home: { title: 'Home titles, text and Croak', small: 'Headings and text shown on your website', lead: ['Use Publish to the site, at the bottom, to save and publish this page.', 'An empty optional text is simply not shown on the site.'], fields: [
    ...[
      ['homeLatestTitle','Latest work heading — Fresh from the pond',true],
      ['homeLatestKicker','Label above latest work',false],
      ['homeNewsTitle',"News heading — What's happening",true],
      ['homeNewsKicker','Label above the news',false],
      ['homeTeamTitle',"Team heading — Who's in the pond (version B)",true],
      ['homeTeamKicker','Label above the team (version B)',false],
      ['homeContactTitle','Contact heading',true],
      ['homeGramDescription','Ribbit introduction',false],
      ['homeCroakLink','Croak link text',false]
    ].map(([key,label,required])=>({name:'editorial_'+key,label,max:120,required,optional:!required})),
    ...[
      ['grandCentral','Home subtitle',240],['tagline','Tagline, under the frogs on the home page',240],['croakTitle','Croak — song title',240],['croakText','Croak — description',240],['croakUrl','Croak — listening link (opened by “Tune in”)',300]
    ].map(([key,label,max])=>({name:'editorial_'+key,label,max,optional:true,type:key==='croakUrl'?'url':undefined})),
    ...Object.entries({advertising:'Advertising',creative:'Creative',pr:'PR','case-studies':'Case Studies','client-work':'Client Work','mock-ads':'Mock Ads',collabs:'Collabs','events-shows':'Events & Shows','films-videos':'Films & Videos',magazine:'Magazine',photography:'Photography',press:'Press',prc:'PRC',recognition:'Recognition',statements:'Statements',about:'About',contact:'Contact',join:'Join Us',legal:'Legal',gram:'Gram',croak:'Croak',announcements:'Announcements',recents:'Recents'}).map(([key,label])=>({name:'navigation_'+key,label:'Navigation label — '+label,max:40,required:true})),

    { name: 'announcementTitle', label: 'Announcement title', max: 60, optional: true, hint: 'Shown in “What\'s happening”, further down the home page. Leave the title and the text empty to hide the announcement.' },
    { name: 'announcementText', label: 'Announcement text', max: 140, optional: true, area: true },
    { name: 'gramLabel', label: 'Ribbit screen text (version B)', max: 40, required: true },
    { name: 'gramUrl', label: 'Instagram link, shown under Ribbit', type: 'url', optional: true }] },
  about: { title: 'About', small: 'About page', lead: ['Each part has its own title. A part whose text is empty is not shown on the site.'], fields: [
    { name: 'storyTitle', label: 'Title — Our Story', max: 120, optional: true },
    { name: 'story', label: 'Our Story', max: 4000, optional: true, area: true },
    { name: 'ethosTitle', label: 'Title — Our Ethos', max: 120, optional: true },
    { name: 'ethos', label: 'Our Ethos', max: 4000, optional: true, area: true },
    { name: 'manifestoTitle', label: 'Title — Our Manifesto', max: 120, optional: true },
    { name: 'manifesto', label: 'Our Manifesto', max: 4000, optional: true, area: true },
    { name: 'differentiatorTitle', label: 'Title — What makes you different', max: 120, optional: true },
    { name: 'differentiator', label: 'What makes you different', max: 4000, optional: true, area: true },
    { name: 'photos', label: 'Photos', type: 'gallery', optional: true, hint: 'Up to 6 photos.', limit: 6 },
    { name: 'teamTitle', label: 'Title — the team', max: 120, optional: true },
    { name: 'teamText', label: 'A few words about the team', max: 4000, optional: true, area: true },
    { name: 'team', label: 'The team', type: 'rows', columns: [['name', 'Name', 90], ['role', 'Role', 90]], add: 'Add a person', limit: 24 },
    { name: 'extendedTeamTitle', label: 'Title — the extended team', max: 120, optional: true },
    { name: 'extendedTeamText', label: 'A few words about the extended team', max: 4000, optional: true, area: true },
    { name: 'extendedTeam', label: 'The extended team', type: 'rows', columns: [['name', 'Name', 90], ['role', 'Role', 90]], add: 'Add a person', limit: 24 }] },
  contact: { title: 'Contact', small: 'Contact page', fields: [
    { name: 'title', label: 'Title of the form — Write to us', max: 120, optional: true },
    { name: 'intro', label: 'Welcome line', max: 600, required: true, area: true },
    { name: 'email', label: 'Email address shown', type: 'email', optional: true },
    { name: 'socialTitle', label: 'Title — Social channels', max: 120, optional: true },
    { name: 'socialText', label: 'A few words above your social links', max: 600, optional: true, area: true },
    { name: 'socials', label: 'Social links', type: 'rows', columns: [['label', 'Name (e.g. Instagram)', 40], ['url', 'Link', 300]], add: 'Add a link', limit: 6, hint: 'Instagram, LinkedIn, Vimeo and YouTube links also appear in the blue bar at the bottom of every page. A network without a link is not shown.' }] },
  legal: { title: 'Legal', small: 'Legal page', lead: ['One PDF holds your Privacy Policy and Terms of Service. Until you add it, the page only shows the short text.'], fields: [
    { name: 'intro', label: 'Short text', max: 600, optional: true, area: true },
    { name: 'documentId', label: 'Privacy Policy and Terms of Service (PDF)', type: 'file', kind: 'pdf', optional: true, hint: 'One PDF, up to 10 MB and 100 pages.' }] },
  join: { title: 'Join Us', small: 'Join Us page', fields: [
    { name: 'intro', label: 'Welcome line', max: 1200, required: true, area: true },
    { name: 'positions', label: 'Open positions', type: 'rows', columns: [['title', 'Position', 90], ['type', 'Type (e.g. full time)', 40]], add: 'Add a position', limit: 10, hint: 'With no open position, the site invites open applications.' }] },
};

PAGES.home.fields=PAGES.home.fields.filter(field=>!field.name.startsWith('navigation_'));
// ---------- API client ----------
// api:start
// A write whose answer was lost (connection cut, proxy error page, unreadable reply) may still have happened on the
// server. Pond Desk then says the result is unknown and where to check; it never says "Done" or "nothing changed",
// and it never sends the write again on its own.
const UNKNOWN = {
  publish: 'Pond Desk lost the server’s answer, so the result is unknown: the site may or may not have been updated. Check Settings → Site history before publishing again.',
  file: 'Pond Desk lost the server’s answer, so the result is unknown: the file may have been added. Reload this screen and look at the files before adding it again.',
  save: 'Pond Desk lost the server’s answer, so the result is unknown: your change may have been saved. Copy what you need, then reload this screen to check before saving again.',
};
const unknownKind = path => /\/(publish|restore)$/.test(path) ? 'publish' : /^\/(files|media)$/.test(path) ? 'file' : 'save';
function uncertain(path, extra = '') {
  progressCard.uncertain();
  return Object.assign(new Error(UNKNOWN[unknownKind(path)] + extra), { status: 0, unknown: true, code: '', diagnostics: [] });
}
// An answer 202 to a request sent with Prefer: respond-async: the server accepted a job (see followJob).
const ACCEPTED = Symbol('accepted');
const readJson = text => { if (typeof text !== 'string' || !text.trim()) return undefined; try { return JSON.parse(text); } catch { return undefined; } };
// One reading of every answer (fetch or upload). A success needs a readable JSON body; an error needs the server's own
// JSON message to count as a known failure. Anything else after a write is an unknown result.
function settleAnswer(method, path, status, text) {
  const data = readJson(text), write = method !== 'GET';
  if (status >= 200 && status < 300) {
    if (data !== undefined) return data;
    if (write) throw uncertain(path);
    throw Object.assign(new Error('The server sent an answer Pond Desk could not read. Reload the page, then try again.'), { status: 0, code: 'protocol', diagnostics: [] });
  }
  if (write && !(data && typeof data.message === 'string')) throw uncertain(path);
  const error = new Error(data?.message || 'The server could not do that. Please try again.'); error.status = status; error.code = data?.code || ''; error.diagnostics = data?.diagnostics || []; throw error;
}
async function call(method, path, body, { prefer = '' } = {}) {
  let response, text;
  try {
    response = await fetch(API + path, { method, headers: { 'X-Editor-Token': state.token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    text = await response.text();
  } catch {
    if (method !== 'GET') throw uncertain(path);
    throw Object.assign(new Error('The connection was lost before the server answered. Check your connection, then try again.'), { status: 0, diagnostics: [] });
  }
  if (prefer && response.status === 202) return { [ACCEPTED]: readJson(text) };
  return settleAnswer(method, path, response.status, text);
}
// Same as call(), for uploads: the browser reports the bytes really sent. When the last byte has left,
// the next step (the server's own check) starts; its length is unknown until the server answers or reports it.
function upload(path, body, steps, { prefer = '' } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', API + path); request.withCredentials = true;
    request.setRequestHeader('X-Editor-Token', state.token); request.setRequestHeader('Content-Type', 'application/json');
    if (prefer) request.setRequestHeader('Prefer', prefer);
    request.upload.onprogress = event => { if (event.lengthComputable) steps?.measure(event.loaded, event.total); };
    request.upload.onload = () => steps?.step(2);
    request.onerror = request.onabort = request.ontimeout = () => reject(uncertain(path));
    request.onload = () => { try { resolve(prefer && request.status === 202 ? { [ACCEPTED]: readJson(request.responseText) } : settleAnswer('POST', path, request.status, request.responseText)); } catch (error) { reject(error); } };
    request.send(JSON.stringify(body));
  });
}
// Long operations (publishing, restoring, checking a PDF or a video) ask the server to answer at once with a job
// (HTTP 202) and report its real steps at GET /jobs/:id. 202 only means "accepted"; a poll answered 200 only means
// "still known": success is state "done", and its result is exactly what the direct request would have returned.
// A server without jobs answers the request directly, which is a confirmed result too.
// Polling: every second, then every 3 seconds. A short network cut is retried (reading is safe); a lost job (404 after
// a restart or expiry), a lost sign-in, an unreadable reply or a longer cut ends with an unknown result.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const POLL_FAST = 1000, POLL_SLOW = 3000, POLL_FAST_COUNT = 10, POLL_CUTS = 3;
async function followJob(path, accepted, steps) {
  const id = accepted && typeof accepted === 'object' && accepted.job && typeof accepted.job.id === 'string' && /^[\w-]{1,100}$/.test(accepted.job.id) ? accepted.job.id : '';
  if (!id) throw uncertain(path);
  for (let poll = 0, cuts = 0; ; poll++) {
    await pause(poll < POLL_FAST_COUNT ? POLL_FAST : POLL_SLOW);
    let response, text;
    try { response = await fetch(`${API}/jobs/${id}`, { headers: { 'X-Editor-Token': state.token }, credentials: 'same-origin' }); text = await response.text(); }
    catch { if (++cuts < POLL_CUTS) continue; throw uncertain(path); }
    cuts = 0;
    if (response.status === 401 || response.status === 403) throw uncertain(path, ' Your sign-in may have expired: reload the page to sign in again.');
    const job = response.ok ? readJson(text) : undefined;
    if (!job || typeof job !== 'object' || !['running', 'done', 'failed'].includes(job.state) || !Array.isArray(job.steps)) throw uncertain(path);
    steps?.server(job.steps);
    if (job.state === 'done') return job.result ?? {};
    if (job.state === 'failed') {
      const failure = job.error && typeof job.error === 'object' ? job.error : {};
      throw Object.assign(new Error(typeof failure.message === 'string' && failure.message ? failure.message : 'The server could not finish. Check Settings → Site history before trying again.'), { status: Number(failure.status) || 500, code: failure.code || '', diagnostics: Array.isArray(failure.diagnostics) ? failure.diagnostics : [] });
    }
  }
}
// A long write: one request, then its job. Same answer as call() when it succeeds.
async function track(path, body, steps) {
  if (!steps) return call('POST', path, body);
  const answer = await call('POST', path, body, { prefer: 'respond-async' });
  return answer && typeof answer === 'object' && ACCEPTED in answer ? followJob(path, answer[ACCEPTED], steps) : answer;
}
async function trackUpload(path, body, steps) {
  const answer = await upload(path, body, steps, { prefer: 'respond-async' });
  return answer && typeof answer === 'object' && ACCEPTED in answer ? followJob(path, answer[ACCEPTED], steps) : answer;
}
// api:end
// AUD-C07: when the server does not answer (restart, deployment), say so and retry every 10 seconds. Never show invented content.
const RETRY_SECONDS = 10;
function waitingScreen(status) {
  clearTimeout(waitingScreen.timer);
  const signIn = status === 401 || status === 403;
  const retry = h('button', { class: 'btn main', type: 'button', onclick: () => { clearTimeout(waitingScreen.timer); retry.disabled = true; retry.setAttribute('aria-busy', 'true'); start(); } }, 'Retry');
  const box = $('#waiting') || h('section', { class: 'waiting', id: 'waiting', role: 'status', 'aria-live': 'polite' });
  box.replaceChildren(h('div', { class: 'panel' }, h('p', { class: 'frog', 'aria-hidden': 'true' }, '🐸'),
    h('h2', { text: signIn ? 'Please sign in again' : 'The server is starting…' }),
    h('p', { text: signIn ? 'Your sign-in has expired. Reload the page to get a new code.' : location.protocol === 'file:' ? 'Pond Desk needs its server. On this computer, start it with “npm run dev:editor”, then open the address it shows.' : `This can take a minute after an update. Trying again every ${RETRY_SECONDS} seconds.` }),
    h('div', { class: 'bar-inline' }, retry)));
  if (!box.isConnected) document.body.prepend(box);
  $('#app').hidden = true; box.hidden = false;
  if (!signIn && location.protocol !== 'file:') waitingScreen.timer = setTimeout(start, RETRY_SECONDS * 1000);
}
async function start() {
  let session = null, status = 0;
  if (location.protocol !== 'file:') {
    try { const response = await fetch(API + '/session', { credentials: 'same-origin' }); status = response.status; if (response.ok) session = await response.json(); }
    catch { status = 0; }
  }
  if (session) {
    clearTimeout(waitingScreen.timer); $('#waiting')?.remove(); $('#app').hidden = false;
    state.token = session.token || ''; state.me = session.user?.email || ''; state.mode = session.mode || ''; state.deployment = session.deployment || (session.mode === 'hosted-test' ? 'hosted' : 'local'); state.publicUrls = session.publicUrls || {}; state.mail = session.mail || '';
    // Which public versions exist: given by the server when it knows (publicVariants), else both only on this computer.
    state.publicB = Array.isArray(session.publicVariants) ? session.publicVariants.includes('b') : state.deployment === 'local';
    const band = $('#notice-band');
    if (state.mail === 'simulated') { band.textContent = state.deployment === 'local' ? 'Test version on this computer: everything is really saved, but no email goes out.' : 'Emails are not sent yet.'; band.classList.add('local'); band.hidden = false; }
    else band.hidden = true;
  } else return waitingScreen(status);
  $('#me').textContent = initials(state.me.split('@')[0].replace(/[._-]/g, ' ') || 'FP');
  showSpace('site'); void refreshCounts();
}
async function refreshCounts() {
  try {
    const counts = await call('GET', '/counts');
    for (const box of ['cv', 'msg']) {
      const pill = $(`#pill-${box}`); pill.hidden = !counts[box]; pill.textContent = counts[box];
    }
  } catch { /* Keep the last known counts when the server is unavailable. */ }
}

// ---------- Navigation ----------
function setPane(pane) { $('#app').dataset.pane = pane; }
function guardLeave() { return !state.dirty || confirm('You have unsaved changes. Discard them?'); }
function showSpace(space) {
  if (!guardLeave()) return; state.dirty = false; state.space = space;
  document.querySelectorAll('.rail [data-space]').forEach(button => button.toggleAttribute('aria-current', button.dataset.space === space));
  document.querySelector(`.rail [data-space="${space}"]`).setAttribute('aria-current', 'page');
  $('#search').value = ''; setPane('list');
  ({ site: listSite, cv: () => listInbox('cv'), msg: () => listInbox('msg'), set: listSettings })[space]();
}
function topBar({ title, small, actions = [] }) {
  return h('div', { class: 'top' }, h('button', { class: 'back', type: 'button', 'aria-label': 'Back', onclick: () => { if (guardLeave()) { state.dirty = false; setPane('list'); } } }, '←'),
    h('div', { class: 'grow' }, h('h2', { text: title }), small ? h('small', { text: small }) : null), ...actions);
}
function main(...children) { const box = $('#main'); box.replaceChildren(...children.filter(child => child !== null && child !== undefined && child !== false)); progressCard.keep(); setPane('main'); box.focus({ preventScroll: true }); }
function welcome(text) { $('#main').replaceChildren(h('div', { class: 'welcome' }, h('div', {}, h('p', { class: 'frog', 'aria-hidden': 'true' }, '🐸'), h('p', { text })))); }
function markCurrent(list, current) { list.querySelectorAll('.row').forEach(row => row.setAttribute('aria-current', String(row === current))); }

// ---------- Space: the site ----------
let siteTree=null;
const editableKinds={works:'work',events:'event',press:'press','case-studies':'case',about:'page',contact:'page',join:'page',legal:'page'};
const nodeSection=node=>({slug:node.id,title:node.title,kind:editableKinds[node.kind]||'structure',node});
const rootZones=[{id:'menus',title:'Frog menus'},{id:'screens',title:'Lily-pad screens'},{id:'stones',title:'Stone links'},{id:'footer',title:'Footer links'},{id:'archive',title:'Hidden sections'}];
const treeChildren=id=>siteTree.fields.nodes.filter(n=>n.parentId===id);
async function saveTree(tree){siteTree=await call('PUT','/structure',{revision:siteTree.revision,structure:tree});state.dirty=false;await listSite(false);}
async function publishTree(steps){try{await track('/structure/publish',{revision:siteTree.revision},steps);steps?steps.finish('Site layout published ✓'):toast('Site layout published ✓');siteTree=await call('GET','/structure');await listSite(false);}catch(e){toast(e.message);}}
const publishTreeButton=event=>busy(event.currentTarget,publishTree,PLAN.publishOnly);
async function listSite(showWelcome=true){
 $('#list-title').textContent='Site zones';$('#search').placeholder='Search sections';
 try{siteTree=await call('GET','/structure');}catch(e){toast(e.message);return;}
 const body=$('#list-body');body.replaceChildren();
 body.append(h('button',{class:'row',type:'button','data-search':'home titles text croak',onclick:()=>{if(guardLeave())openPage('home');}},h('span',{class:'badge','aria-hidden':'true',text:'H'}),h('span',{class:'row-text'},h('b',{text:'Home titles & text, and Croak'}),h('small',{text:'Edit your existing site content'})),h('span',{class:'row-meta'})));
 body.append(h('button',{class:'row',type:'button','data-search':'site wording small texts buttons labels messages',onclick:()=>{if(guardLeave()){state.dirty=false;openWording();}}},h('span',{class:'badge','aria-hidden':'true',text:'W'}),h('span',{class:'row-text'},h('b',{text:'Site wording'}),h('small',{text:'Buttons, labels and short messages on every page'})),h('span',{class:'row-meta'})));
 const render=(node,depth=0)=>{
  const row=h('div',{class:'tree-node','data-search':node.title.toLowerCase(),style:`--tree-depth:${Math.min(depth,5)}`},
   h('button',{class:'tree-open',type:'button',onclick:()=>{if(guardLeave()){state.dirty=false;openNode(node.id);}}},node.title,h('small',{text:node.visible?'':'Hidden — content kept'})),
   null);
  const wrap=h('div',{class:'tree-branch'},row,...treeChildren(node.id).map(child=>render(child,depth+1)));return wrap;
 };
 for(const zone of siteTree.zones??rootZones){const roots=treeChildren(null).filter(n=>n.zone===zone.id);body.append(h('section',{class:'tree-zone'},h('div',{class:'tree-zone-head'},h('h3',{text:zone.title})),...roots.map(n=>render(n)),!roots.length?h('p',{class:'hint',text:'No sections in this zone.'}):null));}
 if(showWelcome)main(topBar({title:'Your site, zone by zone',small:'Choose an existing section to change its name or edit its content.',actions:[h('button',{class:'btn main',type:'button',onclick:publishTreeButton},'Publish layout')]}),h('div',{class:'body'},h('div',{class:'panel'},h('h3',{text:'Changes stay in draft until you publish'}),h('p',{text:'Your site structure is already set up. Change names and content without creating pages or changing their addresses.'})),...rootZones.filter(z=>z.id!=='archive').map(zone=>h('div',{class:'panel zone-card'},h('h3',{text:zone.title}),h('p',{text:({menus:'The frogs on the wooden raft and their existing menu links.',screens:'The lily pads and their screens on the pond.',stones:'The stone links around the pond.',footer:'Links at the bottom of the pages.'})[zone.id]})))));
 if(showWelcome&&matchMedia('(max-width:860px)').matches)setPane('list');
}
const SCREEN_MESSAGE_MAX=14;
const graphemes=typeof Intl==='object'&&Intl.Segmenter?new Intl.Segmenter('en',{granularity:'grapheme'}):null;
const screenChars=text=>graphemes?[...graphemes.segment(text)].length:[...text].length;
function screenMessageProblem(value){
 if(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(value))return 'Use plain text on one line.';
 const extra=screenChars(value.trim())-SCREEN_MESSAGE_MAX;
 return extra>0?`Up to ${SCREEN_MESSAGE_MAX} characters, spaces included. Remove ${extra} ${extra===1?'character':'characters'}.`:'';
}
function openNode(id){
 const node=siteTree.fields.nodes.find(n=>n.id===id);if(!node)return;
 const name=h('input',{class:'text',id:'section-title',maxlength:60});name.value=node.title;
 const text=h('textarea',{class:'text',id:'section-text',maxlength:12000,rows:6});text.value=node.text;
 const href=h('input',{class:'text',id:'section-link',maxlength:300});href.value=node.href;
 const visible=h('input',{id:'section-visible',type:'checkbox'});visible.checked=node.visible;
 const newTab=h('input',{id:'section-new-tab',type:'checkbox'});newTab.checked=node.newTab;
 // Lily-pad screens only: an optional message inside the TV, the same on A and B. The counter and the check
 // count what a reader sees as characters (an emoji or an accented letter counts once), spaces included.
 const message=node.zone==='screens'?h('input',{class:'text',id:'section-message',maxlength:240,autocomplete:'off','aria-describedby':'section-message-count section-message-hint section-message-error'}):null;
 const messageCount=h('span',{class:'counter',id:'section-message-count'}),messageError=h('p',{class:'error',id:'section-message-error','aria-live':'polite',hidden:true});
 const messageOk=()=>{if(!message)return true;const problem=screenMessageProblem(message.value);const length=screenChars(message.value.trim());
  messageCount.textContent=length+'/'+SCREEN_MESSAGE_MAX;messageCount.classList.toggle('over',length>SCREEN_MESSAGE_MAX);
  message.setAttribute('aria-invalid',problem?'true':'false');messageError.textContent=problem;messageError.hidden=!problem;return !problem;};
 if(message){message.value=node.message??'';message.addEventListener('input',messageOk);messageOk();}
 const fields=h('form',{class:'form',onsubmit:e=>e.preventDefault(),oninput:()=>{state.dirty=true;}},
 h('div',{class:'field'},h('label',{for:name.id,text:'Section name'}),name),
 message?h('div',{class:'field screen-message-field'},h('div',{class:'label-row'},h('label',{for:message.id},'Screen message ',h('span',{class:'opt',text:'(optional)'})),messageCount),message,h('p',{class:'hint',id:'section-message-hint',text:'Shown inside this TV screen on both designs (A and B). Leave it empty to show only the arrow.'}),messageError):null,
 h('label',{class:'check-label'},visible,' Show in navigation'),h('label',{class:'check-label'},newTab,' Open in a new tab'),
 ['menu','page'].includes(node.kind)?h('div',{class:'field'},h('label',{for:text.id,text:'Page text'}),text):null,
 ['link','anchor'].includes(node.kind)?h('div',{class:'field'},h('label',{for:href.id,text:'Link (HTTPS, page.html or #section)'}),href):null,
 h('p',{class:'hint',text:node.slug?'Address: '+node.slug+'.html — kept when you rename this section.':'A link has no page of its own.'}));
 const save=async(steps,publishing)=>{if(!messageOk()){message?.focus();return false;}try{const draft=structuredClone(siteTree.fields),edited=draft.nodes.find(n=>n.id===id);Object.assign(edited,{title:name.value.trim(),text:text.value,href:href.value.trim(),visible:visible.checked,newTab:newTab.checked});if(message&&(message.value.trim()||'message' in edited))edited.message=message.value.trim();await saveTree(draft);if(publishing)steps?.step(1);else steps?steps.finish('Layout draft saved ✓ Not on the site yet.'):toast('Layout draft saved ✓');if(!publishing)openNode(id);return true;}catch(e){toast(e.message);return false;}};
 const actions=[h('button',{class:'btn main',type:'button',onclick:writer(async(event,steps)=>{if(await save(steps,true)){await publishTree(steps);openNode(id);}},PLAN.publish)},'Save and publish')];
 const content=editableKinds[node.kind]?h('button',{class:'btn soft',type:'button',onclick:()=>{if(guardLeave()){state.dirty=false;openSection(node.id);}}},'Edit content'):node.kind==='croak'?h('button',{class:'btn soft',type:'button',onclick:()=>{if(guardLeave())openPage('home');}},'Edit text'):null;
 main(topBar({title:node.title,small:'Section settings — '+(rootZones.find(z=>z.id===node.zone)?.title??node.zone),actions}),h('div',{class:'body'},fields,h('div',{class:'bar-inline'},h('button',{class:'btn soft',type:'button',onclick:writer((event,steps)=>save(steps,false),PLAN.save)},'Save draft'),content),
 node.kind==='menu'&&node.zone==='menus'?h('section',{class:'panel'},h('h3',{text:'Subsections'}),...treeChildren(id).map(child=>h('button',{class:'row',type:'button',onclick:()=>{if(guardLeave())openNode(child.id);}},child.title))):null));
}

async function openSection(slug) {
  const section = sectionOf(slug); state.section = section;
  if (section.kind === 'page') return openPage(slug);
  if(section.kind === 'structure')return openNode(slug);
  const [items, intros] = await Promise.all([call('GET', `/items?section=${slug}`), call('GET', '/pages/intros').catch(() => ({ fields: {} }))]);
  const intro = h('textarea', { class: 'text', id: 'intro', maxlength: '240', rows: '2' }); intro.value = intros.fields?.[slug] || '';
  const saveIntro = h('button', { class: 'btn soft', type: 'button', onclick: writer(async (event, steps) => {
    try { const fields = { ...(intros.fields || {}), [slug]: intro.value.trim() }; const saved = await call('PUT', '/pages/intros', { revision: intros.revision, fields }); intros.revision = saved.revision; intros.fields = fields; steps?.step(1); await track('/pages/intros/publish', {}, steps); steps ? steps.finish('Line published ✓') : toast('Line published ✓'); } catch (error) { toast(error.message); }
  }, PLAN.publish) }, 'Publish the line');
  const grid = h('div', { class: 'items' }, h('button', { class: 'add', type: 'button', onclick: () => openItem(null) }, h('div', {}, h('span', { 'aria-hidden': 'true' }, '+'), `Add a ${NOUN[section.kind]}`)),
    ...items.map(item => h('button', { class: 'item', type: 'button', onclick: () => openItem(item.id) },
      h('span', { class: 'thumb' }, item.thumb ? h('img', { src: item.thumb, alt: '' }) : null),
      h('div', {}, h('b', { text: item.title }), statusBadge(item.status)))));
  main(topBar({ title: section.title, small: `${items.length} ${items.length === 1 ? NOUN[section.kind] : NOUN[section.kind] === 'case study' ? 'case studies' : NOUN[section.kind] + 's'} on the site`, actions: [viewOnSite(slug)] }),
    h('div', { class: 'body' },
      h('div', { class: 'field lede-field' }, h('label', { for: 'intro' }, 'Line under the page title ', h('span', { class: 'opt', text: '(optional)' })), intro, h('div', { class: 'bar-inline' }, saveIntro)),
      grid, section.kind !== 'event' && section.kind !== 'press' ? h('p', { class: 'hint-order', text: 'The site orders these by date, newest first.' }) : null));
}
function statusBadge(status) {
  const label = { live: 'On the site', draft: 'Draft', changed: 'Edited, not published yet' }[status] || status;
  return h('span', { class: `status ${status}`, text: label });
}
function viewOnSite(slug) { return h('a', { class: 'btn soft', href: `${state.publicUrls?.a || 'http://127.0.0.1:4321'}/${slug === 'home' ? 'index' : siteTree?.fields.nodes.find(n=>n.id===slug)?.slug || slug}.html`, target: '_blank', rel: 'noopener' }, 'View on the site ↗'); }

// ---------- Forms ----------
function fieldId(name) { return `f-${name}`; }
function buildField(spec, value, media) {
  const id = fieldId(spec.name);
  const label = h('label', { for: id }, spec.label, spec.optional ? h('span', { class: 'opt', text: ' (optional)' }) : null);
  const hint = spec.hint ? h('p', { class: 'hint', id: `${id}-hint`, text: spec.hint }) : null;
  const error = h('p', { class: 'error', id: `${id}-error`, hidden: true });
  let control;
  if (spec.type === 'image' || spec.type === 'gallery') control = imageControl(spec, value, media, id);
  else if (spec.type === 'file') control = fileControl(spec, value, id);
  else if (spec.type === 'rows') control = rowsControl(spec, value, id);
  else if (spec.type === 'page') {
    control = h('select', { class: 'text', id, name: spec.name }, h('option', { value: '' }, '— none —'), ...SECTIONS.flatMap(group => group.items).filter(item => item.slug !== 'home').map(item => h('option', { value: `${item.slug}.html` }, item.title)));
    control.value = value || '';
  } else if (spec.area) { control = h('textarea', { class: 'text', id, name: spec.name, maxlength: spec.max }); control.value = value || ''; }
  else {
    control = h('input', { class: 'text', id, name: spec.name, type: spec.type || 'text', maxlength: spec.max, inputmode: spec.type === 'url' ? 'url' : undefined, placeholder: spec.type === 'url' ? 'https://' : undefined });
    control.value = value || '';
  }
  if (control.matches?.('input, textarea, select')) control.setAttribute('aria-describedby', [hint && `${id}-hint`, `${id}-error`].filter(Boolean).join(' '));
  return h('div', { class: 'field', 'data-field': spec.name, hidden: spec.hidden }, spec.type === 'image' || spec.type === 'gallery' || spec.type === 'rows' || spec.type === 'file' ? h('p', { class: 'label', id: `${id}-label` }, h('b', { text: spec.label }), spec.optional ? h('span', { class: 'opt', text: ' (optional)' }) : null) : label, control, hint, error);
}
function imageControl(spec, value, media, id) {
  const many = spec.type === 'gallery'; const limit = spec.limit || 12;
  let list = many ? [...(value || [])] : value ? [value] : [];
  const pics = h('div', { class: 'pics' });
  const draw = () => {
    pics.replaceChildren(...list.map((picture, index) => h('div', { class: 'pic' },
      h('img', { src: media[picture.mediaId] || picture.src || '', alt: '' }),
      h('button', { type: 'button', 'aria-label': `Remove photo ${index + 1}`, onclick: () => { list.splice(index, 1); state.dirty = true; draw(); } }, '×'),
      h('input', { class: 'text', 'aria-label': `What does photo ${index + 1} show?`, placeholder: 'What does the photo show?', maxlength: '200', value: picture.alt || '', oninput: event => { picture.alt = event.target.value; state.dirty = true; } }))));
    drop.hidden = list.length >= (many ? limit : 1);
  };
  const input = h('input', { type: 'file', id, accept: 'image/png,image/jpeg,image/webp', multiple: many, 'aria-labelledby': `${id}-label` });
  const drop = h('div', { class: 'drop' }, h('b', { text: many ? 'Drop your photos here' : 'Drop a photo here' }), ' or click to choose', h('br'), h('small', { text: 'JPG, PNG or WebP' }), input);
  const add = async files => {
    for (const file of [...files].slice(0, many ? limit - list.length : 1)) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast(`“${file.name}” is not a JPG, PNG or WebP photo.`); continue; }
      if (file.size > 5 * 1024 * 1024) { toast(`“${file.name}” is too large (5 MB max).`); continue; }
      const result = await busy(null, async steps => { const base64 = await readBase64(file, (read, size) => steps.measure(read, size)); steps.step(1); const added = await upload('/media', { name: file.name, base64 }, steps); steps.finish(`“${file.name}” added ✓`); return added; }, PLAN.photo);
      if (!result) continue;
      media[result.mediaId] = result.src; const picture = { mediaId: result.mediaId, alt: '' }; if (many) list.push(picture); else list = [picture]; state.dirty = true; draw();
    }
  };
  input.addEventListener('change', () => { add(input.files); input.value = ''; });
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('over'); add(event.dataTransfer.files); });
  const box = h('div', { 'data-images': spec.name }, drop, pics); box.read = () => many ? list : list[0] || null; draw();
  return box;
}
// A checked PDF or video, uploaded to /api/v2/files. The server checks the real format, rebuilds PDFs as images
// and keeps the file private until a publication uses it. The form only stores its ID.
const FILE_MAX_BYTES = 10 * 1024 * 1024;
const FILE_TOO_LARGE = 'This file is too large (10 MB maximum). Please send a link instead, or contact us by email.';
const FILE_TYPES = {
  pdf: { accept: 'application/pdf,.pdf', name: /\.pdf$/i, drop: 'Drop a PDF here', small: 'PDF, up to 10 MB and 100 pages', wrong: 'is not a PDF. Save Word files as PDF first.', badge: 'PDF', label: 'PDF ready' },
  video: { accept: 'video/mp4,video/webm,.mp4,.webm', name: /\.(mp4|webm)$/i, drop: 'Drop a video here', small: 'MP4 or WebM, up to 10 MB and 60 seconds', wrong: 'is not an MP4 or WebM video.', badge: 'VIDEO', label: 'Video ready' },
};
function fileControl(spec, value, id) {
  const type = FILE_TYPES[spec.kind]; let current = value || null; let name = '';
  const input = h('input', { type: 'file', id, accept: type.accept, 'aria-labelledby': `${id}-label` });
  const drop = h('div', { class: 'drop' }, h('b', { text: type.drop }), ' or click to choose', h('br'), h('small', { text: type.small }), input);
  const info = h('div', { class: 'file-current' });
  const draw = () => {
    drop.hidden = Boolean(current);
    info.replaceChildren(...(current ? [
      spec.kind === 'video' ? h('video', { class: 'file-preview', src: `${API}/files/${current}`, controls: true, preload: 'metadata' }) : null,
      h('div', { class: 'file' }, h('span', { class: 'pdf', 'aria-hidden': 'true' }, type.badge),
        h('span', { class: 'grow' }, h('b', { text: name || type.label }), h('br'), h('small', { text: name ? 'Checked. Visible on the site once you publish.' : 'Checked.' })),
        h('span', { class: 'file-actions' },
          h('a', { class: 'btn soft', href: `${API}/files/${current}`, target: '_blank', rel: 'noopener' }, spec.kind === 'pdf' ? 'Download' : 'Open'),
          h('button', { class: 'btn soft', type: 'button', onclick: () => { current = null; name = ''; state.dirty = true; draw(); input.focus(); } }, 'Remove'))),
    ].filter(Boolean) : []));
  };
  const add = async file => {
    if (!file) return;
    if (!type.name.test(file.name)) { toast(`“${file.name}” ${type.wrong}`); return; }
    if (file.size > FILE_MAX_BYTES) { toast(FILE_TOO_LARGE); return; }
    const result = await busy(null, async steps => { const base64 = await readBase64(file, (read, size) => steps.measure(read, size)); steps.step(1); const added = await trackUpload('/files', { name: file.name, base64 }, steps); steps.finish('File checked and added ✓ Publish to put it on the site.'); return added; }, PLAN.file);
    if (!result) return;
    current = result.id; name = result.name; state.dirty = true; draw();
  };
  input.addEventListener('change', () => { add(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('over'); add(event.dataTransfer.files[0]); });
  const box = h('div', { 'data-file': spec.name }, drop, info); box.read = () => current; draw();
  return box;
}
function rowsControl(spec, value, id) {
  const rows = h('div', { class: 'rows', id, role: 'group', 'aria-labelledby': `${id}-label` });
  const addRow = (data = {}) => {
    const row = h('div', { class: 'subrow' }, ...spec.columns.map(([name, label, max]) => { const input = h('input', { class: 'text', 'aria-label': label, placeholder: label, maxlength: String(max), 'data-col': name }); input.value = data[name] || ''; return input; }),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Remove this row', onclick: () => { row.remove(); state.dirty = true; plus.hidden = false; } }, '×'));
    rows.append(row); plus.hidden = rows.children.length >= spec.limit;
  };
  const plus = h('button', { class: 'plus', type: 'button', onclick: () => { addRow(); state.dirty = true; rows.lastChild.querySelector('input').focus(); } }, `+ ${spec.add}`);
  (value || []).forEach(addRow);
  const box = h('div', {}, rows, plus); box.read = () => [...rows.children].map(row => Object.fromEntries([...row.querySelectorAll('[data-col]')].map(input => [input.dataset.col, input.value.trim()]))).filter(row => Object.values(row).some(Boolean));
  box.dataset.rows = spec.name; return box;
}
function readForm(form, specs) {
  const fields = {};
  for (const spec of specs) {
    const wrapper = form.querySelector(`[data-field="${spec.name}"]`);
    const custom = wrapper.querySelector('[data-images], [data-rows], [data-file]');
    fields[spec.name] = custom ? custom.read() : wrapper.querySelector('input, textarea, select').value.trim();
  }
  return fields;
}
// Plain-English checks before sending; the server checks again and its answers are shown the same way.
function check(form, specs, fields) {
  const problems = [];
  for (const spec of specs) {
    const value = fields[spec.name];
    if (spec.hidden) continue;
    if (spec.required && !(spec.unlessFilled && fields[spec.unlessFilled]) && (!value || (Array.isArray(value) && !value.length))) problems.push([spec.name, `${spec.label}: please fill this in.`]);
    else if (spec.max && typeof value === 'string' && value.length > spec.max) problems.push([spec.name, `${spec.label}: ${spec.max} characters max (now ${value.length}).`]);
    else if (spec.type === 'url' && value && !/^https:\/\/\S+$/.test(value)) problems.push([spec.name, `${spec.label}: the link must start with https://`]);
    else if ((spec.type === 'image' || spec.type === 'gallery') && value && [].concat(value).some(picture => !picture.alt?.trim())) problems.push([spec.name, `${spec.label}: say in a few words what each photo shows.`]);
  }
  return problems;
}
function showProblems(form, problems) {
  form.querySelectorAll('.error').forEach(error => { error.hidden = true; });
  form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  for (const [name, message] of problems) {
    const wrapper = form.querySelector(`[data-field="${name}"]`) || form;
    const error = wrapper.querySelector('.error'); if (error) { error.textContent = message; error.hidden = false; }
    wrapper.querySelector('input.text, textarea, select')?.setAttribute('aria-invalid', 'true');
  }
  if (problems.length) { const first = form.querySelector(`[data-field="${problems[0][0]}"] input, [data-field="${problems[0][0]}"] textarea, [data-field="${problems[0][0]}"] select, [data-field="${problems[0][0]}"] button`); first?.focus(); toast(problems.length === 1 ? problems[0][1] : `${problems.length} things to fix, shown in red.`); }
}
function serverProblems(error, specs) {
  return (error.diagnostics || []).map(item => [item.field, item.message || `${specs.find(spec => spec.name === item.field)?.label || 'This field'}: please fix.`]);
}
function menu(entries) {
  const pop = h('div', { class: 'menu-pop', role: 'menu', hidden: true }, ...entries.map(([label, action, danger]) => h('button', { type: 'button', role: 'menuitem', class: danger ? 'del' : null, onclick: () => { close(); busy(toggle, action); } }, label)));
  const toggle = h('button', { class: 'btn soft', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More actions', onclick: () => { pop.hidden = !pop.hidden; toggle.setAttribute('aria-expanded', String(!pop.hidden)); if (!pop.hidden) pop.querySelector('button').focus(); } }, '⋯');
  const close = () => { pop.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  pop.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); toggle.focus(); } });
  document.addEventListener('click', event => { if (!wrap.contains(event.target)) close(); });
  const wrap = h('div', { class: 'menu' }, toggle, pop); return wrap;
}

// ---------- An item (case study, work, event, press) ----------
async function openItem(id) {
  const section = state.section; const specs = FIELDS[section.kind];
  const item = id ? await call('GET', `/items/${id}`) : { id: null, revision: 0, status: 'draft', fields: {}, media: {} };
  const media = item.media || {};
  const form = h('form', { class: 'form', novalidate: true, onsubmit: event => event.preventDefault(), oninput: () => { state.dirty = true; } }, ...specs.map(spec => buildField(spec, item.fields[spec.name], media)));
  const save = async (publish, steps) => {
    const fields = readForm(form, specs); const problems = publish ? check(form, specs, fields) : check(form, specs.filter(spec => spec.name === 'title'), fields);
    showProblems(form, problems); if (problems.length) return;
    try {
      let saved = item.id ? await call('PUT', `/items/${item.id}`, { revision: item.revision, fields }) : await call('POST', '/items', { section: section.slug, fields });
      Object.assign(item, saved); steps?.step(1);
      const said = text => steps ? steps.finish(text) : toast(text);
      if (publish) { const result = await track(`/items/${item.id}/publish`, { revision: item.revision }, steps); Object.assign(item, result.item || {}); said(result.message || 'Published ✓ Live on the site in a minute or two.'); }
      else said('Saved ✓ Not on the site yet.');
      state.dirty = false; openSection(section.slug).then(() => openItem(item.id));
    } catch (error) {
      if (error.status === 409) toast('Someone else edited this at the same time. Copy your text, then reopen it.');
      else { const problems = serverProblems(error, specs); if (problems.length) showProblems(form, problems); else toast(error.message); }
    }
  };
  const actions = item.id ? [menu([
    ['View on the site', () => window.open(`${state.publicUrls?.a || 'http://127.0.0.1:4321'}/${section.slug}.html`, '_blank', 'noopener')],
    ...(item.status !== 'draft' ? [['Take off the site (keep here)', async () => { if (!confirm('Take this off the site? It stays here and can be published again.')) return; await call('POST', `/items/${item.id}/unpublish`, { revision: item.revision }); toast('Taken off the site ✓'); openSection(section.slug); }]] : []),
    ['Delete', async () => { if (!confirm('Delete this item? If it is on the site, it is removed right away. You can bring it back from Settings → Deleted.')) return; await call('DELETE', `/items/${item.id}`); toast('Deleted ✓'); state.dirty = false; openSection(section.slug); }, true],
  ])] : [];
  main(topBar({ title: item.id ? item.fields.title || 'Untitled' : `New ${NOUN[section.kind]}`, small: section.title, actions: [item.id ? statusBadge(item.status) : null, ...actions].filter(Boolean) }),
    h('div', { class: 'body' }, form, h('div', { class: 'bar' },
      h('button', { class: 'btn main', type: 'button', onclick: writer((event, steps) => save(true, steps), PLAN.publish) }, item.status === 'live' ? 'Publish changes' : 'Publish to the site'),
      h('button', { class: 'btn soft', type: 'button', onclick: writer((event, steps) => save(false, steps), PLAN.save) }, 'Save without publishing'))));
  state.dirty = false; form.querySelector('input, textarea')?.focus();
}

// ---------- A single page (home screens, about, contact, join) ----------
async function openPage(slug) {
  const data = await call('GET', `/pages/${slug}`); const media = data.media || {};
  // Fields only shown on version B stay in the form (their value is kept) but are hidden while B is not public.
  const page = { ...PAGES[slug], fields: PAGES[slug].fields.map(spec => !state.publicB && /\(version B\)/.test(spec.label) ? { ...spec, hidden: true } : spec) };
  const form = h('form', { class: 'form', novalidate: true, onsubmit: event => event.preventDefault(), oninput: () => { state.dirty = true; } },
    page.lead ? h('div', { class: 'form-lead' }, ...page.lead.map(text => h('p', { text }))) : null,
    ...page.fields.map(spec => buildField(spec, data.fields[spec.name], media)));
  const publish = async (event, steps) => {
    const fields = readForm(form, page.fields); const problems = check(form, page.fields, fields); showProblems(form, problems); if (problems.length) return;
    try { const saved = await call('PUT', `/pages/${slug}`, { revision: data.revision, fields }); data.revision = saved.revision; steps?.step(1); const result = await track(`/pages/${slug}/publish`, {}, steps); state.dirty = false; const text = result.message || 'Published ✓ Live on the site in a minute or two.'; if (steps) steps.finish(text); else toast(text); }
    catch (error) { const problems = serverProblems(error, page.fields); if (problems.length) showProblems(form, problems); else toast(error.message); }
  };
  main(topBar({ title: page.title, small: page.small, actions: [viewOnSite(slug)] }),
    h('div', { class: 'body' }, form, h('div', { class: 'bar' }, h('button', { class: 'btn main', type: 'button', onclick: writer(publish, PLAN.publish) }, 'Publish to the site'))));
}

// ---------- Site wording: every small text of the site (buttons, labels, short messages) ----------
// The server owns the 66 keys, their original text and their limits (GET /pages/wording). An empty field means
// "use the original". Save keeps a draft; Publish saves then puts it live. Nothing here is ever read as HTML.
const WORDING = [
  ['Home page', [['home.title', 'Big title above the frogs'], ['home.latestEmpty', 'Recent work, when there is none yet'], ['home.newsEmpty', 'News, when there is none yet'], ['home.announcementLabel', 'Label on the announcement card'], ['home.ribbitEmpty', 'Ribbit, when there are no photos yet'], ['home.instagramLink', 'Button to Instagram'], ['home.croakEmpty', 'Croak, when there is no song yet'], ['home.tuneIn', 'Button to the song']]],
  ['Every page', [['nav.home', 'First link of the top menu'], ['nav.back', 'Link back to the home page'], ['footer.copyright', 'Copyright line'], ['footer.pauseMotion', 'Button that stops the animations'], ['footer.resumeMotion', 'Same button, when the animations are stopped'], ['empty.page', 'Page with no text yet']]],
  ['Empty sections', [['empty.title', 'Section with nothing in it yet'], ['empty.suggestion', 'Start of the suggestion (a link follows)'], ['empty.backHome', 'Link back to the home page']]],
  ['Projects and events', [['work.view', 'Link to a project'], ['work.allImages', 'Open all the images of a project'], ['work.video', 'Tag on a video'], ['work.audio', 'Tag on a song'], ['events.upcoming', 'Title above upcoming events'], ['events.none', 'When no event is announced'], ['events.details', 'Link to an event']]],
  ['Case Studies', [['case.readSummary', 'Link to the summary page'], ['case.pdfNote', 'Note read after a PDF link'], ['case.openPdf', 'Button that opens the PDF'], ['case.all', 'Link back to all case studies'], ['case.client', 'Word before the client name'], ['case.context', 'Title — context'], ['case.work', 'Title — the work'], ['case.gallery', 'Title — gallery'], ['case.results', 'Title — results']]],
  ['About', [['about.ctaTitle', 'Title of the last block'], ['about.ctaText', 'Text of the last block'], ['about.ctaProject', 'Button to Contact'], ['about.ctaJoin', 'Button to Join Us']]],
  ['Contact and forms', [['contact.emailLabel', 'Label above the email address'], ['form.required', 'Note above the form'], ['form.name', 'Field — name'], ['form.email', 'Field — email'], ['form.message', 'Field — message'], ['form.send', 'Send button'], ['form.closed', 'When online sending is closed'], ['form.closedWithEmail', 'Same, when an email address is shown (the address follows)'], ['form.privacy', 'Link to the privacy policy'], ['form.missing', 'When a required field is empty']]],
  ['Join Us', [['join.openPositions', 'Title above open positions'], ['join.spontaneous', 'Text under the positions'], ['join.fullName', 'Field — full name'], ['join.phone', 'Field — phone'], ['join.optional', 'Word after an optional field'], ['join.fileLabel', 'Field — file'], ['join.fileHelp', 'Help under the file field'], ['join.linkLabel', 'Field — link'], ['join.linkHelp', 'Help under the link field'], ['join.why', 'Field — message'], ['join.send', 'Send button'], ['join.fileType', 'When the file type is not accepted'], ['join.fileEmpty', 'When the file is empty'], ['join.fileTooLarge', 'When the file is too large']]],
  ['Legal', [['legal.intro', 'Text when no short text is written'], ['legal.pdfLink', 'Button that opens the PDF'], ['legal.pending', 'Text before the PDF is added (a link follows)'], ['legal.contactLink', 'Link to Contact']]],
  ['Croak page', [['croak.label', 'Small title above the song']]],
];
async function openWording() {
  let data = await call('GET', '/pages/wording');
  const keys = Object.keys(data.defaults || {});
  const listed = WORDING.flatMap(([, rows]) => rows.map(([key]) => key));
  // A key the server knows but this screen does not list still gets a field, so nothing is ever out of reach.
  const extra = keys.filter(key => !listed.includes(key)).map(key => [key, key]);
  const groups = extra.length ? [...WORDING, ['Other', extra]] : WORDING;
  const inputs = {}, hints = {};
  // "On the site now" shows the published text when it differs from what is in the field.
  const hintText = key => { const live = data.live?.[key] || '', field = inputs[key]?.value ?? data.fields?.[key] ?? ''; return `Original: ${data.defaults[key]}${live && live !== field ? ` · On the site now: ${live}` : ''}`; };
  // T11-F04: after a confirmed publication, read the published texts again. Only "live" is taken from that read:
  // the draft revision and the fields stay the ones this screen saved, so a draft saved meanwhile in another window
  // is never adopted silently, and the next save still meets the T9 conflict check.
  const refreshLive = async () => { try { const fresh = await call('GET', '/pages/wording'); if (fresh && typeof fresh.live === 'object' && fresh.live) { data.live = fresh.live; for (const key of Object.keys(hints)) hints[key].textContent = hintText(key); } } catch { /* the hint simply stays as it was */ } };
  const row = ([key, label]) => {
    if (!keys.includes(key)) return null;
    const id = `w-${key.replace(/\W/g, '-')}`, limit = data.limits?.[key] || 240, original = data.defaults[key];
    const input = h(limit > 240 ? 'textarea' : 'input', { class: 'text', id, name: key, maxlength: String(limit), placeholder: original, 'aria-describedby': `${id}-hint ${id}-error`, ...(limit > 240 ? { rows: '2' } : { type: 'text' }) });
    input.value = data.fields?.[key] || ''; inputs[key] = input;
    const reset = h('button', { class: 'btn soft', type: 'button', onclick: () => { input.value = ''; state.dirty = true; input.focus(); } }, 'Back to the original');
    return h('div', { class: 'field', 'data-field': key },
      h('label', { for: id, text: label }), input,
      hints[key] = h('p', { class: 'hint', id: `${id}-hint`, text: hintText(key) }),
      h('div', { class: 'bar-inline' }, reset),
      h('p', { class: 'error', id: `${id}-error`, hidden: true }));
  };
  const form = h('form', { class: 'form', novalidate: true, onsubmit: event => event.preventDefault(), oninput: () => { state.dirty = true; } },
    h('div', { class: 'form-lead' }, h('p', { text: 'The small texts of the site: buttons, labels and short messages. Leave a field empty to keep the original text, shown in grey.' }), h('p', { text: 'Save keeps your changes here. Publish puts them on the site. Changing a text never changes how the site works: file limits and forms stay as they are.' })),
    ...groups.map(([title, rows]) => h('fieldset', { class: 'wording-group' }, h('legend', { text: title }), ...rows.map(row))));
  const values = () => Object.fromEntries(keys.map(key => [key, inputs[key]?.value ?? '']));
  const local = () => {
    const problems = [];
    for (const key of keys) { const value = inputs[key]?.value ?? ''; if (value.length > (data.limits?.[key] || 240)) problems.push([key, `Up to ${data.limits[key]} characters.`]); else if (/[<>\u0000-\u001f\u007f‪-‮⁦-⁩]/u.test(value)) problems.push([key, 'Use plain text on one line, without < or >.']); }
    return problems;
  };
  const save = async () => {
    const problems = local(); showProblems(form, problems); if (problems.length) return false;
    try { const saved = await call('PUT', '/pages/wording', { revision: data.revision, fields: values() }); data.revision = saved.revision; state.dirty = false; return true; }
    catch (error) {
      const found = serverProblems(error, keys.map(name => ({ name, label: name })));
      if (found.length) showProblems(form, found);
      else toast(error.status === 409 ? 'Someone changed these texts in another window. Your changes are still here: copy what you need, then reload this screen.' : error.message);
      return false;
    }
  };
  const said = (steps, text) => steps ? steps.finish(text) : toast(text);
  const saveOnly = async (event, steps) => { if (await save()) said(steps, 'Saved ✓ Not on the site yet.'); };
  const publish = async (event, steps) => {
    if (!await save()) return;
    steps?.step(1);
    try { const result = await track('/pages/wording/publish', {}, steps); said(steps, result?.message || 'Published ✓ Live on the site in a minute or two.'); await refreshLive(); }
    catch (error) { toast(error.status === 409 ? 'Someone changed these texts in another window. Your changes are saved; reload this screen before publishing.' : error.message); }
  };
  main(topBar({ title: 'Site wording', small: 'Buttons, labels and short messages on every page', actions: [viewOnSite('home')] }),
    h('div', { class: 'body' }, form, h('div', { class: 'bar' },
      h('button', { class: 'btn soft', type: 'button', onclick: writer(saveOnly, PLAN.save) }, 'Save without publishing'),
      h('button', { class: 'btn main', type: 'button', onclick: writer(publish, PLAN.publish) }, 'Publish to the site'))));
}

// ---------- Space: applications and messages (one conversation per person) ----------
const QUICK = [
  ['Got it', 'Thanks for applying! We got your application and will get back to you very soon.'],
  ['Suggest a call', 'We like your profile. Would you be free for a call this week?'],
  ['Not right now', 'Thanks for your interest. We are not moving forward right now, but we will keep your profile in mind.'],
];
// What happened to a reply sent from Desk. The server owns the status; a simulated reply never claims an email went out.
function deliveryText(message) {
  if (message.simulation || message.status === 'simulated') return 'test, not sent';
  return { queued: 'sending…', sent: 'sent by email', failed: 'not sent yet, trying again', review_required: 'delivery not confirmed' }[message.status] ?? 'status unavailable';
}
// A reply whose delivery could not be confirmed may already have arrived: sending again needs an explicit yes.
function retryRow(id, box, message) {
  return h('div', { class: 'file' }, h('span', { class: 'grow', text: 'We could not confirm that this email arrived.' }),
    h('button', { class: 'btn soft', type: 'button', onclick: writer(async () => {
      if (!confirm('This email may already have reached the person. Sending it again can deliver it twice. Send it again?')) return;
      const result = await call('POST', `/conversations/${id}/retry-reply`, { mailId: message.mailId, confirmPotentialDuplicate: true });
      toast(result?.message || 'Sending again ✓'); openConversation(id, box, false, true);
    }) }, 'Send again'));
}
const fileSize = bytes => typeof bytes === 'number' ? (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`) : String(bytes ?? '');
// Attachments open as the checked copy rebuilt by the server. The original stays private and is only downloaded after a warning.
function attachmentRow(file) {
  const label = { pdf: 'PDF', image: 'IMG', video: 'VID' }[file.kind] ?? 'FILE';
  const original = h('a', { class: 'btn soft', href: `${API}/attachments/${file.id}?original=1&confirm=1`, rel: 'noopener' }, 'Original');
  original.addEventListener('click', event => { if (!confirm('The original file has not been checked. Download it only if you trust the sender. Continue?')) event.preventDefault(); });
  return h('div', { class: 'file' }, h('span', { class: 'pdf', 'aria-hidden': 'true' }, label), h('span', { class: 'grow' }, h('b', { text: file.name }), h('br'), h('small', { text: `${fileSize(file.size)} · checked copy` })),
    h('a', { class: 'btn soft', href: `${API}/attachments/${file.id}`, target: '_blank', rel: 'noopener' }, 'Download'), original);
}
async function listInbox(box) {
  $('#list-title').textContent = box === 'cv' ? 'Applications' : 'Messages'; $('#search').placeholder = 'Search a name';
  const [open, archived] = await Promise.all([call('GET', `/conversations?box=${box}&state=open`), call('GET', `/conversations?box=${box}&state=archived`)]);
  const body = $('#list-body'); body.replaceChildren();
  const row = item => { const button = h('button', { class: `row${item.unread ? ' unread' : ''}`, type: 'button', 'data-search': `${item.name} ${item.email}`.toLowerCase(), onclick: () => { markCurrent(body, button); button.classList.remove('unread'); button.querySelector('.count')?.remove(); openConversation(item.id, box); } },
    h('span', { class: 'badge person', 'aria-hidden': 'true', text: initials(item.name) }),
    h('span', { class: 'row-text' }, h('b', { text: item.name }), h('small', { text: item.preview })),
    h('span', { class: 'row-meta' }, when(item.lastAt), item.unread ? h('span', { class: 'count', 'aria-label': 'unread' }, '1') : null)); return button; };
  if (!open.length && !archived.length) body.append(h('p', { class: 'hint', text: box === 'cv' ? 'No applications yet.' : 'No messages yet.' }));
  body.append(...open.map(row));
  if (archived.length) body.append(h('p', { class: 'group', text: 'Archived' }), ...archived.map(row));
  if (open[0]) { body.querySelector('.row').setAttribute('aria-current', 'true'); openConversation(open[0].id, box, true); }
  else $('#main').replaceChildren(h('div', { class: 'empty-box' }, h('p', { text: box === 'cv' ? 'Applications sent from the Join Us page will show up here.' : 'Messages sent from the Contact page will show up here.' })));
}
async function openConversation(id, box, quiet = false, force = false) {
  if (!quiet && !force && state.conversation?.id === id && $('#main .compose')) { setPane('main'); return; }
  const request = (state.openRequest = (state.openRequest || 0) + 1);
  const talk = await call('GET', `/conversations/${id}`);
  if (request !== state.openRequest) return;
  state.conversation = talk;
  const chat = h('div', { class: 'chat', role: 'log', 'aria-label': 'Conversation' });
  let day = '';
  for (const message of talk.messages) {
    const label = new Date(message.at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (label !== day) { day = label; chat.append(h('span', { class: 'day', text: label })); }
    chat.append(h('div', { class: `bubble ${message.from}${message.status === 'failed' && !message.simulation ? ' failed' : ''}` },
      message.facts ? h('p', { class: 'facts', text: message.facts }) : null, message.text,
      ...(message.attachments || []).map(attachmentRow),
      message.from === 'us' && message.status === 'review_required' && message.mailId && !message.simulation ? retryRow(id, box, message) : null,
      h('time', { text: `${new Date(message.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${message.from === 'us' ? ' · ' + deliveryText(message) : ''}` })));
  }
  const text = h('textarea', { class: 'text', rows: '1', placeholder: 'Write a reply…', 'aria-label': state.mail === 'simulated' ? `Your reply to ${talk.name} (test version, no email sent)` : `Your reply, emailed to ${talk.name}` });
  const send = async () => {
    const value = text.value.trim(); if (!value) { text.focus(); return; }
    try { const result = await call('POST', `/conversations/${id}/replies`, { text: value }); text.value = ''; toast(result?.status === 'simulated' || state.mail === 'simulated' ? 'Reply saved ✓ (test version: no email sent)' : 'Reply sent by email ✓'); openConversation(id, box, false, true); }
    catch (error) { if (error.status === 409 && /simulation/i.test(error.message)) { text.value = ''; toast('Reply saved ✓ (test version: no email sent)'); openConversation(id, box, false, true); } else toast(error.message); }
  };
  const sendButton = h('button', { class: 'send', type: 'button', 'aria-label': state.mail === 'simulated' ? 'Save the reply (test version)' : 'Send the reply by email', onclick: () => busy(sendButton, send) }, '➤');
  text.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) busy(sendButton, send); });
  const actions = [menu([
    ...(box === 'cv' ? [['Mark “call back”', async () => { await call('POST', `/conversations/${id}/state`, { state: 'callback' }); toast('Marked “call back” ✓'); }]] : []),
    [talk.state === 'archived' ? 'Move back to the list' : 'Archive', async () => { await call('POST', `/conversations/${id}/state`, { state: talk.state === 'archived' ? 'open' : 'archived' }); toast('Done ✓'); listInbox(box); }],
    [box === 'cv' ? 'Delete the application and résumé' : 'Delete the message', async () => { if (!confirm('Delete this conversation? It leaves the inbox now and is removed for good at the end of the usual period.')) return; await call('DELETE', `/conversations/${id}`); toast('Deleted ✓'); listInbox(box); }, true],
  ])];
  main(topBar({ title: talk.name, small: [talk.email, talk.subject].filter(Boolean).join(' · '), actions }),
    h('div', { class: 'body' }, chat),
    box === 'cv' ? h('div', { class: 'quick', 'aria-label': 'Quick replies' }, ...QUICK.map(([label, value]) => h('button', { type: 'button', onclick: () => { text.value = value; text.focus(); } }, label))) : null,
    h('div', { class: 'compose' }, text, sendButton));
  if (quiet) setPane('list');
  $('#main .body').scrollTop = 1e6; refreshCounts();
}

// ---------- Space: settings ----------
function listSettings() {
  $('#list-title').textContent = 'Settings'; $('#search').placeholder = 'Search';
  const body = $('#list-body'); body.replaceChildren();
  const entries = [['people', 'People', 'Who can sign in'], ['notify', 'Notifications', 'Get an email heads-up'], ['signature', 'Signature', 'Added under your replies'], ['history', 'Site history', 'Go back to an earlier version'], ['archive', 'Deleted', 'Bring back a deleted item'], ['data', 'Your data', 'How long things are kept, and a copy']];
  for (const [key, title, hint] of entries) { const row = h('button', { class: 'row', type: 'button', onclick: () => { markCurrent(body, row); openSetting(key); } }, h('span', { class: 'badge', 'aria-hidden': 'true', text: title[0] }), h('span', { class: 'row-text' }, h('b', { text: title }), h('small', { text: hint })), h('span')); body.append(row); }
  body.querySelector('.row').setAttribute('aria-current', 'true'); openSetting('people', true);
}
async function openSetting(key, quiet = false) {
  const settings = await call('GET', '/settings');
  const panels = {
    people: async () => {
      const people = await call('GET', '/people'); const email = h('input', { class: 'text', type: 'email', placeholder: 'name@frogpondboys.com', 'aria-label': 'Email address to allow' });
      return [h('div', { class: 'panel' }, h('h3', { text: 'People' }), h('p', { text: state.deployment === 'local' ? 'Test version on this computer: the list is saved, but nobody gets a sign-in code yet. Once online, each address will sign in with a code sent by email.' : 'Each person signs in with their own address and a code sent by email. Everyone on this list sees the same inbox and the same content.' }),
        ...people.map(person => h('div', { class: 'person' }, h('span', { text: person.email + (person.me ? ' (you)' : '') }), state.deployment === 'hosted' || person.me || people.length === 1 ? null : h('button', { class: 'btn danger', type: 'button', onclick: writer(async () => { if (!confirm(`Remove access for ${person.email}?`)) return; await call('DELETE', `/people/${encodeURIComponent(person.email)}`); toast('Access removed ✓'); openSetting('people'); }) }, 'Remove'))),
        state.deployment === 'hosted' ? h('p', { text: 'To add or remove a person, ask the site manager: the address must be added to the sign-in list and to the server settings.' }) : h('div', { class: 'person' }, email, h('button', { class: 'btn main', type: 'button', onclick: writer(async () => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { toast('This email address does not look right.'); email.focus(); return; } await call('POST', '/people', { email: email.value.trim() }); toast(state.deployment === 'local' ? 'Address added to the list ✓' : 'Access granted ✓'); openSetting('people'); }) }, 'Add')))];
    },
    notify: async () => [h('div', { class: 'panel' }, h('h3', { text: 'Notifications' }), h('p', { text: 'The email only says there is something new, without the content or the résumé.' }), state.mail === 'simulated' ? h('p', { class: 'hint', text: 'Emails are not sent yet: these choices apply once sending is switched on.' }) : null,
      ...[['cv', 'Tell me about a new application'], ['msg', 'Tell me about a new message']].map(([name, label]) => { const box = h('input', { type: 'checkbox' }); box.checked = settings.notifications?.[name] !== false; box.addEventListener('change', () => busy(box, async () => { Object.assign(settings, await call('PUT', '/settings', { ...settings, notifications: { ...settings.notifications, [name]: box.checked } })); toast('Saved ✓'); })); return h('label', { class: 'check' }, box, label); }))],
    signature: async () => { const area = h('textarea', { class: 'text', 'aria-label': 'Signature', maxlength: '300' }); area.value = settings.signature || ''; return [h('div', { class: 'panel' }, h('h3', { text: 'Reply signature' }), area, h('div', { class: 'bar-inline' }, h('button', { class: 'btn main', type: 'button', onclick: writer(async () => { Object.assign(settings, await call('PUT', '/settings', { ...settings, signature: area.value.trim() })); toast('Saved ✓'); }) }, 'Save')))]; },
    history: async () => { const list = await call('GET', '/publishes'); return [h('div', { class: 'panel' }, h('h3', { text: 'Site history' }), h('p', { text: 'Each publish keeps a version of the site. You can go back to an earlier one.' }),
      ...list.map((entry, index) => h('div', { class: 'person' }, h('span', { text: `${new Date(entry.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} — ${entry.summary}` }), index === 0 ? h('b', { text: 'Current version' }) : h('button', { class: 'btn soft', type: 'button', onclick: writer(async (event, steps) => { if (!confirm('Put the site back to this version?')) return; const result = await track(`/publishes/${entry.id}/restore`, {}, steps); const text = result.message || 'Site restored to this version ✓'; if (steps) steps.finish(text); else toast(text); openSetting('history'); }, PLAN.restore) }, 'Go back to this version'))))]; },
    archive: async () => { const deleted = await call('GET', '/archive'); return [h('div', { class: 'panel' }, h('h3', { text: 'Deleted items' }), h('p', { text: 'A deleted item comes back as a draft: publish it again to show it on the site.' }),
      ...(deleted.items.length ? deleted.items.map(item => h('div', { class: 'person' }, h('span', { text: `${item.title || 'Untitled'} — deleted ${new Date(item.deletedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}` }), h('button', { class: 'btn soft', type: 'button', onclick: writer(async () => { await call('POST', `/archive/${encodeURIComponent(item.id)}/restore`, {}); toast('Brought back as a draft ✓'); openSetting('archive'); }) }, 'Bring back'))) : [h('p', { class: 'hint', text: 'Nothing has been deleted.' })])),
      deleted.conversations.length ? h('div', { class: 'panel' }, h('h3', { text: 'Deleted conversations' }), h('p', { text: 'They are kept until the end of the usual period, then removed for good. Ask the site manager if one must come back.' }), ...deleted.conversations.map(talk => h('div', { class: 'person' }, h('span', { text: `${talk.name} — deleted ${new Date(talk.deletedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}` })))) : null]; },
    data: async () => [h('div', { class: 'panel' }, h('h3', { text: 'Your data' }), h('p', { text: 'Applications and their résumés are deleted automatically after 12 months, messages after 24 months.' }), h('a', { class: 'btn soft', href: `${API}/export` }, 'Download a copy of the site content'))],
  };
  const titles = { people: 'People', notify: 'Notifications', signature: 'Signature', history: 'Site history', archive: 'Deleted items', data: 'Your data' };
  main(topBar({ title: titles[key] }), h('div', { class: 'body' }, ...(await panels[key]())));
  if (quiet) setPane('list');
}

// ---------- Search in the left column ----------
$('#search').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('#list-body .row, #list-body .tree-node').forEach(row => { row.hidden = query && !(row.dataset.search || row.textContent.toLowerCase()).includes(query); });
});
document.querySelectorAll('.rail [data-space]').forEach(button => button.addEventListener('click', () => showSpace(button.dataset.space)));
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

start();
