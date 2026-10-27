# Spec: Stop committing `frontend/dist` (PR hygiene)

**Status:** Deferred — address in a dedicated follow-up PR  
**Origin:** Review of PR #16 (`improve_inherited_visualizations`), comment #15  
**Related paths:** `frontend/dist/**`, Vite build output, release/`sysmlviewer.sh` packaging

---

## Problem

PR #16 (and earlier history on `main`) includes large churn under `frontend/dist/` — hashed JS/CSS bundles and `index.html` that Vite regenerates on every `npm run build`.

Consequences today:

1. **Review noise** — thousands of added/removed lines in `dist` obscure real source changes (bindings, layout, settings).
2. **`git blame` / history quality** — blame on UI behavior lands on rebuild commits instead of the React/CSS change that mattered.
3. **Merge conflicts** — parallel feature branches each rebuild `dist` and conflict on asset hashes even when source conflicts are trivial.
4. **Unclear source of truth** — reviewers cannot tell whether `dist` was intentionally shipped or left over from a local build.

The runtime product *can* serve `frontend/dist` in production mode (`sysmlviewer.sh start` without `--dev`), so removing tracked `dist` is not free: release and CI must still produce those assets.

---

## Proposed action (follow-up PR)

### Goals

- Keep **source** (`frontend/src/**`, configs) as the only layout/UI source of truth in git.
- Ensure **production** start path still has a built `dist` (CI artifact, release script, or documented local build step).
- Avoid breaking existing users who clone and run `./sysmlviewer.sh start` expecting a prebuilt UI.

### Recommended steps

1. **Inventory**
   - Confirm who consumes tracked `dist` (README, `sysmlviewer.sh`, Docker, GitHub releases).
   - Note whether CI already runs `npm run build` before publish.

2. **`.gitignore`**
   - Add `frontend/dist/` (and any sibling build dirs) so new builds are not re-committed.
   - Keep ignoring Vite caches (`frontend/node_modules`, etc.) as today.

3. **Remove from git index (one commit)**
   - `git rm -r --cached frontend/dist` (or equivalent) so history retains past blobs but the tip no longer tracks them.
   - Do **not** mix this with feature work; single hygiene PR.

4. **Build before prod start**
   - Update `sysmlviewer.sh start` (and Windows `.bat` if needed) to:
     - Prefer existing `frontend/dist` if present and fresh enough, **or**
     - Run `npm run build` (or `--build` flag) when `dist` is missing.
   - Document in README: `--dev` for HMR; prod path builds or expects CI artifacts.

5. **CI**
   - Ensure the pipeline that ships releases builds `frontend` and attaches `dist` as an artifact or builds inside the release job.
   - Optional: fail PR CI if someone re-adds `frontend/dist/**` (path guard).

6. **Examples / session JSON**
   - Keep example `state.json` / view layout churn out of the dist PR; if needed, separate “example layout refresh” commit.

### Out of scope for that PR

- Changing Vite hashing strategy or CDN hosting.
- Reworking how Arcadia vs SysML view JSON is stored.
- Feature work from PR #16 (already merged or open separately).

---

## Expected improvement

| Area | Before | After |
|------|--------|--------|
| PR diffs | ~17k lines of bundle noise | Source-only diffs; review focuses on behavior |
| Merge conflicts | Frequent hash collisions in `dist` | Conflicts limited to real source |
| Blame | Points at rebuild commits | Points at TS/CSS authors |
| Clone + run | Works if `dist` committed | Works if script/CI builds `dist`; documented |
| Repo size growth | Every build rewrites large binaries | Growth driven by source + occasional assets |

---

## Acceptance criteria

- [ ] `frontend/dist/` is gitignored and absent from `HEAD` tree.
- [ ] `./sysmlviewer.sh start` (prod) still serves a working UI without manual undocumented steps.
- [ ] README documents build vs `--dev`.
- [ ] CI (or release script) produces `dist` for packaged releases.
- [ ] No feature/behavior change required beyond packaging; smoke-test open GeneralView after a clean clone + start.

---

## Risks / mitigations

| Risk | Mitigation |
|------|------------|
| Users pull and prod start fails (no `dist`) | Auto-build in start script or clear error + `npm run build` hint |
| CI time increases | Cache `frontend/node_modules` / Vite cache in CI |
| Someone force-adds `dist` again | Optional CI check forbidding the path |

---

## Suggested PR title

`chore: stop tracking frontend/dist; build on prod start / CI`
