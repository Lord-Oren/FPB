import snapshot from './site-content.json';
import { prepareSiteContent } from './site-content.js';
import { look } from './presentation.js';
export const site = prepareSiteContent(snapshot, { prefer: look === 'pixel' ? 'pixel' : '' });
// Shown as a small note on every page while sample content is on the site (snapshot.demo === true).
export const isDemo = snapshot.demo === true;
