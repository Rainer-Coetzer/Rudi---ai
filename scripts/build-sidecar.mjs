/**
 * Bundles the Node sidecar (sidecar/index.ts) into dist-sidecar/index.mjs.
 *
 *   node scripts/build-sidecar.mjs            # dev bundle
 *   node scripts/build-sidecar.mjs --release  # also stages node.exe for Tauri's externalBin
 */

import { build } from 'esbuild';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');

await build({
  entryPoints: [path.join(root, 'sidecar', 'index.ts')],
  outfile: path.join(root, 'dist-sidecar', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: !release,
  minify: release,
  // Some bundled deps still call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

if (release) {
  // Tauri's externalBin wants binaries/<name>-<target-triple>[.exe]
  const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf-8' })
    .split('\n')
    .find(l => l.startsWith('host:'))
    .slice('host:'.length)
    .trim();
  const ext = process.platform === 'win32' ? '.exe' : '';
  const dest = path.join(root, 'src-tauri', 'binaries', `node-${triple}${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(process.execPath, dest);
  console.log(`[sidecar] Staged Node runtime → ${path.relative(root, dest)}`);
}
