---
name: compress
description: Compress a long session or the whole project into a concise summary.
argument-hint: "session <sessionId> | project"
allowed-tools: Bash
---

# /compress

Invoke TokenSmith's compression pipeline.

```bash
tokensmith compress session <sessionId>   # summarise a single session
tokensmith compress project               # summarise every session in this namespace
```
