import snapshot from './site-content.json';
import { prepareSiteContent } from './site-content.js';
import { look } from './presentation.js';
export const site = prepareSiteContent(snapshot, { prefer: look === 'pixel' ? 'pixel' : '' });
