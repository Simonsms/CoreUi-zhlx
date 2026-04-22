import { describe, expect, it } from 'vitest';
import { STAGE_PROMPTS } from '@renderer/pages/decision/constants';

describe('decision stage prompts', () => {
  it('research prompt keeps stage boundaries with constructive guidance', () => {
    expect(STAGE_PROMPTS.research).toContain('本阶段要完成的输出物');
    expect(STAGE_PROMPTS.research).toContain('decision_set_dimensions');
    expect(STAGE_PROMPTS.research).toContain('decision_score_candidate');
    expect(STAGE_PROMPTS.research).toContain('decision_create_recommendation');
    expect(STAGE_PROMPTS.research).not.toContain('严禁宣称');
  });

  it('comparison prompt explicitly forbids generating final recommendations', () => {
    expect(STAGE_PROMPTS.comparison).toContain('严禁');
    expect(STAGE_PROMPTS.comparison).toContain('decision_create_recommendation');
    expect(STAGE_PROMPTS.comparison).toContain('优先使用候选方案名称');
  });

  it('convergence prompt asks for names in user-facing output instead of raw UUIDs', () => {
    expect(STAGE_PROMPTS.convergence).toContain('优先使用候选方案名称');
    expect(STAGE_PROMPTS.convergence).toContain('UUID');
  });
});
