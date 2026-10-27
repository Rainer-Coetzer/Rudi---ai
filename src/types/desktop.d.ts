export interface ToolResult {
  success: boolean;
  result: string;
  /** Stopped by the sidecar's security rules or declined in the approval dialog. */
  blocked?: boolean;
}

export interface DesktopAPI {
  /** `confirm` forces the approval dialog even when policy would allow the call. */
  executeTool(name: string, params: any, options?: { confirm?: boolean }): Promise<ToolResult>;
  /** Tells the sidecar's approval gate which autonomy level the user picked. */
  setAutonomyLevel?(level: 'observe' | 'assist' | 'autonomous'): Promise<string>;
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
