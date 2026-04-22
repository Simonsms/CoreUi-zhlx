import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const swrData = new Map<string, unknown>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'common.more') return '更多';
      if (key === 'common.collapse') return '收起';
      return key;
    },
  }),
}));

vi.mock('swr', () => ({
  default: (key: string | null) => ({
    data: key ? swrData.get(key) : undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    decision: {
      research: { list: { invoke: vi.fn() } },
      candidate: { list: { invoke: vi.fn() } },
      recommendation: { get: { invoke: vi.fn() } },
      dimension: { list: { invoke: vi.fn() } },
      insight: { list: { invoke: vi.fn() } },
    },
  },
}));

vi.mock('@arco-design/web-react', () => {
  const Typography = {
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Title: ({ children }: { children: React.ReactNode }) => <h6>{children}</h6>,
  };

  return {
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
    Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Typography,
  };
});

vi.mock('@icon-park/react', () => ({
  Inbox: () => <span data-testid='inbox-icon' />,
}));

import ContextPanel from '@renderer/pages/decision/SessionPage/components/ContextPanel';

const createInsights = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `insight-${index + 1}`,
    content: `洞见 ${index + 1}`,
    importance: 'medium' as const,
  }));

describe('ContextPanel insights', () => {
  beforeEach(() => {
    swrData.clear();
    swrData.set('decision.research.session-1', []);
    swrData.set('decision.insights.session-1', createInsights(6));
    swrData.set('decision.research.session-2', []);
    swrData.set('decision.insights.session-2', createInsights(3));
  });

  it('shows only the latest five insights by default and expands all on demand', () => {
    render(<ContextPanel sessionId='session-1' currentStage='research' />);

    expect(screen.queryByText('洞见 1')).not.toBeInTheDocument();
    expect(screen.getByText('洞见 2')).toBeInTheDocument();
    expect(screen.getByText('洞见 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '更多' }));

    expect(screen.getByText('洞见 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument();
  });

  it('resets expanded state when session changes', () => {
    const { rerender } = render(<ContextPanel sessionId='session-1' currentStage='research' />);

    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    expect(screen.getByText('洞见 1')).toBeInTheDocument();

    rerender(<ContextPanel sessionId='session-2' currentStage='research' />);

    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '更多' })).not.toBeInTheDocument();
    expect(screen.getByText('洞见 1')).toBeInTheDocument();
    expect(screen.getByText('洞见 3')).toBeInTheDocument();
  });

  it('does not render an insight section when there are no insights', () => {
    swrData.set('decision.insights.session-1', []);

    render(<ContextPanel sessionId='session-1' currentStage='research' />);

    expect(screen.queryByText('洞见')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '更多' })).not.toBeInTheDocument();
  });
});
