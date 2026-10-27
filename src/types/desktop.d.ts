export interface DesktopAPI {
  executeTool(name: string, params: any): Promise<{ success: boolean; result: string }>;
  onModeChange(callback: (mode: string) => void): void;
  appendLog?(category: string, source: string, message: string): void;
  getLogs?(category: string): Promise<string>;
  getToolSchemas?(): Promise<any[]>;
  executeMcpTool?(server: string, tool: string, args: any): Promise<any>;
  getProjectContext?(): Promise<string>;
  // Workspace
  getWorkspace(): Promise<string>;
  setWorkspace(path: string): Promise<boolean>;
  pickWorkspace(): Promise<string | null>;
  // Window
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  windowIsMaximized(): Promise<boolean>;
}

declare global {
  interface Window {
    /** Present only inside the Tauri desktop shell; undefined in a plain browser. */
    desktopAPI?: DesktopAPI;
  }
}
