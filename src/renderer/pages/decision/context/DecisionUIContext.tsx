import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { DecisionStage } from '@process/decision/types';

type DecisionUIState = {
  rightPanelCollapsed: boolean;
  selectedResearchItemId: string | null;
  selectedCandidateId: string | null;
  highlightedItemIds: Set<string>;
};

type DecisionUIActions = {
  toggleRightPanel: () => void;
  setSelectedResearchItem: (id: string | null) => void;
  setSelectedCandidate: (id: string | null) => void;
  addHighlight: (id: string) => void;
  removeHighlight: (id: string) => void;
};

type DecisionUIContextValue = DecisionUIState & DecisionUIActions;

const DecisionUICtx = createContext<DecisionUIContextValue | null>(null);

export const DecisionUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [selectedResearchItemId, setSelectedResearchItem] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidate] = useState<string | null>(null);
  const [highlightedItemIds, setHighlightedItemIds] = useState<Set<string>>(new Set());

  const toggleRightPanel = useCallback(() => setRightPanelCollapsed((v) => !v), []);

  const addHighlight = useCallback((id: string) => {
    setHighlightedItemIds((prev) => new Set(prev).add(id));
    // 2 秒后自动移除高亮
    setTimeout(() => {
      setHighlightedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  }, []);

  const removeHighlight = useCallback((id: string) => {
    setHighlightedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      rightPanelCollapsed,
      selectedResearchItemId,
      selectedCandidateId,
      highlightedItemIds,
      toggleRightPanel,
      setSelectedResearchItem,
      setSelectedCandidate,
      addHighlight,
      removeHighlight,
    }),
    [rightPanelCollapsed, selectedResearchItemId, selectedCandidateId, highlightedItemIds, toggleRightPanel, addHighlight, removeHighlight]
  );

  return <DecisionUICtx.Provider value={value}>{children}</DecisionUICtx.Provider>;
};

export function useDecisionUI(): DecisionUIContextValue {
  const ctx = useContext(DecisionUICtx);
  if (!ctx) throw new Error('useDecisionUI must be used within DecisionUIProvider');
  return ctx;
}
