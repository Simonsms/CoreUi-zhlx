import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type DecisionUIState = {
  selectedResearchItemId: string | null;
  selectedCandidateId: string | null;
  highlightedItemIds: Set<string>;
};

type DecisionUIActions = {
  setSelectedResearchItem: (id: string | null) => void;
  setSelectedCandidate: (id: string | null) => void;
  addHighlight: (id: string) => void;
  removeHighlight: (id: string) => void;
};

type DecisionUIContextValue = DecisionUIState & DecisionUIActions;

const DecisionUICtx = createContext<DecisionUIContextValue | null>(null);

export const DecisionUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedResearchItemId, setSelectedResearchItem] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidate] = useState<string | null>(null);
  const [highlightedItemIds, setHighlightedItemIds] = useState<Set<string>>(new Set());
  const highlightTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => highlightTimersRef.current.forEach(clearTimeout);
  }, []);

  const addHighlight = useCallback((id: string) => {
    setHighlightedItemIds((prev) => new Set(prev).add(id));
    const timer = setTimeout(() => {
      setHighlightedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      highlightTimersRef.current.delete(timer);
    }, 2000);
    highlightTimersRef.current.add(timer);
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
      selectedResearchItemId,
      selectedCandidateId,
      highlightedItemIds,
      setSelectedResearchItem,
      setSelectedCandidate,
      addHighlight,
      removeHighlight,
    }),
    [selectedResearchItemId, selectedCandidateId, highlightedItemIds, addHighlight, removeHighlight]
  );

  return <DecisionUICtx.Provider value={value}>{children}</DecisionUICtx.Provider>;
};

export function useDecisionUI(): DecisionUIContextValue {
  const ctx = useContext(DecisionUICtx);
  if (!ctx) throw new Error('useDecisionUI must be used within DecisionUIProvider');
  return ctx;
}
