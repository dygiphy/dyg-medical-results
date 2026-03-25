# Changelog

All notable changes to HealthVault are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [1.0.1] – 2026-03-25

### Fixed
- `login.php`: replaced non-existent `AdminAuth::login()` call with correct `AdminAuth::authenticate()` pattern; added `try/catch` error handling, `AdminSessionManager::saveAndClose()`, and corrected `RememberMeManager::createToken()` parameter signature

### Deployed
- Full production deployment to `https://apps.dygiphy.com.au/medical-results/`
- Auth submodule deployed via FTP; both app and auth schemas applied
- Wade's blood test data imported (6 sessions, ~90 results from 2020–2024)

---

## [1.0.0] – 2026-03-24

### Added
- Initial application build
- Authentication via `standalone-auth-package` Git submodule
- Three-table database schema: `blood_tests`, `test_results`, `ai_analyses`
- Comprehensive encyclopedia (`includes/encyclopedia.php`) with 60+ blood test definitions across 12 categories
- Full data access layer (`includes/functions.php`) with trend queries, AI prompt builders, and result status derivation
- REST-ish API endpoints: `api/blood-tests.php`, `api/trends.php`, `api/test-types.php`, `api/analyse.php`
- AI analysis via Gemini (`gemini-3.1-pro`) with SHA-256 prompt caching
- Vanilla JS SPA (`assets/js/app.js`) with hash-based router, five views (Dashboard, History, Detail, Trends, Encyclopedia, Add Results)
- Canvas-based trend line charts with reference range shading and status-coloured dots
- Login / logout pages with branded design
- CSS design system (`assets/css/app.css`) using CSS custom properties, navy/teal colour scheme, mobile-first layout
- PWA manifest (`manifest.json`) with deep navy theme colour
- Import script (`tools/import-wade.php`) for six historical test sessions from PDF
- Database setup tool (`tools/setup-db.php`)
- Icon generator (`tools/gen-icons.js`)
- `.gitignore`, `.github/copilot-instructions.md`, this changelog
