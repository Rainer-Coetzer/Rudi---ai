import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { getUserDataDir, getLegacyDataDir } from './paths.js';

let kbCache = null;
let idCounter = 0;
// Lowercased content per entry, kept off the persisted objects.
const lowerCache = new WeakMap();
let kbQueue = Promise.resolve();

const KB_FILE = 'knowledge_base.json';
export const KB_PATH = path.join(getUserDataDir(), KB_FILE);
const LEGACY_KB_PATH = path.join(getLegacyDataDir(), KB_FILE);

/**
 * One-time move from %APPDATA%/rudi-app: copies the old file in if there is no
 * knowledge base here yet. The old file is left in place as a backup.
 */
async function migrateLegacyStore() {
  if (path.resolve(LEGACY_KB_PATH) === path.resolve(KB_PATH)) return;
  try {
    await fs.access(KB_PATH);
    return;
  } catch {
    // no current store — fall through
  }
  try {
    await fs.mkdir(path.dirname(KB_PATH), { recursive: true });
    await fs.copyFile(LEGACY_KB_PATH, KB_PATH, fsConstants.COPYFILE_EXCL);
    console.log(`[KB] Migrated knowledge base from ${LEGACY_KB_PATH}`);
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'EEXIST') {
      console.error(`[KB] Could not migrate ${LEGACY_KB_PATH}: ${err.message}`);
    }
  }
}

async function loadStore() {
  if (kbCache) return kbCache;
  await migrateLegacyStore();
  try {
    const raw = await fs.readFile(KB_PATH, 'utf-8');
    kbCache = JSON.parse(raw);
    return kbCache;
  } catch {
    kbCache = [];
    return kbCache;
  }
}

async function saveStore(entries) {
  const dir = path.dirname(KB_PATH);
  const tempPath = KB_PATH + '.tmp';
  
  await fs.mkdir(dir, { recursive: true });
  // Atomic write pattern: write to temp, then rename
  await fs.writeFile(tempPath, JSON.stringify(entries), 'utf-8');
  await fs.rename(tempPath, KB_PATH);
  kbCache = entries;
}

function makeEntry(entry) {
  return { id: `kb_${Date.now()}_${idCounter++}`, ...entry, timestamp: new Date().toISOString() };
}

export async function addKnowledge(entry) {
  const [added] = await addKnowledgeBatch([entry]);
  return added;
}

/** Adds many entries with a single disk write. */
export async function addKnowledgeBatch(entries) {
  return (kbQueue = kbQueue.catch(() => {}).then(async () => {
    const store = await loadStore();
    const added = entries.map(makeEntry);
    store.push(...added);
    await saveStore(store);
    return added;
  }));
}

export async function listKnowledge() {
  return loadStore();
}

export async function deleteKnowledge(id) {
  return (kbQueue = kbQueue.then(async () => {
    const store = await loadStore();
    const filtered = store.filter(e => e.id !== id);
    await saveStore(filtered);
  }));
}

/**
 * Returns top-K most relevant chunks for a given query (keyword-based).
 */
export async function getRelevantContext(query, topK = 3) {
  const store = await loadStore();
  if (!store.length || !query) return '';

  const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const scored = store.map(entry => {
    let text = lowerCache.get(entry);
    if (text === undefined) {
      text = (entry.content || '').toLowerCase();
      lowerCache.set(entry, text);
    }
    const score = terms.reduce((acc, term) => acc + (text.includes(term) ? 1 : 0), 0);
    return { entry, score };
  });

  const top = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.entry);

  if (!top.length) return '';

  return '\n\n[KNOWLEDGE CONTEXT — from ingested documents]\n' +
    top.map(e => `--- ${e.source} ---\n${e.content.slice(0, 800)}`).join('\n\n');
}
