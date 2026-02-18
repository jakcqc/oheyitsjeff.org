---
name: visual-app-pipeline
description: Batch-generate visual app folders from a JSON ideas list using helper/visualHelp.js and Voronoi/voronoi_visual.js as references.
---

# Visual App Pipeline (Codex Extension)

Use this skill to turn a list of idea objects into separate visual app folders in this repo.

## Inputs

- Primary source: `codex_pipeline/ideas.json`
- Template/context: `codex_pipeline/pipeline.json`

If the user pastes a list, normalize it into the `codex_pipeline/ideas.json` structure:

```json
{
  "schemaVersion": 1,
  "ideas": [
    {
      "title": "Idea title",
      "summary": "Short concept description",
      "slug": "FolderAndFileStem",
      "folder": "FolderAndFileStem",
      "visualId": "lowerCamelVisualId"
    }
  ]
}
```

## Workflow

1. Read `codex_pipeline/ideas.json`. If missing or invalid, ask for a JSON list and write it.
2. For each idea, run the same steps as a standalone job.
3. Treat each idea as a fresh run: do not reuse creative decisions between ideas.
4. Use these code references for style and structure:
   - `helper/visualHelp.js`
   - `Voronoi/voronoi_visual.js`
5. Create a new folder per idea (`idea.folder` or `idea.slug`) with:
   - `index.html`
   - `index.js`
   - `${idea.slug}_visual.js`
6. In the visual file: `registerVisual(...)` with params + `create({ mountEl }, state)`.
7. In `index.js`: call `runVisualApp({ visualId, mountEl: #vis, uiEl: #config })`.
8. In `index.html`: follow the Voronoi layout (`#infoBar`, `#config`, `#vis`) and add any required libs in `<head>`.
9. If a target folder already exists, stop and ask before overwriting.

## Fresh Context Rule

If the user insists on strict isolation per idea, stop after one idea and ask them to start a new Codex chat for the next item.

## Completion Checklist (per idea)

- New folder created with three files above
- Visual registers correctly and mounts to `#vis`
- UI controls appear in `#config`
