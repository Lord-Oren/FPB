// Pond Desk v2 client. API implementation: editor/backend/api.mjs.
// Until that API answers, the app runs in a clearly flagged demonstration mode where nothing is saved.
'use strict';

const API = '/api/v2';
const $ = selector => document.querySelector(selector);
const state = { demo: false, mode: '', mail: '', token: '', space: 'site', section: null, item: null, conversation: null, dirty: false };

// ---------- Small DOM helper: text is always set as text, never parsed as HTML ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return el;
}
function toast(text) {
  const box = $('#toast'); box.textContent = text; box.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { box.hidden = true; }, 3200);
}
const when = iso => { const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const initials = name => { const words = name.trim().split(/\s+/).filter(Boolean); return ((words[0]?.[0] || '') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase(); };

// ---------- What the site contains, in the order the owners see it on the site ----------
const SECTIONS = [
  { group: 'Home', items: [{ slug: 'home', title: 'Home, menus, Croak and Legal', hint: 'Headings, TV screens, menu labels and legal examples', kind: 'page' }] },
  { group: 'Advertising', items: [
    { slug: 'case-studies', title: 'Case Studies', hint: 'Your case studies', kind: 'case' },
    { slug: 'client-work', title: 'Client Work', hint: 'Work for your clients', kind: 'work' },
    { slug: 'mock-ads', title: 'Mock Ads', hint: 'Ads you imagined', kind: 'work' },
    { slug: 'presentations', title: 'Presentations', hint: 'Decks and presentations', kind: 'work' }] },
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
const retired = new Set(['presentations','music','media-relations','influencer-relations','events-launches']);
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
    { name: 'summary', label: 'In two sentences', max: 240, required: true, area: true, hint: 'Shown under the photo, in the list of case studies.' },
    { name: 'cover', label: 'Main photo', type: 'image', required: true },
    { name: 'client', label: 'Which client?', max: 90, optional: true },
    { name: 'context', label: 'The background', max: 4000, required: true, area: true },
    { name: 'work', label: 'What you did', max: 4000, required: true, area: true },
    { name: 'gallery', label: 'More photos', type: 'gallery', optional: true, hint: 'Up to 12 photos.' },
    { name: 'results', label: 'The results', max: 1500, optional: true, area: true }],
  work: [
    { name: 'title', label: 'Title', max: 90, required: true },
    { name: 'date', label: 'When?', type: 'month', required: true, hint: 'The most recent show first.' },
    { name: 'summary', label: 'In one or two sentences', max: 240, required: true, area: true },
    { name: 'image', label: 'Photo', type: 'image', required: true },
    { name: 'client', label: 'Which client?', max: 90, optional: true },
    { name: 'gallery', label: 'More photos', type: 'gallery', optional: true, hint: 'Up to 12 photos.' },
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
  home: { title: 'Home, navigation, Croak and Legal', small: 'Published text and menu labels', fields: [
    ...[
      ['grandCentral','Home subtitle',240],['tagline','Tagline',240],['croakTitle','Croak — song title (Demo until supplied)',240],['croakText','Croak — description',240],['croakUrl','Croak — listening link',300],
      ['legalPrivacy','Legal — Privacy Policies',4000],['legalCookies','Legal — Cookie Settings',4000],['legalTerms','Legal — Terms of Services',4000],['legalConduct','Legal — Code of Conduct',4000],['legalValues','Legal — Values',4000]
    ].map(([key,label,max])=>({name:'editorial_'+key,label,max,optional:true,area:max===4000,hint:'Leave empty only if you want to remove this text. Demo examples must be reviewed before public launch.'})),
    ...Object.entries({advertising:'Advertising',creative:'Creative',pr:'PR','case-studies':'Case Studies','client-work':'Client Work','mock-ads':'Mock Ads',collabs:'Collabs','events-shows':'Events & Shows','films-videos':'Films & Videos',magazine:'Magazine',photography:'Photography',press:'Press',prc:'PRC',recognition:'Recognition',statements:'Statements',about:'About',contact:'Contact',join:'Join Us',legal:'Legal',gram:'Gram',croak:'Croak',announcements:'Announcements',recents:'Recents'}).map(([key,label])=>({name:'navigation_'+key,label:'Navigation label — '+label,max:40,required:true})),

    { name: 'announcementTitle', label: 'Announcement title', max: 60, required: true, hint: 'Shown on the “Announcements” screen of the home page and in “What\'s happening” on the modern version.' },
    { name: 'announcementText', label: 'Announcement text', max: 140, required: true, area: true },
    { name: 'announcementLink', label: 'Page to open on click (pixel version)', type: 'page', optional: true, hint: 'On the modern version, the screen leads to the news further down the home page.' },
    { name: 'gramLabel', label: 'Gram screen text', max: 40, required: true },
    { name: 'gramUrl', label: 'Instagram link', type: 'url', optional: true }] },
  about: { title: 'About', small: 'About page', fields: [
    { name: 'story', label: 'Your story', max: 4000, required: true, area: true },
    { name: 'ethos', label: 'What you believe in', max: 4000, required: true, area: true },
    { name: 'photos', label: 'Photos', type: 'gallery', optional: true, hint: 'Up to 6 photos.', limit: 6 },
    { name: 'team', label: 'The team', type: 'rows', columns: [['name', 'Name', 90], ['role', 'Role', 90]], add: 'Add a person', limit: 24 }] },
  contact: { title: 'Contact', small: 'Contact page', fields: [
    { name: 'intro', label: 'Welcome line', max: 600, required: true, area: true },
    { name: 'email', label: 'Email address shown', type: 'email', optional: true },
    { name: 'socials', label: 'Social links', type: 'rows', columns: [['label', 'Name (e.g. Instagram)', 40], ['url', 'Link', 300]], add: 'Add a link', limit: 6 }] },
  join: { title: 'Join Us', small: 'Join Us page', fields: [
    { name: 'intro', label: 'Welcome line', max: 1200, required: true, area: true },
    { name: 'positions', label: 'Open positions', type: 'rows', columns: [['title', 'Position', 90], ['type', 'Type (e.g. full time)', 40]], add: 'Add a position', limit: 10, hint: 'With no open position, the site invites open applications.' }] },
};

PAGES.home.fields=PAGES.home.fields.filter(field=>!field.name.startsWith('navigation_'));
// ---------- API client, with an honest demonstration fallback ----------
async function call(method, path, body) {
  if (state.demo) return Demo.handle(method, path, body);
  const response = await fetch(API + path, { method, headers: { 'X-Editor-Token': state.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null; try { data = await response.json(); } catch { data = null; }
  if (!response.ok) { const error = new Error(data?.message || 'The server could not do that. Please try again.'); error.status = response.status; error.diagnostics = data?.diagnostics || []; throw error; }
  return data;
}
async function start() {
  try {
    if (location.protocol === 'file:') throw new Error('file');
    const response = await fetch(API + '/session', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('no api');
    const session = await response.json(); state.token = session.token || ''; state.me = session.user?.email || ''; state.mode = session.mode || ''; state.publicUrls = session.publicUrls || {}; state.mail = session.mail || '';
    if (state.mail === 'simulated') { const band = $('#demo-band'); band.textContent = (state.mode === 'hosted-test' ? 'Private online test version: use only made-up data and résumés. ' : '') + 'Test version: everything is really saved, but no email goes out (replies and notifications are simulated).'; band.classList.add('local'); band.hidden = false; }
  } catch { state.demo = true; state.me = 'demo@frogpondboys.com'; $('#demo-band').hidden = false; }
  $('#me').textContent = initials(state.me.split('@')[0].replace(/[._-]/g, ' ') || 'FP');
  showSpace('site'); void refreshCounts();
}
async function refreshCounts() {
  try {
    const counts = state.demo ? Object.fromEntries(await Promise.all(['cv', 'msg'].map(async box => [box, (await call('GET', `/conversations?box=${box}&state=open`)).filter(item => item.unread).length]))) : await call('GET', '/counts');
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
function main(...children) { const box = $('#main'); box.replaceChildren(...children.filter(child => child !== null && child !== undefined && child !== false)); setPane('main'); box.focus({ preventScroll: true }); }
function welcome(text) { $('#main').replaceChildren(h('div', { class: 'welcome' }, h('div', {}, h('p', { class: 'frog', 'aria-hidden': 'true' }, '🐸'), h('p', { text })))); }
function markCurrent(list, current) { list.querySelectorAll('.row').forEach(row => row.setAttribute('aria-current', String(row === current))); }

// ---------- Space: the site ----------
let siteTree=null;
const editableKinds={works:'work',events:'event',press:'press','case-studies':'case',about:'page',contact:'page',join:'page'};
const nodeSection=node=>({slug:node.id,title:node.title,kind:editableKinds[node.kind]||'structure',node});
const rootZones=[{id:'menus',title:'Frog menus'},{id:'screens',title:'Lily-pad screens'},{id:'stones',title:'Stone links'},{id:'footer',title:'Footer links'},{id:'archive',title:'Hidden sections'}];
const treeChildren=id=>siteTree.fields.nodes.filter(n=>n.parentId===id);
async function saveTree(tree){siteTree=await call('PUT','/structure',{revision:siteTree.revision,structure:tree});state.dirty=false;await listSite(false);}
async function publishTree(){try{await call('POST','/structure/publish',{revision:siteTree.revision});siteTree=await call('GET','/structure');toast('Site layout published ✓');await listSite(false);}catch(e){toast(e.message);}}
async function listSite(showWelcome=true){
 $('#list-title').textContent='Site zones';$('#search').placeholder='Search sections';
 if(state.demo){return listLegacySite();}
 try{siteTree=await call('GET','/structure');}catch(e){toast(e.message);return;}
 const body=$('#list-body');body.replaceChildren();
 body.append(h('button',{class:'row',type:'button',onclick:()=>{if(guardLeave())openPage('home');}},h('span',{class:'row-text'},h('b',{text:'Home text, Croak and Legal'}),h('small',{text:'Edit your existing site content'}))));
 const render=(node,depth=0)=>{
  const row=h('div',{class:'tree-node','data-search':node.title.toLowerCase(),style:`--tree-depth:${Math.min(depth,5)}`},
   h('button',{class:'tree-open',type:'button',onclick:()=>{if(guardLeave()){state.dirty=false;openNode(node.id);}}},node.title,h('small',{text:node.visible?'':'Hidden — content kept'})),
   null);
  const wrap=h('div',{class:'tree-branch'},row,...treeChildren(node.id).map(child=>render(child,depth+1)));return wrap;
 };
 for(const zone of siteTree.zones??rootZones){const roots=treeChildren(null).filter(n=>n.zone===zone.id);body.append(h('section',{class:'tree-zone'},h('div',{class:'tree-zone-head'},h('h3',{text:zone.title})),...roots.map(n=>render(n)),!roots.length?h('p',{class:'hint',text:'No sections in this zone.'}):null));}
 if(showWelcome)main(topBar({title:'Your site, zone by zone',small:'Choose an existing section to change its name or edit its content.',actions:[h('button',{class:'btn main',type:'button',onclick:publishTree},'Publish layout')]}),h('div',{class:'body'},h('div',{class:'panel'},h('h3',{text:'Changes stay in draft until you publish'}),h('p',{text:'Your site structure is already set up. Change names and content without creating pages or changing their addresses.'})),...rootZones.filter(z=>z.id!=='archive').map(zone=>h('div',{class:'panel zone-card'},h('h3',{text:zone.title}),h('p',{text:({menus:'The frogs on the wooden raft and their existing menu links.',screens:'The lily pads and their screens on the pond.',stones:'The stone links around the pond.',footer:'Links at the bottom of the pages.'})[zone.id]})))));
 if(showWelcome&&matchMedia('(max-width:860px)').matches)setPane('list');
}
function openNode(id){
 const node=siteTree.fields.nodes.find(n=>n.id===id);if(!node)return;
 const name=h('input',{class:'text',id:'section-title',maxlength:60});name.value=node.title;
 const text=h('textarea',{class:'text',id:'section-text',maxlength:12000,rows:6});text.value=node.text;
 const href=h('input',{class:'text',id:'section-link',maxlength:300});href.value=node.href;
 const visible=h('input',{id:'section-visible',type:'checkbox'});visible.checked=node.visible;
 const newTab=h('input',{id:'section-new-tab',type:'checkbox'});newTab.checked=node.newTab;
 const fields=h('form',{class:'form',onsubmit:e=>e.preventDefault(),oninput:()=>{state.dirty=true;}},
 h('div',{class:'field'},h('label',{for:name.id,text:'Section name'}),name),
 h('label',{class:'check-label'},visible,' Show in navigation'),h('label',{class:'check-label'},newTab,' Open in a new tab'),
 ['menu','page'].includes(node.kind)?h('div',{class:'field'},h('label',{for:text.id,text:'Page text'}),text):null,
 ['link','anchor'].includes(node.kind)?h('div',{class:'field'},h('label',{for:href.id,text:'Link (HTTPS, page.html or #section)'}),href):null,
 h('p',{class:'hint',text:node.slug?'Address: '+node.slug+'.html — kept when you rename this section.':'A link has no page of its own.'}));
 const save=async()=>{try{const draft=structuredClone(siteTree.fields),edited=draft.nodes.find(n=>n.id===id);Object.assign(edited,{title:name.value.trim(),text:text.value,href:href.value.trim(),visible:visible.checked,newTab:newTab.checked});await saveTree(draft);toast('Layout draft saved ✓');openNode(id);return true;}catch(e){toast(e.message);return false;}};
 const actions=[h('button',{class:'btn main',type:'button',onclick:async()=>{if(await save())await publishTree();}},'Save and publish')];
 const content=editableKinds[node.kind]?h('button',{class:'btn soft',type:'button',onclick:()=>{if(guardLeave()){state.dirty=false;openSection(node.id);}}},'Edit content'):['legal','croak'].includes(node.kind)?h('button',{class:'btn soft',type:'button',onclick:()=>{if(guardLeave())openPage('home');}},'Edit text'):null;
 main(topBar({title:node.title,small:'Section settings — '+(rootZones.find(z=>z.id===node.zone)?.title??node.zone),actions}),h('div',{class:'body'},fields,h('div',{class:'bar-inline'},h('button',{class:'btn soft',type:'button',onclick:save},'Save draft'),content),
 node.kind==='menu'&&node.zone==='menus'?h('section',{class:'panel'},h('h3',{text:'Subsections'}),...treeChildren(id).map(child=>h('button',{class:'row',type:'button',onclick:()=>{if(guardLeave())openNode(child.id);}},child.title))):null));
}

async function listLegacySite() {
  $('#list-title').textContent = 'The site'; $('#search').placeholder = 'Search sections';
  const counts = await call('GET', '/sections').catch(() => ({}));
  const body = $('#list-body'); body.replaceChildren();
  for (const group of SECTIONS) {
    body.append(h('p', { class: 'group', text: group.group }));
    for (const section of group.items) {
      const row = h('button', { class: 'row', type: 'button', 'data-search': `${section.title} ${section.hint}`.toLowerCase(), onclick: () => { if (!guardLeave()) return; state.dirty = false; markCurrent(body, row); openSection(section.slug); } },
        h('span', { class: 'badge', 'aria-hidden': 'true', text: section.title.replace(/[^A-Z]/g, '').slice(0, 2) || section.title[0] }),
        h('span', { class: 'row-text' }, h('b', { text: section.title }), h('small', { text: section.hint })),
        h('span', { class: 'row-meta' }, counts[section.slug] !== undefined ? String(counts[section.slug]) : ''));
      body.append(row);
    }
  }
  welcome('Pick a part of the site to edit.');
}
async function openSection(slug) {
  const section = sectionOf(slug); state.section = section;
  if (section.kind === 'page') return openPage(slug);
  if(section.kind === 'structure')return openNode(slug);
  const [items, intros] = await Promise.all([call('GET', `/items?section=${slug}`), call('GET', '/pages/intros').catch(() => ({ fields: {} }))]);
  const intro = h('textarea', { class: 'text', id: 'intro', maxlength: '240', rows: '2' }); intro.value = intros.fields?.[slug] || '';
  const saveIntro = h('button', { class: 'btn soft', type: 'button', onclick: async () => {
    try { const fields = { ...(intros.fields || {}), [slug]: intro.value.trim() }; const saved = await call('PUT', '/pages/intros', { revision: intros.revision, fields }); intros.revision = saved.revision; intros.fields = fields; await call('POST', '/pages/intros/publish', { }); toast('Line published ✓'); } catch (error) { toast(error.message); }
  } }, 'Publish the line');
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
  return h('div', { class: 'field', 'data-field': spec.name }, spec.type === 'image' || spec.type === 'gallery' || spec.type === 'rows' ? h('p', { class: 'label', id: `${id}-label` }, h('b', { text: spec.label }), spec.optional ? h('span', { class: 'opt', text: ' (optional)' }) : null) : label, control, hint, error);
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
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      try { toast('Preparing the photo…'); const result = await call('POST', '/media', { name: file.name, base64 }); media[result.mediaId] = result.src; const picture = { mediaId: result.mediaId, alt: '' }; if (many) list.push(picture); else list = [picture]; state.dirty = true; draw(); toast('Photo added ✓'); }
      catch (error) { toast(`“${file.name}”: ${error.message}`); }
    }
  };
  input.addEventListener('change', () => { add(input.files); input.value = ''; });
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('over'); add(event.dataTransfer.files); });
  const box = h('div', { 'data-images': spec.name }, drop, pics); box.read = () => many ? list : list[0] || null; draw();
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
    const custom = wrapper.querySelector('[data-images], [data-rows]');
    fields[spec.name] = custom ? custom.read() : wrapper.querySelector('input, textarea, select').value.trim();
  }
  return fields;
}
// Plain-English checks before sending; the server checks again and its answers are shown the same way.
function check(form, specs, fields) {
  const problems = [];
  for (const spec of specs) {
    const value = fields[spec.name];
    if (spec.required && (!value || (Array.isArray(value) && !value.length))) problems.push([spec.name, `${spec.label}: please fill this in.`]);
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
  const pop = h('div', { class: 'menu-pop', role: 'menu', hidden: true }, ...entries.map(([label, action, danger]) => h('button', { type: 'button', role: 'menuitem', class: danger ? 'del' : null, onclick: () => { close(); action(); } }, label)));
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
  const save = async publish => {
    const fields = readForm(form, specs); const problems = publish ? check(form, specs, fields) : check(form, specs.filter(spec => spec.name === 'title'), fields);
    showProblems(form, problems); if (problems.length) return;
    try {
      let saved = item.id ? await call('PUT', `/items/${item.id}`, { revision: item.revision, fields }) : await call('POST', '/items', { section: section.slug, fields });
      Object.assign(item, saved);
      if (publish) { const result = await call('POST', `/items/${item.id}/publish`, { revision: item.revision }); Object.assign(item, result.item || {}); toast(result.message || 'Published ✓ Live on the site in a minute or two.'); }
      else toast('Saved ✓ Not on the site yet.');
      state.dirty = false; openSection(section.slug).then(() => openItem(item.id));
    } catch (error) {
      if (error.status === 409) toast('Someone else edited this at the same time. Copy your text, then reopen it.');
      else { const problems = serverProblems(error, specs); if (problems.length) showProblems(form, problems); else toast(error.message); }
    }
  };
  const actions = item.id ? [menu([
    ['View on the site', () => window.open(`${state.publicUrls?.a || 'http://127.0.0.1:4321'}/${section.slug}.html`, '_blank', 'noopener')],
    ...(item.status !== 'draft' ? [['Take off the site (keep here)', async () => { if (!confirm('Take this off the site? It stays here and can be published again.')) return; await call('POST', `/items/${item.id}/unpublish`, { revision: item.revision }); toast('Taken off the site ✓'); openSection(section.slug); }]] : []),
    ['Delete for good', async () => { if (!confirm('Delete for good? This cannot be undone.')) return; await call('DELETE', `/items/${item.id}`); toast('Deleted ✓'); state.dirty = false; openSection(section.slug); }, true],
  ])] : [];
  main(topBar({ title: item.id ? item.fields.title || 'Untitled' : `New ${NOUN[section.kind]}`, small: section.title, actions: [item.id ? statusBadge(item.status) : null, ...actions].filter(Boolean) }),
    h('div', { class: 'body' }, form, h('div', { class: 'bar' },
      h('button', { class: 'btn main', type: 'button', onclick: () => save(true) }, item.status === 'live' ? 'Publish changes' : 'Publish to the site'),
      h('button', { class: 'btn soft', type: 'button', onclick: () => save(false) }, 'Save without publishing'))));
  state.dirty = false; form.querySelector('input, textarea')?.focus();
}

// ---------- A single page (home screens, about, contact, join) ----------
async function openPage(slug) {
  const page = PAGES[slug]; const data = await call('GET', `/pages/${slug}`); const media = data.media || {};
  const form = h('form', { class: 'form', novalidate: true, onsubmit: event => event.preventDefault(), oninput: () => { state.dirty = true; } }, ...page.fields.map(spec => buildField(spec, data.fields[spec.name], media)));
  const publish = async () => {
    const fields = readForm(form, page.fields); const problems = check(form, page.fields, fields); showProblems(form, problems); if (problems.length) return;
    try { const saved = await call('PUT', `/pages/${slug}`, { revision: data.revision, fields }); data.revision = saved.revision; const result = await call('POST', `/pages/${slug}/publish`, {}); state.dirty = false; toast(result.message || 'Published ✓ Live on the site in a minute or two.'); }
    catch (error) { const problems = serverProblems(error, page.fields); if (problems.length) showProblems(form, problems); else toast(error.message); }
  };
  main(topBar({ title: page.title, small: page.small, actions: [viewOnSite(slug)] }),
    h('div', { class: 'body' }, form, h('div', { class: 'bar' }, h('button', { class: 'btn main', type: 'button', onclick: publish }, 'Publish to the site'))));
}

// ---------- Space: applications and messages (one conversation per person) ----------
const QUICK = [
  ['Got it', 'Thanks for applying! We got your application and will get back to you very soon.'],
  ['Suggest a call', 'We like your profile. Would you be free for a call this week?'],
  ['Not right now', 'Thanks for your interest. We are not moving forward right now, but we will keep your profile in mind.'],
];
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
      ...(message.attachments || []).map(file => h('div', { class: 'file' }, h('span', { class: 'pdf', 'aria-hidden': 'true' }, 'PDF'), h('span', { class: 'grow' }, h('b', { text: file.name }), h('br'), h('small', { text: file.size })),
        h('a', { class: 'btn soft', href: state.demo ? '#' : `${API}/attachments/${file.id}`, target: '_blank', rel: 'noopener', onclick: event => { if (state.demo) { event.preventDefault(); toast('Demo mode: there is no real résumé.'); } } }, 'Open'))),
      h('time', { text: `${new Date(message.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${message.from === 'us' ? (message.simulation || message.status === 'simulated' ? ' · test, not sent' : message.status === 'failed' ? ' · not sent' : ' · sent by email') : ''}` })));
  }
  const text = h('textarea', { class: 'text', rows: '1', placeholder: 'Write a reply…', 'aria-label': state.mail === 'simulated' ? `Your reply to ${talk.name} (test version, no email sent)` : `Your reply, emailed to ${talk.name}` });
  const send = async () => {
    const value = text.value.trim(); if (!value) { text.focus(); return; }
    try { const result = await call('POST', `/conversations/${id}/replies`, { text: value }); text.value = ''; toast(result?.status === 'simulated' || state.mail === 'simulated' ? 'Reply saved ✓ (test version: no email sent)' : 'Reply sent by email ✓'); openConversation(id, box, false, true); }
    catch (error) { if (error.status === 409 && /simulation/i.test(error.message)) { text.value = ''; toast('Reply saved ✓ (test version: no email sent)'); openConversation(id, box, false, true); } else toast(error.message); }
  };
  text.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send(); });
  const actions = [menu([
    ...(box === 'cv' ? [['Mark “call back”', async () => { await call('POST', `/conversations/${id}/state`, { state: 'callback' }); toast('Marked “call back” ✓'); }]] : []),
    [talk.state === 'archived' ? 'Move back to the list' : 'Archive', async () => { await call('POST', `/conversations/${id}/state`, { state: talk.state === 'archived' ? 'open' : 'archived' }); toast('Done ✓'); listInbox(box); }],
    [box === 'cv' ? 'Delete the application and résumé' : 'Delete the message', async () => { if (!confirm('Delete for good? This cannot be undone.')) return; await call('DELETE', `/conversations/${id}`); toast('Deleted ✓'); listInbox(box); }, true],
  ])];
  main(topBar({ title: talk.name, small: [talk.email, talk.subject].filter(Boolean).join(' · '), actions }),
    h('div', { class: 'body' }, chat),
    box === 'cv' ? h('div', { class: 'quick', 'aria-label': 'Quick replies' }, ...QUICK.map(([label, value]) => h('button', { type: 'button', onclick: () => { text.value = value; text.focus(); } }, label))) : null,
    h('div', { class: 'compose' }, text, h('button', { class: 'send', type: 'button', 'aria-label': state.mail === 'simulated' ? 'Save the reply (test version)' : 'Send the reply by email', onclick: send }, '➤')));
  if (quiet) setPane('list');
  $('#main .body').scrollTop = 1e6; refreshCounts();
}

// ---------- Space: settings ----------
function listSettings() {
  $('#list-title').textContent = 'Settings'; $('#search').placeholder = 'Search';
  const body = $('#list-body'); body.replaceChildren();
  const entries = [['people', 'People', 'Who can sign in'], ['notify', 'Notifications', 'Get an email heads-up'], ['signature', 'Signature', 'Added under your replies'], ['history', 'Site history', 'Go back to an earlier version'], ['data', 'Your data', 'How long things are kept, and a copy']];
  for (const [key, title, hint] of entries) { const row = h('button', { class: 'row', type: 'button', onclick: () => { markCurrent(body, row); openSetting(key); } }, h('span', { class: 'badge', 'aria-hidden': 'true', text: title[0] }), h('span', { class: 'row-text' }, h('b', { text: title }), h('small', { text: hint })), h('span')); body.append(row); }
  body.querySelector('.row').setAttribute('aria-current', 'true'); openSetting('people', true);
}
async function openSetting(key, quiet = false) {
  const settings = await call('GET', '/settings');
  const panels = {
    people: async () => {
      const people = await call('GET', '/people'); const email = h('input', { class: 'text', type: 'email', placeholder: 'name@frogpondboys.com', 'aria-label': 'Email address to allow' });
      return [h('div', { class: 'panel' }, h('h3', { text: 'People' }), h('p', { text: state.mode === 'local' ? 'Test version on this computer: the list is saved, but nobody gets a sign-in code yet. Once online, each address will sign in with a code sent by email.' : 'They sign in with a code sent by email. Everyone sees everything.' }),
        ...people.map(person => h('div', { class: 'person' }, h('span', { text: person.email + (person.me ? ' (you)' : '') }), state.mode === 'hosted-test' || person.me || people.length === 1 ? null : h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (!confirm(`Remove access for ${person.email}?`)) return; await call('DELETE', `/people/${encodeURIComponent(person.email)}`); toast('Access removed ✓'); openSetting('people'); } }, 'Remove'))),
        state.mode === 'hosted-test' ? h('p', { text: 'To add or remove a tester, ask the site manager to update the Cloudflare access and the server settings.' }) : h('div', { class: 'person' }, email, h('button', { class: 'btn main', type: 'button', onclick: async () => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { toast('This email address does not look right.'); email.focus(); return; } await call('POST', '/people', { email: email.value.trim() }); toast(state.mode === 'local' ? 'Address added to the list ✓' : 'Access granted ✓'); openSetting('people'); } }, 'Add')))];
    },
    notify: async () => [h('div', { class: 'panel' }, h('h3', { text: 'Notifications' }), h('p', { text: 'The email only says there is something new, without the content or the résumé.' }),
      ...[['cv', 'Tell me about a new application'], ['msg', 'Tell me about a new message']].map(([name, label]) => { const box = h('input', { type: 'checkbox' }); box.checked = settings.notifications?.[name] !== false; box.addEventListener('change', async () => { Object.assign(settings, await call('PUT', '/settings', { ...settings, notifications: { ...settings.notifications, [name]: box.checked } })); toast('Saved ✓'); }); return h('label', { class: 'check' }, box, label); }))],
    signature: async () => { const area = h('textarea', { class: 'text', 'aria-label': 'Signature', maxlength: '300' }); area.value = settings.signature || ''; return [h('div', { class: 'panel' }, h('h3', { text: 'Reply signature' }), area, h('div', { class: 'bar-inline' }, h('button', { class: 'btn main', type: 'button', onclick: async () => { Object.assign(settings, await call('PUT', '/settings', { ...settings, signature: area.value.trim() })); toast('Saved ✓'); } }, 'Save')))]; },
    history: async () => { const list = await call('GET', '/publishes'); return [h('div', { class: 'panel' }, h('h3', { text: 'Site history' }), h('p', { text: 'Each publish keeps a version of the site. You can go back to an earlier one.' }),
      ...list.map((entry, index) => h('div', { class: 'person' }, h('span', { text: `${new Date(entry.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} — ${entry.summary}` }), index === 0 ? h('b', { text: 'Current version' }) : h('button', { class: 'btn soft', type: 'button', onclick: async () => { if (!confirm('Put the site back to this version?')) return; const result = await call('POST', `/publishes/${entry.id}/restore`, {}); toast(result.message || 'Site restored to this version ✓'); openSetting('history'); } }, 'Go back to this version'))))]; },
    data: async () => [h('div', { class: 'panel' }, h('h3', { text: 'Your data' }), h('p', { text: 'Applications and their résumés are deleted automatically after 12 months, messages after 24 months.' }), h('a', { class: 'btn soft', href: state.demo ? '#' : `${API}/export`, onclick: event => { if (state.demo) { event.preventDefault(); toast('Demo mode: no export.'); } } }, 'Download a copy of the site content'))],
  };
  const titles = { people: 'People', notify: 'Notifications', signature: 'Signature', history: 'Site history', data: 'Your data' };
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

// ---------- Demonstration store (only when the back-end is not there yet). Fictional data only. ----------
const Demo = (() => {
  const now = Date.now(), ago = minutes => new Date(now - minutes * 60000).toISOString();
  let next = 100; const newId = prefix => `${prefix}-${++next}`;
  const items = {
    'case-studies': [{ id: 'd-c1', title: 'Sample: a brand launch', status: 'live' }],
    'client-work': [{ id: 'd-w1', title: 'Neighborhood café rebrand', status: 'live' }, { id: 'd-w2', title: 'Summer festival campaign', status: 'changed' }, { id: 'd-w3', title: 'Bike shop launch kit', status: 'draft' }],
    photography: [{ id: 'd-w4', title: 'Morning light, studio series', status: 'live' }, { id: 'd-w5', title: 'Street textures', status: 'live' }],
    'events-shows': [{ id: 'd-e1', title: 'Studio open night', status: 'live' }],
    press: [{ id: 'd-p1', title: 'Five young studios to watch this year', status: 'live' }],
  };
  const fields = { 'd-w1': { title: 'Neighborhood café rebrand', date: '2026-09', summary: 'A warm identity, menus and window posters for a corner café.', image: null, gallery: [] } };
  const pages = {
    intros: { revision: 1, fields: { photography: 'Portraits, places and productions, shot in the studio and around town.' } },
    home: { revision: 1, fields: { announcementTitle: 'New season, new studio', announcementText: 'We moved into a bigger pond. Come and see the space at our open night.', announcementLink: 'events-shows.html', gramLabel: 'Studio moments', gramUrl: '' } },
    about: { revision: 1, fields: { story: 'Frog Pond Boys started as three friends making posters for the people around them.', ethos: 'We keep things simple, playful and honest.', photos: [], team: [{ name: 'The advertising frog', role: 'Campaigns and brand ideas' }] } },
    contact: { revision: 1, fields: { intro: 'A project, a question or just a hello: write to us.', email: 'hello@example.com', socials: [] } },
    join: { revision: 1, fields: { intro: 'We are always happy to meet curious people.', positions: [{ title: 'Junior designer', type: 'Full time' }] } },
  };
  const talks = [
    { id: 'd-t1', box: 'cv', state: 'open', unread: true, name: 'Sample Applicant A', email: 'applicant.a@example.com', subject: 'Junior designer', messages: [{ from: 'them', at: ago(50), facts: 'Application · Junior designer · +1 000 000 0000', text: 'Sample cover note, as the person wrote it on the site.', attachments: [{ id: 'cv1', name: 'sample-resume.pdf', size: '412 KB' }] }] },
    { id: 'd-t2', box: 'cv', state: 'open', unread: true, name: 'Sample Applicant B', email: 'applicant.b@example.com', subject: 'Open application', messages: [{ from: 'them', at: ago(1500), facts: 'Open application', text: 'Sample message.', attachments: [{ id: 'cv2', name: 'resume.pdf', size: '230 KB' }] }] },
    { id: 'd-t3', box: 'cv', state: 'archived', unread: false, name: 'Sample Applicant C', email: 'applicant.c@example.com', subject: 'Video intern', messages: [{ from: 'them', at: ago(20000), text: 'Sample message.', attachments: [] }, { from: 'us', at: ago(19000), text: 'Thanks for your interest!', status: 'sent' }] },
    { id: 'd-t4', box: 'msg', state: 'open', unread: true, name: 'Sample Sender', email: 'sender@example.com', subject: 'Contact form', messages: [{ from: 'them', at: ago(90), text: 'Hi, this is a sample message sent from the Contact page.', attachments: [] }] },
  ];
  const people = [{ email: 'demo@frogpondboys.com', me: true }, { email: 'partner@example.com' }];
  let settings = { notifications: { cv: true, msg: true }, signature: 'The Frog Pond Boys team' };
  const publishes = [{ id: 'p2', at: ago(30), summary: '2 items published' }, { id: 'p1', at: ago(1500), summary: '1 item published' }];
  const media = {};
  const findItem = id => Object.entries(items).flatMap(([section, list]) => list.map(item => ({ section, item }))).find(entry => entry.item.id === id);
  const wait = value => new Promise(resolve => setTimeout(() => resolve(structuredClone(value)), 120));
  function handle(method, path, body) {
    const [route, query] = path.split('?'); const params = new URLSearchParams(query); const parts = route.split('/').filter(Boolean);
    if (route === '/sections') return wait(Object.fromEntries(SECTIONS.flatMap(group => group.items).filter(section => section.kind !== 'page').map(section => [section.slug, (items[section.slug] || []).length])));
    if (route === '/items' && method === 'GET') return wait((items[params.get('section')] || []).map(item => ({ ...item, thumb: fields[item.id]?.image ? media[fields[item.id].image.mediaId] : '' })));
    if (route === '/items' && method === 'POST') { const id = newId('d-new'); (items[body.section] ||= []).unshift({ id, title: body.fields.title, status: 'draft' }); fields[id] = body.fields; return wait({ id, revision: 1, status: 'draft', fields: body.fields }); }
    if (parts[0] === 'items') {
      const found = findItem(parts[1]); if (!found) return Promise.reject(Object.assign(new Error('Item not found.'), { status: 404 }));
      if (method === 'GET') return wait({ id: found.item.id, revision: 1, status: found.item.status, fields: fields[found.item.id] || { title: found.item.title }, media });
      if (method === 'PUT') { fields[found.item.id] = body.fields; found.item.title = body.fields.title; if (found.item.status === 'live') found.item.status = 'changed'; return wait({ id: found.item.id, revision: 2, status: found.item.status, fields: body.fields }); }
      if (parts[2] === 'publish') { found.item.status = 'live'; publishes.unshift({ id: newId('p'), at: new Date().toISOString(), summary: `“${found.item.title}” published` }); return wait({ message: 'Demo mode: nothing is really published.', item: { status: 'live' } }); }
      if (parts[2] === 'unpublish') { found.item.status = 'draft'; return wait({}); }
      if (method === 'DELETE') { items[found.section] = items[found.section].filter(item => item !== found.item); return wait({}); }
    }
    if (parts[0] === 'pages') { const page = pages[parts[1]]; if (parts[2] === 'publish') return wait({ message: 'Demo mode: nothing is really published.' }); if (method === 'PUT') { page.fields = body.fields; page.revision++; } return wait({ ...page, media }); }
    if (route === '/media') { const id = newId('m'); media[id] = `data:image/*;base64,${body.base64}`; return wait({ mediaId: id, src: media[id] }); }
    if (route === '/conversations') return wait(talks.filter(talk => talk.box === params.get('box') && (params.get('state') === 'archived' ? talk.state === 'archived' : talk.state !== 'archived')).map(talk => ({ id: talk.id, name: talk.name, email: talk.email, unread: talk.unread, lastAt: talk.messages.at(-1).at, preview: (talk.messages.at(-1).from === 'us' ? 'You: ' : '') + talk.messages.at(-1).text })));
    if (parts[0] === 'conversations') {
      const talk = talks.find(item => item.id === parts[1]);
      if (method === 'GET') { talk.unread = false; return wait(talk); }
      if (parts[2] === 'replies') { talk.messages.push({ from: 'us', at: new Date().toISOString(), text: `${body.text}\n\n${settings.signature}`, status: 'sent' }); return wait({}); }
      if (parts[2] === 'state') { talk.state = body.state === 'callback' ? 'open' : body.state; return wait({}); }
      if (method === 'DELETE') { talks.splice(talks.indexOf(talk), 1); return wait({}); }
    }
    if (route === '/settings') { if (method === 'PUT') settings = body; return wait(settings); }
    if (route === '/people') { if (method === 'POST') people.push({ email: body.email }); return wait(people); }
    if (parts[0] === 'people' && method === 'DELETE') { people.splice(people.findIndex(person => person.email === decodeURIComponent(parts[1])), 1); return wait({}); }
    if (route === '/publishes') return wait(publishes);
    if (parts[0] === 'publishes') return wait({ message: 'Demo mode: the site has not changed.' });
    return Promise.reject(new Error('Unknown action.'));
  }
  return { handle };
})();

start();
