// node --test backend/knowledgeStore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Point both the legacy and the current data dir into a temp folder before
// knowledgeStore.js computes its paths.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rudi-kb-'));
process.env.APPDATA = tmp;
process.env.XDG_CONFIG_HOME = tmp;
process.env.RUDI_USER_DATA = path.join(tmp, 'user-data');

const legacyDir = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'rudi-app')
  : path.join(tmp, 'rudi-app');
const legacyFile = path.join(legacyDir, 'knowledge_base.json');
const legacyEntries = [{ id: 'kb_old_1', source: 'old.pdf', content: 'legacy quantum notes', timestamp: '2025-01-01T00:00:00.000Z' }];

test('migrates the legacy knowledge base into RUDI_USER_DATA and keeps the original', { skip: process.platform === 'darwin' }, async () => {
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(legacyFile, JSON.stringify(legacyEntries));

  const kb = await import('./knowledgeStore.js');
  assert.equal(kb.KB_PATH, path.join(tmp, 'user-data', 'knowledge_base.json'));

  assert.deepEqual(await kb.listKnowledge(), legacyEntries);
  assert.deepEqual(JSON.parse(fs.readFileSync(kb.KB_PATH, 'utf-8')), legacyEntries);

  await kb.addKnowledge({ source: 'new.txt', content: 'fresh entry' });
  const saved = JSON.parse(fs.readFileSync(kb.KB_PATH, 'utf-8'));
  assert.equal(saved.length, 2);
  assert.equal(saved[0].id, 'kb_old_1');

  // Original untouched, so nothing is lost if the user downgrades.
  assert.deepEqual(JSON.parse(fs.readFileSync(legacyFile, 'utf-8')), legacyEntries);
});

test('never overwrites an existing knowledge base with the legacy one', { skip: process.platform === 'darwin' }, async () => {
  process.env.RUDI_USER_DATA = path.join(tmp, 'user-data-2');
  const current = [{ id: 'kb_current', source: 'now.txt', content: 'current', timestamp: '2026-01-01T00:00:00.000Z' }];
  fs.mkdirSync(process.env.RUDI_USER_DATA, { recursive: true });
  fs.writeFileSync(path.join(process.env.RUDI_USER_DATA, 'knowledge_base.json'), JSON.stringify(current));

  // Fresh module instance so it picks up the new RUDI_USER_DATA.
  const kb = await import('./knowledgeStore.js?existing');
  assert.deepEqual(await kb.listKnowledge(), current);

  fs.rmSync(tmp, { recursive: true, force: true });
});
