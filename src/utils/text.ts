/**
 * Lightweight text utilities used by the context engine. Deliberately free of
 * heavyweight NLP deps — TokenSmith ships as a zero-native-ML package.
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "do", "for",
  "from", "has", "have", "he", "her", "him", "i", "in", "into", "is",
  "it", "its", "of", "on", "or", "our", "she", "that", "the", "their",
  "them", "then", "there", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "will", "with", "you",
  "your", "can", "could", "would", "should", "if", "else", "how"
]);

export function tokenizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s_.-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Jaccard-style keyword score between a query and a document. Cheap, stable,
 * and good enough for the "which memories look relevant?" heuristic.
 */
export function keywordScore(query: string, doc: string): number {
  const q = new Set(tokenizeWords(query));
  if (q.size === 0) return 0;
  const d = tokenizeWords(doc);
  if (d.length === 0) return 0;

  let matches = 0;
  const uniqueDoc = new Set(d);
  for (const w of q) {
    if (uniqueDoc.has(w)) matches += 1;
  }
  const union = new Set([...q, ...uniqueDoc]).size;
  return union === 0 ? 0 : matches / union;
}

/**
 * Extractive summariser used when no LLM is available. Ranks sentences by the
 * density of query-relevant, non-stop-word terms and keeps the top-N.
 */
export function extractiveSummary(text: string, maxSentences: number): string {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return text.trim();

  const wordFreq = new Map<string, number>();
  for (const w of tokenizeWords(text)) {
    wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }

  const scored = sentences.map((sentence, index) => {
    const words = tokenizeWords(sentence);
    const score = words.reduce((acc, w) => acc + (wordFreq.get(w) ?? 0), 0);
    return { sentence, index, score: score / Math.max(1, words.length) };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence.trim());
  return top.join(" ");
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function truncateToChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Safely render a Mustache-style `{{var}}` template without allowing arbitrary
 * code execution — we only interpolate explicitly provided variables.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key as string];
    return value === undefined ? match : value;
  });
}
