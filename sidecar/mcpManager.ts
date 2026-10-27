import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeLog } from "./logger.js";

interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  /** Env vars the server can't start without. They are passed through to it; missing ones skip the server. */
  requiredEnv: string[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: unknown;
  mcpServer: string;
}

export class McpManager {
  private static instance: McpManager;
  private clients: Map<string, Client> = new Map();
  private configs: McpServerConfig[] = [
    { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], requiredEnv: ["GITHUB_PERSONAL_ACCESS_TOKEN"] },
    // Needs OAuth credentials created once with `npx @modelcontextprotocol/server-gdrive auth`.
    { name: "google-drive", command: "npx", args: ["-y", "@modelcontextprotocol/server-gdrive"], requiredEnv: ["GDRIVE_CREDENTIALS_PATH"] },
    { name: "slack", command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"], requiredEnv: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"] },
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
      const missing = config.requiredEnv.filter(key => !process.env[key]);
      if (missing.length > 0) {
        console.log(`[MCP] Skipping ${config.name}: set ${missing.join(", ")} to enable it.`);
        continue;
      }
      try {
        await this.connectToServer(config);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[MCP] Failed to connect to ${config.name}:`, message);
        writeLog('errors', 'MCP', `Connection to ${config.name} failed: ${message}`);
      }
    }
  }

  private async connectToServer(config: McpServerConfig): Promise<void> {
    // The transport only forwards a safe default environment, so pass the server's own vars explicitly.
    const env = getDefaultEnvironment();
    for (const key of config.requiredEnv) env[key] = process.env[key]!;

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env,
    });

    const client = new Client({ name: "rudi-agent-host", version: "1.0.0" });

    // connect() performs the MCP initialize handshake.
    await client.connect(transport);

    this.clients.set(config.name, client);
    console.log(`[MCP] Connected to server: ${config.name}`);
  }

  public async listAllTools(): Promise<McpTool[]> {
    const allTools: McpTool[] = [];
    for (const [name, client] of this.clients) {
      try {
        const result = await client.listTools();
        // Tag tools with their source server
        for (const t of result.tools) allTools.push({ ...t, mcpServer: name });
      } catch (err) {
        console.error(`[MCP] Error listing tools for ${name}:`, err instanceof Error ? err.message : err);
      }
    }
    return allTools;
  }

  public async callTool(serverName: string, toolName: string, args: Record<string, unknown>) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP Server "${serverName}" not connected.`);

    return await client.callTool({
      name: toolName,
      arguments: args
    });
  }
}
