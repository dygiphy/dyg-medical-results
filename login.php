<?php
/**
 * HealthVault – Login Page
 *
 * Authenticates users via the standalone-auth-package.
 * Redirects already-authenticated users to the app.
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

// ─── Redirect if already logged in ───────────────────────────────────
$sessionId   = AdminSessionManager::getSessionId();
$currentUser = null;

if ($sessionId) {
    $currentUser = AdminAuth::validateSession($sessionId);
}

if (!$currentUser) {
    $sessionCfg = AdminSessionManager::getConfig();
    $userId = RememberMeManager::validateToken(
        AdminSessionManager::getCookieDomain(),
        $sessionCfg['is_https'] ?? false
    );
    if ($userId) {
        $currentUser = \StandaloneAuth\Core\Database::findOne('admin_users', ['id' => $userId, 'is_active' => true]);
    }
}

if ($currentUser) {
    $redirect = $_SESSION['redirect_after_login'] ?? AUTH_DEFAULT_REDIRECT;
    unset($_SESSION['redirect_after_login']);
    header('Location: ' . $redirect);
    exit;
}

// ─── Handle POST ──────────────────────────────────────────────────────
$error    = '';
$username = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $remember = !empty($_POST['remember']);

    if ($username === '' || $password === '') {
        $error = 'Please enter your username and password.';
    } else {
        $result = AdminAuth::login(
            $username,
            $password,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        );

        if (!empty($result['success'])) {
            AdminSessionManager::store($result['session'], $result['user']);

            if ($remember) {
                $sessionCfg = AdminSessionManager::getConfig();
                RememberMeManager::createToken(
                    $result['user']['id'],
                    AdminSessionManager::getCookieDomain(),
                    $sessionCfg['is_https'] ?? false
                );
            }

            $redirect = $_SESSION['redirect_after_login'] ?? AUTH_DEFAULT_REDIRECT;
            unset($_SESSION['redirect_after_login']);
            header('Location: ' . $redirect);
            exit;
        }

        $error = $result['error'] ?? 'Invalid username or password.';
    }
}
?>
<!DOCTYPE html>
<html lang="en-AU">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0D3B66">
    <title>Sign In – HealthVault</title>
    <link rel="icon" type="image/png" sizes="32x32" href="<?= BASE_URL ?>assets/icons/favicon-32.png">
    <link rel="stylesheet" href="<?= BASE_URL ?>assets/css/app.css?v=<?= file_exists(__DIR__ . '/assets/css/app.css') ? filemtime(__DIR__ . '/assets/css/app.css') : 1 ?>">
</head>
<body class="login-body">

<div class="login-wrap">
    <div class="login-card">
        <div class="login-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect width="48" height="48" rx="12" fill="#0D3B66"/>
                <path d="M24 10C16.268 10 10 16.268 10 24C10 31.732 16.268 38 24 38C31.732 38 38 31.732 38 24C38 16.268 31.732 10 24 10ZM24 14C29.523 14 34 18.477 34 24C34 29.523 29.523 34 24 34C18.477 34 14 29.523 14 24C14 18.477 18.477 14 24 14Z" fill="#17B0BD" opacity="0.4"/>
                <path d="M22 19H26V22H29V26H26V29H22V26H19V22H22V19Z" fill="#17B0BD"/>
            </svg>
        </div>
        <h1 class="login-title">HealthVault</h1>
        <p class="login-subtitle">Your personal health record</p>

        <?php if ($error): ?>
            <div class="alert alert-error" role="alert"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <form method="post" action="" novalidate>
            <div class="form-group">
                <label class="form-label" for="username">Username</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    class="form-input"
                    value="<?= htmlspecialchars($username) ?>"
                    autocomplete="username"
                    autofocus
                    required
                >
            </div>

            <div class="form-group">
                <label class="form-label" for="password">Password</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    class="form-input"
                    autocomplete="current-password"
                    required
                >
            </div>

            <div class="form-check">
                <input type="checkbox" id="remember" name="remember" class="check-input" value="1">
                <label for="remember" class="check-label">Keep me signed in</label>
            </div>

            <button type="submit" class="btn btn-primary btn-full">Sign In</button>
        </form>
    </div>
</div>

</body>
</html>
