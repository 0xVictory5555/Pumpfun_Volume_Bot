import TelegramBot from 'node-telegram-bot-api';
import { PumpfunVbot } from '../index';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
    connection,
    userKeypair,
    DefaultSlippage,
    DefaultCA,
    DefaultDistributeAmountLamports,
    TELEGRAM_ALLOWED_USER_IDS,
    TELEGRAM_BOT_TOKEN,
} from './config';
import fs from 'fs';

// Add missing constant
const DefaultJitoTipAmountLamports = 1000000; // 0.00001 SOL

// Rate limiting constants
const TELEGRAM_RATE_LIMIT_DELAY = 1000; // 1 second between messages
const TELEGRAM_MAX_RETRIES = 3;
let lastMessageTime = 0;

interface BotConfig {
    solAmount: number;
    tokenAddress: string;
    sleepTime: number;
    isRunning: boolean;
    slippage: number;
}

class TelegramController {
    private bot: TelegramBot;
    private pumpBot: PumpfunVbot | null = null;
    private config: BotConfig = {
        solAmount: DefaultDistributeAmountLamports / LAMPORTS_PER_SOL,
        tokenAddress: DefaultCA,
        sleepTime: 5000,
        isRunning: false,
        slippage: DefaultSlippage,
    };

    constructor() {
        if (!TELEGRAM_BOT_TOKEN) {
            console.error("FATAL: TELEGRAM_BOT_TOKEN is not defined. Bot cannot start.");
            process.exit(1);
        }
        this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
        this.setupCommands();
        console.log("TelegramController initialized. Allowed users:", TELEGRAM_ALLOWED_USER_IDS.join(', ') || "NONE (CRITICAL SECURITY RISK!)");
    }

    private async sendMessageWithRetry(chatId: number, text: string, options?: TelegramBot.SendMessageOptions): Promise<TelegramBot.Message> {
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;

        if (timeSinceLastMessage < TELEGRAM_RATE_LIMIT_DELAY) {
            await new Promise(resolve => setTimeout(resolve, TELEGRAM_RATE_LIMIT_DELAY - timeSinceLastMessage));
        }

        let retries = 0;
        while (retries < TELEGRAM_MAX_RETRIES) {
            try {
                const message = await this.bot.sendMessage(chatId, text, options);
                lastMessageTime = Date.now();
                return message;
            } catch (error: any) {
                if (error.response?.statusCode === 429) {
                    const retryAfter = parseInt(error.response.headers['retry-after']) || 1;
                    console.log(`Rate limited by Telegram. Waiting ${retryAfter} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    retries++;
                } else {
                    throw error;
                }
            }
        }
        throw new Error(`Failed to send message after ${TELEGRAM_MAX_RETRIES} retries`);
    }

    private async editMessageWithRetry(chatId: number, messageId: number, text: string, options?: TelegramBot.EditMessageTextOptions): Promise<TelegramBot.Message | boolean> {
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;

        if (timeSinceLastMessage < TELEGRAM_RATE_LIMIT_DELAY) {
            await new Promise(resolve => setTimeout(resolve, TELEGRAM_RATE_LIMIT_DELAY - timeSinceLastMessage));
        }

        let retries = 0;
        while (retries < TELEGRAM_MAX_RETRIES) {
            try {
                const result = await this.bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
                lastMessageTime = Date.now();
                return result;
            } catch (error: any) {
                if (error.response?.statusCode === 429) {
                    const retryAfter = parseInt(error.response.headers['retry-after']) || 1;
                    console.log(`Rate limited by Telegram. Waiting ${retryAfter} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    retries++;
                } else if (error.message?.includes("message is not modified")) {
                    return true;
                } else {
                    throw error;
                }
            }
        }
        throw new Error(`Failed to edit message after ${TELEGRAM_MAX_RETRIES} retries`);
    }

    private isUserAllowed(userId?: number): boolean {
        if (!userId) return false;
        if (TELEGRAM_ALLOWED_USER_IDS.length === 0) {
            if (process.env.NODE_ENV === 'development_open') {
                console.warn("SECURITY_DEV_ONLY: Bot running in open mode due to NODE_ENV=development_open.");
                return true;
            }
            console.error("CRITICAL: No authorized users configured and not in development_open mode. Denying access.");
            return false;
        }
        return TELEGRAM_ALLOWED_USER_IDS.includes(userId);
    }

    private setupCommands() {
        this.bot.onText(/\/settings/, (msg) => this.handleGenericCommand(msg, this._handleSettingsLogic));
        this.bot.onText(/\/status/, (msg) => this.handleGenericCommand(msg, this._handleStatusLogic));
        this.bot.onText(/\/help/, (msg) => this.handleGenericCommand(msg, this._handleHelpLogic));
        this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
    }

    private async handleGenericCommand(msg: TelegramBot.Message, handler: (msg: TelegramBot.Message) => Promise<void>) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        if (!this.isUserAllowed(userId)) {
            await this.sendMessageWithRetry(chatId, "🚫 You are not authorized to use this bot.");
            console.log(`Unauthorized command attempt by user ID: ${userId} (${msg.text}), chat ID: ${chatId}`);
            return;
        }
        try {
            await handler.call(this, msg);
        } catch (error) {
            console.error(`Error processing command "${msg.text}" for user ${userId}:`, error);
            await this.sendMessageWithRetry(chatId, "🤖 Oops! Something went wrong. Please contact the administrator or check the bot's console logs.");
        }
    }

    private async _handleHelpLogic(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const helpText = `🤖 **Pumpfun Volume Bot Help** 🤖

Use /settings to access the main control panel. From there you can:
-   **Set SOL/Swap**: Amount of SOL each sub-wallet uses per buy/sell cycle.
-   **Set Slippage**: Max price deviation for trades (e.g., 1 for 1%).
-   **Set Token**: The Pump.fun token CA to target.
-   **Set Sleep**: Pause duration (ms) between swap cycles.
-   **Start Bot**: Initiates wallet setup (if needed), SOL distribution, and starts the volume generation loop.
-   **Stop Bot**: Halts the volume generation loop.
-   **Sell All Tokens**: Attempts to sell all target tokens from sub-wallets.
-   **Collect All SOL**: Transfers SOL from sub-wallets back to the main wallet.

Other commands:
/status - Show current bot configuration and running state.
/help - Display this message.

**IMPORTANT:**
- Ensure your main wallet (from \`.env\`) is funded.
- Set \`TELEGRAM_ALLOWED_USER_IDS\` in \`.env\` to restrict access.
- The bot creates \`wallets.json\` and \`lut.json\`. Do not edit them manually unless you know what you're doing.`;

        const keyboard: TelegramBot.InlineKeyboardMarkup = {
            inline_keyboard: [
                [
                    { text: '⚙️ Settings', callback_data: 'settings' },
                    { text: '📊 Status', callback_data: 'status' }
                ]
            ]
        };

        await this.sendMessageWithRetry(chatId, helpText, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }

    private async _handleSettingsLogic(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const tokenDisplay = this.config.tokenAddress
            ? `${this.config.tokenAddress.substring(0, 6)}...${this.config.tokenAddress.substring(this.config.tokenAddress.length - 4)}`
            : 'Not Set';

        const keyboard: TelegramBot.InlineKeyboardMarkup = {
            inline_keyboard: [
                [
                    { text: `💰 SOL/Swap: ${this.config.solAmount.toFixed(4)}`, callback_data: 'set_sol' },
                    { text: `💧 Slippage: ${(this.config.slippage * 100).toFixed(1)}%`, callback_data: 'set_slippage' },
                ],
                [{ text: `🔑 Token: ${tokenDisplay}`, callback_data: 'set_token' }],
                [{ text: `⏱️ Sleep: ${this.config.sleepTime}ms`, callback_data: 'set_time' }],
                [
                    { text: this.config.isRunning ? '⏹️ Bot Running (Stop)' : '▶️ Bot Stopped (Start)', callback_data: this.config.isRunning ? 'stop_bot_op' : 'start_bot_op' },
                ],
                [
                    { text: '💸 Sell All Tokens', callback_data: 'sell_all_tokens' },
                    { text: '📥 Collect All SOL', callback_data: 'collect_all_sol' },
                ],
                [
                    { text: '❓ Help', callback_data: 'help' },
                    { text: '📊 Status', callback_data: 'status' }
                ]
            ]
        };
        const messageText = this.config.isRunning
            ? '⚙️ **Bot Settings (Currently RUNNING)** ⚙️'
            : '⚙️ **Bot Settings (Currently STOPPED)** ⚙️';

        try {
            if ('message_id' in msg && this.bot && typeof this.bot.editMessageText === 'function') {
                try {
                    await this.editMessageWithRetry(chatId, msg.message_id, messageText, {
                        parse_mode: "Markdown",
                        reply_markup: keyboard,
                    });
                } catch (e: any) {
                    if (e.message && e.message.includes("message can't be edited")) {
                        // If message can't be edited, send a new one
                        await this.sendMessageWithRetry(chatId, messageText, {
                            reply_markup: keyboard,
                            parse_mode: "Markdown"
                        });
                    } else {
                        console.error("Error editing settings message:", e);
                        // Send a new message as fallback
                        await this.sendMessageWithRetry(chatId, messageText, {
                            reply_markup: keyboard,
                            parse_mode: "Markdown"
                        });
                    }
                }
            } else {
                await this.sendMessageWithRetry(chatId, messageText, { reply_markup: keyboard, parse_mode: "Markdown" });
            }
        } catch (error) {
            console.error("Error in settings logic:", error);
            // Final fallback - send a simple message
            await this.sendMessageWithRetry(chatId, "Error updating settings. Please try /settings again.");
        }
    }

    private async handleCallbackQuery(callbackQuery: TelegramBot.CallbackQuery) {
        const chatId = callbackQuery.message?.chat.id;
        const userId = callbackQuery.from.id;
        const originalMessage = callbackQuery.message;

        if (!chatId || !originalMessage) {
            console.error("Callback query without chat ID or message:", callbackQuery);
            if (callbackQuery.id) await this.bot.answerCallbackQuery(callbackQuery.id, { text: "Error: Message context missing." });
            return;
        }
        if (!this.isUserAllowed(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: "🚫 Unauthorized" });
            await this.sendMessageWithRetry(chatId, "🚫 You are not authorized for this action.");
            console.log(`Unauthorized callback query by user ID: ${userId}, data: ${callbackQuery.data}`);
            return;
        }

        const data = callbackQuery.data;
        if (!data) {
            await this.bot.answerCallbackQuery(callbackQuery.id);
            return;
        }

        await this.bot.answerCallbackQuery(callbackQuery.id);

        try {
            let requiresSettingsUpdate = false;
            switch (data) {
                case 'settings':
                    await this._handleSettingsLogic(originalMessage);
                    break;
                case 'help':
                    await this._handleHelpLogic(originalMessage);
                    break;
                case 'status':
                    await this._handleStatusLogic(originalMessage);
                    break;
                case 'set_sol':
                    await this.sendMessageWithRetry(chatId, 'Enter SOL amount per sub-wallet (e.g., 0.005):');
                    this.bot.once('message', async (responseMsg) => {
                        if (responseMsg.chat.id === chatId && this.isUserAllowed(responseMsg.from?.id)) {
                            const amount = parseFloat(responseMsg.text || '');
                            if (!isNaN(amount) && amount > 0.004 && amount < 10) {
                                this.config.solAmount = amount;
                                await this.sendMessageWithRetry(chatId, `✅ SOL amount set to ${amount}`);
                            } else {
                                await this.sendMessageWithRetry(chatId, '❌ Invalid amount. (e.g. 0.005,  min 0.004 And max 10).');
                            }
                            await this._handleSettingsLogic(originalMessage);
                        }
                    });
                    break;

                case 'set_slippage':
                    await this.sendMessageWithRetry(chatId, 'Enter slippage % (e.g., 0.5 for 0.5%, max 50%):');
                    this.bot.once('message', async (responseMsg) => {
                        if (responseMsg.chat.id === chatId && this.isUserAllowed(responseMsg.from?.id)) {
                            const percentage = parseFloat(responseMsg.text || '');
                            if (!isNaN(percentage) && percentage >= 0.1 && percentage <= 50) {
                                this.config.slippage = percentage / 100;
                                await this.sendMessageWithRetry(chatId, `✅ Slippage set to ${percentage}%`);
                            } else {
                                await this.sendMessageWithRetry(chatId, '❌ Invalid slippage. Enter between 0.1 and 50.');
                            }
                            await this._handleSettingsLogic(originalMessage);
                        }
                    });
                    break;

                case 'set_token':
                    await this.sendMessageWithRetry(chatId, 'Enter the Pump.fun token address:');
                    this.bot.once('message', async (responseMsg) => {
                        if (responseMsg.chat.id === chatId && this.isUserAllowed(responseMsg.from?.id)) {
                            const tokenAddress = responseMsg.text?.trim();
                            if (tokenAddress && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress)) {
                                await this.sendMessageWithRetry(chatId, `⏳ Validating token ...`);
                                try {
                                    const tempBot = new PumpfunVbot(tokenAddress, 0, 0);
                                    await tempBot.getPumpData();
                                    this.config.tokenAddress = tokenAddress;
                                    await this.sendMessageWithRetry(chatId, `✅ Token: ${tokenAddress}\n  SOL: ${(tempBot.virtualSolReserves / LAMPORTS_PER_SOL).toFixed(6)}\n  Tokens: ${tempBot.virtualTokenReserves?.toLocaleString() || '0'}`);
                                } catch (error: any) {
                                    console.error("Token validation error:", error);
                                    await this.sendMessageWithRetry(chatId, `❌ Invalid or non-Pump.fun token: ${error.message || 'Unknown validation error.'}`);
                                }
                            } else {
                                await this.sendMessageWithRetry(chatId, '❌ Invalid token address format.');
                            }
                            await this._handleSettingsLogic(originalMessage);
                        }
                    });
                    break;

                case 'set_time':
                    await this.sendMessageWithRetry(chatId, 'Enter sleep time in milliseconds (e.g., 3000, min 1000ms):');
                    this.bot.once('message', async (responseMsg) => {
                        if (responseMsg.chat.id === chatId && this.isUserAllowed(responseMsg.from?.id)) {
                            const time = parseInt(responseMsg.text || '');
                            if (!isNaN(time) && time >= 1000) {
                                this.config.sleepTime = time;
                                await this.sendMessageWithRetry(chatId, `✅ Sleep time set to ${time}ms`);
                            } else {
                                await this.sendMessageWithRetry(chatId, '❌ Invalid time. Enter a number >= 1000.');
                            }
                            await this._handleSettingsLogic(originalMessage);
                        }
                    });
                    break;

                case 'start_bot_op':
                    await this._startBotLogic(originalMessage);
                    requiresSettingsUpdate = true;
                    break;

                case 'stop_bot_op':
                    await this._stopBotLogic(originalMessage);
                    requiresSettingsUpdate = true;
                    break;

                case 'sell_all_tokens':
                    await this.sellAllTokens(originalMessage);
                    break;

                case 'collect_all_sol':
                    await this.collectAllSol(originalMessage);
                    break;
            }
            if (requiresSettingsUpdate) {
                await this._handleSettingsLogic(originalMessage);
            }
        } catch (error) {
            console.error(`Error in callback query handler (data: ${data}):`, error);
            await this.sendMessageWithRetry(chatId, "🤖 An error occurred while processing your request.");
        }
    }

    private async _startBotLogic(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;

        if (this.config.isRunning) {
            await this.sendMessageWithRetry(chatId, '⚠️ Bot is already running!');
            return;
        }
        if (!this.config.tokenAddress || (this.config.tokenAddress === DefaultCA && DefaultCA.includes("YOUR_DEFAULT"))) {
            await this.sendMessageWithRetry(chatId, '⚠️ Token address not set or is placeholder. Configure in /settings.');
            return;
        }
        if (this.config.solAmount <= 0) {
            await this.sendMessageWithRetry(chatId, '⚠️ SOL Amount per swap not set or invalid. Configure in /settings.');
            return;
        }
        if (this.config.slippage <= 0 || this.config.slippage > 0.5) {
            await this.sendMessageWithRetry(chatId, `⚠️ Slippage is ${(this.config.slippage * 100).toFixed(1)}%. Must be > 0% and <= 50%. Configure in /settings.`);
            return;
        }

        try {
            const mainWalletBalance = await connection.getBalance(userKeypair.publicKey);
            const numWalletsToFund = 10;
            const estimatedCost = (0.02 * LAMPORTS_PER_SOL) + (this.config.solAmount * numWalletsToFund * LAMPORTS_PER_SOL) + (DefaultJitoTipAmountLamports * 5);
            if (mainWalletBalance < estimatedCost) {
                await this.sendMessageWithRetry(chatId, `⚠️ Insufficient main wallet balance. Need ~${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} SOL for setup and initial distribution. Current: ${(mainWalletBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`);
                return;
            }

            this.config.isRunning = true;
            await this.sendMessageWithRetry(chatId, '🚀 Initializing bot operations...');

            this.pumpBot = new PumpfunVbot(
                this.config.tokenAddress,
                this.config.solAmount * LAMPORTS_PER_SOL,
                this.config.slippage
            );

            await this.sendMessageWithRetry(chatId, 'Fetching token data...');
            await this.pumpBot.getPumpData();
            await this.sendMessageWithRetry(chatId, `✅ Token: ${this.config.tokenAddress.substring(0, 6)}... | SOL: ${(this.pumpBot.virtualSolReserves / LAMPORTS_PER_SOL).toFixed(4)} | Tokens: ${this.pumpBot.virtualTokenReserves.toLocaleString()}`);

            if (!fs.existsSync('wallets.json')) {
                await this.sendMessageWithRetry(chatId, 'wallets.json not found. Creating new wallets...');
                this.pumpBot.createWallets();
            }
            this.pumpBot.loadWallets();
            await this.sendMessageWithRetry(chatId, `✅ Loaded ${this.pumpBot.keypairs.length} wallets.`);

            if (!fs.existsSync('./lut.json')) {
                await this.sendMessageWithRetry(chatId, 'LUT.json not found. Creating new Lookup Table (can take ~30s)...');
                await this.pumpBot.createLUT();
                await this.sendMessageWithRetry(chatId, '✅ New LUT created.');
            } else {
                await this.pumpBot.loadLUT();
                if (!this.pumpBot.lookupTableAccount) {
                    await this.sendMessageWithRetry(chatId, 'Failed to load LUT from file, attempting to create a new one (can take ~30s)...');
                    await this.pumpBot.createLUT();
                    //await this.sendMessageWithRetry(chatId, '✅ New LUT created after load failure.');
                } else {
                    //await this.sendMessageWithRetry(chatId, '✅ Existing LUT loaded.');
                }
            }

            //await this.sendMessageWithRetry(chatId, 'Extending Lookup Table if necessary (can take ~30s per transaction)...');
            await this.pumpBot.extendLUT();
            // await this.sendMessageWithRetry(chatId, '✅ LUT extension process complete.');

            // await this.sendMessageWithRetry(chatId, `Distributing ${this.config.solAmount} SOL to each sub-wallet...`);
            await this.pumpBot.distributeSOL();
            await this.sendMessageWithRetry(chatId, '✅ SOL distribution complete.');

            await this.sendMessageWithRetry(chatId, `🔄 Starting swap operations. Sleep time: ${this.config.sleepTime}ms. Slippage: ${(this.config.slippage * 100).toFixed(1)}%`);

            (async () => {
                while (this.config.isRunning && this.pumpBot) {
                    try {
                        // if(!this.pumpBot)
                        // return;
                        await this.pumpBot.swap();
                        await this.sendMessageWithRetry(chatId, `Cycle complete. Sleeping for ${this.config.sleepTime / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, this.config.sleepTime));
                    } catch (loopError: any) {
                        console.error("Error in swap loop:", loopError);
                        await this.sendMessageWithRetry(chatId, `⚠️ Error during swap cycle: ${loopError.message}. Check console. Pausing for 10s.`);
                        await new Promise(resolve => setTimeout(resolve, 10000));
                    }
                }
                if (!this.config.isRunning) {
                    await this.sendMessageWithRetry(chatId, 'ℹ️ Bot loop has been stopped.');
                }
            })();

        } catch (error: unknown) {
            this.config.isRunning = false;
            console.error("Error during bot start logic:", error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            await this.sendMessageWithRetry(chatId, `❌ Error starting bot: ${errorMessage}. See console for details.`);
        }
    }

    private async _stopBotLogic(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        if (!this.config.isRunning) {
            await this.sendMessageWithRetry(chatId, '⚠️ Bot is not currently running.');
            return;
        }
        this.config.isRunning = false;
        await this.sendMessageWithRetry(chatId, '🛑 Stopping bot operations... Loop will finish current cycle if active, then halt.');
    }

    private async collectAllSol(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        await this.sendMessageWithRetry(chatId, '💰 Collect SOL from sub-wallets to main wallet...');
        if (this.config.isRunning) {
            await this.sendMessageWithRetry(chatId, '⚠️ Bot is running. Please stop it first via /settings before collecting SOL.');
            return;
        }

        try {
            // if (!this.config.tokenAddress || (this.config.tokenAddress === DefaultCA && DefaultCA.includes("YOUR_DEFAULT"))) {
            //     await this.sendMessageWithRetry(chatId, '⚠️ Token address not set or is placeholder. Configure in /settings before collecting SOL.');
            //     return;
            // }
            if (!this.pumpBot) {
                this.pumpBot = new PumpfunVbot(
                    this.config.tokenAddress,
                    this.config.solAmount * LAMPORTS_PER_SOL,
                    this.config.slippage
                );
            }
            if (!this.pumpBot.keypairs || this.pumpBot.keypairs.length === 0) {
                if (!fs.existsSync('wallets.json')) {
                    await this.sendMessageWithRetry(chatId, '⚠️ wallets.json not found. Cannot collect SOL.'); return;
                }
                this.pumpBot.loadWallets();
            }

            if (!this.pumpBot.lookupTableAccount) {
                if (!fs.existsSync('./lut.json')) {
                    await this.sendMessageWithRetry(chatId, '⚠️ LUT.json not found. Cannot collect SOL efficiently.'); return;
                }
                await this.pumpBot.loadLUT();
                if (!this.pumpBot.lookupTableAccount) {
                    await this.sendMessageWithRetry(chatId, '⚠️ Failed to load LUT. Cannot collect SOL.'); return;
                }
            }


            await this.pumpBot.collectSOL();
            await this.sendMessageWithRetry(chatId, '✅ SOL collection complete successfully.');
        } catch (error: unknown) {
            console.error("Error during SOL collection:", error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            await this.sendMessageWithRetry(chatId, `⚠️ Error collecting SOL: ${errorMessage}. See console.`);
        }
    }

    private async sellAllTokens(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        await this.sendMessageWithRetry(chatId, '💸 Attempting to sell all tokens from sub-wallets...');

        if (this.config.isRunning) {
            await this.sendMessageWithRetry(chatId, '⚠️ Bot is currently running swaps. Please stop it first via /settings to sell all tokens.');
            return;
        }
        if (!this.config.tokenAddress || (this.config.tokenAddress === DefaultCA && DefaultCA.includes("YOUR_DEFAULT"))) {
            await this.sendMessageWithRetry(chatId, '⚠️ Token address not set or is placeholder. Configure in /settings before selling.');
            return;
        }

        try {
            if (!this.pumpBot || this.pumpBot.mint.toBase58() !== this.config.tokenAddress) {
                this.pumpBot = new PumpfunVbot(
                    this.config.tokenAddress,
                    0,
                    this.config.slippage
                );
            }

            // await this.sendMessageWithRetry(chatId, 'Fetching latest token data for selling...');
            await this.pumpBot.getPumpData();

            if (!fs.existsSync('wallets.json')) {
                await this.sendMessageWithRetry(chatId, '⚠️ wallets.json not found. Cannot proceed.');
                return;
            }
            this.pumpBot.loadWallets();

            if (!fs.existsSync('./lut.json')) {
                await this.sendMessageWithRetry(chatId, '⚠️ LUT.json not found. Cannot proceed with efficient selling.');
                return;
            }
            await this.pumpBot.loadLUT();
            if (!this.pumpBot.lookupTableAccount) {
                await this.sendMessageWithRetry(chatId, '⚠️ Failed to load LUT. Cannot proceed.');
                return;
            }

            await this.pumpBot.sellAllTokensFromWallets();
            await this.sendMessageWithRetry(chatId, '✅ Sell All Tokens process initiated. Check console for Jito bundle status.');
            await this.sendMessageWithRetry(chatId, 'ℹ️ After selling, you might want to use "Collect All SOL" from settings.');

        } catch (error: unknown) {
            console.error("Error during Sell All Tokens:", error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            await this.sendMessageWithRetry(chatId, `⚠️ Error selling tokens: ${errorMessage}. See console.`);
        }
    }

    private async _handleStatusLogic(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        let mainWalletSol = "N/A";
        try {
            const balance = await connection.getBalance(userKeypair.publicKey);
            mainWalletSol = (balance / LAMPORTS_PER_SOL).toFixed(5) + " SOL";
        } catch (e) { console.error("Failed to get main wallet balance for status:", e); }

        const tokenDisplay = this.config.tokenAddress
            ? `${this.config.tokenAddress.substring(0, 6)}...${this.config.tokenAddress.substring(this.config.tokenAddress.length - 4)}`
            : 'Not set';

        const status = `🤖 **Bot Status & Config** 🤖
-----------------------------------
- Running: ${this.config.isRunning ? '✅ Active' : '❌ Idle'}
- Target Token: \`${tokenDisplay}\`
- SOL/Swap Cycle: \`${this.config.solAmount.toFixed(4)} SOL\`
- Slippage: \`${(this.config.slippage * 100).toFixed(1)}%\`
- Cycle Sleep: \`${this.config.sleepTime}ms\`
- Main Wallet: \`${mainWalletSol}\`
- Authorized Users: \`${TELEGRAM_ALLOWED_USER_IDS.join(', ') || "ANYONE (CRITICAL SECURITY RISK!)"}\`
-----------------------------------`;
        await this.sendMessageWithRetry(chatId, status, { parse_mode: "Markdown" });
    }
}

export default TelegramController;