import { canAutoExecute, requiresHardConfirmation, type AutonomyLevel } from './autonomy';

export type PermissionLevel = 'safe' | 'caution' | 'dangerous';

const TOOL_WHITELIST = [
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
  // Logging
  'get_logs',
  // Self-improvement
  'self_inspect', 'self_improve',
] as const;

/** Paths Rudi must never touch */
const PROTECTED_PATHS = [
  'system32', 'windows\\', 'program files\\', '/usr/bin', '/etc/passwd',
  '/etc/', '/boot/', 'c:\\windows',
];

/** Destructive shell patterns */
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
  ':(){:|:&};:',          // Fork bomb
  '> /proc/',
];

/** Network request patterns that should require explicit permission */
const NETWORK_PATTERNS = [
  'curl ', 'wget ', 'invoke-webrequest', 'invoke-restmethod',
  'net use', 'netsh', 'nc ', 'ncat ',
];

/** Package manager patterns */
const INSTALL_PATTERNS = [
  'npm install -g', 'winget install', 'choco install',
  'scoop install', 'apt install', 'pip install',
];

export const getPermissionLevel = (toolName: string): PermissionLevel => {
  if (['delete_file', 'git_push', 'shutdown', 'uninstall', 'self_improve'].includes(toolName)) return 'dangerous';
  if (['run_terminal', 'git_commit', 'start_dev_server', 'npm_install', 'modify_system', 'rename_file', 'package_app'].includes(toolName)) return 'caution';
  return 'safe';
};

export const validateTool = (toolName: string, params: any): { valid: boolean; reason?: string } => {
  // Must be whitelisted
  if (!(TOOL_WHITELIST as readonly string[]).includes(toolName)) {
    return { valid: false, reason: `Tool "${toolName}" is not in Rudi's safety whitelist.` };
  }

  const paramString = JSON.stringify(params || {}).toLowerCase();

  // Block destructive patterns
  for (const pattern of DANGER_PATTERNS) {
    if (paramString.includes(pattern.toLowerCase())) {
      return { valid: false, reason: `Achtung, Chef! Destructive pattern detected: "${pattern}". Blocked.` };
    }
  }

  // Block unauthorised network ops in terminal commands
  if (toolName === 'run_terminal') {
    for (const pattern of NETWORK_PATTERNS) {
      if (paramString.includes(pattern.toLowerCase())) {
        return { valid: false, reason: `Network command blocked. Enable network access in settings first.` };
      }
    }
    for (const pattern of INSTALL_PATTERNS) {
      if (paramString.includes(pattern.toLowerCase())) {
        return { valid: false, reason: `Global package installation requires explicit approval.` };
      }
    }
  }

  // Path traversal protection
  if (paramString.includes('..\\') || paramString.includes('../')) {
    return { valid: false, reason: 'Path traversal detected. Use absolute paths only.' };
  }

  // Protect system directories
  if (['delete_file', 'write_code', 'create_file', 'rename_file', 'append_file'].includes(toolName)) {
    for (const p of PROTECTED_PATHS) {
      if (paramString.includes(p.toLowerCase())) {
        return { valid: false, reason: `Access to protected system directory blocked.` };
      }
    }
  }

  return { valid: true };
};

/**
 * Determines if a tool execution requires explicit user confirmation,
 * based on the current automony level and the tool's permission level.
 */
export const requiresConfirmation = (
  toolName: string,
  autonomyLevel: AutonomyLevel
): boolean => {
  // Hard confirmation required regardless of autonomy
  if (requiresHardConfirmation(toolName)) return true;

  // In observe mode, nothing executes (handled upstream)
  if (autonomyLevel === 'observe') return true;

  // Check if tool can auto-execute at this level
  if (!canAutoExecute(toolName, autonomyLevel)) return true;

  return false;
};
