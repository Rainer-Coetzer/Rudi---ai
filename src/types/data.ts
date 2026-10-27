/** Shapes of the JSON the sidecar's read-only tools return (see sidecar/productivity.ts, meetingNotes.ts). */

export interface Task {
  id: string;
  text: string;
  priority: string;
  status: 'pending' | 'completed' | string;
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

export interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: string;
}

export interface ChangelogEntry {
  message: string;
  timestamp: string;
}
