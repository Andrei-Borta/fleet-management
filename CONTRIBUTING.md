# Contributing: team workflow

## 0. How we work (agile, one-week sprint)
- **Sprint 1 = Nov 8–12**, goal: a demo of the most valuable features. Board: [Fleet Management – Sprint 1](https://github.com/users/Andrei-Borta/projects/1)
- **User stories** (`story` label) describe value for a persona: *As a … I want … so that …*. Each story has
  **task sub-issues** (backend, frontend, QA). A story is done when all its tasks are merged and its acceptance criteria are demoed.
  **Enablers** (`enabler` label) are technical or process tasks with no story (setup, CI, demo video).
- **Points** on the board (1/2/3/5/8) are relative effort estimates.
- **Board flow:** Backlog → Todo → **In progress** (move your card when you start) → **In review** (PR open) → Done (merged).
- **Daily stand-up** in the team group: what I finished, what's next, what blocks me.
- **Sprint review** = the demo video. **Retrospective** after Nov 12: what went well, what didn't, what to change.

## 1. Pick an issue
- Open the [issues](../../issues) in the **Demo – Nov 12** milestone. Prefer `priority:must`.
- Pick an unassigned issue in your lane (`backend`, `frontend`, `qa`, `docs`) and **assign it to yourself**
  before you start, then move its card to *In progress* on the board. Check its *Depends on* section first.
- Aim for one or two issues in progress at a time. Comment on the issue if you're blocked.

## 2. Branch
Always branch from an up-to-date `main`:
```bash
git switch main && git pull
git switch -c feat/12-reservation-conflicts
```
Branch names: `<type>/<issue#>-<short-slug>`, where type is `feat`, `fix`, `docs`, `test`, `chore` or `refactor`.

## 3. Commit
[Conventional Commits](https://www.conventionalcommits.org): `feat(reservations): detect overlapping bookings`.
Small, focused commits. They are squashed on merge anyway, so the **PR title** is what matters most.

## 4. Pull request
- Push early and open a **draft PR** to make progress visible. Mark it *Ready for review* when it's done.
- PR title = Conventional Commit (it becomes the squash commit message).
- The PR body must contain `Closes #<issue>` and fill in the template checklist.
- At least **1 approval** is required. The project lead is requested automatically as reviewer (`.github/CODEOWNERS`). Ask for a reviewer from your lane; BE↔FE contract changes need one reviewer from each lane.
- All CI checks must be green: `backend`, `frontend`, `e2e`.
- Merge only with **Squash and merge**. The branch is deleted automatically afterwards.
- Keep your PR in sync with `main` (`git pull --rebase origin main` or "Update branch").

## 5. Definition of done
- [ ] Acceptance criteria of the issue are met
- [ ] **Backend:** every public function in `service.py` has pytest tests (happy path and error cases);
      coverage of service files ≥ 80%
- [ ] **Frontend:** every new page or user flow has a **Playwright** spec in `frontend/e2e/`
- [ ] **UI:** follows [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) (checklist §9)
- [ ] Lint and build pass locally; DB changes include an Alembic migration
- [ ] API changes are reflected in the FE models; docs are updated if behaviour or setup changed
- [ ] Reviewed and approved, CI green, squash-merged

## Using AI agents
AI agents (Claude Code, Codex, Copilot, …) are encouraged. Rules:
- Agents follow [AGENTS.md](AGENTS.md).
- **You** are the author and are responsible for the code. Read every line before you push.
- **No bot-authored PRs or commits.** Don't use cloud agents that open PRs or push commits under their own
  account (e.g. the GitHub Copilot coding agent, `copilot-swe-agent[bot]`). Run agents locally and commit
  and push under your own name. Bot-authored PRs are closed without review.
- **No AI attribution** anywhere: no `Co-Authored-By:` trailers for AI tools, no "Generated with …"
  lines in commits, PRs, issues or code comments. AI tools must never show up as repository contributors.
- Never paste secrets into prompts.
