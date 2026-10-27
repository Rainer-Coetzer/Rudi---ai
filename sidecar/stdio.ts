/**
 * Sidecar stdio protocol — newline-delimited JSON between the Tauri shell and this process.
 *
 *   shell → sidecar (stdin):  { "id": 1, "method": "executeTool", "params": {...} }
 *   sidecar → shell (stdout): { "id": 1, "result": ... } | { "id": 1, "error": "..." }
 *                             { "event": "notify", "payload": {...} }
 *
 * stdout is reserved for the protocol, so this module must be imported first:
 * it reroutes every other stdout write (console.log, libraries) to stderr.
 */

const rawStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;

export function send(message: unknown): void {
  rawStdoutWrite(JSON.stringify(message) + '\n');
}

export function emitEvent(event: string, payload: unknown): void {
  send({ event, payload });
}
