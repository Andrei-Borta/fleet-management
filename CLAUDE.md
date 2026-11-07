# CLAUDE.md

Read and follow **[AGENTS.md](AGENTS.md)**. It is the single source of truth for this repo's rules,
commands and layout. Summary of the non-negotiables:

- Backend: every public `service.py` function has pytest tests (≥ 80% coverage on services).
- Frontend: every page or flow has a Playwright spec in `frontend/e2e/`.
- Run lint, build and tests (backend and frontend, plus e2e) before declaring a task done; CI checks all of them.
- Feature branch → PR with `Closes #N` → squash & merge. Never commit to `main`.
- **Never add `Co-Authored-By: Claude`, "Generated with Claude Code", or any other AI attribution** to
  commits, PRs, issues or code. Claude must never appear as a contributor.
- Frontend: follow **[docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md)**. Use tokens, `<app-page-header>`, `<app-status-badge>`, and no hard-coded colours.
- Stay inside the module or feature of the current issue.

Personal, uncommitted preferences go in `CLAUDE.local.md` (gitignored).
