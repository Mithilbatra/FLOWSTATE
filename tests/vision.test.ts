// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stand-in for Google's SDK: records the request and returns whatever the test queues.
const gemini = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: gemini.generateContent };
  },
  ApiError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

const { ApiError } = await import('@google/genai');
const { readFrame, VisionUnavailableError } = await import('../backend/vision');
const { loadConfig } = await import('../backend/config');

const read = {
  football_visible: true, is_replay: false, competition: null, home_team: 'MCI', away_team: 'ARS',
  home_score: 1, away_score: 0, clock: '23:41', period: 'first_half', home_color: '#6cabdd', away_color: '#ef4444',
  possession: 'home', attacking_team: 'home', danger: 'final_third', event: 'none', event_team: 'unknown',
  event_player: null, caption: 'City camped in the Arsenal half.',
  stats: { possession_home: null, possession_away: null, shots_home: null, shots_away: null, shots_on_target_home: null, shots_on_target_away: null, corners_home: null, corners_away: null, fouls_home: null, fouls_away: null, xg_home: null, xg_away: null },
};

beforeEach(() => vi.stubEnv('GEMINI_API_KEY', 'test-key'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  gemini.generateContent.mockReset();
});

describe('readFrame with a gemini model', () => {
  it('sends the JPEG with the JSON schema and returns the validated read', async () => {
    gemini.generateContent.mockResolvedValue({ text: JSON.stringify(read) });
    await expect(readFrame('AAAA', 'gemini-3.8-flash')).resolves.toEqual(read);
    const req = gemini.generateContent.mock.calls[0][0];
    expect(req.model).toBe('gemini-3.8-flash');
    expect(req.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
    expect(req.config.responseMimeType).toBe('application/json');
    expect(req.config.responseJsonSchema.$schema).toBeUndefined();
    expect(req.config.responseJsonSchema.required).toContain('home_score');
  });

  it('rejects output that does not match the schema', async () => {
    gemini.generateContent.mockResolvedValue({ text: JSON.stringify({ ...read, possession: 'both' }) });
    await expect(readFrame('AAAA', 'gemini-3.8-flash')).rejects.toThrow();
  });

  it('stops scanning when the key is missing or rejected', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(readFrame('AAAA', 'gemini-3.8-flash')).rejects.toBeInstanceOf(VisionUnavailableError);
    expect(gemini.generateContent).not.toHaveBeenCalled();

    vi.stubEnv('GEMINI_API_KEY', 'bad-key');
    gemini.generateContent.mockRejectedValue(new (ApiError as unknown as new (s: number, m: string) => Error)(400, 'API key not valid. Please pass a valid API key.'));
    await expect(readFrame('AAAA', 'gemini-3.8-flash')).rejects.toBeInstanceOf(VisionUnavailableError);
  });

  it('treats other API errors as a one-frame failure', async () => {
    gemini.generateContent.mockRejectedValue(new (ApiError as unknown as new (s: number, m: string) => Error)(429, 'Resource exhausted'));
    const err = await readFrame('AAAA', 'gemini-3.8-flash').catch((e) => e);
    expect(err).not.toBeInstanceOf(VisionUnavailableError);
  });
});

describe('readFrame with the default model (audit #11)', () => {
  it('stops scanning when the provider rejects the key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const body = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 401, headers: { 'content-type': 'application/json' } })));
    await expect(readFrame('AAAA', loadConfig({}).screenModel)).rejects.toBeInstanceOf(VisionUnavailableError);
  });
});
