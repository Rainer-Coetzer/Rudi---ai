import { canAutoExecute, requiresHardConfirmation, type AutonomyLevel } from './autonomy';
import { checkToolRules, type RuleViolation } from '../shared/toolRules';

export type PermissionLevel = 'safe' | 'caution' | 'dangerous';

export const getPermissionLevel = (toolName: string): PermissionLevel => {
  if (['delete_file', 'git_push', 'shutdown', 'uninstall', 'self_improve'].includes(toolName)) return 'dangerous';
  if (['run_terminal', 'git_commit', 'start_dev_server', 'npm_install', 'modify_system', 'rename_file', 'package_app'].includes(toolName)) return 'caution';
  return 'safe';
};

function reasonFor(name: string, v: RuleViolation): string {
  switch (v.kind) {
    case 'not_whitelisted': return `Tool "${name}" is not in Rudi's safety whitelist.`;
    case 'unserialisable':  return 'Tool params could not be serialised.';
    case 'danger':          return `Achtung, Chef! Destructive pattern detected: "${v.pattern}". Blocked.`;
    case 'network':         return 'Network command blocked. Enable network access in settings first.';
    case 'install':         return 'Global package installation requires explicit approval.';
    case 'traversal':       return 'Path traversal detected. Use absolute paths only.';
    case 'protected_path':  return 'Access to protected system directory blocked.';
  }
}

/** UX-side mirror of the sidecar's privileged gate — same rules, friendlier messages. */
export const validateTool = (toolName: string, params: unknown): { valid: boolean; reason?: string } => {
  const violation = checkToolRules(toolName, params);
  return violation ? { valid: false, reason: reasonFor(toolName, violation) } : { valid: true };
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
