import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const NOTES_FILE = path.join(DATA_DIR, 'meeting_notes.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readNotes() {
  try {
    ensureDataDir();
    if (!fs.existsSync(NOTES_FILE)) {
      fs.writeFileSync(NOTES_FILE, JSON.stringify({ notes: [] }, null, 2), 'utf-8');
      return { notes: [] };
    }
    const content = fs.readFileSync(NOTES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[MEETING NOTES] Error reading notes:', err);
    return { notes: [] };
  }
}

function writeNotes(data: any) {
  try {
    ensureDataDir();
    fs.writeFileSync(NOTES_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[MEETING NOTES] Error writing notes:', err);
    return false;
  }
}

export function recordMeetingNote(title: string, content: string, date?: string) {
  const data = readNotes();
  const newNote = {
    id: Date.now().toString(),
    title,
    content,
    date: date || new Date().toISOString()
  };
  data.notes.push(newNote);
  writeNotes(data);
  return { success: true, note: newNote };
}

export function listMeetingNotes() {
  const data = readNotes();
  return data.notes.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function deleteMeetingNote(id: string) {
  const data = readNotes();
  const initialLength = data.notes.length;
  data.notes = data.notes.filter((n: any) => n.id !== id);
  if (data.notes.length !== initialLength) {
    writeNotes(data);
    return true;
  }
  return false;
}
