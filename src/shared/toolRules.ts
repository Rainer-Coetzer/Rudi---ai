/**
 * Tool safety rules shared by the privileged gate (sidecar/security.ts) and the
 * renderer's UX checks (src/utils/safety.ts). Keep this module pure — no DOM or
 * Node APIs — so both builds can import it.
 */

export const TOOL_WHITELIST: ReadonlySet<string> = new Set([
  // System
  'open_app', 'open_vscode', 'open_vscode_file', 'system_info', 'run_terminal',
  // Files & Code
  'create_file', 'create_folder', 'read_file', 'list_dir', 'delete_file',
  'write_code', 'append_file', 'rename_file', 'search_project',
  // Network
  'open_url', 'search_web',
  // Dev
  'start_dev_server', 'npm_install', 'git_status', 'git_commit', 'git_push',
  'package_app', 'set_ui_layout',
  // Productivity
  'create_task', 'list_tasks', 'complete_task', 'delete_task',
  'read_calendar', 'add_event', 'remove_event', 'upcoming_events',
  'summarize', 'daily_briefing',
  // Meetings
  'record_meeting_note', 'list_meeting_notes', 'delete_meeting_note',
  // Logging
  'get_logs',
  // Self-improvement & System
  'self_inspect', 'self_improve', 'self_changelog', 'undo_action',
  // Cognitive Core
  'record_memory', 'list_memories', 'delete_memory',
  'save_skill', 'list_skills', 'load_skill',
]);

/** Destructive shell patterns */
export const DANGER_PATTERNS: readonly string[] = [
  'rm -rf /',
  'rm -rf c:',
  'format c:',
  'del /f /s /q c:\\',
  '> /dev/',
  '; shutdown',
  '; reboot',
  'rmdir /s /q c:',
  'mkfs.',
  ':(){:|:&};:',          // Fork bomb
  '> /proc/',
];

/** Paths Rudi must never write to */
export const PROTECTED_PATHS: readonly string[] = [
  'system32', 'windows\\', 'program files\\', '/usr/bin',
  '/etc/passwd', '/etc/', '/boot/', 'c:\\windows',
];

/** Network commands that need explicit permission in run_terminal */
export const NETWORK_PATTERNS: readonly string[] = [
  'curl ', 'wget ', 'invoke-webrequest', 'invoke-restmethod',
  'net use', 'netsh', 'nc ', 'ncat ',
];

/** Global package installs blocked in run_terminal */
export const INSTALL_PATTERNS: readonly string[] = [
  'npm install -g', 'winget install', 'choco install',
  'scoop install', 'apt install', 'pip install',
];

/** Tools whose params are checked against PROTECTED_PATHS */
export const PATH_WRITING_TOOLS: ReadonlySet<string> = new Set([
  'delete_file', 'write_code', 'create_file', 'rename_file', 'append_file',
]);

export type RuleViolation =
  | { kind: 'not_whitelisted' }
  | { kind: 'unserialisable' }
  | { kind: 'danger'; pattern: string }
  | { kind: 'network' }
  | { kind: 'install' }
  | { kind: 'traversal' }
  | { kind: 'protected_path' };

/**
 * Checks a tool call against the shared rules. Returns the first violation, or null
 * when the call passes. Callers turn the violation into their own message.
 */
export function checkToolRules(name: string, params: unknown): RuleViolation | null {
  if (!TOOL_WHITELIST.has(name)) return { kind: 'not_whitelisted' };

  let paramString: string;
  try {
    paramString = JSON.stringify(params ?? {}).toLowerCase();
  } catch {
    return { kind: 'unserialisable' };
  }

  for (const pattern of DANGER_PATTERNS) {
    if (paramString.includes(pattern.toLowerCase())) return { kind: 'danger', pattern };
  }

  if (name === 'run_terminal') {
    if (NETWORK_PATTERNS.some(p => paramString.includes(p))) return { kind: 'network' };
    if (INSTALL_PATTERNS.some(p => paramString.includes(p))) return { kind: 'install' };
  }

  if (paramString.includes('..\\') || paramString.includes('../')) return { kind: 'traversal' };

  if (PATH_WRITING_TOOLS.has(name) && PROTECTED_PATHS.some(p => paramString.includes(p))) {
    return { kind: 'protected_path' };
  }

  return null;
}
