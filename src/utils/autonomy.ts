/**
 * Rudi Autonomy Level System
 * Defines the 3-tier permission model: OBSERVE → ASSIST → AUTONOMOUS
 */

export type AutonomyLevel = 'observe' | 'assist' | 'autonomous';

export const AutonomyLabels: Record<AutonomyLevel, string> = {
  observe:    'Observe',
  assist:     'Assist',
  autonomous: 'Autonomous',
};

export const AutonomyDescriptions: Record<AutonomyLevel, string> = {
  observe:    'Rudi suggests actions only. No execution.',
  assist:     'Rudi executes safe tasks. Dangerous ops need approval.',
  autonomous: 'Rudi operates independently. Only system changes need approval.',
};

/**
 * Tool Permission Matrix
 * Maps each tool name to the minimum autonomy level required to auto-execute.
 */
const TOOL_AUTONOMY_MAP: Record<string, AutonomyLevel> = {
  // Safe tools — execute in any mode (except observe)
  system_info:        'assist',
  open_app:           'assist',
  open_vscode:        'assist',
  open_vscode_file:   'assist',
  open_url:           'assist',
  search_web:         'assist',
  list_dir:           'assist',
  read_file:          'assist',
  daily_briefing:     'assist',
  create_task:        'assist',
  list_tasks:         'assist',
  complete_task:      'assist',
  read_calendar:      'assist',
  upcoming_events:    'assist',
  summarize:          'assist',
  get_logs:           'assist',
  list_memories:      'assist',
  list_skills:        'assist',
  load_skill:         'assist',
  list_meeting_notes: 'assist',
  self_changelog:     'assist',

  // Moderate tools — require ASSIST or AUTONOMOUS
  create_file:        'assist',
  write_code:         'assist',
  create_folder:      'assist',
  append_file:        'assist',
  rename_file:        'assist',
  search_project:     'assist',
  start_dev_server:   'assist',
  git_status:         'assist',
  add_event:          'assist',
  remove_event:       'assist',
  set_ui_layout:      'assist',
  package_app:        'assist',
  record_memory:      'assist',
  save_skill:         'assist',
  record_meeting_note: 'assist',
  undo_action:        'assist',

  // Elevated tools — require AUTONOMOUS
  run_terminal:       'autonomous',
  npm_install:        'autonomous',
  git_commit:         'autonomous',
  delete_file:        'autonomous',
  self_inspect:       'autonomous',
  self_improve:       'autonomous',
  delete_meeting_note: 'autonomous',
  delete_memory:      'autonomous',

  // Dangerous — always require explicit confirmation regardless of mode
  git_push:           'autonomous',
  shutdown:           'autonomous',
  uninstall:          'autonomous',
};

/**
 * Determines if a tool can be auto-executed at the given autonomy level.
 * In OBSERVE mode, nothing is auto-executed — only suggestions are shown.
 * Unknown tools (not in TOOL_AUTONOMY_MAP) are NEVER auto-executed — fail closed.
 */
export function canAutoExecute(toolName: string, level: AutonomyLevel): boolean {
  if (level === 'observe') return false;

  // Fail closed: tools not explicitly mapped always require user confirmation.
  if (!(toolName in TOOL_AUTONOMY_MAP)) return false;

  if (level === 'autonomous') return true; // autonomous can run all known tools (except hardcoded dangerous)
  const required = TOOL_AUTONOMY_MAP[toolName];
  if (level === 'assist') return required === 'assist'; // assist can run assist-level only

  return false;
}

/**
 * Returns true if the tool needs explicit user confirmation before running,
 * even in autonomous mode.
 */
export function requiresHardConfirmation(toolName: string): boolean {
  const ALWAYS_CONFIRM = ['delete_file', 'git_push', 'shutdown', 'uninstall', 'self_improve'];
  return ALWAYS_CONFIRM.includes(toolName);
}

/**
 * Returns the autonomy level required for a tool.
 * Unknown tools report 'autonomous' for display (indicating they need the highest level to even consider).
 */
export function getRequiredAutonomy(toolName: string): AutonomyLevel {
  return TOOL_AUTONOMY_MAP[toolName] ?? 'autonomous';
}

/**
 * Colors for UI display.
 */
export const AutonomyColors: Record<AutonomyLevel, { text: string; border: string; bg: string; dot: string }> = {
  observe: {
    text:   'text-sky-400',
    border: 'border-sky-500/40',
    bg:     'bg-sky-500/10',
    dot:    'bg-sky-400',
  },
  assist: {
    text:   'text-amber-400',
    border: 'border-amber-500/40',
    bg:     'bg-amber-500/10',
    dot:    'bg-amber-400',
  },
  autonomous: {
    text:   'text-emerald-400',
    border: 'border-emerald-500/40',
    bg:     'bg-emerald-500/10',
    dot:    'bg-emerald-400',
  },
};
