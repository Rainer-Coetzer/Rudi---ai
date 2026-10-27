import os from 'os';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Keep sidecar modules that touch user data away from the real profile.
    env: { RUDI_USER_DATA: path.join(os.tmpdir(), 'rudi-test-data') },
    include: ['src/**/*.test.ts', 'sidecar/**/*.test.ts'],
  },
});
