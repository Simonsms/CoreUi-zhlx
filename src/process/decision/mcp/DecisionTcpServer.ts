// src/process/decision/mcp/DecisionTcpServer.ts
// 决策模块 TCP MCP Server — 在 Electron 主进程中运行
// 参照 TeamMcpServer 的 TCP + stdio bridge 模式

import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';
import { writeTcpMessage, createTcpMessageReader, resolveMcpScriptDir } from '@process/team/mcp/tcpHelpers';
import type { DecisionMcpTools } from '../DecisionMcpServer';

export type StdioMcpConfig = {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
};

export class DecisionTcpServer {
  private tcpServer: net.Server | null = null;
  private _port = 0;
  private readonly authToken = crypto.randomUUID();

  constructor(private readonly tools: DecisionMcpTools) {}

  async start(): Promise<StdioMcpConfig> {
    this.tcpServer = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.tcpServer!.listen(0, '127.0.0.1', () => {
        const addr = this.tcpServer!.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
        }
        resolve();
      });
      this.tcpServer!.once('error', reject);
    });

    console.log(`[DecisionMcp] TCP server started on port ${this._port}`);
    return this.getStdioConfig();
  }

  getStdioConfig(): StdioMcpConfig {
    const scriptPath = path.join(resolveMcpScriptDir(), 'decision-mcp-stdio.js');
    return {
      name: 'zhlxui-decision',
      command: 'node',
      args: [scriptPath],
      env: [
        { name: 'DECISION_MCP_PORT', value: String(this._port) },
        { name: 'DECISION_MCP_TOKEN', value: this.authToken },
      ],
    };
  }

  getPort(): number {
    return this._port;
  }

  async stop(): Promise<void> {
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
    }
    this._port = 0;
  }

  private handleConnection(socket: net.Socket): void {
    const reader = createTcpMessageReader(async (msg) => {
      const request = msg as {
        tool?: string;
        args?: Record<string, unknown>;
        auth_token?: string;
      };

      if (request.auth_token !== this.authToken) {
        writeTcpMessage(socket, { error: 'Unauthorized' });
        socket.end();
        return;
      }

      const toolName = request.tool ?? '';
      const args = request.args ?? {};

      try {
        const result = await this.tools.executeTool(toolName, args);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        writeTcpMessage(socket, { result: resultStr });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        writeTcpMessage(socket, { error: errMsg });
      }
      socket.end();
    });

    socket.on('data', reader);
    socket.on('error', () => {});
  }
}
