import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeLog } from "./logger.js";

interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

export class McpManager {
  private static instance: McpManager;
  private clients: Map<string, Client> = new Map();
  private configs: McpServerConfig[] = [
    // Default system MCP servers could go here
    { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    { name: "google-drive", command: "npx", args: ["-y", "@modelcontextprotocol/server-google-drive"] },
    { name: "slack", command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"] },
  ];

  private constructor() {}

  public static getInstance(): McpManager {
    if (!McpManager.instance) {
      McpManager.instance = new McpManager();
    }
    return McpManager.instance;
  }

  public async initialize(): Promise<void> {
    console.log("[MCP] Initializing external server connections...");
    for (const config of this.configs) {
      try {
        await this.connectToServer(config);
      } catch (err: any) {
        console.error(`[MCP] Failed to connect to ${config.name}:`, err.message);
        writeLog('errors', 'MCP', `Connection to ${config.name} failed: ${err.message}`);
      }
    }
  }

  private async connectToServer(config: McpServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
    });

    const client = new Client(
      { name: "rudi-agent-host", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    await client.connect(transport);
    await client.initialize();
    
    this.clients.set(config.name, client);
    console.log(`[MCP] Connected to server: ${config.name}`);
  }

  public async listAllTools(): Promise<any[]> {
    let allTools: any[] = [];
    for (const [name, client] of this.clients) {
      try {
        const result = await client.listTools();
        // Tag tools with their source server
        const taggedTools = (result.tools || []).map(t => ({ ...t, mcpServer: name }));
        allTools = [...allTools, ...taggedTools];
      } catch (err: any) {
        console.error(`[MCP] Error listing tools for ${name}:`, err.message);
      }
    }
    return allTools;
  }

  public async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP Server "${serverName}" not connected.`);
    
    return await client.callTool({
      name: toolName,
      arguments: args
    });
  }

  public isMcpTool(name: string): boolean {
    // This logic might need refinement depending on how we name tools
    return false; // Placeholder
  }
}
