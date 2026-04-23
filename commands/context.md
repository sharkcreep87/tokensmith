---
name: context
description: Build a compressed, relevance-ranked context bundle for a query and inject it into the conversation.
argument-hint: "<query>"
allowed-tools: Bash
---

# /context

Run `tokensmith context "$ARGUMENTS"` and include the resulting context block in
the reply so Claude has the most relevant memories, skills and summaries
available — without re-reading the whole project.
