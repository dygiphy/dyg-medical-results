<?php
/**
 * HealthVault – Trends API
 *
 * GET api/trends.php?code=CODE   – Historical trend for a specific test code
 * GET api/trends.php             – All trends grouped by category
 *
 * @package HealthVault
 */

header('Content-Type: application/json; charset=utf-8');

define('APP_ROOT', dirname(__DIR__));
require_once APP_ROOT . '/config/config.php';
require_once APP_ROOT . '/includes/auth-init.php';
require_once APP_ROOT . '/includes/require-auth.php';
require_once APP_ROOT . '/includes/db.php';
require_once APP_ROOT . '/includes/functions.php';

$db     = getDb();
$userId = (int) $authUser['id'];

try {
    $code = isset($_GET['code']) ? strtoupper(trim($_GET['code'])) : null;

    if ($code) {
        $trend = getTestTrend($db, $userId, $code);
        echo json_encode(['success' => true, 'data' => $trend]);
        exit;
    }

    $all = getAllTrends($db, $userId);
    echo json_encode(['success' => true, 'data' => $all]);

} catch (Exception $e) {
    http_response_code(500);
    $msg = APP_DEBUG ? $e->getMessage() : 'An unexpected error occurred.';
    echo json_encode(['success' => false, 'error' => $msg]);
}
