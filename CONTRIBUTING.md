# Contributing: team workflow

## 1. Pick an issue
- Open the [issues](../../issues) in the **Demo – Nov 12** milestone. Prefer `priority:must`.
- Pick an unassigned issue in your lane (`backend`, `frontend`, `qa`, `docs`) and **assign it to yourself**
  before you start. Check its *Depends on* section first.
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
- **No AI attribution** anywhere: no `Co-Authored-By:` trailers for AI tools, no "Generated with …"
  lines in commits, PRs, issues or code comments. AI tools must never show up as repository contributors.
- Never paste secrets into prompts.
