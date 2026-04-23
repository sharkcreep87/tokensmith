import fs from "node:fs";
import path from "node:path";

/**
 * Walk up from `start` until a `.git` directory (or file — worktrees) is found
 * and return the repository root, or `null` if the path is outside a repo.
 */
export function findGitRoot(start: string): string | null {
  let dir = path.resolve(start);
  const { root } = path.parse(dir);
  while (true) {
    const marker = path.join(dir, ".git");
    if (fs.existsSync(marker)) return dir;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Derive a stable, filename-safe namespace from the git repository so that
 * different projects never pollute each other's memory store.
 *
 * - In a repo: returns the repo directory name (e.g. `tokensmith`).
 * - Outside a repo: returns `null` and the caller falls back to cwd basename.
 */
export function detectGitNamespace(cwd: string): string | null {
  const root = findGitRoot(cwd);
  if (!root) return null;
  const name = path.basename(root).toLowerCase();
  return name.replace(/[^a-z0-9._:-]/g, "-") || null;
}
