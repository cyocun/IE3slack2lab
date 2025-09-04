# AI Prompts and Working Agreements

This document provides AI-oriented guidance and ready-to-use prompts for working on this repo.

## Quick Context

- Purpose: Upload Slack images to GitHub, update JSON metadata; Cloudflare Workers + TypeScript + Hono
- Single-commit: Image + JSON updates are made atomically via Git Trees/Commits/Refs
- Truth source: `wrangler.toml` defines `IMAGE_PATH`, `JSON_PATH`, `GITHUB_BRANCH`, KV binding name

## Rules of the Road

- Use `src/github/urlBuilder.ts` to construct all GitHub URLs
- Store site paths (start with `/images/...`) in JSON; convert with `utils/paths.ts`
- Keep user-facing copy in `src/constants.ts` only; technical strings inline
- Validate: dates via `formatDateInput` → `YYYY/MM/DD`; links support Slack `<url|text>`
- Respect Slack’s ~3s expectation; consider `waitUntil()` for heavy tasks when refactoring

## High-Value Prompts

Refactor upload to background (sketch):

"""
Task: Move heavy upload steps to background to respect Slack’s 3s limit.
Constraints:
- Keep API signatures and messages intact.
- Use `executionCtx.waitUntil()` when available in request context.
- Ensure success/failure Slack messages still post to the same thread.
Acceptance:
- `/slack/events` returns 200 quickly.
- Background task runs image optimization + GitHub commit.
"""

Add field to JSON entries:

"""
Task: Add optional `author` to `LabEntry` and flow.
Constraints:
- Backfill: default to empty string.
- Keep order and formatting of JSON stable.
- Update success/edit messages and tests.
Acceptance:
- New uploads write `author`.
- Edit flow supports author.
"""

## Consistency Checklist

- Branch/paths from `wrangler.toml` are used throughout.
- All GitHub calls use URL builder helpers.
- JSON contains site paths; repo operations use repo paths.
- KV TTLs follow `KV_CONFIG`.
- Add/edit docs when behavior changes (README, SPECIFICATION, CLAUDE, this file).

## Edge Cases to Test

- Dates like `0131` → `YYYY/01/31`; invalid like `1331` rejected
- Slack link `<https://example.com|example>` accepted; `no` clears link
- Non-ASCII file names sanitized and still unique with timestamp
- JSON missing/empty returns empty array gracefully
- Delete when image blob missing: JSON-only update path

