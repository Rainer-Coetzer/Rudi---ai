/**
 * Approval gate — decides which tool calls need the user's OK, and gets it.
 *
 * The decision lives here, in the privileged process, so the renderer can't skip it.
 * Approval is collected by the Tauri shell as a native dialog (see on_event "confirm"
 * in src-tauri/src/sidecar.rs) and reported back via the shell-only `confirmResult`
 * method, which the renderer is not allowed to call.
 */

import { canAutoExecute, requiresHardConfirmation, type AutonomyLevel } from '../src/utils/autonomy';
import { emitEvent } from './stdio';
import { privilegedValidateTool } from './security';
import { writeLog } from './logger';

const AUTONOMY_LEVELS: AutonomyLevel[] = ['observe', 'assist', 'autonomous'];
const CONFIRM_TIMEOUT_MS = 120_000;

// Read-only tools the UI calls on its own (panels, context recall) — never prompt for these.
const READ_ONLY = new Set([
  'system_info', 'list_dir', 'read_file', 'search_project', 'git_status',
  'list_tasks', 'read_calendar', 'upcoming_events', 'summarize', 'daily_briefing',
  'list_meeting_notes', 'get_logs', 'self_changelog',
  'list_memories', 'list_skills', 'load_skill',
]);

let autonomyLevel: AutonomyLevel = 'assist';

export function setAutonomyLevel(level: unknown): AutonomyLevel {
  if (AUTONOMY_LEVELS.includes(level as AutonomyLevel)) autonomyLevel = level as AutonomyLevel;
  return autonomyLevel;
}

function needsApproval(name: string): boolean {
  if (requiresHardConfirmation(name)) return true;
  if (READ_ONLY.has(name)) return false;
  return !canAutoExecute(name, autonomyLevel);
}

// ── Asking the user ─────────────────────────────────────────────────────────

const pending = new Map<number, (approved: boolean) => void>();
let nextId = 1;

function requestApproval(title: string, detail: string): Promise<boolean> {
  const id = nextId++;
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS);
    function finish(approved: boolean) {
      clearTimeout(timer);
      pending.delete(id);
      resolve(approved);
    }
    pending.set(id, finish);
    emitEvent('confirm', { id, title, detail });
  });
}

/** Called by the shell with the user's answer. Unknown or expired ids are ignored. */
export function resolveApproval(id: unknown, approved: unknown): null {
  if (typeof id === 'number') pending.get(id)?.(approved === true);
  return null;
}

function truncate(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Plain-language summary of what the tool will do, for the approval dialog. */
function describe(name: string, params: Record<string, unknown>): string {
  const target = String(params.path ?? params.file ?? '?');
  switch (name) {
    case 'delete_file':   return `Delete file:\n${target}`;
    case 'create_file':
    case 'write_code': {
      const lines = String(params.content ?? '').split('\n').length;
      return `Write ${lines} line${lines === 1 ? '' : 's'} to:\n${target}`;
    }
    case 'append_file':   return `Append to:\n${target}`;
    case 'rename_file':   return `Rename:\n${params.from ?? target} → ${params.to ?? params.newName ?? '?'}`;
    case 'run_terminal':  return `Run this PowerShell command${params.cwd ? ` in ${params.cwd}` : ''}:\n\n${truncate(String(params.command ?? ''))}`;
    case 'git_commit':    return `Stage all changes and commit:\n"${params.message ?? 'Updated by Rudi Agent'}"`;
    case 'git_push':      return 'Push commits to the remote repository.';
    case 'npm_install':   return `Install npm packages${params.package ? `:\n${params.package}` : '.'}`;
    case 'self_improve':  return `Modify Rudi's own source file:\n${target}`;
    default:              return `${name}\n\n${truncate(JSON.stringify(params, null, 2))}`;
  }
}

export interface Blocked {
  success: false;
  result: string;
  blocked: true;
}

/**
 * Returns null when the call may proceed, or a Blocked result to hand back to the renderer.
 * @param forceApproval the model asked for confirmation itself — can only make the gate stricter
 */
export async function gate(name: string, params: Record<string, unknown>, forceApproval = false): Promise<Blocked | null> {
  // Hard security rules first, so the user is never asked to approve something that will be refused.
  if (!name.startsWith('mcp:')) {
    const check = privilegedValidateTool(name, params);
    if (!check.valid) {
      writeLog('errors', 'SECURITY', `Blocked at privilege boundary: ${name} — ${check.reason}`);
      return { success: false, result: check.reason ?? 'Blocked by security policy.', blocked: true };
    }
  }

  if (!forceApproval && !needsApproval(name)) return null;

  const approved = await requestApproval(`Allow Rudi to run "${name}"?`, describe(name, params));
  writeLog('activity', 'SECURITY', `${approved ? 'Approved' : 'Declined'}: ${name} (${autonomyLevel} mode)`);
  return approved ? null : { success: false, result: 'Declined by user.', blocked: true };
}
