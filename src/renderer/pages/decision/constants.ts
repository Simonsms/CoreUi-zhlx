import type { DecisionStage } from '@process/decision/types';

export const STAGE_LABELS: Record<DecisionStage, string> = {
  problem_definition: '问题定义',
  research: '调研发散',
  comparison: '方案评估',
  convergence: '决策收敛',
};
