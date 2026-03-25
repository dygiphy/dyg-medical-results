# HealthVault – Copilot Instructions

## Overview

HealthVault is a personal blood test history and trend-tracking web app for `apps.dygiphy.com.au/medical-results/`.
It is a vanilla PHP + vanilla JS SPA built on the shared dygiphy platform conventions.

## Platform

- **Hosting**: apps.dygiphy.com.au (Synergy Wholesale cPanel, shared Linux)
- **Language**: PHP 8.2+ (no framework, no Composer in app)
- **Database**: MySQL/MariaDB via PDO
- **Frontend**: Vanilla JS SPA, hash-based router, canvas charts
- **Auth**: `standalone-auth-package` Git submodule at `standalone-auth-package/`
- **AI**: `includes/AIApiClient.php` (copy of shared client), key in `config/config.php`

## URLs

| Environment | Base URL |
|-------------|----------|
| Local       | `http://localhost/dyg-medical-results/` |
| Production  | `https://apps.dygiphy.com.au/medical-results/` |

## Database

| Environment | Name |
|-------------|------|
| Local       | `dyg_medical_results` |
| Production  | `dygiphyc_medrslt` |

## Config

- `config/config.php` – gitignored, uses `define()` constants
- `config/config.example.php` – committed template
- Auto-detects environment via `$_SERVER['SERVER_NAME']`
- Production settings are commented-in and local settings commented-out by the developer

## Auth Package

- Submodule: `standalone-auth-package/`
- Init: `includes/auth-init.php` → bootstraps DB + session
- Require auth (pages): include `includes/require-auth.php` → sets `$authUser`
- Table: `admin_users` (id, username, email, display_name, role, is_active)
- Cookie name: `healthvault_remember`

## Tables

| Table | Purpose |
|-------|---------|
| `blood_tests` | One row per test session (date, lab, doctor) |
| `test_results` | One row per result per session (code, value, flag, ref range) |
| `ai_analyses` | Cached AI responses keyed by SHA-256 prompt hash |

## Key Files

| File | Purpose |
|------|---------|
| `index.php` | SPA shell – PHP auth + pre-render → loads app.js |
| `login.php` / `logout.php` | Auth pages |
| `api/blood-tests.php` | CRUD for test sessions |
| `api/trends.php` | Historical trend data |
| `api/test-types.php` | Encyclopedia (filtered to user's tests) |
| `api/analyse.php` | AI analysis via Gemini |
| `includes/encyclopedia.php` | Single source of truth for all test definitions |
| `includes/functions.php` | All DB query functions |
| `assets/css/app.css` | Full design system |
| `assets/js/app.js` | SPA (router, views, canvas charts) |

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--clr-primary` | `#0D3B66` | Navy – headers, buttons |
| `--clr-accent` | `#17B0BD` | Teal – accents, charts |
| `--clr-normal` | `#16A34A` | Green – in-range results |
| `--clr-high` | `#DC2626` | Red – above range |
| `--clr-low` | `#2563EB` | Blue – below range |

## AI Integration

- Model: `gemini-3.1-pro` (set in `config.php` via `AI_MODEL` constant)
- Key: stored as `AI_API_KEY` constant in `config/config.php`
- Middleware: `https://api2.dygiphy.com.au`
- Client: `includes/AIApiClient.php` (copied from `B:\wamp64\www\ai-api2\ai-api2-client\`)
- Responses cached by SHA-256 prompt hash in `ai_analyses` table

## Supplementary Instructions

- See `.github/instructions/changelog.md` for change history
- See `.github/instructions/ssh-production-server.instructions.md` for deployment details
