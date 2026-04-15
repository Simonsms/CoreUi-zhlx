// src/process/decision/migrations.ts
// 决策模块独立迁移系统 — 与上游迁移完全隔离，零冲突
//
// 使用 _decision_schema_version 表追踪版本，不占用 SQLite user_version pragma

import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

type DecisionMigration = {
  version: number;
  name: string;
  up: (db: ISqliteDriver) => void;
};

// ── 版本追踪 ─────────────────────────────────────────

function ensureVersionTable(db: ISqliteDriver): number {
  db.exec(`CREATE TABLE IF NOT EXISTS _decision_schema_version (
    version INTEGER NOT NULL DEFAULT 0
  )`);
  const row = db.prepare('SELECT version FROM _decision_schema_version').get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.exec('INSERT INTO _decision_schema_version (version) VALUES (0)');
    return 0;
  }
  return row.version;
}

// ── 迁移脚本 ─────────────────────────────────────────

const migration_v1: DecisionMigration = {
  version: 1,
  name: 'create decision tables',
  up(db) {
    // 决策工作空间
    db.exec(`CREATE TABLE IF NOT EXISTS decision_workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_dw_user_id ON decision_workspaces(user_id)');

    // 决策会话
    db.exec(`CREATE TABLE IF NOT EXISTS decision_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      current_stage TEXT NOT NULL DEFAULT 'problem_definition',
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES decision_workspaces(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ds_workspace_id ON decision_sessions(workspace_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ds_status ON decision_sessions(status)');

    // 阶段执行记录
    db.exec(`CREATE TABLE IF NOT EXISTS stage_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      run_number INTEGER NOT NULL DEFAULT 1,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_sr_session_id ON stage_runs(session_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sr_session_stage ON stage_runs(session_id, stage)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sr_conversation ON stage_runs(conversation_id)');

    // 调研条目
    db.exec(`CREATE TABLE IF NOT EXISTS research_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      stage_run_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'manual',
      summary TEXT NOT NULL DEFAULT '',
      borrowable TEXT NOT NULL DEFAULT '',
      not_borrowable TEXT NOT NULL DEFAULT '',
      inspiration TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_run_id) REFERENCES stage_runs(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ri_session_id ON research_items(session_id)');

    // 证据
    db.exec(`CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      research_item_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source_ref TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0.5,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ev_research_item ON evidence(research_item_id)');

    // 候选方案
    db.exec(`CREATE TABLE IF NOT EXISTS candidate_options (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      pros TEXT NOT NULL DEFAULT '[]',
      cons TEXT NOT NULL DEFAULT '[]',
      risks TEXT NOT NULL DEFAULT '[]',
      constraints TEXT NOT NULL DEFAULT '[]',
      scores TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_co_session_id ON candidate_options(session_id)');

    // 评估维度
    db.exec(`CREATE TABLE IF NOT EXISTS score_dimensions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_sd_session_id ON score_dimensions(session_id)');

    // 决策建议
    db.exec(`CREATE TABLE IF NOT EXISTS decision_recommendations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      recommended_option_id TEXT NOT NULL,
      reasoning TEXT NOT NULL DEFAULT '',
      alternative_ids TEXT NOT NULL DEFAULT '[]',
      pending_items TEXT NOT NULL DEFAULT '[]',
      next_steps TEXT NOT NULL DEFAULT '[]',
      adopted INTEGER,
      rejection_reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (recommended_option_id) REFERENCES candidate_options(id)
    )`);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_dr_session_id ON decision_recommendations(session_id)'
    );

    // 洞见
    db.exec(`CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      stage_run_id TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL,
      content TEXT NOT NULL,
      importance TEXT NOT NULL DEFAULT 'medium',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_in_session_id ON insights(session_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_in_stage ON insights(session_id, stage)');
  },
};

// ── 迁移注册 ─────────────────────────────────────────

const DECISION_MIGRATIONS: DecisionMigration[] = [migration_v1];

// ── 迁移执行器 ───────────────────────────────────────

export function runDecisionMigrations(db: ISqliteDriver): void {
  const currentVersion = ensureVersionTable(db);
  const targetVersion = DECISION_MIGRATIONS.length;

  if (currentVersion >= targetVersion) {
    return;
  }

  const toRun = DECISION_MIGRATIONS.filter(
    (m) => m.version > currentVersion && m.version <= targetVersion
  ).sort((a, b) => a.version - b.version);

  if (toRun.length === 0) {
    return;
  }

  console.log(
    `[Decision] Running ${toRun.length} migration(s): v${currentVersion} → v${targetVersion}`
  );

  // 迁移前关闭外键约束（与上游 runMigrations 保持一致）
  db.pragma('foreign_keys = OFF');

  try {
    const runInTransaction = db.transaction(() => {
      for (const migration of toRun) {
        console.log(`[Decision] Running migration v${migration.version}: ${migration.name}`);
        migration.up(db);
      }
      db.prepare('UPDATE _decision_schema_version SET version = ?').run(targetVersion);
    });
    runInTransaction();
    console.log(`[Decision] Migrations complete. Version: ${targetVersion}`);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
