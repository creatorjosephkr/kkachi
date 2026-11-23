import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function buildMainAndPreload() {
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/main/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    outfile: path.join(rootDir, 'dist/main/index.cjs'),
  });

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/preload/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    outfile: path.join(rootDir, 'dist/preload/index.cjs'),
  });
}

async function waitForPort(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for Vite dev server at ${url}`);
}

async function main() {
  if (!fs.existsSync(path.join(rootDir, 'build/trayTemplate.png'))) {
    await import('./generate-icons.mjs');
  }

  await buildMainAndPreload();

  const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', '5173'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  const cleanup = () => {
    try {
      vite.kill();
    } catch {
      // ignore
    }
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await waitForPort('http://localhost:5173');

  const electronBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron'
  );

  const electronProc = spawn(electronBin, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  });

  electronProc.on('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
