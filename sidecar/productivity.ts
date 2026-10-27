import fs from 'fs';
import path from 'path';
import { getUserDataDir, notify } from './platform';

const DATA_DIR = path.join(getUserDataDir(), 'data');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface Task {
  id: string;
  text: string;
  priority: string;
  status: 'pending' | 'completed';
  created: string;
  completed: string | null;
  tags: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
}

function readJSON<T>(filePath: string, defaultData: T): T {
  try {
    ensureDataDir();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[PRODUCTIVITY] Error reading ${filePath}:`, err);
    return defaultData;
  }
}

function writeJSON(filePath: string, data: unknown) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[PRODUCTIVITY] Error writing ${filePath}:`, err);
    return false;
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────
export function listTasks() {
  const data = readJSON<{ tasks: Task[] }>(TASKS_FILE, { tasks: [] });
  return data.tasks;
}

export function createTask(text: string, priority: string = 'medium', tags: string[] = []) {
  const data = readJSON<{ tasks: Task[] }>(TASKS_FILE, { tasks: [] });
  const newTask: Task = {
    id: Date.now().toString(),
    text,
    priority,
    status: 'pending',
    created: new Date().toISOString(),
    completed: null,
    tags
  };
  data.tasks.push(newTask);
  writeJSON(TASKS_FILE, data);
  return newTask;
}

export function completeTask(id: string) {
  const data = readJSON<{ tasks: Task[] }>(TASKS_FILE, { tasks: [] });
  let found = false;
  data.tasks = data.tasks.map((t) => {
    if (t.id === id) {
      found = true;
      return { ...t, status: 'completed' as const, completed: new Date().toISOString() };
    }
    return t;
  });
  if (found) writeJSON(TASKS_FILE, data);
  return found;
}

export function deleteTask(id: string) {
  const data = readJSON<{ tasks: Task[] }>(TASKS_FILE, { tasks: [] });
  const initialLength = data.tasks.length;
  data.tasks = data.tasks.filter((t) => t.id !== id);
  if (data.tasks.length !== initialLength) {
    writeJSON(TASKS_FILE, data);
    return true;
  }
  return false;
}

// ── Calendar ─────────────────────────────────────────────────────────────
export function readCalendar() {
  const data = readJSON<{ events: CalendarEvent[] }>(CALENDAR_FILE, { events: [] });
  return data.events;
}

export function addEvent(title: string, start: string, end: string, description: string = '') {
  const data = readJSON<{ events: CalendarEvent[] }>(CALENDAR_FILE, { events: [] });
  const newEvent: CalendarEvent = {
    id: Date.now().toString(),
    title,
    start,
    end,
    description
  };
  data.events.push(newEvent);
  writeJSON(CALENDAR_FILE, data);
  return newEvent;
}

export function removeEvent(id: string) {
  const data = readJSON<{ events: CalendarEvent[] }>(CALENDAR_FILE, { events: [] });
  const initialLength = data.events.length;
  data.events = data.events.filter((e) => e.id !== id);
  if (data.events.length !== initialLength) {
    writeJSON(CALENDAR_FILE, data);
    return true;
  }
  return false;
}

export function getUpcomingEvents() {
  const events = readCalendar();
  const now = new Date().toISOString();
  return events
    .filter((e) => e.start >= now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5); // next 5 events
}

// ── Reminders Loop ───────────────────────────────────────────────────────
let reminderInterval: NodeJS.Timeout | null = null;
const notifiedEvents = new Set<string>();

export function startReminderService() {
  if (reminderInterval) clearInterval(reminderInterval);
  
  reminderInterval = setInterval(() => {
    const events = readCalendar();
    const now = new Date();
    
    events.forEach((evt) => {
      const startTime = new Date(evt.start);
      const diffMs = startTime.getTime() - now.getTime();
      const diffMin = Math.round(diffMs / 60000);
      
      // Notify 15 mins before
      if (diffMin === 15 && !notifiedEvents.has(evt.id)) {
        notifiedEvents.add(evt.id);
        notify(
          'Upcoming Meeting in 15m',
          `${evt.title}
Starts at ${startTime.toLocaleTimeString()}`
        );
      }
    });
  }, 60000); // Check every minute
}

// ── Summaries ────────────────────────────────────────────────────────────
export function generateDailySummary() {
  const now = new Date();
  const tasks = listTasks();
  const events = readCalendar();
  
  const todayStr = now.toISOString().split('T')[0];
  
  const completedToday = tasks.filter((t) => t.status === 'completed' && t.completed?.startsWith(todayStr));
  const newTasks = tasks.filter((t) => t.status === 'pending');
  const eventsToday = events.filter((e) => e.start.startsWith(todayStr));
  
  const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
  
  let summary = `Good ${greeting}, Sir.\n\n`;
  
  summary += `**Tasks Completed Today:** ${completedToday.length}\n`;
  completedToday.forEach((t) => summary += `- ${t.text}\n`);
  
  summary += `\n**Pending Tasks:** ${newTasks.length}\n`;
  newTasks.slice(0, 5).forEach((t) => summary += `- [${t.priority}] ${t.text}\n`);
  if (newTasks.length > 5) summary += `- ... and ${newTasks.length - 5} more.\n`;
  
  summary += `\n**Events Today:** ${eventsToday.length}\n`;
  eventsToday.forEach((e) => {
    const time = new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    summary += `- ${time}: ${e.title}\n`;
  });
  
  return summary;
}
