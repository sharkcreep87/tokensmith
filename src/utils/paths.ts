import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "./errors.js";

/**
 * Resolve a user-supplied path relative to a trusted root, refusing anything
 * that escapes (`..`, absolute paths pointing outside, symlinks resolving
 * elsewhere). Called whenever we accept a path from CLI args or plugin
 * invocation.
 */
export function safeResolveWithin(root: string, target: string): string {
  const absRoot = fs.realpathSync.native
    ? fs.realpathSync.native(path.resolve(root))
    : fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(absRoot, target);
  const rel = path.relative(absRoot, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ConfigError(`Path escapes project root: ${target}`);
  }
  return candidate;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
