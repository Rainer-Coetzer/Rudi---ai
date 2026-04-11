import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import child_process from 'child_process';
import fs from 'fs';
import activeWin from 'active-win';
import { screen } from 'electron';
import { writeLog, readLog, clearLog, type LogCategory } from './logger';
import { captureSnapshot, undoLastAction } from './undo';
import {
  listTasks, createTask, completeTask, deleteTask,
  readCalendar, addEvent, removeEvent, getUpcomingEvents,
  generateDailySummary, startReminderService
} from './productivity';
import { selfInspect, selfImprove, selfChangelog } from './selfImprove';
import { recordMeetingNote, listMeetingNotes, deleteMeetingNote } from './meetingNotes';
import { globalShortcut } from 'electron';
import { getProjectContext } from './handlers/contextInjector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { ToolsManager } from './handlers/ToolsManager';
const toolsManager = ToolsManager.getInstance();

import { McpManager } from './mcpManager';
const mcpManager = McpManager.getInstance();

let mainWindow: BrowserWindow | null = null;
let ghostWindow: BrowserWindow | null = null;
let ollamaProcess: child_process.ChildProcess | null = null;
let lastActiveApp = '';
let currentMode = 'idle';

// GPU flags are critical for 8,000 particle sphere performance in Electron
app.commandLine.appendSwitch('disable-features', 'NetworkServiceInProcess');


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    frame: false,           // Fully frameless — we draw our own title bar
    transparent: false,
    backgroundColor: '#000000',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Polling for active window awareness
  setInterval(async () => {
    try {
      const active = await activeWin();
      if (!active || !mainWindow) return;

      const appName = active.owner.name.toLowerCase();
      const title = active.title.toLowerCase();

      // Check if awareness state needs update
      let newMode = currentMode;
      if (appName.includes('code') || title.includes('visual studio code')) {
        newMode = 'coding';
      } else if (appName.includes('chrome') || appName.includes('msedge') || appName.includes('firefox')) {
        newMode = 'web';
      } else {
        newMode = 'idle';
      }

      if (newMode !== currentMode) {
        currentMode = newMode;
        console.log(`[AWARENESS] Switched to ${newMode} mode (App: ${appName})`);
        mainWindow.webContents.send('active-mode-changed', newMode);
        
        // Auto-move window based on awareness if user was idle
        if (newMode === 'coding') updateWindowLayout('coding');
        else if (newMode === 'web') updateWindowLayout('web');
      }
    } catch (err) {
      // Ignore poll errors
    }
  }, 1500);
}

function updateWindowLayout(mode: string) {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: scrW, height: scrH } = primaryDisplay.workAreaSize;

  switch (mode) {
    case 'idle':
      mainWindow.setSize(1400, 900, true);
      mainWindow.center();
      break;
    case 'coding':
      mainWindow.setSize(450, 600, true);
      mainWindow.setPosition(scrW - 460, scrH - 610, true);
      break;
    case 'web':
      mainWindow.setSize(450, 600, true);
      mainWindow.setPosition(scrW - 460, 10, true);
      break;
    case 'side':
      mainWindow.setSize(500, scrH - 40, true);
      mainWindow.setPosition(scrW - 510, 20, true);
      break;
    case 'full':
      mainWindow.setSize(scrW - 100, scrH - 100, true);
      mainWindow.center();
      break;
  }
}

function createGhostWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  ghostWindow = new BrowserWindow({
    width: 600,
    height: 120,
    x: Math.floor((width - 600) / 2),
    y: Math.floor(height * 0.2), // Upper 20% of screen
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    ghostWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/ghost`);
  } else {
    ghostWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}#/ghost`);
  }

  ghostWindow.on('blur', () => {
    ghostWindow?.hide();
  });
}

function toggleGhostMode() {
  if (!ghostWindow) {
    createGhostWindow();
  }

  if (ghostWindow?.isVisible()) {
    ghostWindow.hide();
  } else {
    ghostWindow?.show();
    ghostWindow?.focus();
  }
}

async function spawnOllama() {
  // First check if Ollama is already serving (e.g. background task or our Express backend)
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    if (res.ok) {
      console.log('[ELECTRON] Ollama already running — skipping daemon spawn.');
      const data = await res.json();
      const names: string[] = (data.models || []).map((m: any) => m.name);
      const gemma = names.find(n => n.startsWith('gemma'));
      if (gemma) {
        console.log(`[ELECTRON] Model confirmed: ${gemma}`);
        writeLog('activity', 'System', `Ollama ready. Active model: ${gemma}`);
      } else {
        console.warn('[ELECTRON] No Gemma model found. Pulling gemma4:e2b in background...');
        child_process.exec('ollama pull gemma4:e2b');
      }
      return;
    }
  } catch {
    // Ollama not running — fall through to spawn
  }

  console.log('[ELECTRON] Spawning local Ollama daemon...');
  ollamaProcess = child_process.spawn('ollama', ['serve'], {
    detached: false,
    stdio: 'ignore'
  });

  ollamaProcess.on('error', (err: any) => {
    console.error('[ELECTRON] Failed to start Ollama. Is it installed?', err.message);
  });

  // Wait briefly for daemon to be reachable then verify model
  setTimeout(() => {
    child_process.exec('ollama list', (error, stdout) => {
      if (error) {
        console.warn('[ELECTRON] Ollama not responding. Rudi may run in text-only mode.');
        return;
      }
      const hasGemma = stdout.includes('gemma');
      if (!hasGemma) {
        console.log('[ELECTRON] No Gemma model found. Pulling gemma4:e2b in background...');
        writeLog('activity', 'System', 'Pulling model: gemma4:e2b');
        child_process.exec('ollama pull gemma4:e2b');
      } else {
        console.log('[ELECTRON] Ollama ready. Gemma model confirmed.');
        writeLog('activity', 'System', 'Ollama daemon ready.');
      }
    });
  }, 2000);
}

app.whenReady().then(async () => {
  createWindow();
  spawnOllama();
  
  // Initialize plugin system
  await toolsManager.scanPlugins();
  
  // Initialize MCP external servers
  await mcpManager.initialize();
  
  createGhostWindow();
  
  // Register Ghost Mode Hotkey
  globalShortcut.register('CommandOrControl+Alt+R', () => {
    toggleGhostMode();
  });

  startReminderService();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (ollamaProcess) {
    console.log('[ELECTRON] Killing Ollama process...');
    ollamaProcess.kill('SIGINT');
  }
});

// ─── Window Controls IPC ──────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

import { handleToolExecution } from './handlers/toolHandler';

ipcMain.handle('execute-tool', async (_event, name: string, params: any) => {
  // Try dynamic plugins first
  const tool = toolsManager.getTool(name);
  if (tool) {
    return await toolsManager.executeTool(name, params);
  }
  
  // Fallback to legacy hardcoded tools
  return await handleToolExecution(name, params);
});

ipcMain.handle('append-log', (_event, category: LogCategory, source: string, message: string) => {
  writeLog(category, source, message);
});

ipcMain.handle('get-logs', (_event, category: LogCategory) => {
  return readLog(category);
});

ipcMain.handle('get-tool-schemas', async () => {
  const internalTools = toolsManager.getAllSchemas();
  const mcpTools = await mcpManager.listAllTools();
  
  // Convert MCP generic tools to Rudi tool schema
  const formattedMcp = mcpTools.map(t => ({
    name: t.name,
    description: `[MCP: ${t.mcpServer}] ${t.description}`,
    parameters: t.inputSchema,
    mcpServer: t.mcpServer,
    isMcp: true
  }));

  return [...internalTools, ...formattedMcp];
});

ipcMain.handle('execute-mcp-tool', async (_event, server: string, tool: string, args: any) => {
  return await mcpManager.callTool(server, tool, args);
});

ipcMain.handle('get-project-context', async () => {
  return await getProjectContext();
});
