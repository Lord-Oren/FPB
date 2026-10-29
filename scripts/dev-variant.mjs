import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const variant = process.argv[2];
if (!['a', 'b'].includes(variant)) throw new Error('Use a or b');
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)), 'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', variant === 'a' ? '4321' : '4322'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', env: { ...process.env, FPB_VARIANT: variant, ASTRO_TELEMETRY_DISABLED: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
