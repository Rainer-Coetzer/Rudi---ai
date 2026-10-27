/**
 * Replacements for the Electron APIs the privileged layer used to rely on
 * (app.getPath, shell.openExternal, Notification).
 */

import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { emitEvent } from './stdio';

// Same folder Electron used (%APPDATA%/rudi-agent on Windows) so existing data carries over.
const APP_NAME = 'rudi-agent';

export function getUserDataDir(): string {
  if (process.env.RUDI_USER_DATA) return process.env.RUDI_USER_DATA;
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
  }
}

export function openExternal(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error(`Invalid URL: ${url}`));
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new Error(`Refusing to open non-web URL: ${url}`));
  }

  const [cmd, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', parsed.href]]
    : process.platform === 'darwin' ? ['open', [parsed.href]]
    : ['xdg-open', [parsed.href]];

  return new Promise((resolve, reject) => {
    execFile(cmd as string, args as string[], { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

/** Shown natively by the Tauri shell. */
export function notify(title: string, body: string): void {
  emitEvent('notify', { title, body });
}
