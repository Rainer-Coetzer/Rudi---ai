/**
 * safeParse — never throws; returns null on invalid/empty JSON.
 * Use everywhere you'd otherwise write JSON.parse without a try-catch.
 */
export function safeParse<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
