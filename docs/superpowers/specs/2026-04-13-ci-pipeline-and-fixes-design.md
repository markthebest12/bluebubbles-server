# BlueBubbles Server Fork: CI Pipeline & Initial Fixes

**Date:** 2026-04-13
**Status:** Approved
**Repo:** markthebest12/bluebubbles-server (fork of BlueBubblesApp/bluebubbles-server)

## Context

Forked the BlueBubbles server to fix bugs affecting the openclaw-infra gateway on canon (macOS 26 Tahoe). The upstream server has not been released since v1.9.9 (May 2025) and has no CI quality gates beyond a build-on-push workflow. This design establishes a production-grade CI pipeline and scopes the initial bug fixes.

### Decisions

- **Run from source** (`npm run start`) on canon — no signed DMG builds
- **Two-tier branching** — `main` + feature branches, squash merge, no staging gate
- **Upstream sync** — automated weekly detection, manual merge decision
- **Test new code only** — Vitest infrastructure for our fixes, no retroactive coverage of upstream code

## 1. Repository Setup

### Branch Strategy

- Rename `master` to `main`
- Default branch: `main`
- Feature branches: `fix/`, `feat/`, `chore/`, `ci/` prefixes
- Squash merge to `main`

### Branch Protection (main)

- Require PR (self-approval OK)
- Require `ci-complete` status check
- No force pushes
- No direct pushes

### Remotes

- `origin` — markthebest12/bluebubbles-server
- `upstream` — BlueBubblesApp/bluebubbles-server

### Starting Point

Fork based on `upstream/development` (ahead of v1.9.9 with unreleased fixes including stopTyping fix, LaunchAgents mkdir, attachment chunking).

### Conventional Commits

Enforced via `pr-title.yml`. Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `chore`, `ci`, `test`, `style`, `build`.

## 2. CI Pipeline

### ci.yml

**Triggers:** PRs to `main`, manual dispatch.
**Runner:** `ubuntu-latest` for all quality gate jobs.
**Node:** 20.x with npm cache via `actions/setup-node`.
**Install:** `npm install --ignore-scripts` — the server's `postinstall` runs `electron-rebuild` which compiles macOS-only native modules (`node-mac-contacts`, `node-mac-permissions`) and will fail on Ubuntu. CI only needs the source for linting, typechecking, and testing.
**All actions pinned to commit SHAs.**

#### Jobs (parallel)

| Job | Description | Blocking |
|-----|-------------|----------|
| `lint` | ESLint on `packages/server` and `packages/ui` (add `lint` script to UI package). Use `--max-warnings` with a counted baseline of existing warnings — tighten to 0 over time. | Yes |
| `typecheck` | `tsc --noEmit` on both packages. Note: server uses webpack+babel for builds, but `tsc --noEmit` is valid for type checking. May surface decorator-related false positives — suppress with targeted `// @ts-expect-error` or `skipLibCheck` if needed. | Yes |
| `test` | Vitest on server package, coverage report | Yes |
| `security-scan` | Trivy (filesystem + secrets, HIGH/CRITICAL) + Gitleaks (full history) | Yes |
| `dep-audit` | `npm audit --audit-level=high` | Yes |
| `ci-complete` | Aggregator — `needs: [lint, typecheck, test, security-scan, dep-audit]` | Required check |

#### Security Scan Details

**Trivy** — two passes:
- Filesystem scan: `vuln` scanner, severity `HIGH,CRITICAL`, `ignore-unfixed: true`
- Secret scan: `secret` scanner, exit code 1 on finding

**Gitleaks** — full git history scan (fetch-depth 0 for this job only), blocking. Use `--log-opts="--since=2026-04-13"` to avoid flagging pre-existing upstream history. If upstream secrets are found before our fork date, add to `.gitleaksignore` with documented justification.

**npm audit** — `--audit-level=high`, JSON output as artifact. Accepted CVEs documented with justification.

**Accepted risk:** Electron 25.9.8 is EOL (Dec 2023) with known Chromium/Node CVEs in the runtime. Upgrading Electron is out of scope for initial fixes (multi-major jump with breaking changes). Track as a separate issue.

### pr-title.yml

Validates PR titles match conventional commit format using `amannn/action-semantic-pull-request`.

## 3. Versioning & Release

### release.yml

**Trigger:** Push to `main` (skip if author is `uplift-bot`).
**Tool:** Uplift.

### .uplift.yml

- **Bump files:** root `package.json`, `packages/server/package.json`, `packages/ui/package.json`
- **Changelog includes:** `feat`, `fix`, `perf`, `refactor`
- **Changelog excludes:** merge commits, `chore`
- **Annotated tags:** true
- **Commit author:** `uplift-bot`

### Version Scheme

Standard semver. **Before first Uplift run, manually create a `v1.9.9` baseline tag** on the initial commit of `main` so Uplift has a correct starting point. First Uplift-managed release will be v1.9.10 or v1.10.0 depending on commit types. No build artifacts — tag and CHANGELOG only.

**Bump scope:** Only bump `packages/server/package.json` and root `package.json`. Skip `packages/ui/package.json` unless the UI is actually modified — avoids false version signals on server-only fixes.

## 4. Upstream Sync

### upstream-sync.yml

**Schedule:** Monday 6am PT (13:00 UTC), plus manual dispatch.

**Behavior:**
1. Fetch `upstream/master` and `upstream/development`
2. **Primary sync target:** `upstream/development` (our fork is based on this branch). Compare against `origin/main` for new commits.
3. **Secondary check:** `upstream/master` for tagged releases only (new version tags). This catches hotfixes that go straight to master without going through development.
4. If new upstream commits exist, open PR with:
   - Commit summary (last 20 messages)
   - Diff stat
   - Conflict detection (trial merge, reports conflicting files)
   - Which upstream branch the changes come from
5. Label: `upstream-sync`
6. No auto-merge — manual review and decision

## 5. Testing Infrastructure

### Framework

Vitest — native TypeScript, fast, v8 coverage provider.

### Config (packages/server/vitest.config.ts)

- Environment: `node`
- Coverage: `v8` provider, reports `text` + `json` + `html`
- Include: `src/**/*.test.ts`
- **Path aliases:** Use `vite-tsconfig-paths` plugin to resolve `@server`, `@windows`, `@trays` from tsconfig.json (Vitest does not read tsconfig paths natively)
- **Decorator support:** The server uses TypeORM with `emitDecoratorMetadata: true`. Vitest's default esbuild transform does not support decorator metadata. Use `@vitest/babel` transform or SWC plugin to handle this correctly.

### Convention

Co-located tests: `src/foo/bar.ts` gets `src/foo/bar.test.ts`.

### CI Enforcement

- Tests must pass (exit code 0)
- Coverage collected and reported, no global threshold
- Future: per-PR coverage diff gate on changed lines

### Scripts (packages/server/package.json)

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

## 6. Pre-commit Hooks

### Husky v9 + lint-staged

Upgrade from existing husky v4. **Migration steps:**
1. Remove `"husky"` and `"lint-staged"` keys from `packages/server/package.json` (v4 config)
2. Install `husky` v9 as a **root** devDependency (must be at git root, not inside a package)
3. Add `"prepare": "husky"` to root `package.json`
4. Create `.husky/pre-commit` and `.husky/commit-msg` shell scripts
5. Move lint-staged config to root `.lintstagedrc.js` (supports monorepo globs)

**pre-commit hook:**
- ESLint on staged `.ts`, `.tsx` files (both packages)
- Prettier on staged `.ts`, `.tsx`, `.json`, `.css`, `.md` files
- No `tsc --noEmit` in pre-commit — too slow for the full server package (5-15s cold). ESLint already runs type-aware linting via `parserOptions.project`. Full typecheck runs in CI.

**commit-msg hook:**
- Commitlint with `@commitlint/config-conventional`

## 7. Initial Fixes

Execution order: pipeline first (#1), verify baseline (#6), then fixes (#2-#5).

### Issue #1: CI Pipeline Setup (ci)

Set up all workflows, testing infrastructure, pre-commit hooks, branch protection. Foundation for all subsequent work.

### Issue #6: Verify Unreleased Development Fixes (chore)

Confirm inherited fixes from upstream `development`: attachment chunking, LaunchAgents mkdir, stopTyping fix, OID cert handling, content-length headers, VCF import API, sensitive config exclusion, dashboard version display, menu bar icon fixes. Document in CHANGELOG.

**Important:** Create manual `v1.9.9` baseline tag on the initial `main` commit before any Uplift runs. This gives Uplift a correct starting point. The first Uplift-managed version will be computed from commits after this tag.

**Verification scope:** "Verify" means confirming the commits are present in git history and the code exists. Behavioral verification (do they actually work on macOS 26?) requires running the server on canon — that's a separate manual activity, not part of the PR.

### Issue #2: Guard message.text null (fix)

**Problem:** Message processing crashes on undefined/null text (group chat, attachment-only messages). The `Message` entity has `text: string` typed without `| null` despite the DB column being `nullable: true`. With `strictNullChecks: false`, the compiler doesn't catch this.
**Fix:** Identify exact crash location(s) during implementation — search all `.text.trim()`, `.text.length`, and similar unguarded access patterns. Add null/optional chaining guards.
**Tests:** Undefined text, attachment-only message, normal text.

### Issue #3: fs.watch persistent flag (fix, cherry-pick)

**Problem:** File watcher dies on idle, server stops detecting messages.
**Fix:** Cherry-pick from arncore fork — `persistent: true` on `fs.watch`.
**Tests:** Verify watcher options.

### Issue #4: Webhook authorization header (feat, cherry-pick)

**Problem:** No auth on outbound webhooks, receivers can't verify origin.
**Fix:** Cherry-pick from saucesteals fork — add `Authorization` header. **Note:** The Webhook entity currently has no `secret`/`token` column. The cherry-pick may add one, which requires a TypeORM migration or a nullable column with default. Verify the cherry-pick's approach and add a migration if needed. Existing webhook rows must not break.
**Tests:** Header present when configured, absent when not (backwards compat).

### Issue #5: stopTyping endpoint (fix)

**Problem:** stopTyping calls startTyping (copy-paste error).
**Status:** Already fixed in our development base (upstream PR #768). Verify present, add test.
**Tests:** Endpoints wired to correct handlers.

## Review Notes

Issues identified during spec review (correctness + architecture) and addressed inline:

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | `npm install` postinstall fails on Ubuntu (native macOS modules) | High | Added `--ignore-scripts` to CI install step |
| 2 | Vitest esbuild can't handle `emitDecoratorMetadata` (TypeORM) | High | Spec now requires `@vitest/babel` or SWC plugin |
| 3 | Path aliases not natively resolved by Vitest | Medium | Spec now requires `vite-tsconfig-paths` plugin |
| 4 | Husky v9 must be at monorepo root, not package level | High | Added explicit migration steps |
| 5 | `tsc --noEmit` too slow for pre-commit hook | High | Removed from pre-commit, kept in CI only |
| 6 | UI package has no `lint` script | High | Noted in lint job description |
| 7 | `--max-warnings 0` fails on existing warnings | High | Changed to counted baseline, tighten over time |
| 8 | No Uplift tag baseline | High | Added manual `v1.9.9` tag step to Issue #6 |
| 9 | Upstream sync dual-branch ambiguity | Medium | Clarified primary (development) and secondary (master releases) |
| 10 | Gitleaks may flag pre-existing upstream secrets | Medium | Added date cutoff and allowlist strategy |
| 11 | Issue #2 needs exact crash location | Medium | Changed to require search during implementation |
| 12 | Issue #4 needs database migration | Medium | Added migration requirement |
| 13 | Electron 25 EOL with known CVEs | Medium | Documented as accepted risk, track separately |
| 14 | Bump scope too broad (UI bumped on server-only fixes) | Low | Limited bump to server + root package.json |
| 15 | Issue #6 conflates "verify present" with "verify works" | Low | Clarified verification scope |
