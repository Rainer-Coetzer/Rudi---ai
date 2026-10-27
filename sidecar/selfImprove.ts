import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { readLog, writeLog } from './logger';

export function selfInspect(projectRoot: string) {
  try {
    const srcDir = path.join(projectRoot, 'src');
    const backendDir = path.join(projectRoot, 'backend');
    const sidecarDir = path.join(projectRoot, 'sidecar');
    const tauriDir = path.join(projectRoot, 'src-tauri', 'src');

    const fileList = [
      ...listFilesRecursive(srcDir),
      ...listFilesRecursive(backendDir),
      ...listFilesRecursive(sidecarDir),
      ...listFilesRecursive(tauriDir)
    ];

    return {
      success: true,
      result: `Inspected project structure. Found ${fileList.length} files. \n\n${fileList.slice(0, 100).join('\n')}\n...`
    };
  } catch (err) {
    return { success: false, result: (err as Error).message };
  }
}

function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  let results: string[] = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    if (file.name === 'node_modules' || file.name === 'dist') continue;
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export async function selfImprove(projectRoot: string, fileRelPath: string, newContent: string) {
  try {
    const filePath = path.join(projectRoot, fileRelPath);
    if (!filePath.startsWith(projectRoot)) {
      return { success: false, result: 'Path traversal prevented in selfImprove.' };
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, result: 'File does not exist.' };
    }

    // Write new content
    fs.writeFileSync(filePath, newContent, 'utf-8');

    // Create a generic self-improvement log entry that represents a commit
    const changelogEntry = `Modified ${fileRelPath} via autonomous self-improvement.`;
    writeLog('self-improvements', 'SelfImprove', changelogEntry);

    // Commit change
    child_process.exec(`git add "${filePath}" && git commit -m "Rudi Self-Improvement: ${fileRelPath}"`, { cwd: projectRoot }, (err) => {
      if (err) console.error('Git auto-commit failed for self improvement:', err);
    });

    return { success: true, result: `Successfully improved ${fileRelPath}.` };
  } catch (err) {
    return { success: false, result: `Self-improvement failed: ${(err as Error).message}` };
  }
}

export function selfChangelog() {
  return readLog('self-improvements');
}
