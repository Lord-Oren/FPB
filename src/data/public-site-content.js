import snapshot from './site-content.json';
import { prepareSiteContent } from './site-content.js';
import { look } from './presentation.js';
export const site = prepareSiteContent(snapshot, { prefer: look === 'pixel' ? 'pixel' : '' });
// Compatibility export until the renderer removes its old banner in T2.
export const isDemo = false;
