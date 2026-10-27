/**
 * Rudi Undo System
 * Snapshots the state of a file before modifying it, allowing for autonomous rollback.
 */

import fs from 'fs/promises';
import { existsSync, readFileSync, statSync } from 'fs'; // sync used only for initial snapshot to avoid blocking tool execution start

interface Snapshot {
  id: string;
  timestamp: number;
  filePath: string;
  content: string; // The content of the file *before* modification
  action: 'write' | 'delete' | 'rename' | 'append';
  oldPath?: string; // used for rename
}

// In-memory stack for now (cap at 10)
const undoStack: Snapshot[] = [];

export function captureSnapshot(filePath: string, action: Snapshot['action'], oldPath?: string) {
  try {
    let content = '';
    if (existsSync(filePath)) {
      const stats = statSync(filePath);
      // Safety Cap: Don't store more than 1MB in memory
      if (stats.size > 1024 * 1024) {
        console.warn(`[UNDO SYSTEM] File too large for snapshot: ${filePath}`);
        return;
      }
      content = readFileSync(filePath, 'utf-8');
    }

    undoStack.push({
      id: Date.now().toString(),
      timestamp: Date.now(),
      filePath,
      content,
      action,
      oldPath
    });

    if (undoStack.length > 20) {
      undoStack.shift(); 
    }
  } catch (err) {
    console.error(`[UNDO SYSTEM] Failed to capture snapshot: ${filePath}`, err);
  }
}

/**
 * Undo the most recent file change.
 */
export async function undoLastAction(): Promise<{ success: boolean; result: string }> {
  if (undoStack.length === 0) {
    return { success: false, result: 'Nothing to undo.' };
  }

  const snapshot = undoStack.pop()!;
  
  try {
    if (snapshot.action === 'write' || snapshot.action === 'append' || snapshot.action === 'delete') {
      if (snapshot.content === '') {
        const exists = await fs.access(snapshot.filePath).then(() => true).catch(() => false);
        if (exists) await fs.unlink(snapshot.filePath);
      } else {
        const tempPath = snapshot.filePath + '.undo';
        await fs.writeFile(tempPath, snapshot.content, 'utf-8');
        await fs.rename(tempPath, snapshot.filePath);
      }
      return { success: true, result: `Restored ${snapshot.filePath} to previous state.` };
    }
    
    if (snapshot.action === 'rename' && snapshot.oldPath) {
      const exists = await fs.access(snapshot.filePath).then(() => true).catch(() => false);
      if (exists) {
        await fs.rename(snapshot.filePath, snapshot.oldPath);
        return { success: true, result: `Reverted rename. Restored ${snapshot.oldPath}` };
      }
    }

    return { success: false, result: 'Unknown action type.' };
  } catch (err) {
    return { success: false, result: `Undo failed: ${(err as Error).message}` };
  }
}

/**
 * Get available undos
 */
export function getUndoStack() {
  return [...undoStack].reverse();
}
