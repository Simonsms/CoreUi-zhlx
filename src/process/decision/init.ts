// src/process/decision/init.ts
// 决策模块异步初始化入口

import { getDatabase } from '@process/services/database';
import { initDecisionBridge } from '@process/bridge/decisionBridge';
import { runDecisionMigrations } from './migrations';
import { DecisionService } from './DecisionService';
import { SqliteDecisionRepository } from './repository/SqliteDecisionRepository';

export async function initDecisionModule(): Promise<void> {
  const aionDb = await getDatabase();
  const driver = aionDb.getDriver();

  // 执行独立迁移
  runDecisionMigrations(driver);

  // 初始化 Service + Bridge
  const repo = new SqliteDecisionRepository(driver);
  const service = new DecisionService(repo);
  initDecisionBridge(service);

  console.log('[Decision] Module initialized');
}
