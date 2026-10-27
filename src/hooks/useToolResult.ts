import { useEffect, useState } from 'react';
import { safeParse } from '../utils/json';

/**
 * Runs a read-only sidecar tool while `enabled` and parses its JSON result.
 * State is only set after the call resolves, and `loading` is derived rather than
 * stored, so opening a panel doesn't trigger a synchronous re-render.
 */
export function useToolResult<T>(tool: string, enabled: boolean) {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ nonce: number; data: T | null } | null>(null);

  useEffect(() => {
    const api = window.desktopAPI;
    if (!enabled || !api) return;
    let cancelled = false;
    api.executeTool(tool, {})
      .then(res => (res.success ? safeParse<T>(res.result) : null))
      .catch(err => {
        console.error(`[${tool}]`, err);
        return null;
      })
      .then(data => {
        if (!cancelled) setResult({ nonce, data });
      });
    return () => {
      cancelled = true;
    };
  }, [tool, enabled, nonce]);

  return {
    data: result?.data ?? null,
    loading: enabled && !!window.desktopAPI && result?.nonce !== nonce,
    reload: () => setNonce(n => n + 1),
  };
}
