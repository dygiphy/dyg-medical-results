<?php
/**
 * HealthVault – Blood Tests API
 *
 * GET  api/blood-tests.php           – List all blood test sessions for the user
 * GET  api/blood-tests.php?id=X      – Single blood test with all results
 * POST api/blood-tests.php           – Create new blood test session
 * DELETE api/blood-tests.php?id=X   – Delete a blood test session
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
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : null;

        if ($id) {
            $test = getBloodTest($db, $id, $userId);
            if (!$test) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Test not found.']);
                exit;
            }
            echo json_encode(['success' => true, 'data' => $test]);
            exit;
        }

        $tests = getBloodTestList($db, $userId);
        echo json_encode(['success' => true, 'data' => $tests]);
        exit;
    }

    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!$body || empty($body['test_date'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'test_date is required.']);
            exit;
        }

        $newId = createBloodTest($db, $userId, $body);

        // If results are included in the same request, save them
        if (!empty($body['results']) && is_array($body['results'])) {
            foreach ($body['results'] as $code => $result) {
                if (empty($code) || !is_string($code)) {
                    continue;
                }
                upsertTestResult($db, $newId, strtoupper($code), $result);
            }
        }

        echo json_encode(['success' => true, 'id' => $newId]);
        exit;
    }

    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id required.']);
            exit;
        }

        $deleted = deleteBloodTest($db, $id, $userId);
        echo json_encode(['success' => $deleted]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);

} catch (Exception $e) {
    http_response_code(500);
    $msg = APP_DEBUG ? $e->getMessage() : 'An unexpected error occurred.';
    echo json_encode(['success' => false, 'error' => $msg]);
}
