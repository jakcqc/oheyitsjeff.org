---
name: custom-instructions-random-files
description: Apply user-provided custom instructions at the start of a task and proactively inspect two random repository files for context. Use when the user asks to enforce custom instructions, wants extra repo context, or explicitly requests sampling random files.
---

# Custom Instructions + Two Random Files

Follow this workflow to consistently apply custom instructions and gather lightweight repo context.

## Workflow

1. Ask the user for their custom instructions if they have not provided them yet.
2. Restate the instructions briefly and commit to following them for the rest of the task.
3. Sample two random files from the repo:

```bash
.codex/skills/custom-instructions-random-files/scripts/pick_two_random_files.py
```

4. Open both files and extract only the most relevant signals (patterns, conventions, utilities, constraints).
5. Continue the task using both the custom instructions and any learned repo conventions.

## Notes

- Treat the two random files as context hints, not requirements.
- Prefer `rg` for follow-up exploration once you discover relevant patterns.
- If the sampled files are obviously irrelevant (e.g., large generated assets), sample again.
