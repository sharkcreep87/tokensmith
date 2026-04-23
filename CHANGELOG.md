# Changelog

All notable changes to TokenSmith are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [1.0.0] — 2026-04-23

Initial release.

### Added

- **Persistent memory store** — SQLite-backed, namespaced, tagged, prioritised
  (`critical` / `normal` / `archive`), with keyword search and duplicate
  detection.
- **Skills library** — reusable prompt templates with safe `{{var}}`
  substitution, usage counters, and CLI invocation.
- **Smart context engine** — deterministic keyword + recency + priority
  ranking within a strict token budget; renders a grounded, provenance-tagged
  context bundle ready for system-message injection.
- **Session & project compression** — deterministic extractive summariser,
  pluggable via constructor injection for LLM-backed summarisation.
- **Token analytics** — per-kind, per-day usage aggregates with computed
  savings and configurable warning thresholds.
- **Claude Code plugin** — `.claude-plugin/plugin.json`,
  `marketplace.json`, five lifecycle hooks (`SessionStart`,
  `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SessionEnd`), five slash
  commands, and four starter skill templates.
- **Standalone CLI** — `tokensmith` and `ts-smith` binaries covering every
  feature, plus shell completion for bash / zsh / fish.
- **Export / import** — JSON bundles for cross-project migration.
- **Git-aware namespaces** — auto-detect the project namespace from the
  nearest `.git` directory so databases can be safely shared.

### Performance safeguards

- Per-hook internal budgets (`SessionStart` 150ms, `UserPromptSubmit` 250ms,
  `PreToolUse`/`PostToolUse` 100ms, `SessionEnd` 1000ms) enforced with
  `withTimeout()` — Claude Code never blocks on TokenSmith.
- Every hook fails open with a structured `{ ok: false, perf: {…} }`
  response; exceptions never bubble to the harness.
- `TOKENSMITH_DISABLED=1` (or `performance.disabled: true`) short-circuits
  before container bootstrap for sub-1ms no-op hooks.
- SQLite tuned with WAL, `NORMAL` sync, 20MB page cache, 64MB mmap, and
  `MEMORY` temp store.
- `perf: { elapsedMs, timedOut }` telemetry attached to every hook
  response.

### Anti-hallucination safeguards

- Confidence floor — non-critical memories need both a keyword overlap and a
  blended score ≥ `context.minInjectionScore` (default 0.12).
- Strict grounding mode (default) returns an empty string when the bundle is
  empty, so the plugin injects *nothing* rather than irrelevant context.
- Grounding preamble instructs Claude to cite by id, prefer live context on
  conflicts, distrust `archive` items, and never paraphrase verbatim
  content.
- Per-item provenance (id, priority, score, updatedAt) rendered inline.
- `critical`-priority memories always rendered inside fenced code blocks —
  never truncated, reformatted, or summarised.
- Summaries prefixed with a "lossy extract — verify before acting" banner.
- Compression fidelity guard refuses to commit a summary larger than the
  original payload.

### Security

- All SQL is parameterised (better-sqlite3 prepared statements).
- User-supplied keys and skill names restricted to `[A-Za-z0-9._:-]` by Zod.
- CLI file paths resolved with `safeResolveWithin` to block path traversal.
- No `eval`, `Function`, or dynamic code execution anywhere in the package.
- Skill templates are substitutional only — no expression evaluation.

### Tooling

- TypeScript strict mode, ESM-first build.
- 13 Vitest suites / 49 tests covering memory, skills, context, compression,
  analytics, config, plugin hooks, export, perf, grounding, and text utils.
- CI matrix on GitHub Actions: Node 20/22 × Linux/macOS/Windows.
- Release workflow uses npm trusted publishing (OIDC) — no `NPM_TOKEN`
  secret required, every tarball ships with a signed provenance statement.

[1.0.0]: https://github.com/sharkcreep87/tokensmith/releases/tag/v1.0.0
