/**
 * Rudi Persistent Logging System
 * Writes structured logs to the logs/ directory in userData.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB rotation

export type LogCategory = 'activity' | 'tasks' | 'changes' | 'errors' | 'self-improvements';

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogPath(category: LogCategory): string {
  return path.join(LOG_DIR, `${category}.log`);
}

function buildEntry(level: 'INFO' | 'WARN' | 'ERROR', source: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] [${source}] ${message}\n`;
}

function rotateIfNeeded(filePath: string) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size >= MAX_LOG_BYTES) {
      const rotated = filePath.replace('.log', `.${Date.now()}.log`);
      fs.renameSync(filePath, rotated);
    }
  } catch {
    // File doesn't exist yet — no rotation needed
  }
}

/**
 * Append a log entry to the specified category file.
 */
export function writeLog(
  category: LogCategory,
  source: string,
  message: string,
  level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'
) {
  try {
    ensureLogDir();
    const filePath = getLogPath(category);
    rotateIfNeeded(filePath);
    const entry = buildEntry(level, source, message);
    fs.appendFileSync(filePath, entry, 'utf-8');
  } catch (err) {
    console.error('[LOGGER] Failed to write log:', err);
  }
}

/**
 * Read the last N lines from a log file.
 */
export function readLog(category: LogCategory, maxLines = 200): string[] {
  try {
    ensureLogDir();
    const filePath = getLogPath(category);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

/**
 * Clear a specific log file.
 */
export function clearLog(category: LogCategory) {
  try {
    const filePath = getLogPath(category);
    if (fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf-8');
  } catch (err) {
    console.error('[LOGGER] Failed to clear log:', err);
  }
}

/**
 * Get the logs directory path (for display in UI).
 */
export function getLogDir(): string {
  return LOG_DIR;
}

// Convenience wrappers
export const log = {
  activity:        (source: string, msg: string) => writeLog('activity', source, msg),
  task:            (source: string, msg: string) => writeLog('tasks', source, msg),
  change:          (source: string, msg: string) => writeLog('changes', source, msg),
  error:           (source: string, msg: string) => writeLog('errors', source, msg, 'ERROR'),
  selfImprovement: (source: string, msg: string) => writeLog('self-improvements', source, msg),
};
