<?php
// CORS headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Telegram credentials (hidden from client)
$botToken = getenv('TG_BOT_TOKEN'); // токен убран из репозитория
$chatId = '103774697';

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || empty($input['name']) || empty($input['phone'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields']);
    exit;
}

// Sanitize input
$name = htmlspecialchars(strip_tags($input['name']), ENT_QUOTES, 'UTF-8');
$phone = htmlspecialchars(strip_tags($input['phone']), ENT_QUOTES, 'UTF-8');
$email = htmlspecialchars(strip_tags($input['email'] ?? '—'), ENT_QUOTES, 'UTF-8');
$projectType = htmlspecialchars(strip_tags($input['projectType'] ?? '—'), ENT_QUOTES, 'UTF-8');
$task = htmlspecialchars(strip_tags($input['task'] ?? '—'), ENT_QUOTES, 'UTF-8');

// Rate limiting (simple file-based)
$ip = $_SERVER['REMOTE_ADDR'];
$rateLimitFile = sys_get_temp_dir() . '/form_rate_' . md5($ip);
$now = time();

if (file_exists($rateLimitFile)) {
    $lastSubmit = (int)file_get_contents($rateLimitFile);
    if ($now - $lastSubmit < 60) { // 1 minute cooldown
        http_response_code(429);
        echo json_encode(['error' => 'Too many requests']);
        exit;
    }
}
file_put_contents($rateLimitFile, $now);

// Build message
$message = "📩 Новая заявка с сайта\n\n";
$message .= "👤 Имя: {$name}\n";
$message .= "📞 Телефон: {$phone}\n";
$message .= "📧 Email: {$email}\n";
$message .= "📋 Тип проекта: {$projectType}\n";
$message .= "💬 Задача: {$task}";

// Send to Telegram
$url = "https://api.telegram.org/bot{$botToken}/sendMessage";
$data = [
    'chat_id' => $chatId,
    'text' => $message,
    'parse_mode' => 'HTML'
];

$options = [
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode($data),
        'timeout' => 10
    ]
];

$context = stream_context_create($options);
$result = @file_get_contents($url, false, $context);

if ($result === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to send message']);
    exit;
}

echo json_encode(['success' => true]);
