# TokenSmith

> Save Claude token usage with persistent memory, reusable skills, smart
> context injection, automatic session compression, and rich token analytics.

TokenSmith is a Claude Code plugin *and* a standalone CLI. It remembers the
important context across sessions so Claude never has to re-read your project
to answer the same question twice, compresses long conversations into concise
summaries, and reports exactly how many tokens it saved you.

![TokenSmith screenshot placeholder](./docs/screenshot-main.png)

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
npm install -g tokensmith

# Verify
tokensmith --version
tokensmith init          # creates token-smith.config.json + .tokensmith/tokensmith.db
```

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

![Memory table placeholder](./docs/screenshot-memory.png)

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

![Analytics screenshot placeholder](./docs/screenshot-analytics.png)

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
