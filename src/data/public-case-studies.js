import snapshot from './case-studies-public.json';
import { preparePublicCases } from './case-studies.js';
import { validatePublicMedia } from './validate-public-media.js';
await validatePublicMedia(snapshot);
export const caseStudies = preparePublicCases(snapshot);
