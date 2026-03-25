<?php
/**
 * HealthVault – Main Application Shell
 *
 * Authenticates the user, pre-renders the latest blood test data into
 * window.__APP_DATA__ for an instant first paint, and serves the SPA shell.
 *
 * @package HealthVault
 */

define('APP_ROOT', __DIR__);
require_once APP_ROOT . '/config/config.php';
require_once APP_ROOT . '/includes/auth-init.php';
require_once APP_ROOT . '/includes/require-auth.php';
require_once APP_ROOT . '/includes/db.php';
require_once APP_ROOT . '/includes/functions.php';

$userId = (int) $authUser['id'];
$db     = getDb();

// Pre-load data for dashboard first paint
$latestTest  = null;
$testList    = [];
$errorMsg    = null;

try {
    $testList   = getBloodTestList($db, $userId);
    $latestTest = $testList ? getBloodTest($db, (int) $testList[0]['id'], $userId) : null;
} catch (Exception $e) {
    $errorMsg = APP_DEBUG ? $e->getMessage() : 'Unable to load your data.';
}

$appData = json_encode([
    'user'        => [
        'id'           => $authUser['id'],
        'username'     => $authUser['username'],
        'display_name' => $authUser['display_name'],
    ],
    'latestTest'  => $latestTest,
    'testList'    => $testList,
    'config'      => [
        'base_url' => BASE_URL,
        'version'  => APP_VERSION,
    ],
    'error'       => $errorMsg,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$cssV = file_exists(__DIR__ . '/assets/css/app.css') ? filemtime(__DIR__ . '/assets/css/app.css') : 1;
$jsV  = file_exists(__DIR__ . '/assets/js/app.js')  ? filemtime(__DIR__ . '/assets/js/app.js')  : 1;
?>
<!DOCTYPE html>
<html lang="en-AU">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#0D3B66">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="HealthVault">
    <meta name="description" content="Personal blood test history and health tracking.">
    <title>HealthVault</title>
    <link rel="manifest" href="<?= BASE_URL ?>manifest.json">
    <link rel="apple-touch-icon" href="<?= BASE_URL ?>assets/icons/icon-180.png">
    <link rel="icon" type="image/png" sizes="32x32" href="<?= BASE_URL ?>assets/icons/favicon-32.png">
    <link rel="stylesheet" href="<?= BASE_URL ?>assets/css/app.css?v=<?= $cssV ?>">
</head>
<body>

<!-- ── App Header ──────────────────────────────────────────────── -->
<header class="app-header" id="app-header">
    <div class="header-inner">
        <div class="header-brand">
            <svg class="brand-icon" width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect width="48" height="48" rx="10" fill="rgba(255,255,255,0.15)"/>
                <path d="M24 10C16.268 10 10 16.268 10 24C10 31.732 16.268 38 24 38C31.732 38 38 31.732 38 24C38 16.268 31.732 10 24 10ZM24 14C29.523 14 34 18.477 34 24C34 29.523 29.523 34 24 34C18.477 34 14 29.523 14 24C14 18.477 18.477 14 24 14Z" fill="white" opacity="0.5"/>
                <path d="M22 19H26V22H29V26H26V29H22V26H19V22H22V19Z" fill="white"/>
            </svg>
            <span class="brand-name">HealthVault</span>
        </div>
        <div class="header-actions">
            <span class="header-user"><?= htmlspecialchars($authUser['display_name'] ?? $authUser['username']) ?></span>
            <a href="<?= BASE_URL ?>logout.php" class="header-logout" title="Sign out">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </a>
        </div>
    </div>
</header>

<!-- ── Main Content ────────────────────────────────────────────── -->
<main class="app-content" id="app-content" role="main">
    <div class="loading-state" id="initial-loader">
        <div class="spinner"></div>
        <p>Loading your health data&hellip;</p>
    </div>
</main>

<!-- ── Bottom Navigation ───────────────────────────────────────── -->
<nav class="nav-bottom" id="nav-bottom" role="navigation" aria-label="Main navigation">
    <a href="#/" class="nav-item" data-route="home" aria-label="Dashboard">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <span>Dashboard</span>
    </a>
    <a href="#/history" class="nav-item" data-route="history" aria-label="History">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>History</span>
    </a>
    <a href="#/trends" class="nav-item" data-route="trends" aria-label="Trends">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span>Trends</span>
    </a>
    <a href="#/encyclopedia" class="nav-item" data-route="encyclopedia" aria-label="Encyclopedia">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        <span>Reference</span>
    </a>
    <a href="#/add" class="nav-item" data-route="add" aria-label="Add test results">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <span>Add</span>
    </a>
</nav>

<!-- ── Overlay / Modal ─────────────────────────────────────────── -->
<div class="overlay" id="overlay" hidden></div>
<div class="modal" id="modal" hidden role="dialog" aria-modal="true">
    <div class="modal-inner" id="modal-inner"></div>
</div>

<!-- ── Toast ──────────────────────────────────────────────────── -->
<div class="toast-container" id="toast-container" aria-live="assertive"></div>

<script>window.__APP_DATA__ = <?= $appData ?>;</script>
<script src="<?= BASE_URL ?>assets/js/app.js?v=<?= $jsV ?>"></script>

</body>
</html>
