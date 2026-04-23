import { describe, expect, it } from "vitest";
import {
  keywordScore,
  extractiveSummary,
  renderTemplate,
  tokenizeWords,
  splitSentences
} from "../utils/text.js";

describe("utils/text", () => {
  it("tokenizeWords removes stop words and punctuation", () => {
    const tokens = tokenizeWords("The quick brown fox, jumps over the lazy dog!");
    expect(tokens).not.toContain("the");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
  });

  it("keywordScore scales with overlap", () => {
    const high = keywordScore("payment api", "payment api secret keys");
    const low = keywordScore("payment api", "unrelated narrative about cats");
    expect(high).toBeGreaterThan(low);
  });

  it("renderTemplate only replaces provided variables", () => {
    const out = renderTemplate("Hi {{name}}, {{age}} yrs", { name: "Ada" });
    expect(out).toBe("Hi Ada, {{age}} yrs");
  });

  it("extractiveSummary trims long text", () => {
    const text = Array.from({ length: 12 })
      .map((_, i) => `Sentence ${i} contains important content about payments.`)
      .join(" ");
    const summary = extractiveSummary(text, 3);
    expect(splitSentences(summary).length).toBeLessThanOrEqual(3);
  });
});
