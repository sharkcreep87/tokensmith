---
name: skill
description: Manage reusable prompt templates ("skills"). Use `skill add`, `skill run`, `skill list`, or `skill delete`.
argument-hint: "<sub-command> [args…]"
allowed-tools: Bash
---

# /skill

Run the TokenSmith skill CLI.

```bash
tokensmith skill add <name> -d "desc" --template "..."
tokensmith skill run <name> var1=value var2=value
tokensmith skill list
tokensmith skill delete <name>
```

When the user runs `/skill run …`, execute the command and render the output
directly.
