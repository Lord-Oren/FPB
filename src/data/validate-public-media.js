import sharp from 'sharp';
// Keep native image memory bounded on the free 512 MiB runtime.
sharp.cache(false);sharp.concurrency(1);
import { preparePublicCases } from './case-studies.js';

export async function validatePublicMedia(snapshot) {
  preparePublicCases(snapshot);
  for (const asset of snapshot.media) {
    try {
      const image = sharp(Buffer.from(asset.base64, 'base64'), { limitInputPixels: 4_000_000 });
      const info = await image.metadata();
      if (info.width > 2000 || info.height > 2000 || (info.pages ?? 1) !== 1) throw new Error('Use one non-animated image no larger than 2,000 pixels.');
      // Decode every pixel without retaining an unused full-size JS pixel buffer.
      await image.stats();
    } catch (error) { throw new Error(`Media ${asset.id}: ${error.message}`); }
  }
}
