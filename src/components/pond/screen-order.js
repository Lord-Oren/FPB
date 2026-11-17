// The lily-pad screens in alphabetical order of their names (client feedback of 17 Nov 2026), on A and B, so a renamed
// screen moves to its place by itself. Case, accents and punctuation ("Recent.") do not change the order.
// Pond Desk lists them the same way (editor/v2/app.js, byScreenName).
const collator = new Intl.Collator('en', { sensitivity: 'base', ignorePunctuation: true, numeric: true });
export const screenOrder = nodes => [...nodes].sort((a, b) => collator.compare(a.title, b.title) || String(a.id).localeCompare(String(b.id)));
