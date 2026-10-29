const legacy = ['presentations','music','media-relations','influencer-relations','events-launches'];
export const pages = [
  {
    "slug": "case-studies",
    "title": "Case Studies",
    "group": "Advertising"
  },
  {
    "slug": "presentations",
    "title": "Presentations",
    "group": "Advertising"
  },
  {
    "slug": "mock-ads",
    "title": "Mock Ads",
    "group": "Advertising"
  },
  {
    "slug": "client-work",
    "title": "Client Work",
    "group": "Advertising"
  },
  {
    "slug": "magazine",
    "title": "Magazine",
    "group": "Creative"
  },
  {
    "slug": "events-shows",
    "title": "Events & Shows",
    "group": "Creative"
  },
  {
    "slug": "films-videos",
    "title": "Films & Videos",
    "group": "Creative"
  },
  {
    "slug": "photography",
    "title": "Photography",
    "group": "Creative"
  },
  {
    "slug": "music",
    "title": "Music",
    "group": "Creative"
  },
  {
    "slug": "collabs",
    "title": "Collabs",
    "group": "Creative"
  },
  {
    "slug": "press",
    "title": "Press",
    "group": "PR"
  },
  {
    "slug": "media-relations",
    "title": "Media Relations",
    "group": "PR"
  },
  {
    "slug": "influencer-relations",
    "title": "Influencer Relations",
    "group": "PR"
  },
  {
    "slug": "events-launches",
    "title": "Events & Launches",
    "group": "PR"
  },
  {
    "slug": "contact",
    "title": "Contact",
    "group": "The pond"
  },
  {
    "slug": "join",
    "title": "Join Us",
    "group": "The pond"
  },
  {
    "slug": "about",
    "title": "About",
    "group": "The pond"
  }
,
  {slug:'gram',title:'Gram',group:'The pond'},
  {slug:'croak',title:'Croak',group:'The pond'},
  {slug:'legal',title:'Legal',group:'The pond'},
  {slug:'prc',title:'PRC',group:'PR'},
  {slug:'recognition',title:'Recognition',group:'PR'},
  {slug:'statements',title:'Statements',group:'PR'}
].map(page => ({...page, hidden:legacy.includes(page.slug)}));
export const menuPages = group => pages.filter(page => page.group === group && !page.hidden).sort((a,b)=>a.title.localeCompare(b.title,'en'));
