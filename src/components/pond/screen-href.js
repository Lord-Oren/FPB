// Where each lily-pad screen of the home page leads (meeting of 13 November 2026): the block title is the link,
// and the four home blocks scroll down to their own part of the home page instead of opening another page.
const homeParts = { announcements: '#news', recents: '#latest', gram: '#ribbit', croak: '#croak' };
export const screenHref = (node, nodeHref) => homeParts[node.id] ?? nodeHref(node);
export const screenNewTab = node => !homeParts[node.id] && node.newTab;
