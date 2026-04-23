<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/logo-dark.svg">
    <img src="./docs/logo.svg" alt="TokenSmith" width="520">
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@sharkcreep87/tokensmith"><img alt="npm" src="https://img.shields.io/npm/v/%40sharkcreep87%2Ftokensmith?color=0891B2&label=npm"></a>
  <a href="https://github.com/sharkcreep87/tokensmith/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/sharkcreep87/tokensmith/ci.yml?branch=main&label=CI"></a>
  <a href="./LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-0F172A"></a>
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%3E%3D20-22D3EE">
</p>

# TokenSmith

> Save Claude token usage with persistent memory, reusable skills, smart
> context injection, automatic session compression, and rich token analytics.

TokenSmith is a Claude Code plugin *and* a standalone CLI. It remembers the
important context across sessions so Claude never has to re-read your project
to answer the same question twice, compresses long conversations into concise
summaries, and reports exactly how many tokens it saved you.

```text
$ tokensmith --help
Usage: tokensmith [options] [command]

TokenSmith — persistent memory, reusable skills, and smart context for Claude Code.

Options:
  -v, --version        Show version
  --db <path>          override database path
  --namespace <name>   override namespace
  --no-color           disable color output
  --log-level <level>  silent | error | warn | info | debug
  -h, --help           display help for command

Commands:
  init                 Create a token-smith.config.json and .tokensmith DB
  memory               Persistent, namespaced memories saved to SQLite
  skill                Reusable prompt templates ('skills')
  context <query...>   Build a compressed, relevance-ranked context bundle
  compress             Compress long session/project history into summaries
  tokens               Token usage analytics and reports
  session              Inspect and record Claude Code session messages
  plugin               Claude Code plugin hooks (machine-invoked)
  completion <shell>   Print shell completion script (bash | zsh | fish)
```

---

## Features

| Capability | What it does | Why it saves tokens |
|---|---|---|
| **Persistent memory** | Tagged, prioritised key/value store backed by SQLite. | Long-term facts never need to be re-described each turn. |
| **Skill library** | Reusable, templated prompts (`debug-laravel`, `build-rest-api`, …). | One short invocation replaces a long, bespoke prompt. |
| **Smart context engine** | Ranks stored memories, skills, and summaries by keyword + recency + priority. | Only the *relevant* context is injected, inside a strict token budget. |
| **Auto compression** | Turns 15k-token sessions into ~800-token summaries. | Runs the conversation window back to a small, stable size. |
| **Token analytics** | Per-day, per-kind tracking of raw vs. effective tokens. | You can prove the savings. |
| **Plugin + CLI** | Ships as a Claude Code plugin and a `tokensmith` binary. | Works the same way whether you're inside or outside Claude Code. |

---

## Installation

```bash
# As an npm dependency (library + CLI)
npm install -g @sharkcreep87/tokensmith

# Verify
tokensmith --version
tokensmith init          # creates token-smith.config.json + .tokensmith/tokensmith.db
```

> The npm package is scoped (`@sharkcreep87/tokensmith`), but the installed
> binary is still called `tokensmith` (plus the `ts-smith` alias). You never
> have to type the scope after install.

### Installing as a Claude Code plugin

```bash
# From inside Claude Code
/plugin install tokensmith
```

Or, if you're developing locally, register this repo as a marketplace:

```bash
/plugin marketplace add /path/to/tokensmith
/plugin install tokensmith@tokensmith-marketplace
```

Once installed, slash commands become available inside Claude Code:

- `/memory save <key> <content>`
- `/memory get <key>`
- `/skill run <name> var=value`
- `/context <query>`
- `/compress session <sessionId>`
- `/tokens stats`

and the hooks in [`hooks/hooks.json`](./hooks/hooks.json) automatically inject
relevant context and auto-compress long sessions.

---

## Usage

### Memories

```bash
tokensmith memory save api-base "Use https://api.example.com/v2" -t api -t urls -p critical
tokensmith memory list
tokensmith memory get  api-base
tokensmith memory delete api-base
tokensmith memory clean              # removes archived memories
tokensmith memory clean --all        # wipes the namespace
```

```text
$ tokensmith memory list
╭──────────────┬──────────┬────────┬───────────┬─────────────────────╮
│ key          │ priority │ tokens │ tags      │ updated             │
├──────────────┼──────────┼────────┼───────────┼─────────────────────┤
│ deploy-rules │ critical │ 4      │ policy    │ 2026-04-23 16:54:04 │
├──────────────┼──────────┼────────┼───────────┼─────────────────────┤
│ payments     │ normal   │ 8      │ payments  │ 2026-04-23 16:54:04 │
├──────────────┼──────────┼────────┼───────────┼─────────────────────┤
│ api-base     │ critical │ 10     │ api, urls │ 2026-04-23 16:54:04 │
╰──────────────┴──────────┴────────┴───────────┴─────────────────────╯
```

### Skills

```bash
tokensmith skill add debug-laravel --file ./skills/debug-laravel.md -d "Laravel debugging"
tokensmith skill run debug-laravel version=11 php=8.3 env=prod symptom="500 on /orders"
tokensmith skill list
tokensmith skill delete debug-laravel
```

### Smart context

```bash
tokensmith context "payment integration"
# ✔ Context bundle
# 🧠 Relevant context loaded (3 items, 820 tokens)
# ⚡ 12.4k tokens avoided (94%)
```

Pipe into anything:

```bash
tokensmith context "payment" --json | jq .renderedText
```

### Compression

```bash
tokensmith compress session s-2026-04-23-01
tokensmith compress project
```

Before: **15,000 tokens** · After: **800 tokens** · ✅ summary stored in the DB
and surfaced automatically by the context engine.

### Token analytics

```bash
tokensmith tokens stats
tokensmith tokens report          # last 14 days
tokensmith tokens recent --limit 50
```

```text
$ tokensmith tokens stats

Token stats — my-project
────────────────────────
Overall: raw 44 → effective 22 (50.0% reduction)
ℹ 4 events · 0 sessions · model claude-sonnet-4-6
╭───────────────┬─────┬───────────┬───────┬───────────┬────────╮
│ kind          │ raw │ effective │ saved │ reduction │ events │
├───────────────┼─────┼───────────┼───────┼───────────┼────────┤
│ context_build │ 22  │ 22        │ 0     │ 0.0%      │ 1      │
├───────────────┼─────┼───────────┼───────┼───────────┼────────┤
│ memory_save   │ 22  │ 0         │ 22    │ 100.0%    │ 3      │
╰───────────────┴─────┴───────────┴───────┴───────────┴────────╯
```

### Export / import

```bash
tokensmith memory export ./backup.json
tokensmith memory import ./backup.json --overwrite
```

---

## Commands

```
tokensmith init                          # scaffold config + DB

tokensmith memory save <key> [content]   # save / update memory
tokensmith memory get <key>
tokensmith memory list [-q keyword]
tokensmith memory delete <key>
tokensmith memory clean [--all]
tokensmith memory export <path>
tokensmith memory import <path> [--overwrite]

tokensmith skill add <name> --file | --template | --stdin
tokensmith skill run <name> key=value ...
tokensmith skill list
tokensmith skill delete <name>

tokensmith context <query...> [--budget N] [--no-memories] [--no-skills] [--no-summaries] [--json]

tokensmith compress session <sessionId> [--ratio 0.2] [--keep 4]
tokensmith compress project [--ratio 0.2]

tokensmith tokens stats [--json]
tokensmith tokens report
tokensmith tokens recent [--limit N]

tokensmith session append <sessionId> [-r role] [-m text]
tokensmith session list

tokensmith plugin hook <event>     # invoked by Claude Code hooks
tokensmith plugin status

tokensmith completion bash | zsh | fish
```

---

## How token savings work

TokenSmith tracks two quantities per event:

- **raw tokens** — what you *would have* paid for if Claude had to process the
  full underlying information (e.g. the original conversation, a full memory
  set, or a whole skill template).
- **effective tokens** — what actually gets sent to the model (the ranked +
  trimmed context bundle, or the compressed summary).

`saved = raw − effective`, `reductionPct = saved / raw`.

Every `memory save`, `memory load`, `skill run`, `context build`, `compress`,
and `injection` event is recorded in the `usage_events` table so you can audit
exactly where the savings came from.

Token counting uses `gpt-tokenizer` (pure JS, no native deps). Counts are
approximate for Anthropic models (±5% for typical English/code) but stable
across runs, which is what matters for budgeting and trend analytics.

---

## Configuration

Create a `token-smith.config.json` at the project root (or copy the one in
[`token-smith.config.example.json`](./token-smith.config.example.json)):

```json
{
  "dbPath": ".tokensmith/tokensmith.db",
  "namespace": "auto",
  "tokenModel": "o200k_base",
  "preferredModel": "claude-sonnet-4-6",
  "compression": { "threshold": 8000, "targetRatio": 0.2, "keepLastMessages": 4 },
  "context":     { "maxTokens": 4000, "keywordWeight": 0.6, "recencyWeight": 0.25, "priorityWeight": 0.15 },
  "analytics":   { "warningTokens": 80000 },
  "autoSaveMemories": false,
  "logLevel": "info"
}
```

All keys can also be overridden with env vars — see [`.env.example`](./.env.example).

### Per-project namespaces

By default the namespace is auto-detected from the git repo name
(`.git` directory). Every memory, skill, summary and usage event is scoped to
that namespace, so multiple projects can share a single database safely.

---

## Development

```bash
git clone https://github.com/sharkcreep87/tokensmith.git
cd tokensmith
npm install
npm run dev -- memory list          # run the CLI through tsx
npm run build                       # emit dist/
npm test                            # run Vitest
npm run test:coverage               # + v8 coverage report
```

### Releasing

Releases are cut automatically by GitHub Actions on any `v*` tag:

```bash
npm version patch --message "Release v%s"  # bumps + commits + tags
git push --follow-tags                      # pushes tag → workflow runs → npm publish
```

The [`release.yml`](./.github/workflows/release.yml) workflow uses npm's
trusted-publishing (OIDC) so no `NPM_TOKEN` secret is required and every
tarball gets a signed provenance statement on npmjs.com.

### Project layout

```
src/
  cli/            # CLI entrypoint + TTY helpers
  commands/       # commander subcommands (memory, skill, context, …)
  services/       # domain logic (pure, injectable)
  repositories/   # SQLite persistence (one per aggregate)
  db/             # schema + connection bootstrap
  plugin/         # Claude Code hook handlers
  utils/          # logger, errors, tokens, text, git, …
  types/          # shared domain types + Zod schemas
  config/         # cosmiconfig + env var resolution
  tests/          # vitest specs
.claude-plugin/   # plugin manifest + marketplace manifest
commands/         # /slash command docs for Claude Code
hooks/            # hook wiring for Claude Code
skills/           # ready-to-use skill templates
```

### Architecture highlights

- **Repository + service + command** — each layer only knows about the one
  below it, so swapping storage or rendering stays local.
- **Dependency injection** via a tiny composition root in `src/container.ts`
  (no decorators, no reflect-metadata).
- **Zod at every boundary** — CLI args, config files, and plugin payloads are
  all validated before they reach the service layer.
- **SQL via prepared statements** — prevents injection by construction.
- **Deterministic extractive summariser** by default; pluggable LLM-backed
  summariser via `CompressionService`'s constructor.

---

## Performance guarantees

TokenSmith runs inside the critical path of every Claude Code turn, so its
hooks are engineered to be effectively invisible to the user:

| Hook | Internal budget | Outer Claude Code timeout | Fail-open? |
|---|---|---|---|
| `SessionStart` | **150 ms** | 2000 ms | ✅ empty response |
| `UserPromptSubmit` | **250 ms** | 3000 ms | ✅ empty response, no injection |
| `PreToolUse` | **100 ms** | 1500 ms | ✅ empty response |
| `PostToolUse` | **100 ms** | 1500 ms | ✅ empty response |
| `SessionEnd` | **1000 ms** | 5000 ms | ✅ empty response |

What this means in practice:

- **Hard deadlines.** Every hook is wrapped in `withTimeout()`. If the work
  isn't finished within the internal budget, TokenSmith returns a valid empty
  response with `perf.timedOut: true` and Claude Code proceeds normally. No
  turn is ever blocked waiting for TokenSmith.
- **Never throws.** Every hook path catches exceptions and returns a
  structured `{ ok: false }` JSON response. Claude Code never sees a
  non-zero exit code or stack trace from us.
- **Lazy container.** The SQLite DB, tokenizer, and config are opened lazily
  when the first command that needs them runs; irrelevant hooks stay close
  to zero-cost.
- **Tuned SQLite.** WAL journalling, `NORMAL` synchronous mode, a 20 MB page
  cache, a 64 MB mmap window and `MEMORY` temp store keep every query under
  a few milliseconds for the sub-megabyte stores TokenSmith produces.
- **Global kill switch.** Set `TOKENSMITH_DISABLED=1` (env var) or
  `performance.disabled: true` (config) and every hook returns in under
  1 ms with zero side effects. Nothing else changes.
- **Telemetry on every response.** Each hook attaches
  `perf: { elapsedMs, timedOut }` so the operator can alert on regressions.

Measured on a 2026 laptop with ~20 memories in the store:

```
run=1 wall=211ms internal=7.3ms  injections=1 contextTokens=417
run=2 wall=228ms internal=8.2ms  injections=1 contextTokens=417
run=3 wall=198ms internal=8.8ms  injections=1 contextTokens=417
```

Most of the wall time is Node startup (shared with every other plugin hook);
TokenSmith's own work is **single-digit milliseconds** per turn.

---

## Anti-hallucination guarantees

Injecting retrieved context into a prompt is a two-sided trade: it gives the
model authoritative-looking text, which means bad retrievals can *cause*
hallucinations. TokenSmith mitigates that risk with several defence layers,
all on by default:

1. **Confidence floor.** Non-critical memories need at least one keyword
   overlap with the user's query AND a blended score ≥ `minInjectionScore`
   (0.12 by default) to be eligible. Weak matches are dropped, not "mostly
   shown" — there is no partial credit.
2. **Strict grounding mode.** When the bundle is empty, the plugin injects
   **nothing**. Silence is always preferred to irrelevant context.
3. **Grounding preamble.** Every non-empty bundle starts with an explicit
   system message that tells Claude:
   - to cite items by id rather than paraphrase them,
   - to prefer live conversation over stored memory on conflicts,
   - that lower-priority items may be stale,
   - that summaries are lossy and must be verified before action.
4. **Provenance on every item.** Each memory/skill/summary carries its id,
   priority, score, and last-updated timestamp — so Claude can cite
   (`memory:abc123`) instead of inventing.
5. **Verbatim critical memories.** Items with `priority: critical` are
   rendered inside fenced code blocks. They are never truncated,
   reformatted, or summarised by TokenSmith, and the grounding header
   instructs Claude not to paraphrase them either.
6. **Labelled summaries.** Every compressed summary is prefixed with
   `[COMPRESSED SUMMARY — lossy extract of prior conversation. Verify before
   acting.]` so the model treats it as auxiliary, not authoritative.
7. **Fidelity guard.** If compression would produce a "summary" larger than
   the original, we refuse to commit it — preventing paraphrased bloat from
   masquerading as source material.
8. **No LLM summariser by default.** The default summariser is a
   deterministic extractive ranker over the original sentences; it cannot
   invent content, only drop it. An LLM-backed summariser can be swapped in
   via `new CompressionService(repos, tokens, config, customFn)` if you
   explicitly want that trade-off.
9. **Per-namespace isolation.** Memories are scoped to the current git repo
   by default, so a memory from one project can never leak into another.

You can tune or disable any of these in `token-smith.config.json`:

```json
{
  "context":   { "minInjectionScore": 0.12 },
  "grounding": {
    "mode": "strict",           // "strict" | "normal" | "off"
    "verbatimCritical": true,
    "includeHeader": true,
    "citeSources": true
  }
}
```

Setting `grounding.mode: "off"` disables all context injection entirely —
useful when debugging or when you want Claude to rely solely on live
conversation.

---

## Security

- All SQL is parameterised (`better-sqlite3` prepared statements).
- User-supplied identifiers are restricted to `[A-Za-z0-9._:-]` by Zod.
- File paths supplied at the CLI are resolved with `safeResolveWithin` to
  block path traversal.
- No `eval`, `Function`, or other dynamic code execution is used anywhere in
  the package.
- Skill templates are purely substitutional — `{{var}}` placeholders only, no
  expressions.

---

## License

MIT © TokenSmith Contributors
