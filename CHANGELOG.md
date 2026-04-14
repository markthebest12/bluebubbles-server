# Changelog

All notable changes to this project will be documented in this file.
This changelog is automatically maintained by [Uplift](https://upliftci.dev/).

## Unreleased

## v1.9.9 — Fork Baseline

Based on upstream `development` branch (ahead of upstream v1.9.9 release).

### Inherited from upstream development (unreleased in upstream)

- feat: attachment chunking for large file transfers
- feat: API for importing VCF contact files
- feat: server version displayed on dashboard
- fix: stopTyping endpoint was calling startTyping (PR #768)
- fix: LaunchAgents directory check and mkdir (PR #764)
- fix: improved OID certificate handling
- fix: LaunchAgent restart loop
- fix: adds content-length header in file responses
- fix: exclude sensitive configs from being logged
- fix: menu bar icon in reduced transparency mode

### Fork additions

- fix: use persistent flag on fs.watch to prevent watcher death on idle (#8)
- fix: guard message.text null access in webhook/message handlers (#12)
- feat: include authorization header in webhook requests (#11)
- test: add regression tests for typing endpoint wiring (#10)
- ci: full CI pipeline with quality gates (#7)
