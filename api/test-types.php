<?php
/**
 * HealthVault – Test Types (Encyclopedia) API
 *
 * GET api/test-types.php         – All test types for which the user has results
 * GET api/test-types.php?code=X  – Single test type definition
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
    $encyclopedia = require APP_ROOT . '/includes/encyclopedia.php';

    if ($code) {
        if (!isset($encyclopedia[$code])) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Unknown test code.']);
            exit;
        }
        echo json_encode(['success' => true, 'data' => array_merge(['code' => $code], $encyclopedia[$code])]);
        exit;
    }

    $entries = getUserEncyclopedia($db, $userId);
    // Remap to include the code in each entry
    $result = [];
    foreach ($entries as $code => $entry) {
        $result[] = array_merge(['code' => $code], $entry);
    }
    echo json_encode(['success' => true, 'data' => $result]);

} catch (Exception $e) {
    http_response_code(500);
    $msg = APP_DEBUG ? $e->getMessage() : 'An unexpected error occurred.';
    echo json_encode(['success' => false, 'error' => $msg]);
}
