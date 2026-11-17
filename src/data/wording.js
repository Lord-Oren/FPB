// Shared editing contract. Values stay plain text; rendering must use escaped text nodes.
export const wordingDefaults = Object.freeze({
  "home.latestEmpty": "New work is on its way.",
  "home.newsEmpty": "News is on its way.",
  "home.ribbitEmpty": "New photos are on their way.",
  "home.croakEmpty": "A new song is on its way.",
  "home.announcementLabel": "Announcement",
  "home.tuneIn": "Tune in",
  "home.instagramLink": "Follow us on Instagram ↗",
  "home.title": "FROG POND BOYS",
  "nav.back": "← Back to the pond",
  "nav.home": "Grand Central",
  "footer.copyright": "© 2026 Frog Pond Boys",
  "footer.pauseMotion": "Pause motion",
  "footer.resumeMotion": "Resume motion",
  "empty.title": "New work is on its way.",
  "empty.suggestion": "Meanwhile, take a look at our",
  "empty.backHome": "go back to the pond",
  "empty.page": "New content is on its way.",
  "work.view": "View project",
  "work.allImages": "See all images",
  "work.video": "Video",
  "work.audio": "Audio",
  "events.upcoming": "Upcoming",
  "events.details": "Details",
  "events.none": "No date announced right now. Follow us to hear first.",
  "case.readSummary": "Read the summary",
  "case.pdfNote": "(PDF, opens in a new tab)",
  "case.openPdf": "Open the full case study (PDF)",
  "case.all": "All case studies",
  "case.client": "Client:",
  "case.context": "Context",
  "case.work": "Our work",
  "case.results": "Results",
  "case.gallery": "Gallery",
  "about.ctaTitle": "Work with us",
  "about.ctaText": "Got a project, or want to join the team?",
  "about.ctaProject": "Start a project",
  "about.ctaJoin": "Join the pond",
  "form.required": "Fields marked * are required.",
  "form.name": "Your name",
  "form.email": "Email",
  "form.message": "Your message",
  "form.send": "Send message",
  "form.closed": "Online sending opens soon.",
  "form.closedWithEmail": "Online sending opens soon. Meanwhile, write to us at",
  "form.privacy": "Privacy policy",
  "form.missing": "Please complete this field.",
  "join.openPositions": "Open positions",
  "join.spontaneous": "Nothing that fits? Send a spontaneous application below.",
  "join.fullName": "Full name",
  "join.phone": "Phone",
  "join.why": "Why would you like to join us?",
  "join.fileLabel": "Your CV, portfolio or a piece of your work",
  "join.optional": "(optional)",
  "join.fileHelp": "One file: PDF, Word (DOCX), image (JPG, PNG, WebP) or short video (MP4, WebM), up to 10 MB. Bigger than that? Add a link below instead.",
  "join.linkLabel": "Link to your work",
  "join.linkHelp": "A portfolio, a video or a shared folder. It must start with https://",
  "join.send": "Send application",
  "join.fileType": "Please choose a PDF, a Word file (DOCX), an image (JPG, PNG, WebP) or a short video (MP4, WebM). Save older Word files (DOC) as PDF first.",
  "join.fileEmpty": "This file is empty. Please choose another one.",
  "join.fileTooLarge": "This file is too large (10 MB maximum). Please send a link instead, or contact us by email.",
  "legal.intro": "Our Privacy Policy and Terms of Service.",
  "legal.pdfLink": "Read the Privacy Policy and Terms of Service (PDF)",
  "legal.pending": "The document will be published here soon. For any question,",
  "legal.contactLink": "contact us",
  "croak.label": "Song of the Week"
});
const longKeys = new Set(["events.none", "about.ctaText", "form.closedWithEmail", "join.spontaneous", "join.fileHelp", "join.linkHelp", "join.fileType", "join.fileTooLarge", "legal.pending"]);
export const wordingLimits = Object.freeze(Object.fromEntries(Object.keys(wordingDefaults).map(key => [key, longKeys.has(key) ? 600 : 240])));
const forbidden = /[<>\u0000-\u001f\u2028\u2029\u007f\u202a-\u202e\u2066-\u2069]/u;
function invalid(field, message) {
  const error = new Error(message); error.status = 422;
  error.diagnostics = [{field, message}]; throw error;
}
// A complete replacement: omitted keys reset to blank, just like an empty field.
export function validateWording(input = {}) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) invalid('wording', 'Site wording must be an object.');
  // Retired field accepted only for legacy snapshots/older open editor tabs.
  // It is validated but never returned or exposed as an editable field.
  for (const key of Object.keys(input)) if (!Object.hasOwn(wordingDefaults, key)) {
    if (key !== 'contact.emailLabel') invalid(key, 'Unknown site wording field.');
    if (typeof input[key] !== 'string' || input[key].length > 240 || forbidden.test(input[key]))
      invalid(key, 'Use plain text on one line, without HTML, up to 240 characters.');
  }
  return Object.fromEntries(Object.keys(wordingDefaults).map(key => {
    const value = Object.hasOwn(input, key) ? input[key] : '';
    if (typeof value !== 'string' || value.length > wordingLimits[key] || forbidden.test(value))
      invalid(key, `Use plain text on one line, without HTML, up to ${wordingLimits[key]} characters.`);
    return [key, value.trim()];
  }));
}
export function resolveWording(input) {
  return Object.fromEntries(Object.entries(validateWording(input)).map(([key, value]) => [key, value || wordingDefaults[key]]));
}
