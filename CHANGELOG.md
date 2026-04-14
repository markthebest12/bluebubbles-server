# Changelog

All notable changes to this project will be documented in this file.
This changelog is automatically maintained by [Uplift](https://upliftci.dev/).

## Unreleased

## [v1.10.3](https://github.com/markthebest12/bluebubbles-server/releases/tag/v1.10.3) - 2026-04-14

- [`bc10360`](https://github.com/markthebest12/bluebubbles-server/commit/bc1036075bf1c50ddb3d665ab954a2670b8f05a8) research: Accessibility API typing indicators prototype (#20) (#25)
- [`e057257`](https://github.com/markthebest12/bluebubbles-server/commit/e057257cb6e4ba6f33925fed42edfbd303203126) fix: add exponential backoff retry for webhook delivery (#15) (#24)
- [`ae06179`](https://github.com/markthebest12/bluebubbles-server/commit/ae06179b) fix: guard headless null window access in preChecks (#14) (#23)
- [`0b2fe54`](https://github.com/markthebest12/bluebubbles-server/commit/0b2fe541) fix: handle Tahoe NULL text column with attributedBody fallback (#19) (#22)

## [v1.10.1](https://github.com/markthebest12/bluebubbles-server/releases/tag/v1.10.1) - 2026-04-14

- [`3158d2e`](https://github.com/markthebest12/bluebubbles-server/commit/3158d2e7) fix: map Tahoe 'any' service type to 'iMessage' in AppleScript sends (#18) (#21)
- [`f7ae4b3`](https://github.com/markthebest12/bluebubbles-server/commit/f7ae4b33) docs: add headless operation research and deployment guide (#17)

## [v1.10.0](https://github.com/markthebest12/bluebubbles-server/releases/tag/v1.10.0) - 2026-04-13

- [`25160b7`](https://github.com/markthebest12/bluebubbles-server/commit/25160b7d23de324845e985fd9fd60c6d68296b8a) feat: include authorization header in webhook requests (#11)
- [`41e11c5`](https://github.com/markthebest12/bluebubbles-server/commit/41e11c5f16cb3f1062d2251a49a8b0d8282717fa) feat: [#622] attachment chunking
- [`9eb36f6`](https://github.com/markthebest12/bluebubbles-server/commit/9eb36f6000ee203fb7505e10874d65a28aa4d7d9) feat: ability to delete individual registered devices
- [`5cce938`](https://github.com/markthebest12/bluebubbles-server/commit/5cce9381f5129df669ac4a60413a44b18e8b6aaa) feat: api for importing vcf files
- [`cac28d6`](https://github.com/markthebest12/bluebubbles-server/commit/cac28d63ece1cecd58ed6f59063e24f7549ecd8c) feat: new contact API updates
- [`a06fb11`](https://github.com/markthebest12/bluebubbles-server/commit/a06fb110d8cf96317d15048263bf48a68b6d35ef) feat: adds flow for adding billing account to fcm
- [`e35417e`](https://github.com/markthebest12/bluebubbles-server/commit/e35417ec4f654517e7cadbd4e7aa177541ec61e9) fix: add Unreleased header for Uplift changelog append
- [`e43c4cc`](https://github.com/markthebest12/bluebubbles-server/commit/e43c4cc7fef1d10cb0136101728f28cc32e6bafa) fix: use Uplift-compatible changelog header
- [`a9b7573`](https://github.com/markthebest12/bluebubbles-server/commit/a9b7573873b867747aa59e73feac2ab95dafb00b) fix: correct uplift config schema and update changelog (#13)
- [`901653b`](https://github.com/markthebest12/bluebubbles-server/commit/901653b48f62578d754793c4e550faaeb2f76210) fix: guard message.text null access in webhook/message handlers (#12)
- [`e00041f`](https://github.com/markthebest12/bluebubbles-server/commit/e00041f40707871f527d0c75665c2ad591cd0597) test: add regression tests for typing endpoint wiring (#10)
- [`11b0b2c`](https://github.com/markthebest12/bluebubbles-server/commit/11b0b2c2399e6180cb1c993258c0c4872d14ccd7) fix: use persistent flag on fs.watch to prevent watcher death on idle (#8)
- [`068ef07`](https://github.com/markthebest12/bluebubbles-server/commit/068ef072ccbe192fb783944121d23e80a7ecf43e) ci: set up CI pipeline with quality gates (#7)
- [`0c9e40e`](https://github.com/markthebest12/bluebubbles-server/commit/0c9e40ed02769769b41b3c1c662fbd88330cd6e8) docs: add implementation plan for CI pipeline and initial fixes
- [`a1d4d70`](https://github.com/markthebest12/bluebubbles-server/commit/a1d4d70d8fadcf6ce92c0d56add5fb3413e745ec) docs: add CI pipeline and initial fixes design spec
- [`2825335`](https://github.com/markthebest12/bluebubbles-server/commit/2825335f2c274f6453b8ce04796c82d7dbfe6c6c) fix: stopTyping endpoint was calling startTyping
- [`36ce34f`](https://github.com/markthebest12/bluebubbles-server/commit/36ce34f097b4eb109910e3d9cf576984e79ee198) fix: #711 - improved OID certificate handling
- [`aa293f2`](https://github.com/markthebest12/bluebubbles-server/commit/aa293f2be501005d38e750623b3f1ff3cd7db9d4) fix: #726 - launchagent loop
- [`729913a`](https://github.com/markthebest12/bluebubbles-server/commit/729913a84f8c630bcfbc23d7a7055fa29a1bb2d3) fix: Daily Messages -> Messages Today
- [`26471ef`](https://github.com/markthebest12/bluebubbles-server/commit/26471ef665f8270afb017a717023710203ef4df3) fix: exclude sensitive configs from being logged
- [`bd2acd0`](https://github.com/markthebest12/bluebubbles-server/commit/bd2acd08e51e756f2ed7b3578c22543d15d9b32d) fix: helptext typos
- [`ab71810`](https://github.com/markthebest12/bluebubbles-server/commit/ab71810b0ca5051e3fcdd6419427b3994f7234f0) fix: tray icon when in reduced transparency mode
- [`3835ec4`](https://github.com/markthebest12/bluebubbles-server/commit/3835ec44d43e0e149b04dc9e9c372de328dd65a2) fix: menu bar icon issues
- [`dfa297e`](https://github.com/markthebest12/bluebubbles-server/commit/dfa297e54e0a9cbe546cb62d7525422c4a350662) fix: google oauth flow & error handling
- [`ec4da5c`](https://github.com/markthebest12/bluebubbles-server/commit/ec4da5c7b27ea3acb2ad00d3791a84057317fa8e) fix: issue with zrok where a named reserved tunnel would not be released when the name was cleared from settings
- [`95d8828`](https://github.com/markthebest12/bluebubbles-server/commit/95d88285f53c95f6cb092a96f67383c082a6294b) fix: version bump individual packages

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
