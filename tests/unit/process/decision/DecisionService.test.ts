import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionService } from '@process/decision/DecisionService';
import type { IDecisionRepository } from '@process/decision/repository/IDecisionRepository';
import type { CandidateOption, DecisionSession, ScoreDimension } from '@process/decision/types';

function createSession(currentStage: DecisionSession['currentStage']): DecisionSession {
  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    currentStage,
    status: 'active',
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
  };
}

function createCandidate(): CandidateOption {
  return {
    id: 'candidate-1',
    sessionId: 'session-1',
    name: 'option-a',
    description: 'desc',
    pros: [],
    cons: [],
    risks: [],
    constraints: [],
    scores: {},
    createdAt: 1,
    updatedAt: 1,
  };
}

function createDimension(): ScoreDimension {
  return {
    id: 'dimension-1',
    sessionId: 'session-1',
    name: 'cost',
    weight: 1,
    description: '',
    createdAt: 1,
  };
}

function createRepository(session: DecisionSession): IDecisionRepository {
  return {
    createWorkspace: vi.fn(),
    findWorkspace: vi.fn(),
    findAllWorkspaces: vi.fn(),
    updateWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    createSession: vi.fn(),
    findSession: vi.fn(async () => session),
    findSessionsByWorkspace: vi.fn(),
    updateSession: vi.fn(),
    getRecentSessions: vi.fn(),
    deleteSession: vi.fn(),
    createStageRun: vi.fn(),
    findStageRun: vi.fn(),
    findStageRunsBySession: vi.fn(),
    findActiveStageRun: vi.fn(),
    findStageRunHistory: vi.fn(),
    findStageRunByConversation: vi.fn(),
    updateStageRun: vi.fn(),
    createResearchItem: vi.fn(),
    findResearchItem: vi.fn(async () => ({
      id: 'research-1',
      sessionId: 'session-1',
      stageRunId: 'stage-run-1',
      title: 'research',
      source: '',
      sourceType: 'manual',
      summary: '',
      borrowable: '',
      notBorrowable: '',
      inspiration: '',
      tags: [],
      createdAt: 1,
    })),
    findResearchItemsBySession: vi.fn(),
    updateResearchItem: vi.fn(),
    deleteResearchItem: vi.fn(),
    createEvidence: vi.fn(),
    findEvidence: vi.fn(),
    findEvidenceByResearchItem: vi.fn(),
    deleteEvidence: vi.fn(),
    createCandidate: vi.fn(async (candidate) => candidate),
    findCandidate: vi.fn(async () => createCandidate()),
    findCandidatesBySession: vi.fn(),
    updateCandidate: vi.fn(async (id, updates) => ({ ...createCandidate(), id, ...updates })),
    deleteCandidate: vi.fn(),
    createDimension: vi.fn(async (dimension) => ({ ...createDimension(), ...dimension })),
    findDimension: vi.fn(async () => createDimension()),
    findDimensionsBySession: vi.fn(async () => [createDimension()]),
    updateDimension: vi.fn(async (id, updates) => ({ ...createDimension(), id, ...updates })),
    deleteDimension: vi.fn(),
    createRecommendation: vi.fn(),
    findRecommendation: vi.fn(),
    findRecommendationBySession: vi.fn(),
    updateRecommendation: vi.fn(),
    createInsight: vi.fn(),
    findInsightsBySession: vi.fn(),
    findInsightsByStage: vi.fn(),
  };
}

describe('DecisionService stage guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects dimension creation before comparison stage', async () => {
    const service = new DecisionService(createRepository(createSession('research')));

    await expect(
      service.addDimension({
        sessionId: 'session-1',
        name: 'cost',
        weight: 1,
        description: '',
      })
    ).rejects.toThrow('方案评估');
  });

  it('rejects candidate scoring before comparison stage', async () => {
    const service = new DecisionService(createRepository(createSession('research')));

    await expect(
      service.updateCandidate('candidate-1', {
        scores: {
          'dimension-1': {
            value: 8,
            reasoning: 'good',
          },
        },
      })
    ).rejects.toThrow('方案评估');
  });

  it('rejects recommendation creation before convergence stage', async () => {
    const service = new DecisionService(createRepository(createSession('comparison')));

    await expect(
      service.createRecommendation({
        sessionId: 'session-1',
        recommendedOptionId: 'candidate-1',
        reasoning: 'pick A',
        alternativeIds: [],
        pendingItems: [],
        nextSteps: [],
        adopted: null,
        rejectionReason: '',
      })
    ).rejects.toThrow('决策收敛');
  });

  it('allows adding candidates during comparison stage', async () => {
    const service = new DecisionService(createRepository(createSession('comparison')));

    await expect(
      service.addCandidate({
        sessionId: 'session-1',
        name: 'option-b',
        description: '',
        pros: [],
        cons: [],
        risks: [],
        constraints: [],
        scores: {},
      })
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      name: 'option-b',
    });
  });
});
