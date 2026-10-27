import fs from 'fs';
import path from 'path';
import { getUserDataDir } from './platform';

// Skills are stored in a dedicated folder in userData for persistence
const SKILLS_DIR = path.join(getUserDataDir(), 'skills');

export interface Skill {
  name: string;
  protocol: string;
  lastUpdated: string;
}

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

/**
 * Persists a new protocol/skill.
 */
export async function saveSkill(name: string, protocol: string): Promise<Skill> {
  ensureSkillsDir();
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filePath = path.join(SKILLS_DIR, `${safeName}.md`);
  
  await fs.promises.writeFile(filePath, protocol, 'utf-8');
  
  return {
    name,
    protocol,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Lists all learned skills.
 */
export async function listSkills(): Promise<string[]> {
  ensureSkillsDir();
  const files = await fs.promises.readdir(SKILLS_DIR);
  return files
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));
}

/**
 * Loads a specific skill protocol.
 */
export async function loadSkill(name: string): Promise<string> {
  ensureSkillsDir();
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filePath = path.join(SKILLS_DIR, `${safeName}.md`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Skill protocol for '${name}' not found.`);
  }
  
  return await fs.promises.readFile(filePath, 'utf-8');
}

/**
 * Deletes a skill.
 */
export async function deleteSkill(name: string): Promise<boolean> {
  ensureSkillsDir();
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filePath = path.join(SKILLS_DIR, `${safeName}.md`);
  
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    return true;
  }
  return false;
}
