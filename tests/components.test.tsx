import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompactOverlay } from '../src/components/CompactOverlay';
import { EventTimeline } from '../src/components/EventTimeline';
import { InsightPanel } from '../src/components/InsightPanel';
import { formationRows } from '../src/components/FormationPitch';
import { GoalBurst } from '../src/components/GoalBurst';
import { MatchHeader } from '../src/components/MatchHeader';
import { Onboarding } from '../src/components/Onboarding';
import { StatsPanel } from '../src/components/StatsPanel';
import { topPlayers } from '../src/utils/players';
import { makeMatch } from './helpers';

const match = makeMatch(60);

describe('MatchHeader', () => {
  it('shows teams, score, competition and the demo badge', () => {
    render(<MatchHeader match={match} />);
    expect(screen.getByText('Manchester City')).toBeInTheDocument();
    expect(screen.getByText('Arsenal')).toBeInTheDocument();
    expect(screen.getByLabelText(`Score ${match.score.home} to ${match.score.away}`)).toBeInTheDocument();
    expect(screen.getByText('Premier League')).toBeInTheDocument();
    expect(screen.getByText('Demo mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Match clock')).toHaveTextContent(`${match.minute}'`);
  });

  it('labels estimated provider stats', () => {
    render(<MatchHeader match={{ ...match, mode: 'live', estimated: true }} />);
    expect(screen.getByText('Live data')).toBeInTheDocument();
    expect(screen.getByText('Estimated stats')).toBeInTheDocument();
  });
});

describe('StatsPanel', () => {
  it('renders every stat row with both teams’ values', () => {
    render(<StatsPanel match={match} />);
    for (const label of ['Possession', 'Shots on target', 'Expected goals (xG)', 'Pass accuracy', 'Fouls', 'Corners', 'Offsides']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(`Possession: ${match.home.stats.possession}% to ${match.away.stats.possession}%`)).toBeInTheDocument();
  });
});

describe('CompactOverlay', () => {
  it('shows score, possession and the lead insight, and hides AI when toggled off', () => {
    const { rerender } = render(<CompactOverlay match={match} showAI />);
    expect(screen.getByLabelText(`Score ${match.score.home} to ${match.score.away}`)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Possession /)).toBeInTheDocument();
    expect(screen.getByText(match.insights[0].title + '.')).toBeInTheDocument();
    rerender(<CompactOverlay match={match} showAI={false} />);
    expect(screen.queryByText(match.insights[0].title + '.')).not.toBeInTheDocument();
  });

  it('calls onExpand from the expand button', () => {
    const onExpand = vi.fn();
    render(<CompactOverlay match={match} showAI onExpand={onExpand} />);
    fireEvent.click(screen.getByLabelText('Expand to dashboard'));
    expect(onExpand).toHaveBeenCalled();
  });
});

describe('InsightPanel and EventTimeline', () => {
  it('renders 1-4 insight cards and the summary', () => {
    render(<InsightPanel match={match} />);
    expect(screen.getByText(match.summary)).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('article').length).toBeLessThanOrEqual(4);
  });

  it('filters the timeline to key events and can show all', () => {
    render(<EventTimeline match={match} />);
    const keyCount = screen.queryAllByRole('listitem').length;
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(keyCount);
  });
});

describe('screen-mode rendering', () => {
  it('shows "—" for stats the source cannot measure instead of 0', () => {
    render(<StatsPanel match={{ ...match, mode: 'screen', missing: ['passAccuracy'] }} />);
    expect(screen.getByLabelText('Pass accuracy: not available from this source')).toHaveTextContent('——');
  });
});

describe('GoalBurst', () => {
  it('fires when a side scores, not on first render', () => {
    const { rerender } = render(<GoalBurst match={match} />);
    expect(screen.queryByText('Goal')).not.toBeInTheDocument();
    rerender(<GoalBurst match={{ ...match, score: { ...match.score, away: match.score.away + 1 } }} />);
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(match.away.name);
  });
});

describe('topPlayers', () => {
  it('has no top dribbler until someone completes a dribble', () => {
    const players = match.players.map((p) => ({ ...p, dribbles: 0 }));
    expect(topPlayers(players).dribbler).toBeUndefined();
  });
});

describe('formationRows', () => {
  it('parses valid formations and rejects invalid ones', () => {
    expect(formationRows('4-3-3')).toEqual([1, 4, 3, 3]);
    expect(formationRows('4-2-3-1')).toEqual([1, 4, 2, 3, 1]);
    expect(formationRows('')).toBeNull();
    expect(formationRows('5-5-5')).toBeNull();
  });
});

describe('Onboarding (audit #9)', () => {
  it("starts from the server's mode and keeps its key when the field is left empty", async () => {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      const body = url === '/api/health' ? { ok: true, requestedMode: 'live', hasKey: true } : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    try {
      const onDone = vi.fn();
      render(<Onboarding onDone={onDone} />);
      await waitFor(() => expect(screen.getByRole('radio', { name: /Live fixtures/ })).toBeChecked());
      expect(screen.getByPlaceholderText(/Leave empty to keep/)).not.toBeRequired();
      fireEvent.click(screen.getByRole('button', { name: /Enter the field/ }));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(JSON.parse(calls.find((c) => c.url === '/api/config')!.body!)).toEqual({ mode: 'live' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
