// Imported first by server.js so every module sees the loaded variables.
// Real environment wins, then backend/.env (dev checkout), then <user data>/.env
// (installed app, where backend/ is a read-only resource folder).
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserDataDir } from './paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: [path.join(here, '.env'), path.join(getUserDataDir(), '.env')], quiet: true });
