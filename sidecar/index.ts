/**
 * Rudi privileged sidecar — spawned and owned by the Tauri shell (src-tauri).
 * Hosts the Node-side tool layer (tool handler, plugins, MCP, productivity, memory)
 * and answers requests over the stdio protocol defined in ./stdio.ts.
 *
 * Window management, hotkeys, dialogs, active-window awareness and the Ollama
 * daemon live in Rust; everything here is what used to sit behind ipcMain.
 */

import { send } from './stdio';
import readline from 'readline';
import { writeLog, readLog, type LogCategory } from './logger';
import { startReminderService } from './productivity';
import { getProjectContext } from './handlers/contextInjector';
import { getWorkspaceRoot, setWorkspaceRoot } from './workspace';
import { handleToolExecution } from './handlers/toolHandler';
import { ToolsManager } from './handlers/ToolsManager';
import { McpManager } from './mcpManager';
import { gate, resolveApproval, setAutonomyLevel } from './policy';
import type { ToolParams } from './types';

const toolsManager = ToolsManager.getInstance();
const mcpManager = McpManager.getInstance();

type Handler = (params: ToolParams) => unknown | Promise<unknown>;

const handlers: Record<string, Handler> = {
  async executeTool({ name, params = {}, confirm }) {
    const blocked = await gate(name, params, confirm === true);
    if (blocked) return blocked;
    // Try dynamic plugins first, then the legacy hardcoded tools.
    if (toolsManager.getTool(name)) return toolsManager.executeTool(name, params);
    return handleToolExecution(name, params);
  },

  appendLog({ category, source, message }) {
    writeLog(category as LogCategory, source, message);
    return null;
  },

  getLogs({ category }) {
    return readLog(category as LogCategory);
  },

  async getToolSchemas() {
    const internalTools = toolsManager.getAllSchemas();
    const mcpTools = await mcpManager.listAllTools();

    // Convert MCP generic tools to Rudi tool schema
    const formattedMcp = mcpTools.map(t => ({
      name: t.name,
      description: `[MCP: ${t.mcpServer}] ${t.description}`,
      parameters: t.inputSchema,
      mcpServer: t.mcpServer,
      isMcp: true,
    }));

    return [...internalTools, ...formattedMcp];
  },

  async executeMcpTool({ server, tool, args = {} }) {
    const blocked = await gate(`mcp:${server}/${tool}`, args);
    if (blocked) return blocked;
    return mcpManager.callTool(server, tool, args);
  },

  setAutonomyLevel({ level }) {
    return setAutonomyLevel(level);
  },

  // Shell-only: the user's answer from the native approval dialog.
  // Not in the renderer allowlist (src-tauri/src/main.rs → RENDERER_METHODS).
  confirmResult({ id, approved }) {
    return resolveApproval(id, approved);
  },

  getProjectContext() {
    return getProjectContext();
  },

  getWorkspace() {
    return getWorkspaceRoot();
  },

  setWorkspace({ path }) {
    return setWorkspaceRoot(path);
  },
};

async function dispatch(line: string) {
  let msg: { id?: number; method?: string; params?: unknown };
  try {
    msg = JSON.parse(line);
  } catch {
    console.error('[SIDECAR] Dropping malformed message:', line.slice(0, 200));
    return;
  }
  const { id, method, params } = msg;
  if (typeof id !== 'number') return;

  const handler = method ? handlers[method] : undefined;
  if (!handler) {
    send({ id, error: `Unknown method: ${method}` });
    return;
  }

  try {
    const result = await handler(params ?? {});
    send({ id, result: result ?? null });
  } catch (err) {
    send({ id, error: (err as Error)?.message ?? String(err) });
  }
}

async function main() {
  // Plugins must be registered before the first executeTool arrives.
  await toolsManager.scanPlugins();

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', line => { void dispatch(line); });
  // Shell exited or closed the pipe — nothing left to serve.
  rl.on('close', () => process.exit(0));

  send({ event: 'ready', payload: null });
  writeLog('activity', 'System', 'Sidecar ready.');

  // MCP servers launch via npx and can take a while; don't block requests on them.
  mcpManager.initialize().catch(err => console.error('[MCP] Init failed:', err));
  startReminderService();
}

main().catch(err => {
  console.error('[SIDECAR] Fatal startup error:', err);
  process.exit(1);
});
