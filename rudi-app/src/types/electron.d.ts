export interface ElectronAPI {
  executeTool(name: string, params: any): Promise<{ success: boolean; result: string }>;
  onModeChange(callback: (mode: string) => void): void;
  appendLog?(category: string, source: string, message: string): void;
  getLogs?(category: string): Promise<string>;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  windowIsMaximized(): Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
