import fs from 'fs';
import path from 'path';
import { getUserDataDir } from './platform';

const DATA_DIR = path.join(getUserDataDir(), 'data');
const NOTES_FILE = path.join(DATA_DIR, 'meeting_notes.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: string;
}

interface NotesFile {
  notes: MeetingNote[];
}

function readNotes(): NotesFile {
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

function writeNotes(data: NotesFile) {
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
  return data.notes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function deleteMeetingNote(id: string) {
  const data = readNotes();
  const initialLength = data.notes.length;
  data.notes = data.notes.filter((n) => n.id !== id);
  if (data.notes.length !== initialLength) {
    writeNotes(data);
    return true;
  }
  return false;
}
