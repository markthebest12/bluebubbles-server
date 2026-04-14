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
**Runner:** `ubuntu-latest` (all quality gates are TypeScript — no macOS needed).
**Node:** 20.x with npm cache via `actions/setup-node`.
**All actions pinned to commit SHAs.**

#### Jobs (parallel)

| Job | Description | Blocking |
|-----|-------------|----------|
| `lint` | ESLint on `packages/server` and `packages/ui`, `--max-warnings 0` | Yes |
| `typecheck` | `tsc --noEmit` on both packages | Yes |
| `test` | Vitest on server package, coverage report | Yes |
| `security-scan` | Trivy (filesystem + secrets, HIGH/CRITICAL) + Gitleaks (full history) | Yes |
| `dep-audit` | `npm audit --audit-level=high` | Yes |
| `ci-complete` | Aggregator — `needs: [lint, typecheck, test, security-scan, dep-audit]` | Required check |

#### Security Scan Details

**Trivy** — two passes:
- Filesystem scan: `vuln` scanner, severity `HIGH,CRITICAL`, `ignore-unfixed: true`
- Secret scan: `secret` scanner, exit code 1 on finding

**Gitleaks** — full git history scan (fetch-depth 0 for this job only), blocking.

**npm audit** — `--audit-level=high`, JSON output as artifact. Accepted CVEs documented with justification.

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

Standard semver. Starting from upstream 1.9.9, first release tagged based on change scope. No build artifacts — tag and CHANGELOG only.

## 4. Upstream Sync

### upstream-sync.yml

**Schedule:** Monday 6am PT (13:00 UTC), plus manual dispatch.

**Behavior:**
1. Fetch `upstream/master` and `upstream/development`
2. Compare against `origin/main`
3. If new upstream commits exist, open PR with:
   - Commit summary (last 20 messages)
   - Diff stat
   - Conflict detection (trial merge, reports conflicting files)
4. Label: `upstream-sync`
5. No auto-merge — manual review and decision

## 5. Testing Infrastructure

### Framework

Vitest — native TypeScript, fast, v8 coverage provider.

### Config (packages/server/vitest.config.ts)

- Environment: `node`
- Coverage: `v8` provider, reports `text` + `json` + `html`
- Include: `src/**/*.test.ts`
- Path aliases: `@server`, `@windows`, `@trays` (matching tsconfig/webpack)

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

Upgrade from existing husky v4.

**pre-commit hook:**
- ESLint on staged `.ts`, `.tsx` files
- Prettier on staged `.ts`, `.tsx`, `.json`, `.css`, `.md` files
- TypeScript type check (`tsc --noEmit`) on server package

**commit-msg hook:**
- Commitlint with `@commitlint/config-conventional`

## 7. Initial Fixes

Execution order: pipeline first (#1), verify baseline (#6), then fixes (#2-#5).

### Issue #1: CI Pipeline Setup (ci)

Set up all workflows, testing infrastructure, pre-commit hooks, branch protection. Foundation for all subsequent work.

### Issue #6: Verify Unreleased Development Fixes (chore)

Confirm inherited fixes from upstream `development`: attachment chunking, LaunchAgents mkdir, stopTyping fix, OID cert handling, content-length headers, VCF import API, sensitive config exclusion, dashboard version display, menu bar icon fixes. Document in CHANGELOG, tag v1.10.0.

### Issue #2: Guard message.text null (fix)

**Problem:** `message.text.trim()` crashes on undefined text (group chat, attachment-only messages).
**Fix:** Null guard before `.trim()`.
**Tests:** Undefined text, attachment-only message, normal text.

### Issue #3: fs.watch persistent flag (fix, cherry-pick)

**Problem:** File watcher dies on idle, server stops detecting messages.
**Fix:** Cherry-pick from arncore fork — `persistent: true` on `fs.watch`.
**Tests:** Verify watcher options.

### Issue #4: Webhook authorization header (feat, cherry-pick)

**Problem:** No auth on outbound webhooks, receivers can't verify origin.
**Fix:** Cherry-pick from saucesteals fork — add `Authorization` header.
**Tests:** Header present when configured, absent when not (backwards compat).

### Issue #5: stopTyping endpoint (fix)

**Problem:** stopTyping calls startTyping (copy-paste error).
**Status:** Already fixed in our development base (upstream PR #768). Verify present, add test.
**Tests:** Endpoints wired to correct handlers.
