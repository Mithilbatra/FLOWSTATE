// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../backend/config';

const model = (env: NodeJS.ProcessEnv) => loadConfig(env).screenModel;

describe('screen model choice (audit #7)', () => {
  it('reads with Gemini when its key is the only one set, as in a copied .env.example', () => {
    expect(model({ SCREEN_MODEL: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: 'g' })).toBe('gemini-3.8-flash');
  });

  it('keeps the default model with no keys, or with both', () => {
    const fallback = model({});
    expect(fallback).not.toMatch(/^gemini/);
    expect(model({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toBe(fallback);
  });

  it('always uses SCREEN_MODEL when it is set', () => {
    expect(model({ SCREEN_MODEL: 'some-model', GEMINI_API_KEY: 'g' })).toBe('some-model');
  });
});
