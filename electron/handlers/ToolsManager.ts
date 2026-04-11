import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export interface ToolSchema {
  name: string;
  description: string;
  parameters: any;
  permission?: 'safe' | 'caution' | 'dangerous';
  autonomy?: 'assist' | 'autonomous';
}

export interface ToolPlugin extends ToolSchema {
  execute: (params: any) => Promise<{ success: boolean; result: string }>;
}

export class ToolsManager {
  private static instance: ToolsManager;
  private plugins: Map<string, ToolPlugin> = new Map();
  private pluginsDir: string;

  private constructor() {
    // Determine plugins directory (relative to built main.js)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // In dev, it's ./electron/plugins. In production, we'll need a better path.
    this.pluginsDir = path.resolve(process.cwd(), 'electron', 'plugins');
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }
  }

  public static getInstance(): ToolsManager {
    if (!ToolsManager.instance) {
      ToolsManager.instance = new ToolsManager();
    }
    return ToolsManager.instance;
  }

  /**
   * Scans the plugins directory and subdirectories for tool implementations.
   */
  public async scanPlugins(): Promise<void> {
    console.log(`[TOOLS] Scanning for plugins in: ${this.pluginsDir}`);
    const files = this.getAllFiles(this.pluginsDir);
    
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.mjs')) {
        await this.loadJsPlugin(file);
      } else if (file.endsWith('.py')) {
        this.loadPyPlugin(file);
      }
    }
    
    console.log(`[TOOLS] Registered ${this.plugins.size} tools.`);
  }

  private getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
      if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
        arrayOfFiles = this.getAllFiles(path.join(dirPath, file), arrayOfFiles);
      } else {
        arrayOfFiles.push(path.join(dirPath, file));
      }
    });

    return arrayOfFiles;
  }

  private async loadJsPlugin(filePath: string): Promise<void> {
    try {
      // Use file URL for cross-platform compatibility with dynamic import
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      
      const plugin = module.default as ToolPlugin;
      if (plugin && plugin.name && typeof plugin.execute === 'function') {
        this.plugins.set(plugin.name, plugin);
        console.log(`[TOOLS] Loaded JS Plugin: ${plugin.name}`);
      }
    } catch (err: any) {
      console.error(`[TOOLS] Failed to load plugin ${filePath}:`, err.message);
    }
  }

  private loadPyPlugin(filePath: string): void {
    // For Python, we register a wrapper that calls the script
    const name = path.basename(filePath, '.py');
    // We'll need a way to get the schema from the python file
    // For now, we assume standard naming and a companion .json schema or a help flag
    console.log(`[TOOLS] Registered Python Plugin (Wrapper): ${name}`);
    
    // Placeholder for Python integration logic
    this.plugins.set(name, {
      name,
      description: `Python script: ${name}`,
      parameters: { type: 'object', properties: {} }, // To be improved
      execute: async (params) => {
        return this.executePythonScript(filePath, params);
      }
    });
  }

  private async executePythonScript(filePath: string, params: any): Promise<{ success: boolean; result: string }> {
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const process = spawn('python', [filePath, JSON.stringify(params)]);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => stdout += data.toString());
      process.stderr.on('data', (data) => stderr += data.toString());

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, result: stdout });
        } else {
          resolve({ success: false, result: stderr || `Exit code ${code}` });
        }
      });
    });
  }

  public getTool(name: string): ToolPlugin | undefined {
    return this.plugins.get(name);
  }

  public getAllSchemas(): ToolSchema[] {
    return Array.from(this.plugins.values()).map(({ name, description, parameters, permission, autonomy }) => ({
      name, description, parameters, permission, autonomy
    }));
  }

  public async executeTool(name: string, params: any): Promise<{ success: boolean; result: string }> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return { success: false, result: `Tool "${name}" not found.` };
    }

    try {
      return await plugin.execute(params);
    } catch (err: any) {
      return { success: false, result: `Execution error: ${err.message}` };
    }
  }
}
