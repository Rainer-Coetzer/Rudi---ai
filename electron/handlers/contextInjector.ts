import fs from 'fs';
import path from 'path';
import activeWin from 'active-win';

/**
 * Project Context Injector
 * Detects the active project based on the focused window and injects metadata into the prompt.
 */
export async function getProjectContext(): Promise<string> {
  try {
    const active = await activeWin();
    if (!active || !active.owner.path) return '';

    // Strategy: If it's VS Code, try to find the project root from the window title or path
    // For now, we'll use the current working directory of the process as a fallback,
    // or attempt to find the nearest package.json/README.md from the active app's context.
    
    const root = process.cwd();
    const pkgPath = path.join(root, 'package.json');
    const readmePath = path.join(root, 'README.md');

    let context = `\n\n[PROJECT_CONTEXT]\nRoot: ${root}\n`;

    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
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
