/**
 * Privileged-side tool validation — runs inside the sidecar process.
 * This is the real security gate. The renderer-side checks in src/utils/safety.ts
 * are UX-only; this file is what actually stops unsafe calls from executing.
 * Both apply the same rules from src/shared/toolRules.ts.
 */

import { checkToolRules, type RuleViolation } from '../src/shared/toolRules';

function reasonFor(name: string, v: RuleViolation): string {
  switch (v.kind) {
    case 'not_whitelisted': return `[SECURITY] Tool "${name}" is not in the privileged whitelist.`;
    case 'unserialisable':  return '[SECURITY] Tool params could not be serialised.';
    case 'danger':          return `[SECURITY] Destructive pattern blocked: "${v.pattern}"`;
    case 'network':         return '[SECURITY] Network command blocked at privilege boundary.';
    case 'install':         return '[SECURITY] Global package install blocked at privilege boundary.';
    case 'traversal':       return '[SECURITY] Path traversal detected.';
    case 'protected_path':  return '[SECURITY] Access to protected system path blocked.';
  }
}

export function privilegedValidateTool(
  name: string,
  params: unknown
): { valid: boolean; reason?: string } {
  const violation = checkToolRules(name, params);
  return violation ? { valid: false, reason: reasonFor(name, violation) } : { valid: true };
}
