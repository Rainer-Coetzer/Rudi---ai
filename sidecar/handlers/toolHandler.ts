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
import { privilegedValidateTool } from '../security';
import { getWorkspaceRoot, getRudiRoot } from '../workspace';
import { openExternal } from '../platform';

/**
 * Resolves a tool-supplied path against the active workspace and returns the absolute
 * path, or null if it escapes the workspace. Always operate on the returned path —
 * a raw relative path would resolve against the sidecar's own working directory.
 */
export function resolveInWorkspace(target: string | undefined, { allowRoot = false } = {}): string | null {
  if (!target || target.includes('"')) return null;
  try {
    const root = getWorkspaceRoot();
    const resolved = path.resolve(root, target);
    const relative = path.relative(root, resolved);
    if (relative === '') return allowRoot ? resolved : null;
    // Compare the first segment, so names like "..config" aren't mistaken for a parent dir.
    const escapes = relative === '..' || relative.startsWith(`..${path.sep}`);
    return !escapes && !path.isAbsolute(relative) ? resolved : null;
  } catch {
    return null;
  }
}

const OUTSIDE_WORKSPACE = { success: false, result: 'Security block: path is outside the active workspace.' };

export async function handleToolExecution(name: string, params: any): Promise<{ success: boolean; result: string }> {
  // Privileged re-validation — renderer checks are UX only; this is the real gate.
  const gate = privilegedValidateTool(name, params);
  if (!gate.valid) {
    writeLog('errors', 'SECURITY', `Blocked at privilege boundary: ${name} — ${gate.reason}`);
    return { success: false, result: gate.reason ?? 'Blocked by security policy.' };
  }

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
          child_process.exec(`powershell -NoProfile -Command "${shellCmd}"`, (error, _stdout, stderr) => {
            if (error || stderr) resolve({ success: false, result: `Failed to launch ${appName}.` });
            else resolve({ success: true, result: `Launched ${appName}.` });
          });
        });
      }

      case 'create_file':
      case 'write_code': {
        const filePath = resolveInWorkspace(params.path || params.file);
        if (!filePath) return OUTSIDE_WORKSPACE;

        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
        captureSnapshot(filePath, 'write');
        await fs.promises.writeFile(filePath, params.content || '', 'utf-8');
        
        return { success: true, result: `Successfully written to ${filePath}.` };
      }

      case 'read_file': {
        const filePath = resolveInWorkspace(params.path || params.file);
        if (!filePath) return OUTSIDE_WORKSPACE;
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return { success: true, result: content };
      }

      case 'list_dir': {
        const dirPath = resolveInWorkspace(params.path || '.', { allowRoot: true });
        if (!dirPath) return OUTSIDE_WORKSPACE;
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const list = entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
        return { success: true, result: list || 'Directory is empty.' };
      }

      case 'delete_file': {
        const filePath = resolveInWorkspace(params.path || params.file);
        if (!filePath) return OUTSIDE_WORKSPACE;
        captureSnapshot(filePath, 'delete');
        await fs.promises.unlink(filePath);
        return { success: true, result: `Deleted ${filePath}.` };
      }

      case 'run_terminal': {
        const cwd = resolveInWorkspace(params.cwd || '.', { allowRoot: true });
        if (!cwd) return OUTSIDE_WORKSPACE;
        return new Promise((resolve) => {
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
          child_process.exec('git status --short', { cwd: getWorkspaceRoot() }, (error, stdout) => {
            if (error) resolve({ success: false, result: 'Not a git repository.' });
            else resolve({ success: true, result: stdout || 'Clean repository.' });
          });
        });
      }

      // ── Shell ─────────────────────────────────────────────────────────────
      case 'open_url': {
        if (params.url) await openExternal(params.url);
        return { success: true, result: `Opened URL: ${params.url}` };
      }

      case 'search_web': {
        const query = encodeURIComponent(params.query || '');
        await openExternal(`https://www.google.com/search?q=${query}`);
        return { success: true, result: `Searching for: ${params.query}` };
      }

      // ── VS Code ───────────────────────────────────────────────────────────
      case 'open_vscode': {
        const dir = resolveInWorkspace(params.path || '.', { allowRoot: true });
        if (!dir) return OUTSIDE_WORKSPACE;
        return new Promise((resolve) => {
          child_process.exec(`code "${dir}"`, (error) => {
            if (error) resolve({ success: false, result: 'VS Code launch failed.' });
            else resolve({ success: true, result: `Opened VS Code at ${dir}.` });
          });
        });
      }

      case 'open_vscode_file': {
        const filePath = resolveInWorkspace(params.path || params.file);
        if (!filePath) return OUTSIDE_WORKSPACE;
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
          child_process.exec(`git add . && git commit -m "${msg}"`, { cwd: getWorkspaceRoot() }, (error, stdout, stderr) => {
            if (error) resolve({ success: false, result: stderr || error.message });
            else resolve({ success: true, result: stdout || 'Committed changes.' });
          });
        });
      }

      case 'git_push': {
        return new Promise((resolve) => {
          child_process.exec(`git push`, { cwd: getWorkspaceRoot() }, (error, stdout, stderr) => {
            if (error) resolve({ success: false, result: stderr || error.message });
            else resolve({ success: true, result: stdout || 'Pushed successfully.' });
          });
        });
      }

      // ── Self Improvement ──────────────────────────────────────────────────
      case 'self_inspect': {
        return Self.selfInspect(getRudiRoot());
      }

      case 'self_improve': {
        return await Self.selfImprove(getRudiRoot(), params.path, params.content);
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
  } catch (err) {
    writeLog('errors', 'HANDLER', `Tool: ${name} Failed: ${(err as Error).message}`);
    return { success: false, result: `Execution error: ${(err as Error).message}` };
  }
}
