/**
 * Privileged-side tool validation — runs inside the Electron main process.
 * This is the real security gate. The renderer-side checks in src/utils/safety.ts
 * are UX-only; this file is what actually stops unsafe calls from executing.
 */

const TOOL_WHITELIST = new Set([
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
  // Self
  'self_inspect', 'self_improve', 'self_changelog', 'undo_action',
  // Cognitive core
  'record_memory', 'list_memories', 'delete_memory',
  'save_skill', 'list_skills', 'load_skill',
]);

const DANGER_PATTERNS = [
  'rm -rf /',
  'rm -rf c:',
  'format c:',
  'del /f /s /q c:\\',
  '> /dev/',
  '; shutdown',
  '; reboot',
  'rmdir /s /q c:',
  'mkfs.',
  ':(){:|:&};:',
];

const PROTECTED_PATHS = [
  'system32', 'windows\\', 'program files\\', '/usr/bin',
  '/etc/passwd', '/etc/', '/boot/', 'c:\\windows',
];

const NETWORK_PATTERNS = [
  'curl ', 'wget ', 'invoke-webrequest', 'invoke-restmethod',
  'net use', 'netsh', 'nc ', 'ncat ',
];

const INSTALL_PATTERNS = [
  'npm install -g', 'winget install', 'choco install',
  'scoop install', 'apt install', 'pip install',
];

export function privilegedValidateTool(
  name: string,
  params: unknown
): { valid: boolean; reason?: string } {
  if (!TOOL_WHITELIST.has(name)) {
    return { valid: false, reason: `[SECURITY] Tool "${name}" is not in the privileged whitelist.` };
  }

  let paramString: string;
  try {
    paramString = JSON.stringify(params ?? {}).toLowerCase();
  } catch {
    return { valid: false, reason: '[SECURITY] Tool params could not be serialised.' };
  }

  for (const pattern of DANGER_PATTERNS) {
    if (paramString.includes(pattern.toLowerCase())) {
      return { valid: false, reason: `[SECURITY] Destructive pattern blocked: "${pattern}"` };
    }
  }

  if (name === 'run_terminal') {
    for (const pattern of NETWORK_PATTERNS) {
      if (paramString.includes(pattern.toLowerCase())) {
        return { valid: false, reason: '[SECURITY] Network command blocked at privilege boundary.' };
      }
    }
    for (const pattern of INSTALL_PATTERNS) {
      if (paramString.includes(pattern.toLowerCase())) {
        return { valid: false, reason: '[SECURITY] Global package install blocked at privilege boundary.' };
      }
    }
  }

  if (paramString.includes('..\\') || paramString.includes('../')) {
    return { valid: false, reason: '[SECURITY] Path traversal detected.' };
  }

  if (['delete_file', 'write_code', 'create_file', 'rename_file', 'append_file'].includes(name)) {
    for (const p of PROTECTED_PATHS) {
      if (paramString.includes(p.toLowerCase())) {
        return { valid: false, reason: '[SECURITY] Access to protected system path blocked.' };
      }
    }
  }

  return { valid: true };
}
