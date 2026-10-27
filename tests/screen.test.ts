import { describe, expect, it } from 'vitest';
import { describeRead, parseClock, sameTeam, ScreenTracker } from '../backend/screen';
import type { ScreenRead } from '../backend/vision';

const noStats = {
  possession_home: null, possession_away: null, shots_home: null, shots_away: null,
  shots_on_target_home: null, shots_on_target_away: null, corners_home: null, corners_away: null,
  fouls_home: null, fouls_away: null, xg_home: null, xg_away: null,
};

/** A typical live frame: MCI 0-0 ARS at 10:00, home in possession. Override per test. */
const frame = (over: Partial<ScreenRead> = {}): ScreenRead => ({
  football_visible: true, is_replay: false, competition: 'Premier League',
  home_team: 'MCI', away_team: 'ARS', home_score: 0, away_score: 0, clock: '10:00',
  period: 'first_half', home_color: '#6cabdd', away_color: '#ef4444',
  possession: 'home', attacking_team: 'none', danger: 'none',
  event: 'none', event_team: 'unknown', event_player: null, stats: noStats, caption: 'City keep the ball.',
  ...over,
});

describe('parseClock', () => {
  it('reads broadcast clock formats', () => {
    expect(parseClock('67:12')).toBe(68);
    expect(parseClock('45:00')).toBe(45);
    expect(parseClock('45+2')).toBe(47);
    expect(parseClock("34'")).toBe(34);
    expect(parseClock('00:00')).toBe(1);
    expect(parseClock(null)).toBeNull();
    expect(parseClock('HT')).toBeNull();
  });

  it('reads added time after a stopped main clock (audit #5)', () => {
    expect(parseClock('45:00 +2')).toBe(47);
    expect(parseClock('45:00 +1:23')).toBe(47);
    expect(parseClock("90'+3'")).toBe(93);
    expect(parseClock('90+3')).toBe(93);
    expect(parseClock('2H 67:12')).toBe(68);
  });
});

describe('sameTeam', () => {
  it('matches abbreviations and short names, not different clubs', () => {
    expect(sameTeam('MCI', 'Manchester City')).toBe(true);
    expect(sameTeam('Man City', 'MCI')).toBe(true);
    expect(sameTeam('ARS', 'Arsenal')).toBe(true);
    expect(sameTeam('MUN', 'Manchester City')).toBe(false);
    expect(sameTeam('CHE', 'Arsenal')).toBe(false);
  });

  it('works for any script and folds accents (audit #3)', () => {
    expect(sameTeam('Ολυμπιακός', 'ΟΛΥΜΠΙΑΚΟΣ')).toBe(true);
    expect(sameTeam('Atlético Madrid', 'Atletico Madrid')).toBe(true);
    expect(sameTeam('Динамо', 'Спартак')).toBe(false);
  });
});

describe('ScreenTracker', () => {
  it('needs a scoreboard before it reports a match; a minute without one is "stale", ten minutes is gone', () => {
    const t = new ScreenTracker();
    t.apply(frame({ home_team: null, away_team: null }), 0);
    expect(t.detected(0)).toBe(false);
    t.apply(frame(), 1000);
    expect(t.detected(1000)).toBe(true);
    expect(t.stale(1000)).toBe(false);
    expect(t.detected(1000 + 61_000)).toBe(true);
    expect(t.stale(1000 + 61_000)).toBe(true);
    expect(t.detected(1000 + 601_000)).toBe(false);
  });

  it('turns scoreboard changes into goals on the right side, once each', () => {
    const t = new ScreenTracker();
    t.apply(frame(), 0);
    t.apply(frame({ away_score: 1, clock: '23:40', event: 'goal', event_team: 'away', event_player: 'Saka' }), 10_000);
    t.apply(frame({ away_score: 1, clock: '23:50', event: 'goal', event_team: 'away', event_player: 'Saka' }), 20_000);
    const m = t.toMatch();
    expect(m.score).toEqual({ home: 0, away: 1 });
    const goals = m.events.filter((e) => e.type === 'goal');
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ side: 'away', minute: 24, player: 'Saka' });
  });

  it('removes a goal when the score goes back down (VAR)', () => {
    const t = new ScreenTracker();
    t.apply(frame(), 0);
    t.apply(frame({ home_score: 1 }), 10_000);
    t.apply(frame({ home_score: 1 }), 20_000);
    expect(t.toMatch().events.filter((e) => e.type === 'goal')).toHaveLength(1);
    t.apply(frame({ home_score: 0 }), 30_000);
    t.apply(frame({ home_score: 0 }), 40_000);
    expect(t.toMatch().events.filter((e) => e.type === 'goal')).toHaveLength(0);
  });

  it('ignores a single misread score or clock', () => {
    const t = new ScreenTracker();
    t.apply(frame(), 0);
    t.apply(frame({ away_score: 8, clock: '83:00' }), 10_000);
    // Right after the bad frame: no phantom goals (and no GOAL animation), clock unchanged.
    let m = t.toMatch();
    expect(m.score).toEqual({ home: 0, away: 0 });
    expect(m.events).toHaveLength(0);
    expect(m.minute).toBe(10);
    t.apply(frame({ clock: '10:20' }), 20_000);
    m = t.toMatch();
    expect(m.score).toEqual({ home: 0, away: 0 });
    expect(m.minute).toBe(11);
  });

  it('follows a seek in the video once two frames agree on the new clock', () => {
    const t = new ScreenTracker();
    t.apply(frame(), 0);
    t.apply(frame({ clock: '70:05' }), 10_000);
    expect(t.toMatch().minute).toBe(10);
    t.apply(frame({ clock: '70:15' }), 20_000);
    expect(t.toMatch().minute).toBe(71);
  });

  it('does not invent goal events for the score it finds when joining mid-match', () => {
    const t = new ScreenTracker();
    t.apply(frame({ home_score: 2, away_score: 1 }), 0);
    const m = t.toMatch();
    expect(m.score).toEqual({ home: 2, away: 1 });
    expect(m.events).toHaveLength(0);
  });

  it('keeps the match when a graphic uses full team names', () => {
    const t = new ScreenTracker();
    t.apply(frame(), 0);
    t.apply(frame({ home_score: 1 }), 10_000);
    t.apply(frame({ home_score: 1 }), 20_000);
    t.apply(frame({ home_team: 'Manchester City', away_team: 'Arsenal', home_score: 1 }), 30_000);
    const m = t.toMatch();
    expect(m.home.name).toBe('MCI');
    expect(m.events.filter((e) => e.type === 'goal')).toHaveLength(1);
  });

  it('tracks a match whose scoreboard uses Greek names (audit #3)', () => {
    const t = new ScreenTracker();
    const g = (o: Partial<ScreenRead> = {}) => frame({ home_team: 'Ολυμπιακός', away_team: 'ΠΑΟΚ', ...o });
    t.apply(g(), 0);
    t.apply(g({ home_score: 1 }), 10_000);
    t.apply(g({ home_score: 1 }), 20_000);
    const m = t.toMatch();
    expect(m.score.home).toBe(1);
    expect(m.events.filter((e) => e.type === 'goal')).toHaveLength(1);
    expect(m.screen?.frames).toBe(3);
  });

  it('shows fouls as missing until a stats graphic gives them, and counts offsides (audit #15)', () => {
    const t = new ScreenTracker();
    t.apply(frame({ event: 'offside', event_team: 'home' }), 0);
    let m = t.toMatch();
    expect(m.missing).toContain('fouls');
    expect(m.missing).not.toContain('offsides');
    expect(m.home.stats.offsides).toBe(1);
    t.apply(frame({ stats: { ...noStats, fouls_home: 7, fouls_away: 9 } }), 10_000);
    m = t.toMatch();
    expect(m.missing).not.toContain('fouls');
    expect(m.away.stats.fouls).toBe(9);
  });

  it('gives multi-word teams distinct short names', () => {
    const t = new ScreenTracker();
    t.apply(frame({ home_team: 'Man City', away_team: 'Man United' }), 0);
    const m = t.toMatch();
    expect([m.home.short, m.away.short]).toEqual(['MC', 'MU']);
  });

  it('goes idle only after ten minutes without any frame', () => {
    const t = new ScreenTracker();
    t.apply(frame(), 0);
    expect(t.idle(61_000)).toBe(false);
    expect(t.idle(601_000)).toBe(true);
  });

  it('ignores replays for score, clock and sampling', () => {
    const t = new ScreenTracker();
    t.apply(frame(), 0);
    t.apply(frame({ is_replay: true, home_score: 3, clock: '88:00', possession: 'away' }), 10_000);
    const m = t.toMatch();
    expect(m.score.home).toBe(0);
    expect(m.minute).toBe(10);
    expect(m.home.stats.possession).toBe(100);
  });

  it('estimates possession and pressure from samples, and on-screen stats win', () => {
    const t = new ScreenTracker();
    t.apply(frame({ possession: 'home' }), 0);
    t.apply(frame({ possession: 'home', attacking_team: 'home', danger: 'chance' }), 10_000);
    t.apply(frame({ possession: 'away' }), 20_000);
    t.apply(frame({ possession: 'unclear' }), 30_000);
    let m = t.toMatch();
    expect(m.home.stats.possession).toBe(67);
    expect(m.away.stats.possession).toBe(33);
    expect(m.home.stats.dangerousAttacks).toBe(1);
    expect(m.home.stats.shots).toBe(1);
    expect(m.estimated).toBe(true);
    expect(m.missing).toContain('passAccuracy');

    t.apply(frame({ stats: { ...noStats, possession_home: 58, possession_away: 42, shots_home: 7, shots_away: 3 } }), 40_000);
    m = t.toMatch();
    expect(m.home.stats.possession).toBe(58);
    expect(m.away.stats.shots).toBe(3);
  });

  it('counts a card graphic once even when it stays on screen for several frames', () => {
    const t = new ScreenTracker();
    const card = frame({ event: 'yellow_card', event_team: 'away', event_player: 'Rice' });
    t.apply(card, 0);
    t.apply(card, 10_000);
    t.apply(card, 20_000);
    expect(t.toMatch().away.stats.yellowCards).toBe(1);
    t.apply(card, 120_000);
    expect(t.toMatch().away.stats.yellowCards).toBe(2);
  });

  it('starts over when a different match appears, but tolerates one name changing', () => {
    const t = new ScreenTracker();
    t.apply(frame({ home_score: 2 }), 0);
    t.apply(frame({ home_team: 'Man City', home_score: 2 }), 10_000);
    expect(t.toMatch().home.name).toBe('MCI');
    t.apply(frame({ home_team: 'LIV', away_team: 'CHE', home_score: 0 }), 20_000);
    const m = t.toMatch();
    expect([m.home.name, m.away.name]).toEqual(['LIV', 'CHE']);
    expect(m.events).toHaveLength(0);
  });

  it('describes a read in one line', () => {
    expect(describeRead(frame({ attacking_team: 'away' }))).toBe('MCI 0–0 ARS · 10:00 · ARS attacking');
    expect(describeRead(frame({ football_visible: false }))).toBe('No football match in this frame');
  });
});
