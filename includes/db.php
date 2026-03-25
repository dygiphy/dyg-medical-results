<?php
/**
 * HealthVault – Database Connection (PDO Singleton)
 *
 * Provides a single shared PDO connection for the application.
 * Config must be loaded (via config.php) before calling getDb().
 *
 * @package HealthVault
 */

/**
 * Return the shared PDO database connection.
 *
 * @return PDO
 * @throws RuntimeException if the connection cannot be established.
 */
function getDb(): PDO
{
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        DB_HOST,
        DB_PORT,
        DB_NAME,
        DB_CHARSET
    );

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        $msg = APP_DEBUG ? $e->getMessage() : 'Database connection failed.';
        throw new RuntimeException($msg);
    }

    return $pdo;
}
