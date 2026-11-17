---
project: google-connect
status: stable
phase: library in use
priority: P4
last_activity: 2026-08-01
updated: 2026-11-17
tags: [library, google]
---
# Status: google-connect

A headless Google API library and CLI (Sheets, Calendar, Tasks, Gmail) using a one-time refresh token.

## Where it stands
- Stable and in use by [[garagewod]], installed via `git+https`. There are no open TODOs in the code.

## Open (optional)
- [ ] Add tests for token refresh and each API wrapper
- [ ] Tag versions so consumers can pin (`#v1.0.0`) instead of tracking `main`
- [ ] If [[garagewod]] issue #1 (per-user sign-in) goes ahead, decide whether interactive OAuth belongs in this library
- [ ] Possible consumer: [[schedulator]] steps 5–6 (Calendar)
