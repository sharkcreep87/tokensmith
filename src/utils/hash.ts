import { createHash } from "node:crypto";

/**
 * Deterministic content hash — used for duplicate memory detection and for
 * cache keys. SHA-256 is overkill for this scale but trivially cheap.
 */
export function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
