<?php
// Router for PHP built-in development server
// Blocks access to sensitive directories

$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);

// Block access to sensitive directories
$blocked = ['/data/', '/.git/', '/.kiro/'];
foreach ($blocked as $dir) {
    if (strpos($path, $dir) === 0) {
        http_response_code(403);
        echo 'Forbidden';
        return true;
    }
}

// Let PHP's built-in server handle everything else
return false;
