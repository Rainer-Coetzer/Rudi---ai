import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memories.json');

export interface Experience {
  id: string;
  timestamp: string;
  type: 'lesson' | 'preference' | 'pattern';
  content: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMemories(): { memories: Experience[] } {
  try {
    ensureDataDir();
    if (!fs.existsSync(MEMORY_FILE)) return { memories: [] };
    const content = fs.readFileSync(MEMORY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[MEMORY] Error reading memories:', err);
    return { memories: [] };
  }
}

function saveMemories(data: { memories: Experience[] }) {
  try {
    ensureDataDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[MEMORY] Error saving memories:', err);
  }
}

/**
 * Persists a new interaction experience for long-term recall.
 */
export function recordExperience(content: string, type: Experience['type'] = 'lesson'): Experience {
  const data = readMemories();
  const experience: Experience = {
    id: Date.now().toString(36),
    timestamp: new Date().toISOString(),
    type,
    content
  };
  data.memories.push(experience);
  saveMemories(data);
  return experience;
}

/**
 * Retrieves memories for context injection.
 * For now, returns the last 10 experiences.
 */
export function getContextMemories(limit = 10): string {
  const { memories } = readMemories();
  if (memories.length === 0) return '';
  
  return memories
    .slice(-limit)
    .map(m => `[RECALL: ${m.type.toUpperCase()}] (${new Date(m.timestamp).toLocaleDateString()}): ${m.content}`)
    .join('\n');
}

/**
 * List all memories in a structured format.
 */
export function listMemories() {
  return readMemories().memories;
}

/**
 * Delete a specific memory by ID.
 */
export function deleteMemory(id: string): boolean {
  const data = readMemories();
  const initialCount = data.memories.length;
  data.memories = data.memories.filter(m => m.id !== id);
  if (data.memories.length !== initialCount) {
    saveMemories(data);
    return true;
  }
  return false;
}
