import { shell } from 'electron';
import child_process from 'child_process';
import path from 'path';
import fs from 'fs';
import { writeLog } from '../logger';
import { captureSnapshot, undoLastAction } from '../undo';
import * as Memory from '../memory';
import * as Skills from '../skills';
import * as Productivity from '../productivity';
import * as Notes from '../meetingNotes';
import * as Self from '../selfImprove';

function validatePath(filePath: string): boolean {
  if (!filePath) return false;
  try {
    const root = process.cwd();
    const resolvedPath = path.resolve(filePath);
    const relative = path.relative(root, resolvedPath);
    // Block if it goes outside root or is a system-critical absolute path
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

export async function handleToolExecution(name: string, params: any): Promise<{ success: boolean; result: string }> {
  console.log(`[HANDLER] Executing tool: ${name}`, JSON.stringify(params));

  try {
    switch (name) {
      case 'open_app': {
        const appName = params.app?.toLowerCase() || '';
        const appMap: Record<string, string> = {
          vscode: 'code', terminal: 'wt', browser: 'chrome', calculator: 'calc'
        };
        const exe = appMap[appName] || appName;
        
        // Use Start-Process but sanitize input by keeping it as a literal string
        const shellCmd = `Start-Process '${exe.replace(/'/g, "''")}' -ErrorAction Stop`;
        
        return new Promise((resolve) => {
          child_process.exec(`powershell -NoProfile -Command "${shellCmd}"`, (error, stdout, stderr) => {
            if (error || stderr) resolve({ success: false, result: `Failed to launch ${appName}.` });
            else resolve({ success: true, result: `Launched ${appName}.` });
          });
        });
      }

      case 'create_file':
      case 'write_code': {
        const filePath = params.path || params.file;
        if (!validatePath(filePath)) return { success: false, result: 'Security block: Path traversal detected.' };
        
        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
        captureSnapshot(filePath, 'write');
        await fs.promises.writeFile(filePath, params.content || '', 'utf-8');
        
        return { success: true, result: `Successfully written to ${filePath}.` };
      }

      case 'read_file': {
        const filePath = params.path || params.file;
        if (!validatePath(filePath)) return { success: false, result: 'Security block: Path traversal detected.' };
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return { success: true, result: content };
      }

      case 'list_dir': {
        const dirPath = params.path || '.';
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const list = entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
        return { success: true, result: list || 'Directory is empty.' };
      }

      case 'delete_file': {
        const filePath = params.path || params.file;
        if (!validatePath(filePath)) return { success: false, result: 'Security block: Path traversal detected.' };
        captureSnapshot(filePath, 'delete');
        await fs.promises.unlink(filePath);
        return { success: true, result: `Deleted ${filePath}.` };
      }

      case 'run_terminal': {
        return new Promise((resolve) => {
          const cwd = params.cwd || process.cwd();
          child_process.exec(params.command, { cwd, shell: 'powershell.exe' }, (error, stdout, stderr) => {
            if (error) resolve({ success: false, result: stderr || error.message });
            else resolve({ success: true, result: stdout || 'Command executed successfully.' });
          });
        });
      }

      case 'system_info': {
        return new Promise((resolve) => {
          child_process.exec('systeminfo | findstr /C:"OS Name" /C:"Total Physical Memory"', (error, stdout) => {
            if (error) resolve({ success: false, result: 'System info retrieval failed.' });
            else resolve({ success: true, result: stdout });
          });
        });
      }

      // ── Git ───────────────────────────────────────────────────────────────
      case 'git_status': {
        return new Promise((resolve) => {
          child_process.exec('git status --short', (error, stdout) => {
            if (error) resolve({ success: false, result: 'Not a git repository.' });
            else resolve({ success: true, result: stdout || 'Clean repository.' });
          });
        });
      }

      // ── Shell ─────────────────────────────────────────────────────────────
      case 'open_url': {
        if (params.url) await shell.openExternal(params.url);
        return { success: true, result: `Opened URL: ${params.url}` };
      }

      case 'search_web': {
        const query = encodeURIComponent(params.query || '');
        await shell.openExternal(`https://www.google.com/search?q=${query}`);
        return { success: true, result: `Searching for: ${params.query}` };
      }

      // ── VS Code ───────────────────────────────────────────────────────────
      case 'open_vscode': {
        const dir = params.path || '.';
        return new Promise((resolve) => {
          child_process.exec(`code "${dir}"`, (error) => {
            if (error) resolve({ success: false, result: 'VS Code launch failed.' });
            else resolve({ success: true, result: `Opened VS Code at ${dir}.` });
          });
        });
      }

      case 'open_vscode_file': {
        const filePath = params.path || params.file;
        return new Promise((resolve) => {
          child_process.exec(`code "${filePath}"`, (error) => {
            if (error) resolve({ success: false, result: 'Failed to open file in VS Code.' });
            else resolve({ success: true, result: `Opened ${filePath} in VS Code.` });
          });
        });
      }

      // ── Productivity (Tasks) ──────────────────────────────────────────────
      case 'list_tasks': {
        const tasks = Productivity.listTasks();
        return { success: true, result: JSON.stringify(tasks, null, 2) };
      }

      case 'create_task': {
        const task = Productivity.createTask(params.text, params.priority, params.tags);
        return { success: true, result: `Task created: ${task.id}` };
      }

      case 'complete_task': {
        const ok = Productivity.completeTask(params.id);
        return { success: ok, result: ok ? 'Task completed.' : 'Task not found.' };
      }

      case 'delete_task': {
        const ok = Productivity.deleteTask(params.id);
        return { success: ok, result: ok ? 'Task deleted.' : 'Task not found.' };
      }

      // ── Productivity (Calendar) ───────────────────────────────────────────
      case 'read_calendar': {
        const events = Productivity.readCalendar();
        return { success: true, result: JSON.stringify(events, null, 2) };
      }

      case 'add_event': {
        const ev = Productivity.addEvent(params.title, params.start, params.end, params.description);
        return { success: true, result: `Event added: ${ev.id}` };
      }

      case 'remove_event': {
        const ok = Productivity.removeEvent(params.id);
        return { success: ok, result: ok ? 'Event removed.' : 'Event not found.' };
      }

      case 'upcoming_events': {
        const events = Productivity.getUpcomingEvents();
        return { success: true, result: JSON.stringify(events, null, 2) };
      }

      case 'summarize': {
        const summary = Productivity.generateDailySummary();
        return { success: true, result: summary };
      }

      // ── Meeting Notes ─────────────────────────────────────────────────────
      case 'record_meeting_note': {
        const res = Notes.recordMeetingNote(params.title, params.content, params.date);
        return { success: res.success, result: res.success ? `Note recorded: ${res.note.id}` : 'Failed to record note.' };
      }

      case 'list_meeting_notes': {
        const notes = Notes.listMeetingNotes();
        return { success: true, result: JSON.stringify(notes, null, 2) };
      }

      case 'delete_meeting_note': {
        const ok = Notes.deleteMeetingNote(params.id);
        return { success: ok, result: ok ? 'Note deleted.' : 'Note not found.' };
      }

 
      case 'git_commit': {
        return new Promise((resolve) => {
          const msg = (params.message || 'Updated by Rudi Agent').replace(/"/g, '\\"');
          child_process.exec(`git add . && git commit -m "${msg}"`, (error, stdout, stderr) => {
            if (error) resolve({ success: false, result: stderr || error.message });
            else resolve({ success: true, result: stdout || 'Committed changes.' });
          });
        });
      }

      case 'git_push': {
        return new Promise((resolve) => {
          child_process.exec(`git push`, (error, stdout, stderr) => {
            if (error) resolve({ success: false, result: stderr || error.message });
            else resolve({ success: true, result: stdout || 'Pushed successfully.' });
          });
        });
      }

      // ── Self Improvement ──────────────────────────────────────────────────
      case 'self_inspect': {
        return Self.selfInspect(process.cwd());
      }

      case 'self_improve': {
        return await Self.selfImprove(process.cwd(), params.path, params.content);
      }

      case 'self_changelog': {
        const log = Self.selfChangelog();
        return { success: true, result: Array.isArray(log) ? log.join('\n') : String(log) };
      }

      // ── Memories (Cognitive Core) ─────────────────────────────────────────
      case 'record_memory': {
        const memory = Memory.recordExperience(params.content, params.type);
        return { success: true, result: `Memory recorded: ${memory.id}` };
      }

      case 'list_memories': {
        const memories = Memory.listMemories();
        return { success: true, result: JSON.stringify(memories, null, 2) };
      }

      // ── Skills (Cognitive Core) ───────────────────────────────────────────
      case 'save_skill': {
        await Skills.saveSkill(params.name, params.protocol);
        return { success: true, result: `Skill protocol '${params.name}' saved to library.` };
      }

      case 'list_skills': {
        const skills = await Skills.listSkills();
        return { success: true, result: JSON.stringify(skills, null, 2) };
      }

      case 'load_skill': {
        const protocol = await Skills.loadSkill(params.name);
        return { success: true, result: protocol };
      }

      case 'undo_action': {
        return await undoLastAction();
      }

      default:
        return { success: false, result: `Tool "${name}" not recognized.` };
    }
  } catch (err: any) {
    writeLog('errors', 'HANDLER', `Tool: ${name} Failed: ${err.message}`);
    return { success: false, result: `Execution error: ${err.message}` };
  }
}
