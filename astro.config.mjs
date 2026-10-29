import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  cacheDir: `.astro/${process.env.FPB_VARIANT ?? 'a'}/`,
  server: { host: '127.0.0.1' },
  vite: { cacheDir: `.cache/vite-${process.env.FPB_VARIANT ?? 'a'}`, server: { strictPort: true, proxy: { '^/api/v2/forms/(contact|join)$': { target: 'http://127.0.0.1:4323', changeOrigin: true } }, fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.local-editor/**', '**/editor/**', '**/*.pem', '**/*.crt'] } } },
  compressHTML: false,
  build: { format: 'file' },
});
