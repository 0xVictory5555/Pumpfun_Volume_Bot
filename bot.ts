import TelegramController from './src/telegram';

console.log('Starting Telegram bot controller...');
// Ensure TELEGRAM_BOT_TOKEN and other necessary env vars are loaded before this
// (dotenv is called in config.ts, which telegram.ts imports)
try {
    const telegramController = new TelegramController();
    console.log('Telegram bot is running. Send /help to get started (if authorized).');
} catch (error) {
    console.error("Failed to initialize TelegramController:", error);
    process.exit(1);
}