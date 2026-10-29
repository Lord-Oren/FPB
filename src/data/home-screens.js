import { site } from './public-site-content.js';
import { caseStudies } from './public-case-studies.js';
import { pages } from './public-pages.js';

// What the three home TV screens show, shared by A and B.
const titleOf = slug => pages.find(page => page.slug === slug)?.title ?? slug;
const latestWork = [...site.works].sort((a, b) => b.date.localeCompare(a.date))[0];
export const announcement = site.home.announcement;
export const gram = site.home.gram;
export const recents = [
  ...caseStudies.slice(0, 1).map(item => ({ label: item.title, href: item.href })),
  ...(latestWork ? [{ label: latestWork.title, href: `${latestWork.rubric}.html` }] : []),
  { label: titleOf('case-studies'), href: 'case-studies.html' },
].slice(0, 2);
