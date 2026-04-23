---
name: memory
description: Persistent, namespaced memories saved to SQLite. Use `memory save`, `memory get`, `memory list`, `memory delete`, or `memory clean`.
argument-hint: "<sub-command> [args…]"
allowed-tools: Bash
---

# /memory

Invoke the TokenSmith memory sub-system. This is a thin shim over the
`tokensmith` CLI so Claude can read & write project memories without spending
tokens quoting file paths.

## Usage

```bash
tokensmith memory save <key> "<content>" -t tag1 -t tag2 -p critical
tokensmith memory get  <key>
tokensmith memory list
tokensmith memory delete <key>
tokensmith memory clean           # removes archived memories
tokensmith memory clean --all     # purges the namespace
```

Run the command for the user and surface the output verbatim.
