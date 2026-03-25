<?php
/**
 * HealthVault – Authentication Initialisation
 *
 * Bootstraps the standalone-auth-package and configures the database
 * connection used by both the auth system and the application.
 * Must be included before any protected page or auth check.
 *
 * @package HealthVault
 */

require_once APP_ROOT . '/standalone-auth-package/src/autoload.php';

use StandaloneAuth\Core\Database as AuthDatabase;
use StandaloneAuth\Core\Logger;
use StandaloneAuth\Auth\RememberMeManager;

// Unique cookie name prevents cross-app session contamination
RememberMeManager::setCookieName('healthvault_remember');

// Auth log
$logDir = LOGS_PATH;
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
if (is_writable($logDir) || is_writable(dirname($logDir))) {
    Logger::init($logDir . '/auth.log');
}

// Initialise auth database (same DB as the app)
$authDbConfig = [
    'host'     => DB_HOST,
    'port'     => DB_PORT,
    'database' => DB_NAME,
    'username' => DB_USER,
    'password' => DB_PASS,
    'charset'  => DB_CHARSET,
    'options'  => [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ],
];

try {
    AuthDatabase::init($authDbConfig);
} catch (Exception $e) {
    error_log('HealthVault auth init failed: ' . $e->getMessage());
    if (APP_DEBUG) {
        die('Auth initialisation failed: ' . $e->getMessage());
    }
    die('Authentication system unavailable. Please try again shortly.');
}
