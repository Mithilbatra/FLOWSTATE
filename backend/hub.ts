import type { DataMode, Match } from '../src/types/match';
import type { Config } from './config';
import { buildInsights } from './insights';
import { MomentumTracker } from './momentum';
import { fromApiFootball, fromFootballData, type BaseMatch } from './normalize';
import { FootballDataProvider } from './providers/footballData';
import { MatchSimulator } from './providers/simulator';
import { describeRead, ScreenTracker } from './screen';
import { readFrame, type ScreenRead } from './vision';

const LIVE_POLL_MS = 15_000;
const FULL_TIME_HOLD_TICKS = 8;

export class BusyError extends Error {}

/**
 * Owns the match state: reads the user's screen (when scanning), polls the live provider, or steps the
 * simulator; normalizes, enriches with momentum + insights, and pushes every update to subscribers.
 * Live and screen failures degrade to demo data.
 */
export class Hub {
  private listeners = new Set<(m: Match) => void>();
  private tracker = new MomentumTracker();
  private sim: MatchSimulator;
  private seed: number;
  private provider: FootballDataProvider;
  private latest: Match | null = null;
  private notice: string | undefined;
  private source: DataMode = 'demo';
  private nextLiveAttempt = 0;
  private liveBusy = false;
  private fullTimeTicks = 0;
  private timer: NodeJS.Timeout | undefined;
  private screen: ScreenTracker | null = null;
  private screenBusy = false;

  constructor(
    private cfg: Config,
    private read: (jpegBase64: string, model: string) => Promise<ScreenRead> = readFrame,
  ) {
    this.seed = cfg.simSeed;
    this.sim = new MatchSimulator(this.seed);
    this.provider = new FootballDataProvider(cfg.apiKey, cfg.matchId);
    for (let i = 0; i < cfg.simStartMinute; i++) {
      this.sim.step();
      this.tracker.push(fromApiFootball(this.sim.snapshot()));
    }
  }

  current() {
    return this.latest;
  }

  info() {
    return { requestedMode: this.cfg.mode, source: this.source, hasKey: this.cfg.apiKey !== '', notice: this.notice ?? null };
  }

  subscribe(fn: (m: Match) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start() {
    const loop = async () => {
      // An error in one update must not stop the feed for the rest of the session.
      try {
        await this.tick(true);
      } catch (err) {
        console.error('[hub] update failed', err);
      }
      const delay = this.source === 'live' ? Math.max(1000, this.nextLiveAttempt - Date.now()) : 2000 / this.cfg.simSpeed;
      this.timer = setTimeout(loop, delay);
    };
    void loop();
  }

  stop() {
    clearTimeout(this.timer);
  }

  /** Re-fetch now. Demo and screen modes republish the current state without advancing the clock. */
  refresh() {
    this.nextLiveAttempt = 0;
    return this.tick(false);
  }

  setConfig(patch: { mode?: 'demo' | 'live'; apiKey?: string }) {
    this.cfg = { ...this.cfg, ...patch };
    if (patch.apiKey !== undefined) this.provider = new FootballDataProvider(this.cfg.apiKey, this.cfg.matchId);
    this.nextLiveAttempt = 0;
    return this.tick(false);
  }

  /** Analyse one frame of the user's screen. One frame at a time: concurrent calls get BusyError. */
  async ingestFrame(jpegBase64: string) {
    if (this.screenBusy) throw new BusyError('Still reading the previous frame');
    this.screenBusy = true;
    try {
      const read = await this.read(jpegBase64, this.cfg.screenModel);
      (this.screen ??= new ScreenTracker()).apply(read);
      await this.tick(false);
      return describeRead(read);
    } finally {
      this.screenBusy = false;
    }
  }

  stopScreen() {
    this.screen = null;
    return this.tick(false);
  }

  private async tick(advance: boolean) {
    // The overlay was closed (or crashed) without pressing stop: frames stopped arriving, so end the scan.
    if (this.screen?.idle()) this.screen = null;
    if (this.screen?.detected()) {
      this.source = 'screen';
      this.publish(this.screen.toMatch());
      return;
    }
    if (this.cfg.mode === 'live') {
      if (this.liveBusy) return; // the request in flight will publish
      if (Date.now() >= this.nextLiveAttempt) {
        if (await this.pollLive()) return;
      } else if (this.source === 'live') {
        return; // between polls: keep showing the live match
      }
    } else {
      this.notice = undefined;
    }
    this.source = 'demo';
    this.demoTick(advance);
  }

  /** True when a live match was published. */
  private async pollLive() {
    this.liveBusy = true;
    try {
      if (!this.cfg.apiKey) throw new Error('no FOOTBALL_DATA_API_KEY set');
      const raw = await this.provider.fetchCurrent();
      if (raw) {
        this.notice = undefined;
        this.source = 'live';
        this.publish(fromFootballData(raw));
        return true;
      }
      this.notice = 'No live matches right now — showing demo data.';
    } catch (err) {
      this.notice = `Live API unavailable (${(err as Error).message}) — showing demo data.`;
      console.warn(`[hub] ${this.notice}`);
    } finally {
      this.liveBusy = false;
      // Counted from when the request ends, so slow timeouts can't starve the demo fallback.
      this.nextLiveAttempt = Date.now() + LIVE_POLL_MS;
    }
    return false;
  }

  private demoTick(advance: boolean) {
    if (advance) {
      if (!this.sim.finished) {
        this.sim.step();
      } else if (++this.fullTimeTicks > FULL_TIME_HOLD_TICKS) {
        this.fullTimeTicks = 0;
        this.sim = new MatchSimulator(++this.seed);
      }
    }
    this.publish(fromApiFootball(this.sim.snapshot()));
  }

  private publish(base: BaseMatch) {
    const momentum = this.tracker.push(base);
    let { insights, summary } = buildInsights({ ...base, momentum });
    if (base.screen?.caption) {
      insights = [{ id: 'live-read', tone: 'neutral' as const, title: 'On your screen', text: base.screen.caption }, ...insights].slice(0, 4);
      summary = `${base.screen.caption} ${summary}`;
    }
    // Live-API notices describe the demo fallback, so they never belong on screen data.
    const notice = base.mode === 'screen' ? undefined : this.screen ? 'Scanning your screen — no football match recognised yet.' : this.notice;
    this.latest = { ...base, momentum, insights, summary, notice, updatedAt: Date.now() };
    this.listeners.forEach((fn) => fn(this.latest!));
  }
}
