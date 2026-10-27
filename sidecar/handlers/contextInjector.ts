import fs from 'fs';
import path from 'path';
import { getWorkspaceRoot } from '../workspace';

/**
 * Project Context Injector
 * Detects the active project based on the focused window and injects metadata into the prompt.
 */
export async function getProjectContext(): Promise<string> {
  try {
    const root = getWorkspaceRoot();
    const pkgPath = path.join(root, 'package.json');
    const readmePath = path.join(root, 'README.md');

    let context = `\n\n[PROJECT_CONTEXT]\nRoot: ${root}\n`;

    if (fs.existsSync(pkgPath)) {
      let pkg: any = {};
      try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* ignore malformed */ }
      context += `Name: ${pkg.name}\nVersion: ${pkg.version}\nScripts: ${Object.keys(pkg.scripts || {}).join(', ')}\n`;
    }

    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, 'utf8').substring(0, 500);
      context += `Summary: ${readme}...\n`;
    }

    return context;
  } catch (err) {
    return '';
  }
}
