-- HealthVault – Database Schema
-- Medical blood test results tracking application.
-- Run via tools/setup-db.php

-- Blood test sessions (one record per pathology visit/report)
CREATE TABLE IF NOT EXISTS `blood_tests` (
    `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id`          INT UNSIGNED NOT NULL,
    `test_date`        DATE NOT NULL,
    `lab_name`         VARCHAR(200) NULL,
    `referring_doctor` VARCHAR(200) NULL,
    `lab_reference`    VARCHAR(100) NULL,
    `notes`            TEXT NULL,
    `created_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_user_date` (`user_id`, `test_date` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Individual test measurements within a blood test session
CREATE TABLE IF NOT EXISTS `test_results` (
    `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `blood_test_id`   INT UNSIGNED NOT NULL,
    `test_code`       VARCHAR(50) NOT NULL,
    `value_numeric`   DECIMAL(12,4) NULL,
    `value_text`      VARCHAR(100) NULL,
    `flag`            VARCHAR(5) NULL COMMENT 'L, H, LL, HH or empty',
    `ref_range_low`   DECIMAL(12,4) NULL,
    `ref_range_high`  DECIMAL(12,4) NULL,
    `ref_range_text`  VARCHAR(100) NULL,
    `units`           VARCHAR(50) NULL,
    `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`blood_test_id`) REFERENCES `blood_tests`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uq_test_result` (`blood_test_id`, `test_code`),
    INDEX `idx_test_code` (`test_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cached AI analysis responses to avoid redundant API calls
CREATE TABLE IF NOT EXISTS `ai_analyses` (
    `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id`       INT UNSIGNED NOT NULL,
    `blood_test_id` INT UNSIGNED NULL COMMENT 'NULL means full history analysis',
    `analysis_type` ENUM('single','history') DEFAULT 'single',
    `prompt_hash`   VARCHAR(64) NOT NULL,
    `response_text` LONGTEXT NULL,
    `tokens_used`   INT UNSIGNED NULL,
    `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_prompt_hash` (`prompt_hash`),
    INDEX `idx_user_analyses` (`user_id`, `blood_test_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
