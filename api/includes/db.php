<?php
/**
 * Database Connection - Weave Application
 * 
 * Provides a PDO connection to MySQL using XAMPP defaults.
 * Usage: require_once 'includes/db.php'; $pdo = getConnection();
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'weave_db');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

/**
 * Returns a PDO instance connected to the MySQL database.
 * Sets error mode to exceptions and default fetch mode to associative arrays.
 *
 * @return PDO
 */
function getConnection() {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'error'   => 'Database connection failed. Please ensure MySQL is running.'
            ]);
            exit;
        }
    }

    return $pdo;
}
