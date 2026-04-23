---
name: fix-typescript-errors
description: Resolve a batch of TypeScript compile errors minimally.
---

# fix-typescript-errors

TypeScript output:

```
{{output}}
```

Rules:

- Fix errors with the smallest, most targeted edits.
- Prefer type-narrowing over casts.
- Never silence with `// @ts-ignore` unless you also add a TODO explaining why.
- After applying edits, re-run `tsc --noEmit` and report the remaining errors.
