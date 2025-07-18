# Pumpfun Volume Bot
This is a Pump.fun volume bot that can increase the volume of a specific Pump.fun token, controlled via Telegram.

## Screenshot

![image](https://github.com/user-attachments/assets/fc57859d-0e89-4cf2-be98-81b22c4ccc5b) <!-- Replace with your actual screenshot if you have one -->

## Main Features

- Analyzes Pump.fun token details (bonding curve, reserves).
- Creates and manages a pool of sub-wallets (`wallets.json`).
- Creates and extends a Solana Address Lookup Table (LUT) for efficient transactions (`lut.json`).
- Submits transactions via Jito Bundles for potential MEV protection and faster inclusion.
- Distributes SOL from a main wallet to sub-wallets.
- Performs buy-then-sell swap cycles using sub-wallets to generate volume.
- Can sell all tokens held by sub-wallets for a specific mint.
- Can collect all SOL from sub-wallets back to the main wallet.
- Secure Telegram bot interface for configuration and control:
    - User ID whitelisting for authorized access.
    - Configurable SOL amount per swap/distribution.
    - Configurable target token address.
    - Configurable sleep time between swap cycles.
    - Configurable slippage for trades (with safety limits).
    - Start/Stop bot operations.
    - Buttons for "Sell All Tokens" and "Collect All SOL".
- Restrictive file permissions set for `wallets.json` and `lut.json` on creation (on POSIX systems).

## How to Run

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd Volume_bot
    ```

2.  **Install dependencies:**
    ```bash
    yarn install
    # or
    # npm install
    ```

3.  **Create and configure `.env` file:**
    Create a file named `.env` in the `Volume_bot` root directory.

    **IMPORTANT SECURITY NOTE for `.env` file:**
    Manually set restrictive permissions for your `.env` file on your server/system. This is crucial to protect your private key.
    For example, on Linux/macOS:
    ```bash
    chmod 600 .env
    ```
    This makes the file readable and writable only by the owner.

    **`.env` file content:**
    ```env
    RPC_URL=YOUR_SOLANA_RPC_URL_HERE
    PRIVATE_KEY=YOUR_MAIN_WALLET_PRIVATE_KEY_BS58_ENCODED
    TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
    TELEGRAM_ALLOWED_USER_IDS="123456789,987654321" # Comma-separated Telegram User IDs that can control the bot
    # JITO_TIP_AMOUNT_LAMPORTS=10000 # Optional: Jito tip in lamports (e.g., 10000 for 0.00001 SOL) - defaults in config.ts if not set
    # NODE_ENV=development_open # UNCOMMENT FOR LOCAL TESTING ONLY TO BYPASS USER ID RESTRICTION - HUGE SECURITY RISK IN PROD
    ```
    *   `RPC_URL`: Your Solana RPC endpoint (e.g., from QuickNode, Helius, Triton, or your own node).
    *   `PRIVATE_KEY`: The secret key of your main Solana wallet (base58 encoded array of 64 bytes). This wallet will fund operations.
    *   `TELEGRAM_BOT_TOKEN`: Get this from BotFather on Telegram.
    *   `TELEGRAM_ALLOWED_USER_IDS`: A comma-separated list of numeric Telegram user IDs. Only these users can interact with the bot. You can get your ID by messaging a bot like `@userinfobot` on Telegram.

4.  **Review Default Configurations (Optional):**
    Check `src/config.ts` for default values like `DefaultJitoTipAmountLamports`, `DefaultSlippage`, etc. These are used if not overridden by Telegram settings or environment variables.

5.  **File Handling (`wallets.json`, `lut.json`):**
    *   The bot will attempt to create `wallets.json` (for sub-wallets) and `lut.json` (for the Address Lookup Table) if they don't exist when you first start operations via Telegram that require them (e.g., starting the bot, distributing SOL).
    *   Restrictive file permissions (`0o400` for `wallets.json`, `0o600` for `lut.json`) will be set upon creation on POSIX-compatible systems.

6.  **Start the Telegram Bot Controller:**
    ```bash
    yarn bot
    # or
    # npm run bot
    ```
    The bot will log its status to the console.

7.  **Interact with the Bot on Telegram:**
    *   Find your bot on Telegram (the one you created with BotFather).
    *   If your Telegram User ID is in `TELEGRAM_ALLOWED_USER_IDS`, you can send commands:
        *   `/help`: Shows available commands and how to use settings.
        *   `/settings`: Opens the main control panel to configure SOL amount, token address, slippage, sleep time, and to start/stop the bot, sell tokens, or collect SOL.
        *   `/status`: Shows the current configuration and running status.

8.  **Standalone Script Execution (for testing `PumpfunVbot` directly - Optional):**
    *   You can test parts of the `PumpfunVbot` logic without the Telegram interface.
    *   Temporarily uncomment the `(async () => { ... })();` block at the end of `index.ts`.
    *   Ensure `DefaultCA` and other defaults in `src/config.ts` are set appropriately for your test, or modify the example block in `index.ts`.
    *   Run:
        ```bash
        yarn start
        # or
        # npm start
        ```
    *   **Remember to re-comment this block when running the Telegram bot via `yarn bot`.**

## Important Security Considerations

*   **Private Key Security:** Your `PRIVATE_KEY` in the `.env` file controls your main funds. Protect this file diligently. The `chmod 600 .env` step is critical.
*   **Telegram User ID Whitelisting:** Ensure `TELEGRAM_ALLOWED_USER_IDS` is correctly set to prevent unauthorized access to bot controls. If left empty or misconfigured (and not in `development_open` mode), the bot might deny all access or be open, which is a major risk.
*   **Sub-Wallet Keys (`wallets.json`):** While the bot sets permissions to read-only for the owner, if the server itself is compromised, these keys could be accessed.
*   **Slippage:** Be extremely cautious with slippage settings. High slippage can lead to significant losses in volatile markets or due to MEV (e.g., sandwich attacks). The bot has a configurable slippage with a maximum limit enforced by the Telegram UI (defaulting to 5%).
*   **RPC Node:** Use a reliable and private RPC node for critical operations. Public nodes can be rate-limited or less reliable.
*   **Test Thoroughly:** Before running with significant funds, test all functionalities on a devnet or with very small amounts on mainnet to understand its behavior and costs.
*   **Jito Bundles:** While Jito bundles can offer MEV protection, they are not a perfect guarantee. Understand their characteristics.
*   **No Guarantees:** This bot interacts with decentralized systems and markets. There are inherent risks. Use at your own discretion and responsibility.

## Author
- [TELEGRAM](https://t.me/darksoul814)
