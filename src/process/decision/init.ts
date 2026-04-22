// src/process/decision/init.ts
// 决策模块异步初始化入口

import { getDatabase } from '@process/services/database';
import { initDecisionBridge } from '@process/bridge/decisionBridge';
import { runDecisionMigrations } from './migrations';
import { DecisionService } from './DecisionService';
import { DecisionMcpTools } from './DecisionMcpServer';
import { DecisionTcpServer } from './mcp/DecisionTcpServer';
import { SqliteDecisionRepository } from './repository/SqliteDecisionRepository';
import type { StdioMcpConfig } from './mcp/DecisionTcpServer';

let mcpTools: DecisionMcpTools | null = null;
let tcpServer: DecisionTcpServer | null = null;
let stdioConfig: StdioMcpConfig | null = null;
let initPromise: Promise<void> | null = null;

export async function initDecisionModule(): Promise<void> {
  if (mcpTools && tcpServer && stdioConfig) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = doInitDecisionModule().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

async function doInitDecisionModule(): Promise<void> {
  const aionDb = await getDatabase();
  const driver = aionDb.getDriver();

  // 执行独立迁移
  runDecisionMigrations(driver);

  // 使用局部变量构建模块，只有全部成功后才提交全局状态。
  const repo = new SqliteDecisionRepository(driver);
  const service = new DecisionService(repo);
  const nextMcpTools = new DecisionMcpTools(service);
  const nextTcpServer = new DecisionTcpServer(nextMcpTools);

  try {
    const nextStdioConfig = await nextTcpServer.start();

    initDecisionBridge(service);

    mcpTools = nextMcpTools;
    tcpServer = nextTcpServer;
    stdioConfig = nextStdioConfig;
  } catch (error) {
    try {
      await nextTcpServer.stop();
    } catch (stopError) {
      console.error('[Decision] Failed to stop TCP server after init error:', stopError);
    }

    throw error;
  }

  console.log(
    `[Decision] Module initialized: ${nextMcpTools.getToolDefinitions().length} MCP tools, TCP port ${nextTcpServer.getPort()}`
  );
}

export function getDecisionMcpTools(): DecisionMcpTools | null {
  return mcpTools;
}

export function getDecisionStdioConfig(): StdioMcpConfig | null {
  return stdioConfig;
}

export async function stopDecisionModule(): Promise<void> {
  if (initPromise) {
    try {
      await initPromise;
    } catch {
      // Ignore initialization errors while shutting down.
    }
  }

  if (tcpServer) {
    await tcpServer.stop();
    tcpServer = null;
  }
  mcpTools = null;
  stdioConfig = null;

  initPromise = null;
}
