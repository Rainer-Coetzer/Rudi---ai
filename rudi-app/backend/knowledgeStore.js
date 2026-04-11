import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let kbCache = null;
let kbQueue = Promise.resolve();

const KB_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'rudi-app', 'knowledge_base.json');

async function loadStore() {
  if (kbCache) return kbCache;
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
  await fs.writeFile(tempPath, JSON.stringify(entries, null, 2), 'utf-8');
  await fs.rename(tempPath, KB_PATH);
  kbCache = entries;
}

export async function addKnowledge(entry) {
  return (kbQueue = kbQueue.then(async () => {
    const store = await loadStore();
    const newEntry = { id: `kb_${Date.now()}`, ...entry, timestamp: new Date().toISOString() };
    store.push(newEntry);
    await saveStore(store);
    return newEntry;
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
    const text = (entry.content || '').toLowerCase();
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
