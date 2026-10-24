import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateMinute, fromApiFootball, fromFootballData } from '../backend/normalize';
import { MatchSimulator } from '../backend/providers/simulator';
import type { FootballDataMatch } from '../backend/raw';

const fixture: FootballDataMatch = JSON.parse(readFileSync('data/fixtures/football-data-sample.json', 'utf8'));

describe('fromFootballData', () => {
  const m = fromFootballData(fixture);

  it('maps score, minute, competition and teams', () => {
    expect(m.score).toEqual({ home: 2, away: 1 });
    expect(m.minute).toBe(67);
    expect(m.competition).toBe('Primera Division');
    expect([m.home.short, m.away.short]).toEqual(['SEV', 'BET']);
    expect(m.status).toBe('live');
  });

  it('flags derived stats as estimated and live', () => {
    expect(m.estimated).toBe(true);
    expect(m.mode).toBe('live');
    expect(m.players).toEqual([]);
  });

  it('builds a sorted event list with the right sides and card counts', () => {
    expect(m.events.map((e) => e.minute)).toEqual([12, 33, 41, 58, 60, 64]);
    expect(m.events[0]).toMatchObject({ type: 'goal', side: 'home', player: 'Lucas Ocampos' });
    expect(m.home.stats.redCards).toBe(1);
    expect(m.away.stats.yellowCards).toBe(1);
  });

  it('keeps estimated possession in a plausible range', () => {
    expect(m.home.stats.possession).toBeGreaterThanOrEqual(35);
    expect(m.home.stats.possession).toBeLessThanOrEqual(65);
    expect(m.home.stats.shotsOnTarget).toBeLessThanOrEqual(m.home.stats.shots);
  });

  it('estimates the minute from kickoff when the API omits it, skipping the half-time break', () => {
    const kickoff = Date.parse('2026-10-24T14:00:00Z');
    expect(estimateMinute(fixture.utcDate, kickoff + 30 * 60_000)).toBe(30);
    expect(estimateMinute(fixture.utcDate, kickoff + 75 * 60_000)).toBe(60);
    const noMinute = fromFootballData({ ...fixture, minute: undefined }, kickoff + 30 * 60_000);
    expect(noMinute.minute).toBe(30);
  });

  it('maps PAUSED to halftime and FINISHED to finished', () => {
    expect(fromFootballData({ ...fixture, status: 'PAUSED' }).status).toBe('halftime');
    expect(fromFootballData({ ...fixture, status: 'FINISHED' }).status).toBe('finished');
  });
});

describe('fromApiFootball (simulator feed)', () => {
  const sim = new MatchSimulator(11);
  for (let i = 0; i < 50; i++) sim.step();
  const m = fromApiFootball(sim.snapshot());

  it('parses string stats ("56%", "1.23") into numbers', () => {
    expect(typeof m.home.stats.possession).toBe('number');
    expect(m.home.stats.possession + m.away.stats.possession).toBe(100);
    expect(typeof m.home.stats.xg).toBe('number');
    expect(m.home.stats.passAccuracy).toBeGreaterThan(0);
  });

  it('is demo data, not flagged as estimated', () => {
    expect(m.mode).toBe('demo');
    expect(m.estimated).toBe(false);
  });

  it('maps events and players into the app schema', () => {
    expect(m.events.length).toBeGreaterThan(0);
    expect(m.events.every((e) => e.text.length > 0 && ['home', 'away'].includes(e.side))).toBe(true);
    expect(m.players).toHaveLength(32);
    expect(m.players.filter((p) => p.onPitch && p.side === 'home').length).toBeLessThanOrEqual(11);
  });

  it('keeps score consistent with goal events', () => {
    const goals = (side: 'home' | 'away') => m.events.filter((e) => e.type === 'goal' && e.side === side).length;
    expect(goals('home')).toBe(m.score.home);
    expect(goals('away')).toBe(m.score.away);
  });
});
