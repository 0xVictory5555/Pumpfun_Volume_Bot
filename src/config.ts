import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import base58 from "bs58";
import dotenv from "dotenv";
dotenv.config();

// --- Essential Configurations - Bot will not run without these ---
if (!process.env.RPC_URL) {
    console.error("FATAL: RPC_URL not set in .env file. Please provide a Solana RPC endpoint.");
    process.exit(1);
}
export const RPC_URL = process.env.RPC_URL;
export const connection = new Connection(RPC_URL!, "confirmed");

if (!process.env.PRIVATE_KEY) {
    console.error("FATAL: PRIVATE_KEY not set in .env file. Please add your main wallet's secret key.");
    process.exit(1);
}
export const userKeypair = Keypair.fromSecretKey(base58.decode(process.env.PRIVATE_KEY!));
// Export private key string for debugging/logging
// export const privateKeyString = base58.encode(userKeypair.secretKey);

if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("FATAL: TELEGRAM_BOT_TOKEN not set in .env file.");
    process.exit(1);
}
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const rawAllowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS || "";
export const TELEGRAM_ALLOWED_USER_IDS = rawAllowedUserIds
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id) && id > 0);

if (TELEGRAM_ALLOWED_USER_IDS.length === 0 && process.env.NODE_ENV !== 'development_open') {
    console.error("CRITICAL SECURITY WARNING: TELEGRAM_ALLOWED_USER_IDS is not set or is invalid in .env. The Telegram bot will be open to anyone. THIS IS A HUGE SECURITY RISK. Set TELEGRAM_ALLOWED_USER_IDS or run with NODE_ENV=development_open if this is intentional for local testing ONLY.");
} else if (TELEGRAM_ALLOWED_USER_IDS.length > 0) {
    console.log("Telegram bot access restricted to user IDs:", TELEGRAM_ALLOWED_USER_IDS);
} else if (process.env.NODE_ENV === 'development_open') {
    console.warn("WARNING: Bot is running in open mode due to NODE_ENV=development_open. Ensure this is for local development only.");
}


// --- Default Operational Parameters (can be overridden by Telegram bot settings) ---
export const DefaultDistributeAmountLamports = 0.004 * LAMPORTS_PER_SOL;
export const DefaultJitoTipAmountLamports = parseInt(process.env.JITO_TIP_AMOUNT_LAMPORTS || "1000000");
export const DefaultCA = 'YOUR_DEFAULT_PUMP_FUN_TOKEN_CA_HERE_OR_LEAVE_AS_EXAMPLE'; // Example: 6YGUi1TCwEMLqSmFfPjT9dVp7RWGVye17kqvaqhwpump
export const DefaultSlippage = 0.5;

console.log(`Default Jito Tip Amount: ${DefaultJitoTipAmountLamports} lamports`);
if (DefaultCA.includes('YOUR_DEFAULT') || DefaultCA.length < 32) {
    console.warn(`Warning: DefaultCA in src/config.ts is a placeholder ("${DefaultCA}"). The Telegram bot will require you to set a token address via /settings.`);
}