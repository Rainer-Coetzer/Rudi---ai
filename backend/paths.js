import path from 'path';
import os from 'os';

const APP_NAME = 'rudi-agent';

function appDataRoot() {
  switch (process.platform) {
    case 'win32':
      return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support');
    default:
      return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
}

/** Same folder the sidecar uses (sidecar/platform.ts getUserDataDir). */
export function getUserDataDir() {
  return process.env.RUDI_USER_DATA || path.join(appDataRoot(), APP_NAME);
}

/** Where the backend kept its data before it shared the sidecar's folder. */
export function getLegacyDataDir() {
  return path.join(appDataRoot(), 'rudi-app');
}
