<?php
/**
 * HealthVault – Application Configuration Template
 *
 * Copy this file to config.php and fill in environment-specific values.
 * NEVER commit config.php – it contains credentials.
 *
 * @package HealthVault
 */

// ─── Environment Detection ────────────────────────────────────────────
$serverName = $_SERVER['SERVER_NAME'] ?? php_sapi_name();
$isProduction = (
    !empty($serverName)
    && strpos($serverName, 'localhost') === false
    && strpos($serverName, '127.0.0.1') === false
    && $serverName !== 'cli'
);

define('IS_PRODUCTION', $isProduction);

if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__DIR__));
}
define('LOGS_PATH', APP_ROOT . '/logs');

if (!defined('BASE_URL')) {
    define('BASE_URL', $isProduction ? '/medical-results/' : '/dyg-medical-results/');
}

define('AUTH_LOGIN_URL',        BASE_URL . 'login.php');
define('AUTH_DEFAULT_REDIRECT', BASE_URL . 'index.php');
define('AUTH_APP_NAME',         'HealthVault');
define('AUTH_APP_TAGLINE',      'Your personal health record');

// ─── Database Configuration ───────────────────────────────────────────
if ($isProduction) {
    define('DB_HOST',    'localhost');
    define('DB_PORT',    3306);
    define('DB_NAME',    'dygiphyc_medrslt');
    define('DB_USER',    'dygiphyc_medrslt');
    define('DB_PASS',    '{PRODUCTION_DB_PASSWORD}');
    define('DB_CHARSET', 'utf8mb4');
} else {
    define('DB_HOST',    'localhost');
    define('DB_PORT',    3306);
    define('DB_NAME',    'dyg_medical_results');
    define('DB_USER',    'root');
    define('DB_PASS',    '');
    define('DB_CHARSET', 'utf8mb4');
}

// ─── AI API ───────────────────────────────────────────────────────────
define('AI_API_KEY',   '{YOUR_AI_API_KEY}');
define('AI_MODEL',     'gemini-3.1-pro');

// ─── App Settings ─────────────────────────────────────────────────────
define('APP_DEBUG',    !$isProduction);
define('APP_VERSION',  '1.0.0');
define('SITE_TITLE',   'HealthVault');
