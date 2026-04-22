/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { initAllBridges } from '../bridge';
import { SqliteChannelRepository } from '@process/services/database/SqliteChannelRepository';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import { ConversationServiceImpl } from '@process/services/ConversationServiceImpl';
import { cronService } from '@process/services/cron/cronServiceSingleton';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { TeamSessionService, SqliteTeamRepository } from '@process/team';
import { initTeamGuideService } from '@process/team/mcp/guide/teamGuideSingleton';
import { initDecisionModule } from '@process/decision/init';

let initPromise: Promise<void> | null = null;

/**
 * Initializes process-side services and IPC bridges.
 *
 * Keep this function explicit and idempotent. The Decision module runs its own
 * migrations and opens its TCP MCP server, so initializing this file as a pure
 * import side effect can race with storage initialization or start duplicate
 * providers/servers during hot reload.
 */
export async function initBridgeServices(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    logger.config({
      print: true,
    });

    const repo = new SqliteConversationRepository();
    const conversationServiceImpl = new ConversationServiceImpl(repo);
    const channelRepo = new SqliteChannelRepository();
    const teamRepo = new SqliteTeamRepository();
    const teamSessionService = new TeamSessionService(teamRepo, workerTaskManager, conversationServiceImpl);

    // 初始化所有 IPC 桥接。
    initAllBridges({
      conversationService: conversationServiceImpl,
      conversationRepo: repo,
      workerTaskManager,
      channelRepo,
      teamSessionService,
    });

    // Initialize cron service (load jobs from database and start timers).
    void cronService.init().catch((error) => {
      console.error('[initBridge] Failed to initialize CronService:', error);
    });

    // Start in-process Aion MCP server for team-guide tools (aion_create_team).
    void initTeamGuideService(teamSessionService).catch((error) => {
      console.error('[initBridge] Failed to initialize TeamGuideMcpServer:', error);
    });

    // 决策模块：独立迁移 + Bridge 初始化 + MCP TCP Server 启动。
    // 等待初始化完成，保证前端进入决策工作台时 provider 已注册、迁移已执行。
    await initDecisionModule();
    console.log('[initBridge] Decision module initialized');
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}
