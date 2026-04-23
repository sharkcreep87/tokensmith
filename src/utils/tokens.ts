import { encode, decode } from "gpt-tokenizer";
import type { TokenModel } from "../types/index.js";

/**
 * Token counter that is safe to call at high frequency.
 *
 * Under the hood we use `gpt-tokenizer` (pure JS) which ships BPE tables for
 * `cl100k_base` / `o200k_base`. These models are NOT identical to Anthropic's
 * tokenizer, but they produce counts within ~5% for English prose and code —
 * the right order of magnitude for savings analytics and budget enforcement.
 *
 * For exact production counts callers can override via `CustomTokenCounter`.
 */
export interface TokenCounter {
  count(text: string): number;
  truncateToBudget(text: string, budget: number): string;
  readonly model: TokenModel;
}

export class GptTokenCounter implements TokenCounter {
  public readonly model: TokenModel;

  public constructor(model: TokenModel = "o200k_base") {
    this.model = model;
  }

  public count(text: string): number {
    if (!text) return 0;
    try {
      return encode(text).length;
    } catch {
      // Extremely defensive — the tokenizer never actually throws on utf-8,
      // but if its WASM ever fails to load we fall back to a char heuristic.
      return Math.ceil(text.length / 4);
    }
  }

  public truncateToBudget(text: string, budget: number): string {
    if (budget <= 0 || !text) return "";
    const tokens = encode(text);
    if (tokens.length <= budget) return text;
    const sliced = tokens.slice(0, budget);
    return decode(sliced);
  }
}

export function createTokenCounter(model: TokenModel): TokenCounter {
  return new GptTokenCounter(model);
}
