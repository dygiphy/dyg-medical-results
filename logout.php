<?php
/**
 * HealthVault – Logout
 *
 * Destroys the session, removes remember-me cookies, and redirects to login.
 *
 * @package HealthVault
 */

define('APP_ROOT', __DIR__);
require_once APP_ROOT . '/config/config.php';
require_once APP_ROOT . '/includes/auth-init.php';

use StandaloneAuth\Auth\AdminSessionManager;
use StandaloneAuth\Auth\AdminAuth;
use StandaloneAuth\Auth\RememberMeManager;

AdminSessionManager::init();

$sessionId = AdminSessionManager::getSessionId();
if ($sessionId) {
    AdminAuth::logout($sessionId);
}

$sessionCfg = AdminSessionManager::getConfig();
RememberMeManager::deleteToken(
    AdminSessionManager::getCookieDomain(),
    $sessionCfg['is_https'] ?? false
);

AdminSessionManager::destroy();

header('Location: ' . AUTH_LOGIN_URL);
exit;
