import type { ApiFootballLike } from '../raw';

type Side = 'home' | 'away';
type Pos = 'G' | 'D' | 'M' | 'F';
type Zone = 'left' | 'center' | 'right';

interface SimPlayer {
  name: string;
  number: number;
  pos: Pos;
  onPitch: boolean;
  yellows: number;
  touches: number;
  passes: number;
  passesOk: number;
  dribbles: number;
  tackles: number;
  interceptions: number;
  shots: number;
  /** per-player skill multiplier so a few players stand out */
  skill: number;
}

interface TeamSpec {
  name: string;
  code: string;
  formation: string;
  strength: number;
  passAcc: number;
  zoneBias: Record<Zone, number>;
  xi: [string, Pos][];
  bench: [string, Pos][];
}

const SPECS: Record<Side, TeamSpec> = {
  home: {
    name: 'Manchester City',
    code: 'MCI',
    formation: '4-3-3',
    strength: 1.1,
    passAcc: 90,
    zoneBias: { left: 0.4, center: 0.25, right: 0.35 },
    xi: [
      ['Ederson', 'G'], ['Kyle Walker', 'D'], ['Rúben Dias', 'D'], ['Josko Gvardiol', 'D'], ['Nathan Aké', 'D'],
      ['Rodri', 'M'], ['Kevin De Bruyne', 'M'], ['Bernardo Silva', 'M'],
      ['Phil Foden', 'F'], ['Erling Haaland', 'F'], ['Jérémy Doku', 'F'],
    ],
    bench: [['Manuel Akanji', 'D'], ['Mateo Kovačić', 'M'], ['İlkay Gündoğan', 'M'], ['Julián Álvarez', 'F'], ['Savinho', 'F']],
  },
  away: {
    name: 'Arsenal',
    code: 'ARS',
    formation: '4-3-3',
    strength: 1.0,
    passAcc: 86,
    zoneBias: { left: 0.3, center: 0.2, right: 0.5 },
    xi: [
      ['David Raya', 'G'], ['Ben White', 'D'], ['William Saliba', 'D'], ['Gabriel', 'D'], ['Jurriën Timber', 'D'],
      ['Declan Rice', 'M'], ['Martin Ødegaard', 'M'], ['Mikel Merino', 'M'],
      ['Bukayo Saka', 'F'], ['Kai Havertz', 'F'], ['Gabriel Martinelli', 'F'],
    ],
    bench: [['Takehiro Tomiyasu', 'D'], ['Thomas Partey', 'M'], ['Jorginho', 'M'], ['Leandro Trossard', 'F'], ['Gabriel Jesus', 'F']],
  },
};

// How much each position contributes to each action; `acc` shifts pass accuracy (keepers go long, forwards pass under pressure).
const WEIGHTS: Record<Pos, { touch: number; pass: number; dribble: number; defend: number; acc: number }> = {
  G: { touch: 0.35, pass: 0.5, dribble: 0, defend: 0.1, acc: -0.12 },
  D: { touch: 0.8, pass: 0.9, dribble: 0.2, defend: 1, acc: 0.03 },
  M: { touch: 1.2, pass: 1.3, dribble: 0.6, defend: 0.7, acc: 0 },
  F: { touch: 0.8, pass: 0.6, dribble: 1.2, defend: 0.2, acc: -0.1 },
};

const POS_MAP: Record<Pos, 'GK' | 'DF' | 'MF' | 'FW'> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };
export const positionLabel = (p: Pos) => POS_MAP[p];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Counters {
  shots: number;
  onTarget: number;
  xg: number;
  fouls: number;
  corners: number;
  offsides: number;
  yellow: number;
  red: number;
  dangerous: number;
  passes: number;
  passesOk: number;
  possession: number;
  zones: Record<Zone, number>;
  pressing: number;
  lanes: number;
  form: number;
}

const blankCounters = (): Counters => ({
  shots: 0, onTarget: 0, xg: 0, fouls: 0, corners: 0, offsides: 0, yellow: 0, red: 0, dangerous: 0,
  passes: 0, passesOk: 0, possession: 0, zones: { left: 0, center: 0, right: 0 }, pressing: 55, lanes: 45, form: 1,
});

/** Deterministic, seeded live-match simulator. One `step()` = one match minute. */
export class MatchSimulator {
  minute = 0;
  finished = false;
  private status: 'live' | 'HT' | 'finished' = 'live';
  private htDone = false;
  private control = 0.55;
  private readonly stoppage: number;
  private readonly rng: () => number;
  private goals = { home: 0, away: 0 };
  private c: Record<Side, Counters> = { home: blankCounters(), away: blankCounters() };
  private squads: Record<Side, SimPlayer[]>;
  private subMinutes: Record<Side, number[]>;
  private events: ApiFootballLike['events'] = [];
  private zoneDrift: Record<Side, Record<Zone, number>> = {
    home: { left: 0, center: 0, right: 0 },
    away: { left: 0, center: 0, right: 0 },
  };

  constructor(seed = 42) {
    this.rng = mulberry32(seed);
    this.stoppage = 2 + Math.floor(this.rng() * 4);
    const mk = (side: Side): SimPlayer[] =>
      [...SPECS[side].xi.map((p) => [...p, true] as const), ...SPECS[side].bench.map((p) => [...p, false] as const)].map(
        ([name, pos, onPitch], i) => ({
          name, pos, onPitch, number: i + 1, yellows: 0, touches: 0, passes: 0, passesOk: 0,
          dribbles: 0, tackles: 0, interceptions: 0, shots: 0, skill: 0.8 + this.rng() * 0.45,
        }),
      );
    this.squads = { home: mk('home'), away: mk('away') };
    const jitter = () => Math.floor(this.rng() * 5);
    this.subMinutes = {
      home: [58 + jitter(), 68 + jitter(), 77 + jitter()],
      away: [56 + jitter(), 66 + jitter(), 75 + jitter()],
    };
  }

  private pick<T>(items: T[], weight: (t: T) => number): T {
    const total = items.reduce((s, i) => s + weight(i), 0);
    let r = this.rng() * total;
    for (const i of items) {
      r -= weight(i);
      if (r <= 0) return i;
    }
    return items[items.length - 1];
  }

  private onPitch(side: Side) {
    return this.squads[side].filter((p) => p.onPitch);
  }

  private log(type: ApiFootballLike['events'][number]['type'], side: Side, player: string, detail: string, xg?: number) {
    this.events.push({ time: { elapsed: this.minute }, team: { name: SPECS[side].name }, player: { name: player }, type, detail, xg });
  }

  step() {
    if (this.finished) return;
    if (this.minute === 45 && !this.htDone) {
      this.htDone = true;
      this.status = 'HT';
      return;
    }
    this.status = 'live';
    this.minute++;

    this.control = clamp(this.control + (this.rng() - 0.5) * 0.05 + (0.55 - this.control) * 0.03, 0.4, 0.68);
    const sides: Side[] = ['home', 'away'];
    for (const side of sides) {
      const other: Side = side === 'home' ? 'away' : 'home';
      const c = this.c[side];
      const spec = SPECS[side];
      const share = side === 'home' ? this.control : 1 - this.control;
      const trailing = clamp(this.goals[other] - this.goals[side], -1, 2);

      c.form = clamp(c.form + (this.rng() - 0.5) * 0.08, 0.85, 1.15);
      c.pressing = clamp(c.pressing + (this.rng() - 0.5) * 7 + trailing * 0.8, 25, 92);
      c.lanes = clamp(c.lanes + (this.rng() - 0.5) * 5 + (share - 0.5) * 6, 28, 70);
      c.possession += share;

      // Which channel is hot drifts over time so the "most dangerous area" insight can change.
      for (const z of ['left', 'center', 'right'] as Zone[]) {
        this.zoneDrift[side][z] = clamp(this.zoneDrift[side][z] + (this.rng() - 0.5) * 0.06, -0.15, 0.25);
      }

      const load = share * spec.strength * c.form * (1 + 0.15 * trailing);
      const dangerous = (this.rng() < load * 0.55 ? 1 : 0) + (this.rng() < load * 0.2 ? 1 : 0);
      for (let i = 0; i < dangerous; i++) {
        c.dangerous++;
        const zone = this.pick(['left', 'center', 'right'] as Zone[], (z) => spec.zoneBias[z] + this.zoneDrift[side][z] + 0.05);
        c.zones[zone]++;
        if (this.rng() < 0.3) this.shoot(side);
      }

      if (this.rng() < 0.11) this.foul(side);
      if (this.rng() < 0.035 * share + 0.01) {
        // Red cards can leave a team with no forwards; fall back to any outfield player.
        const forwards = this.onPitch(side).filter((x) => x.pos === 'F');
        const p = this.pick(forwards.length ? forwards : this.onPitch(side).filter((x) => x.pos !== 'G'), () => 1);
        c.offsides++;
        this.log('Offside', side, p.name, 'Offside');
      }
      if (this.rng() < 0.02 * load) {
        c.corners++;
        this.log('Corner', side, this.pick(this.onPitch(side).filter((x) => x.pos !== 'G'), () => 1).name, 'Corner Kick');
      }

      this.tickPlayers(side, share);
      if (this.subMinutes[side].includes(this.minute)) this.substitute(side);
    }

    if (this.minute >= 90 + this.stoppage) {
      this.finished = true;
      this.status = 'finished';
    }
  }

  private shoot(side: Side) {
    const c = this.c[side];
    const xg = 0.02 + this.rng() ** 3 * 0.4;
    const onTarget = this.rng() < Math.min(0.85, 0.3 + xg * 1.5);
    const scorer = this.pick(this.onPitch(side), (p) => (p.pos === 'F' ? 3 : p.pos === 'M' ? 1.5 : p.pos === 'D' ? 0.3 : 0) * p.skill);
    scorer.shots++;
    c.shots++;
    c.xg += xg;
    if (onTarget) c.onTarget++;
    const goal = onTarget && this.rng() < Math.min(0.75, xg * 1.7 + 0.04);
    if (goal) {
      this.goals[side]++;
      this.log('Goal', side, scorer.name, 'Normal Goal', xg);
    } else {
      this.log('Shot', side, scorer.name, onTarget ? 'Saved' : this.rng() < 0.3 ? 'Blocked' : 'Off Target', xg);
      if (onTarget && this.rng() < 0.3) {
        this.c[side].corners++;
        this.log('Corner', side, scorer.name, 'Corner Kick');
      }
    }
  }

  private foul(side: Side) {
    const c = this.c[side];
    const p = this.pick(this.onPitch(side).filter((x) => x.pos !== 'G'), (x) => WEIGHTS[x.pos].defend + 0.2);
    c.fouls++;
    this.log('Foul', side, p.name, 'Foul');
    const r = this.rng();
    if (r < 0.014) {
      this.sendOff(side, p, 'Red Card');
    } else if (r < 0.16) {
      p.yellows++;
      c.yellow++;
      this.log('Card', side, p.name, 'Yellow Card');
      if (p.yellows === 2) this.sendOff(side, p, 'Second Yellow card');
    }
  }

  private sendOff(side: Side, p: SimPlayer, detail: string) {
    p.onPitch = false;
    this.c[side].red++;
    this.log('Card', side, p.name, detail);
  }

  private substitute(side: Side) {
    const squad = this.squads[side];
    const out = this.pick(this.onPitch(side).filter((p) => p.pos !== 'G'), (p) => (p.pos === 'F' ? 1.5 : 1));
    const bench = squad.filter((p) => !p.onPitch && p.passes === 0 && p.touches === 0);
    const candidate = bench.find((p) => p.pos === out.pos) ?? bench[0];
    if (!candidate) return;
    out.onPitch = false;
    candidate.onPitch = true;
    this.log('subst', side, candidate.name, `${candidate.name} replaces ${out.name}`);
  }

  private tickPlayers(side: Side, share: number) {
    const c = this.c[side];
    const spec = SPECS[side];
    const players = this.onPitch(side);
    const teamPasses = Math.max(2, Math.round(share * 11 + this.rng() * 3));
    const acc = clamp(spec.passAcc + (this.rng() - 0.5) * 6, 70, 96) / 100;
    const total = players.reduce((s, p) => s + WEIGHTS[p.pos].pass * p.skill, 0);
    for (const p of players) {
      const w = WEIGHTS[p.pos];
      const passes = Math.max(0, Math.round((teamPasses * w.pass * p.skill) / total + (this.rng() - 0.5)));
      let ok = 0;
      for (let i = 0; i < passes; i++) if (this.rng() < acc + w.acc) ok++;
      p.passes += passes;
      p.passesOk += ok;
      c.passes += passes;
      c.passesOk += ok;
      p.touches += Math.round(passes * 1.25 + this.rng() * w.touch);
      if (this.rng() < w.dribble * 0.05 * share * p.skill * 2) p.dribbles++;
      if (this.rng() < w.defend * 0.05 * (1.3 - share) * p.skill * 1.5) p.tackles++;
      if (this.rng() < w.defend * 0.03 * p.skill * 1.5) p.interceptions++;
    }
  }

  /** Current state in provider shape. */
  snapshot(): ApiFootballLike {
    const sides: Side[] = ['home', 'away'];
    const m = Math.max(1, this.minute);
    const poss = Math.round((this.c.home.possession / m) * 100);
    const possession = { home: this.minute === 0 ? 50 : poss, away: this.minute === 0 ? 50 : 100 - poss };
    const short = this.status === 'HT' ? 'HT' : this.status === 'finished' ? 'FT' : this.minute > 45 ? '2H' : '1H';
    const stat = (side: Side) => {
      const c = this.c[side];
      const zoneTotal = c.zones.left + c.zones.center + c.zones.right || 1;
      return {
        team: { name: SPECS[side].name },
        statistics: [
          { type: 'Total Shots', value: c.shots },
          { type: 'Shots on Goal', value: c.onTarget },
          { type: 'expected_goals', value: c.xg.toFixed(2) },
          { type: 'Ball Possession', value: `${possession[side]}%` },
          { type: 'Fouls', value: c.fouls },
          { type: 'Corner Kicks', value: c.corners },
          { type: 'Offsides', value: c.offsides },
          { type: 'Yellow Cards', value: c.yellow },
          { type: 'Red Cards', value: c.red },
          { type: 'Passes %', value: `${c.passes ? Math.round((c.passesOk / c.passes) * 100) : 0}%` },
          { type: 'Dangerous Attacks', value: c.dangerous },
          { type: 'Pressing Intensity', value: Math.round(c.pressing) },
          { type: 'Progressive Passes %', value: Math.round(c.lanes) },
          { type: 'Attacks Left %', value: Math.round((c.zones.left / zoneTotal) * 100) },
          { type: 'Attacks Center %', value: Math.round((c.zones.center / zoneTotal) * 100) },
          { type: 'Attacks Right %', value: Math.round((c.zones.right / zoneTotal) * 100) },
        ],
      };
    };
    return {
      fixture: { id: 900001, status: { short, elapsed: this.minute } },
      league: { name: 'Premier League' },
      teams: {
        home: { name: SPECS.home.name, code: SPECS.home.code },
        away: { name: SPECS.away.name, code: SPECS.away.code },
      },
      goals: { ...this.goals },
      statistics: sides.map(stat),
      events: [...this.events],
      lineups: sides.map((s) => ({ team: { name: SPECS[s].name }, formation: SPECS[s].formation })),
      players: sides.map((s) => ({
        team: { name: SPECS[s].name },
        players: this.squads[s].map((p) => ({
          player: { name: p.name, number: p.number, pos: p.pos },
          onPitch: p.onPitch,
          statistics: {
            touches: p.touches,
            passes: { total: p.passes, accurate: p.passesOk },
            dribbles: { success: p.dribbles },
            tackles: { total: p.tackles, interceptions: p.interceptions },
            shots: { total: p.shots },
          },
        })),
      })),
    };
  }
}
