@AGENTS.md

## Environment

- Editor is **LazyVim** (Neovim). Give Neovim-style instructions for manual file edits (`nvim <file>`, `i` to insert, `Esc` then `:wq` to save).

Private working notes (collaboration preferences, project status, decisions) live in `docs/PROJECT-NOTES.md` — read that file too, it's intentionally gitignored and won't be here for outside readers.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
