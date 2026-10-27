/**
 * Workspace — single source of truth for the user's active project root.
 *
 * Two roots exist:
 *   getRudiRoot()      — frozen at startup; always Rudi's own install dir.
 *                        Used by self_inspect / self_improve ONLY.
 *   getWorkspaceRoot() — user-selected, persisted; used by all file/terminal tools.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getUserDataDir } from './platform';

// Frozen at module load — never changes at runtime.
const RUDI_ROOT: string = process.cwd();

const DATA_DIR = path.join(getUserDataDir(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

interface Settings {
  workspaceRoot: string;
}

function readSettings(): Settings {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) return { workspaceRoot: os.homedir() };
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) as Settings;
  } catch {
    return { workspaceRoot: os.homedir() };
  }
}

function writeSettings(settings: Settings): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[WORKSPACE] Failed to persist settings:', (err as Error).message);
  }
}

// In-memory cache — loaded once, updated on change.
let _workspaceRoot: string = readSettings().workspaceRoot;

/** Rudi's own install directory. Use ONLY for self_inspect / self_improve. */
export function getRudiRoot(): string {
  return RUDI_ROOT;
}

/** The user's active project directory. Use for all file/terminal/context tools. */
export function getWorkspaceRoot(): string {
  return _workspaceRoot;
}

/**
 * Change the active workspace. Validates the path exists and is a directory,
 * then persists. Returns true on success.
 */
export function setWorkspaceRoot(newPath: string): boolean {
  try {
    const resolved = path.resolve(newPath);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return false;
    _workspaceRoot = resolved;
    writeSettings({ ...readSettings(), workspaceRoot: resolved });
    console.log(`[WORKSPACE] Active workspace set to: ${resolved}`);
    return true;
  } catch {
    return false;
  }
}
