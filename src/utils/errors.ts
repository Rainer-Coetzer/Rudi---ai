/** Message text of anything thrown, for logs and the UI. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
