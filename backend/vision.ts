import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ApiError as GeminiApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const count = z.number().nullable();

/** What Claude reads from one broadcast frame. Everything not visible in the frame is null / 'unclear'. */
const ScreenReadSchema = z.object({
  football_visible: z.boolean(),
  is_replay: z.boolean(),
  competition: z.string().nullable(),
  home_team: z.string().nullable(),
  away_team: z.string().nullable(),
  home_score: z.number().int().nullable(),
  away_score: z.number().int().nullable(),
  clock: z.string().nullable(),
  period: z.enum(['first_half', 'half_time', 'second_half', 'extra_time', 'full_time', 'unknown']),
  home_color: z.string().nullable(),
  away_color: z.string().nullable(),
  possession: z.enum(['home', 'away', 'unclear']),
  attacking_team: z.enum(['home', 'away', 'none']),
  danger: z.enum(['none', 'build_up', 'final_third', 'chance']),
  event: z.enum(['none', 'goal', 'yellow_card', 'red_card', 'substitution', 'corner', 'offside']),
  event_team: z.enum(['home', 'away', 'unknown']),
  event_player: z.string().nullable(),
  stats: z.object({
    possession_home: count, possession_away: count,
    shots_home: count, shots_away: count,
    shots_on_target_home: count, shots_on_target_away: count,
    corners_home: count, corners_away: count,
    fouls_home: count, fouls_away: count,
    xg_home: count, xg_away: count,
  }),
  caption: z.string(),
});

export type ScreenRead = z.infer<typeof ScreenReadSchema>;

/** Thrown when the API key is missing or rejected; scanning cannot work until the user fixes it. */
export class VisionUnavailableError extends Error {}

const SYSTEM = `You read single frames from a football (soccer) broadcast for a live stats overlay.
Report only what is visible in this frame. Never guess and never use outside knowledge about the match.

- Scoreboard: the score graphic, usually in a top corner. The team shown first (left) is home.
  Copy team names or abbreviations exactly as shown. Copy the clock as shown, e.g. "67:12" or "45+2".
- home_color / away_color: the team colour swatches in the score graphic, as hex like "#6cabdd".
- possession: the team in control of the ball in this frame, matched by kit colour; "unclear" for close-ups, crowd shots or graphics.
- attacking_team and danger: which team is going forward, and how dangerous it is right now
  (build_up = own half, final_third = near the box, chance = a shot or a clear chance in this frame).
- is_replay: true for replays (replay logo, slow motion, repeated angle), adverts, studio and highlight packages.
- event: only when the frame clearly shows it (a GOAL graphic or celebration, a card being shown, a substitution graphic, a corner being taken, an offside flag graphic).
- stats: fill only from an on-screen statistics graphic; otherwise null.
- caption: one sharp sentence (max 20 words) on what is happening, like a top analyst. Only name players whose names are on screen.
If no football match is visible, set football_visible to false and leave the rest null / "unclear" / "none".`;

let client: Anthropic | undefined;
let gemini: GoogleGenAI | undefined;

/** Reads one frame with Claude, or with Gemini when the model name starts with "gemini". */
export function readFrame(jpegBase64: string, model: string): Promise<ScreenRead> {
  return model.startsWith('gemini') ? readWithGemini(jpegBase64, model) : readWithClaude(jpegBase64, model);
}

// Gemini takes plain JSON Schema; it accepts every keyword zod emits here except the $schema header.
const { $schema: _draft, ...geminiSchema } = z.toJSONSchema(ScreenReadSchema);

async function readWithGemini(jpegBase64: string, model: string): Promise<ScreenRead> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new VisionUnavailableError('No Gemini key. Set GEMINI_API_KEY in .env and restart the server.');
  let text: string | undefined;
  try {
    gemini ??= new GoogleGenAI({ apiKey });
    const response = await gemini.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } }, { text: 'Read this frame.' }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: geminiSchema,
        abortSignal: AbortSignal.timeout(30_000),
      },
    });
    text = response.text;
  } catch (err) {
    // Gemini answers a bad key with 400 "API key not valid", so the status alone is not enough.
    if (err instanceof GeminiApiError && (err.status === 401 || err.status === 403 || /api key/i.test(err.message))) {
      throw new VisionUnavailableError('Gemini rejected the API key. Check GEMINI_API_KEY.');
    }
    throw err;
  }
  if (!text) throw new Error('Frame not analysed (empty Gemini response)');
  // The schema is enforced by Gemini, but this is still a trust boundary: validate before use.
  return ScreenReadSchema.parse(JSON.parse(text));
}

async function readWithClaude(jpegBase64: string, model: string): Promise<ScreenRead> {
  let response;
  try {
    client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 });
    response = await client.beta.messages.parse({
      model,
      max_tokens: 4000,
      // Server-side refusal fallback; Haiku has none, so it gets no fallback parameter.
      ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
      output_config: { effort: 'low', format: betaZodOutputFormat(ScreenReadSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: 'Read this frame.' },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new VisionUnavailableError('Claude rejected the API key. Check ANTHROPIC_API_KEY.');
    }
    // With no key and no `ant auth login` profile the SDK throws a plain Error, not a typed one.
    if (!(err instanceof Anthropic.APIError) && /authentication method/i.test((err as Error).message)) {
      throw new VisionUnavailableError('No Claude credentials. Set ANTHROPIC_API_KEY in .env and restart the server.');
    }
    throw err;
  }
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error(`Frame not analysed (${response.stop_reason ?? 'no output'})`);
  }
  return response.parsed_output;
}
