<?php
/**
 * HealthVault – Data Access Functions
 *
 * Single source of truth for all database interactions.
 * Called by both index.php (pre-render) and all API endpoints.
 *
 * @package HealthVault
 */

/**
 * Return all blood test sessions for a user, newest first.
 *
 * @param PDO $db
 * @param int $userId
 * @return array
 */
function getBloodTestList(PDO $db, int $userId): array
{
    $stmt = $db->prepare("
        SELECT
            bt.id,
            bt.test_date,
            bt.lab_name,
            bt.referring_doctor,
            bt.lab_reference,
            bt.notes,
            COUNT(tr.id)                                        AS result_count,
            SUM(tr.flag IS NOT NULL AND tr.flag != '')          AS abnormal_count
        FROM blood_tests bt
        LEFT JOIN test_results tr ON tr.blood_test_id = bt.id
        WHERE bt.user_id = :uid
        GROUP BY bt.id
        ORDER BY bt.test_date DESC
    ");
    $stmt->execute(['uid' => $userId]);
    return $stmt->fetchAll();
}

/**
 * Return a single blood test session with all its results.
 *
 * @param PDO $db
 * @param int $bloodTestId
 * @param int $userId  Ownership check.
 * @return array|null  Null if not found or not owned by user.
 */
function getBloodTest(PDO $db, int $bloodTestId, int $userId): ?array
{
    $stmt = $db->prepare("
        SELECT * FROM blood_tests
        WHERE id = :id AND user_id = :uid
    ");
    $stmt->execute(['id' => $bloodTestId, 'uid' => $userId]);
    $test = $stmt->fetch();
    if (!$test) {
        return null;
    }

    $test['results'] = getTestResults($db, $bloodTestId);
    return $test;
}

/**
 * Return all test results for a blood test session, with encyclopedia metadata merged in.
 *
 * @param PDO $db
 * @param int $bloodTestId
 * @return array
 */
function getTestResults(PDO $db, int $bloodTestId): array
{
    $stmt = $db->prepare("
        SELECT * FROM test_results
        WHERE blood_test_id = :id
        ORDER BY test_code
    ");
    $stmt->execute(['id' => $bloodTestId]);
    $rows = $stmt->fetchAll();

    $encyclopedia = require __DIR__ . '/encyclopedia.php';

    foreach ($rows as &$row) {
        $code = $row['test_code'];
        if (isset($encyclopedia[$code])) {
            $e = $encyclopedia[$code];
            $row['test_name']  = $e['name'];
            $row['short_name'] = $e['short_name'];
            $row['category']   = $e['category'];
            $row['sort_order'] = $e['sort_order'];
            $row['decimals']   = $e['decimals'];
        } else {
            $row['test_name']  = $code;
            $row['short_name'] = $code;
            $row['category']   = 'Other';
            $row['sort_order'] = 999;
            $row['decimals']   = 2;
        }
        $row['status'] = deriveResultStatus($row);
    }
    unset($row);

    // Sort by category sort order then individual sort order
    usort($rows, fn($a, $b) => $a['sort_order'] <=> $b['sort_order']);

    return $rows;
}

/**
 * Return trend data for a specific test code across all of a user's blood tests.
 *
 * @param PDO $db
 * @param int $userId
 * @param string $testCode
 * @return array
 */
function getTestTrend(PDO $db, int $userId, string $testCode): array
{
    $encyclopedia = require __DIR__ . '/encyclopedia.php';
    $meta = $encyclopedia[$testCode] ?? null;

    $stmt = $db->prepare("
        SELECT
            tr.id,
            tr.blood_test_id,
            bt.test_date,
            tr.value_numeric,
            tr.value_text,
            tr.flag,
            tr.ref_range_low,
            tr.ref_range_high,
            tr.ref_range_text,
            tr.units
        FROM test_results tr
        JOIN blood_tests bt ON bt.id = tr.blood_test_id
        WHERE bt.user_id = :uid
          AND tr.test_code = :code
        ORDER BY bt.test_date ASC
    ");
    $stmt->execute(['uid' => $userId, 'code' => $testCode]);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['status'] = deriveResultStatus($row);
    }
    unset($row);

    return [
        'test_code' => $testCode,
        'test_name' => $meta['name'] ?? $testCode,
        'short_name' => $meta['short_name'] ?? $testCode,
        'category'  => $meta['category'] ?? 'Other',
        'units'     => $meta['units'] ?? '',
        'decimals'  => $meta['decimals'] ?? 2,
        'ref_low'   => $meta['ref_low'] ?? null,
        'ref_high'  => $meta['ref_high'] ?? null,
        'ref_text'  => $meta['ref_text'] ?? '',
        'description' => $meta['description'] ?? '',
        'why_done'    => $meta['why_done'] ?? '',
        'what_shows'  => $meta['what_shows'] ?? '',
        'low_meaning' => $meta['low_meaning'] ?? '',
        'high_meaning' => $meta['high_meaning'] ?? '',
        'data'      => $rows,
    ];
}

/**
 * Return trend data for all test codes that have results for a user.
 * Grouped by category, suitable for the trends overview.
 *
 * @param PDO $db
 * @param int $userId
 * @return array  Keys are category names; values are arrays of trend objects.
 */
function getAllTrends(PDO $db, int $userId): array
{
    $stmt = $db->prepare("
        SELECT DISTINCT tr.test_code
        FROM test_results tr
        JOIN blood_tests bt ON bt.id = tr.blood_test_id
        WHERE bt.user_id = :uid
        ORDER BY tr.test_code
    ");
    $stmt->execute(['uid' => $userId]);
    $codes = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $encyclopedia = require __DIR__ . '/encyclopedia.php';
    $grouped = [];

    foreach ($codes as $code) {
        $trend = getTestTrend($db, $userId, $code);
        $cat   = $trend['category'];
        if (!isset($grouped[$cat])) {
            $grouped[$cat] = [];
        }
        $grouped[$cat][] = $trend;
    }

    return $grouped;
}

/**
 * Return all encyclopedia entries for test codes the user actually has results for.
 *
 * @param PDO $db
 * @param int $userId
 * @return array
 */
function getUserEncyclopedia(PDO $db, int $userId): array
{
    $stmt = $db->prepare("
        SELECT DISTINCT tr.test_code
        FROM test_results tr
        JOIN blood_tests bt ON bt.id = tr.blood_test_id
        WHERE bt.user_id = :uid
    ");
    $stmt->execute(['uid' => $userId]);
    $codes = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));

    $encyclopedia = require __DIR__ . '/encyclopedia.php';

    $result = [];
    foreach ($encyclopedia as $code => $entry) {
        if (!isset($codes[$code])) {
            continue;
        }
        $result[$code] = $entry;
    }

    // Sort by category sort order then name
    uasort($result, function ($a, $b) {
        if ($a['category'] !== $b['category']) {
            return $a['sort_order'] <=> $b['sort_order'];
        }
        return $a['sort_order'] <=> $b['sort_order'];
    });

    return $result;
}

/**
 * Return the latest blood test with all results for pre-rendering the dashboard.
 *
 * @param PDO $db
 * @param int $userId
 * @return array|null
 */
function getLatestBloodTest(PDO $db, int $userId): ?array
{
    $stmt = $db->prepare("
        SELECT id FROM blood_tests
        WHERE user_id = :uid
        ORDER BY test_date DESC
        LIMIT 1
    ");
    $stmt->execute(['uid' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    return getBloodTest($db, (int) $row['id'], $userId);
}

/**
 * Upsert a test result within a blood test session.
 *
 * @param PDO    $db
 * @param int    $bloodTestId
 * @param string $testCode
 * @param array  $data  Keys: value_numeric, value_text, flag, ref_range_low, ref_range_high, ref_range_text, units
 * @return int   The result row ID.
 */
function upsertTestResult(PDO $db, int $bloodTestId, string $testCode, array $data): int
{
    $stmt = $db->prepare("
        INSERT INTO test_results
            (blood_test_id, test_code, value_numeric, value_text, flag, ref_range_low, ref_range_high, ref_range_text, units)
        VALUES
            (:btid, :code, :vnum, :vtxt, :flag, :rlow, :rhigh, :rtext, :units)
        ON DUPLICATE KEY UPDATE
            value_numeric  = VALUES(value_numeric),
            value_text     = VALUES(value_text),
            flag           = VALUES(flag),
            ref_range_low  = VALUES(ref_range_low),
            ref_range_high = VALUES(ref_range_high),
            ref_range_text = VALUES(ref_range_text),
            units          = VALUES(units)
    ");
    $stmt->execute([
        'btid'   => $bloodTestId,
        'code'   => $testCode,
        'vnum'   => $data['value_numeric'] ?? null,
        'vtxt'   => $data['value_text'] ?? null,
        'flag'   => $data['flag'] ?? null,
        'rlow'   => $data['ref_range_low'] ?? null,
        'rhigh'  => $data['ref_range_high'] ?? null,
        'rtext'  => $data['ref_range_text'] ?? null,
        'units'  => $data['units'] ?? null,
    ]);
    return (int) $db->lastInsertId();
}

/**
 * Create a new blood test session.
 *
 * @param PDO    $db
 * @param int    $userId
 * @param array  $data  Keys: test_date, lab_name, referring_doctor, lab_reference, notes
 * @return int   New blood_test id.
 */
function createBloodTest(PDO $db, int $userId, array $data): int
{
    $stmt = $db->prepare("
        INSERT INTO blood_tests (user_id, test_date, lab_name, referring_doctor, lab_reference, notes)
        VALUES (:uid, :date, :lab, :doctor, :labref, :notes)
    ");
    $stmt->execute([
        'uid'    => $userId,
        'date'   => $data['test_date'],
        'lab'    => $data['lab_name'] ?? null,
        'doctor' => $data['referring_doctor'] ?? null,
        'labref' => $data['lab_reference'] ?? null,
        'notes'  => $data['notes'] ?? null,
    ]);
    return (int) $db->lastInsertId();
}

/**
 * Delete a blood test session (cascade deletes results).
 *
 * @param PDO $db
 * @param int $bloodTestId
 * @param int $userId  Ownership check.
 * @return bool
 */
function deleteBloodTest(PDO $db, int $bloodTestId, int $userId): bool
{
    $stmt = $db->prepare("DELETE FROM blood_tests WHERE id = :id AND user_id = :uid");
    $stmt->execute(['id' => $bloodTestId, 'uid' => $userId]);
    return $stmt->rowCount() > 0;
}

/**
 * Look up a cached AI analysis.
 *
 * @param PDO    $db
 * @param string $hash  SHA-256 of the prompt content.
 * @return array|null
 */
function getCachedAnalysis(PDO $db, string $hash): ?array
{
    $stmt = $db->prepare("SELECT * FROM ai_analyses WHERE prompt_hash = :h");
    $stmt->execute(['h' => $hash]);
    return $stmt->fetch() ?: null;
}

/**
 * Save a new AI analysis response.
 *
 * @param PDO    $db
 * @param int    $userId
 * @param int|null $bloodTestId
 * @param string $type  'single' or 'history'
 * @param string $hash
 * @param string $responseText
 * @param int    $tokens
 * @return int
 */
function saveAnalysis(PDO $db, int $userId, ?int $bloodTestId, string $type, string $hash, string $responseText, int $tokens): int
{
    $stmt = $db->prepare("
        INSERT INTO ai_analyses (user_id, blood_test_id, analysis_type, prompt_hash, response_text, tokens_used)
        VALUES (:uid, :btid, :type, :hash, :resp, :tok)
        ON DUPLICATE KEY UPDATE
            response_text = VALUES(response_text),
            tokens_used   = VALUES(tokens_used)
    ");
    $stmt->execute([
        'uid'  => $userId,
        'btid' => $bloodTestId,
        'type' => $type,
        'hash' => $hash,
        'resp' => $responseText,
        'tok'  => $tokens,
    ]);
    return (int) $db->lastInsertId();
}

/**
 * Derive a result status string (normal, low, high) from a result row.
 *
 * @param array $row
 * @return string  'normal', 'low', 'high', or 'unknown'
 */
function deriveResultStatus(array $row): string
{
    $flag = strtoupper(trim($row['flag'] ?? ''));

    if ($flag === 'L' || $flag === 'LL') {
        return 'low';
    }
    if ($flag === 'H' || $flag === 'HH') {
        return 'high';
    }
    if ($flag === '') {
        // No lab flag – compute from numeric value and range
        $val  = isset($row['value_numeric']) ? (float) $row['value_numeric'] : null;
        $lo   = isset($row['ref_range_low'])  ? (float) $row['ref_range_low']  : null;
        $hi   = isset($row['ref_range_high']) ? (float) $row['ref_range_high'] : null;

        if ($val === null) {
            return 'unknown';
        }
        if ($lo !== null && $val < $lo) {
            return 'low';
        }
        if ($hi !== null && $val > $hi) {
            return 'high';
        }
        if ($lo !== null || $hi !== null) {
            return 'normal';
        }
    }

    return 'unknown';
}

/**
 * Format trend data into a plain-text summary for AI prompts.
 *
 * @param array $allBloodTests  List returned by getBloodTestList().
 * @param PDO   $db
 * @param int   $userId
 * @return string
 */
function formatHistoryForAI(array $allBloodTests, PDO $db, int $userId): string
{
    $lines = ["BLOOD TEST HISTORY SUMMARY\n"];

    foreach ($allBloodTests as $test) {
        $lines[] = "Date: {$test['test_date']} | Lab: {$test['lab_name']}";
        $results = getTestResults($db, (int) $test['id']);
        foreach ($results as $r) {
            $flag  = $r['flag'] ? " [{$r['flag']}]" : '';
            $range = $r['ref_range_text'] ?? '';
            $lines[] = "  {$r['test_name']}: {$r['value_text']} {$r['units']}{$flag} ref{$range}";
        }
        $lines[] = '';
    }

    return implode("\n", $lines);
}
