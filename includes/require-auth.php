<?php
/**
 * HealthVault – Require Authentication
 *
 * Include at the top of any protected page or API endpoint.
 * Sets $authUser with the authenticated user data.
 * Redirects HTML requests to login; returns JSON 401 for AJAX requests.
 *
 * Prerequisites: config.php and auth-init.php must already be loaded.
 *
 * @package HealthVault
 */

use StandaloneAuth\Auth\AdminSessionManager;
use StandaloneAuth\Auth\AdminAuth;
use StandaloneAuth\Auth\RememberMeManager;

AdminSessionManager::init();

$sessionId = AdminSessionManager::getSessionId();
$authUser  = null;

if ($sessionId) {
    $authUser = AdminAuth::validateSession($sessionId);
}

// Fall back to remember-me token if session is absent
if (!$authUser) {
    $sessionCfg = AdminSessionManager::getConfig();
    $userId = RememberMeManager::validateToken(
        AdminSessionManager::getCookieDomain(),
        $sessionCfg['is_https'] ?? false
    );

    if ($userId) {
        try {
            $userData = \StandaloneAuth\Core\Database::findOne('admin_users', [
                'id'        => $userId,
                'is_active' => true,
            ]);

            if ($userData) {
                $sessionData = AdminAuth::createSession(
                    $userId,
                    $_SERVER['REMOTE_ADDR'] ?? '',
                    $_SERVER['HTTP_USER_AGENT'] ?? '',
                    true
                );
                AdminSessionManager::store($sessionData, $userData);
                $authUser = $userData;
            }
        } catch (Exception $e) {
            // Silent – unauthenticated path handled below
        }
    }
}

if (!$authUser) {
    $isAjax = !empty($_SERVER['HTTP_X_REQUESTED_WITH'])
        && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';

    // API requests and fetch() calls
    $acceptsJson = !$isAjax && isset($_SERVER['HTTP_ACCEPT'])
        && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;

    if ($isAjax || $acceptsJson) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Authentication required', 'redirect' => AUTH_LOGIN_URL]);
        exit;
    }

    $_SESSION['redirect_after_login'] = $_SERVER['REQUEST_URI'] ?? BASE_URL;
    header('Location: ' . AUTH_LOGIN_URL);
    exit;
}
