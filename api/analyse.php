<?php
/**
 * HealthVault – AI Analysis API
 *
 * POST api/analyse.php
 *
 * Body (JSON):
 *   { "blood_test_id": 6 }          – Analyse a specific test date
 *   { "blood_test_id": null }        – Analyse full history
 *   { "force_refresh": true }        – Bypass cache
 *
 * Returns:
 *   { "success": true, "analysis": "...", "cached": false, "tokens": 1234 }
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

// Copy AIApiClient from shared location if not present locally
$clientSrc  = 'B:/wamp64/www/ai-api2/ai-api2-client/AIApiClient.php';
$clientDest = APP_ROOT . '/includes/AIApiClient.php';
if (!file_exists($clientDest) && file_exists($clientSrc)) {
    copy($clientSrc, $clientDest);
}
require_once $clientDest;

$db     = getDb();
$userId = (int) $authUser['id'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

$body         = json_decode(file_get_contents('php://input'), true);
$bloodTestId  = isset($body['blood_test_id']) ? (int) $body['blood_test_id'] : null;
$forceRefresh = !empty($body['force_refresh']);
$type         = $bloodTestId ? 'single' : 'history';

try {
    // ─── Build prompt ────────────────────────────────────────────────
    $patientAge = 'unknown';
    $patientSex = 'Male';

    if ($bloodTestId) {
        $test = getBloodTest($db, $bloodTestId, $userId);
        if (!$test) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Test not found.']);
            exit;
        }
        $promptData = buildSingleTestPrompt($test, $patientSex, $patientAge);
    } else {
        $allTests   = getBloodTestList($db, $userId);
        $promptData = buildHistoryPrompt($allTests, $db, $userId, $patientSex, $patientAge);
    }

    $hash = hash('sha256', $promptData);

    // ─── Check cache ─────────────────────────────────────────────────
    if (!$forceRefresh) {
        $cached = getCachedAnalysis($db, $hash);
        if ($cached) {
            echo json_encode([
                'success'  => true,
                'analysis' => $cached['response_text'],
                'cached'   => true,
                'tokens'   => (int) $cached['tokens_used'],
            ]);
            exit;
        }
    }

    // ─── Call AI API ─────────────────────────────────────────────────
    $client = new AIApiClient([
        'api_key' => AI_API_KEY,
        'timeout' => 150,
    ]);

    $systemPrompt = "You are an experienced GP and pathologist providing plain-English interpretation of blood test results for an informed patient. "
        . "Your response must be thorough, detailed, and accessible, written for an intelligent non-medical reader. "
        . "Structure your response with clear sections using markdown-style headings (##). "
        . "For every result that is outside the reference range or flagged as high or low, you MUST provide: "
        . "(1) a plain-English explanation of what the result means and why it matters; "
        . "(2) the most common causes or contributing factors; "
        . "(3) practical lifestyle, dietary, or medical steps the patient could discuss with their doctor to improve or monitor it. "
        . "Do NOT give specific diagnoses or prescribe treatments – frame improvement suggestions as things to raise with their doctor. "
        . "Be balanced: acknowledge normal results positively, and explain abnormal results calmly with context. "
        . "Always include a section at the end titled '## Important Note' reminding the reader this is an AI interpretation and not a substitute for medical advice.";

    $response = $client->prompt([
        'model'       => AI_MODEL,
        'system'      => $systemPrompt,
        'prompt'      => $promptData,
        'temperature' => 0.4,
        'max_tokens'  => 8000,
    ]);

    $analysisText = $response['content'] ?? 'No analysis available.';
    $tokens       = (int) ($response['usage']['total_tokens'] ?? 0);

    // ─── Cache the result ─────────────────────────────────────────────
    saveAnalysis($db, $userId, $bloodTestId, $type, $hash, $analysisText, $tokens);

    echo json_encode([
        'success'  => true,
        'analysis' => $analysisText,
        'cached'   => false,
        'tokens'   => $tokens,
    ]);

} catch (AIApiRateLimitException $e) {
    http_response_code(429);
    echo json_encode(['success' => false, 'error' => 'AI service is currently busy. Please try again in a moment.']);
} catch (Exception $e) {
    http_response_code(500);
    $msg = APP_DEBUG ? $e->getMessage() : 'AI analysis failed. Please try again.';
    echo json_encode(['success' => false, 'error' => $msg]);
}

// ─── Prompt builders ──────────────────────────────────────────────────

/**
 * Build a prompt for a single blood test date analysis.
 *
 * @param array  $test       Full test record with results.
 * @param string $sex
 * @param string $age
 * @return string
 */
function buildSingleTestPrompt(array $test, string $sex, string $age): string
{
    $lines = [
        "Please analyse the following blood test results and provide a thorough plain-English interpretation.",
        "",
        "Patient: {$sex}, age {$age}",
        "Test date: {$test['test_date']}",
        "Laboratory: {$test['lab_name']}",
        "",
        "RESULTS:",
        "─────────────────────────────────────"
    ];

    $currentCat = null;
    foreach ($test['results'] as $r) {
        if ($r['category'] !== $currentCat) {
            $lines[] = "";
            $lines[] = "[ {$r['category']} ]";
            $currentCat = $r['category'];
        }
        $flag  = $r['flag'] ? " *** {$r['flag']} ***" : '';
        $ref   = $r['ref_range_text'] ?? '';
        $lines[] = "  {$r['test_name']}: {$r['value_text']} {$r['units']}{$flag}  (ref: {$ref})";
    }

    $lines[] = "";
    $lines[] = "Please structure your response with the following sections:";
    $lines[] = "## Overall Assessment";
    $lines[] = "## Key Findings (both normal and abnormal)";
    $lines[] = "## Items Requiring Attention";
    $lines[] = "For this section, address EACH out-of-range result individually with three sub-points: what it means, likely causes, and what the patient could do to improve it (diet, lifestyle, or medical follow-up to discuss with their doctor).";
    $lines[] = "## Possible Causes and Context";
    $lines[] = "## Suggested Next Steps";
    $lines[] = "## Important Note";

    return implode("\n", $lines);
}

/**
 * Build a prompt for full history analysis.
 *
 * @param array  $allTests
 * @param PDO    $db
 * @param int    $userId
 * @param string $sex
 * @param string $age
 * @return string
 */
function buildHistoryPrompt(array $allTests, PDO $db, int $userId, string $sex, string $age): string
{
    $lines = [
        "Please analyse the following blood test history and identify trends, improvements, deteriorations, and overall patterns over time.",
        "",
        "Patient: {$sex}, age {$age}",
        "Number of tests: " . count($allTests),
        "",
        "FULL HISTORY:"
    ];

    foreach ($allTests as $test) {
        $lines[] = "";
        $lines[] = "─── {$test['test_date']} | {$test['lab_name']} ───────────────";
        $results = getTestResults($db, (int) $test['id']);
        $currentCat = null;
        foreach ($results as $r) {
            if ($r['category'] !== $currentCat) {
                $lines[] = "  [{$r['category']}]";
                $currentCat = $r['category'];
            }
            $flag = $r['flag'] ? " [{$r['flag']}]" : '';
            $lines[] = "    {$r['test_name']}: {$r['value_text']} {$r['units']}{$flag}";
        }
    }

    $lines[] = "";
    $lines[] = "Please structure your response with the following sections:";
    $lines[] = "## Overall Health Trajectory";
    $lines[] = "## Notable Trends (what is improving, staying stable, or worsening)";
    $lines[] = "## Key Findings That Warrant Attention";
    $lines[] = "For this section, address EACH persistently abnormal or worsening result individually with three sub-points: what the trend means, likely contributing factors, and practical steps the patient could discuss with their doctor to address it.";
    $lines[] = "## Areas of Concern";
    $lines[] = "## Positive Indicators";
    $lines[] = "## Recommended Discussions with Your Doctor";
    $lines[] = "## Important Note";

    return implode("\n", $lines);
}
