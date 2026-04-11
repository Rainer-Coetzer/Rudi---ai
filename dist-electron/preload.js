import { contextBridge, ipcRenderer } from "electron";
//#region electron/preload.ts
console.log("[RUDI] Preload script initializing...");
contextBridge.exposeInMainWorld("electronAPI", {
	executeTool: (name, params) => ipcRenderer.invoke("execute-tool", name, params),
	onModeChange: (callback) => {
		ipcRenderer.on("active-mode-changed", (_event, mode) => callback(mode));
	},
	appendLog: (category, source, message) => ipcRenderer.invoke("append-log", category, source, message),
	getLogs: (category) => ipcRenderer.invoke("get-logs", category),
	getToolSchemas: () => ipcRenderer.invoke("get-tool-schemas"),
	executeMcpTool: (server, tool, args) => ipcRenderer.invoke("execute-mcp-tool", server, tool, args),
	getProjectContext: () => ipcRenderer.invoke("get-project-context"),
	getProjectContext: () => ipcRenderer.invoke("get-project-context"),
	windowMinimize: () => ipcRenderer.send("window-minimize"),
	windowMaximize: () => ipcRenderer.send("window-maximize"),
	windowClose: () => ipcRenderer.send("window-close"),
	windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized")
});
//#endregion
