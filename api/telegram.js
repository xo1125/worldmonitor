import { put, list } from '@vercel/blob';

// Use Node.js runtime (not edge) to avoid blob module conflicts with other edge functions
export const config = { runtime: 'nodejs' };

const BLOB_KEY = 'fcmonitor_config';

// Validate env
function getEnv() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.TELEGRAM_ADMIN_ID; // your Telegram user ID
  return { botToken, adminId };
}

// Read current config from blob
async function readConfig() {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (blobs.length === 0) return { tokens: {} };
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return { tokens: {} };
  }
}

// Write config to blob
async function writeConfig(cfg) {
  await put(BLOB_KEY, JSON.stringify(cfg, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// Send message back to Telegram
async function reply(chatId, text, botToken) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });
}

// Validate token exists on CoinGecko
async function validateCoinGeckoId(id) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { name: data.name, symbol: data.symbol.toUpperCase() };
  } catch {
    return null;
  }
}

const VALID_CATEGORIES = ['Bluechips', 'DeFi', 'AI', 'Other'];
const CATEGORY_ALIASES = {
  bluechips: 'Bluechips', majors: 'Bluechips', major: 'Bluechips',
  defi: 'DeFi',
  ai: 'AI',
  other: 'Other',
};

function resolveCategory(input) {
  return CATEGORY_ALIASES[input.toLowerCase()] || null;
}

const HELP_TEXT = `
*FC Monitor Bot* 🤖

Commands:
\`/add <coingecko-id> <category>\` — Add a token
\`/remove <coingecko-id>\` — Remove a token
\`/list\` — Show all custom tokens
\`/categories\` — Show valid categories
\`/clear\` — Remove all custom tokens

Categories: \`bluechips\`, \`defi\`, \`ai\`, \`other\`

Example:
\`/add pendle defi\`
\`/add render-token ai\`
\`/remove pendle\`
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const { botToken, adminId } = getEnv();
  if (!botToken) {
    return res.status(500).send('Bot not configured');
  }

  const body = req.body;
  if (!body) {
    return res.status(400).send('Bad request');
  }

  const message = body.message;
  if (!message || !message.text) {
    return res.status(200).send('OK');
  }

  const chatId = message.chat.id;
  const userId = String(message.from.id);
  const text = message.text.trim();

  // Auth check — only allow admin
  if (adminId && userId !== adminId) {
    await reply(chatId, '⛔ Unauthorized. This bot is private.', botToken);
    return res.status(200).send('OK');
  }

  // Parse command
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  try {
    if (cmd === '/start' || cmd === '/help') {
      await reply(chatId, HELP_TEXT, botToken);
    } else if (cmd === '/categories') {
      await reply(chatId, `Valid categories:\n${VALID_CATEGORIES.map(c => `• \`${c}\``).join('\n')}`, botToken);
    } else if (cmd === '/list') {
      const cfg = await readConfig();
      const tokens = cfg.tokens || {};
      if (Object.keys(tokens).length === 0) {
        await reply(chatId, '📋 No custom tokens added yet.', botToken);
      } else {
        const lines = Object.entries(tokens).map(
          ([id, t]) => `• *${t.symbol}* (${id}) → ${t.category}${t.conviction ? ` [${t.conviction}]` : ''}`
        );
        await reply(chatId, `📋 *Custom Tokens (${lines.length}):*\n${lines.join('\n')}`, botToken);
      }
    } else if (cmd === '/add') {
      if (parts.length < 3) {
        await reply(chatId, '❌ Usage: `/add <coingecko-id> <category>`\nExample: `/add pendle defi`', botToken);
        return res.status(200).send('OK');
      }
      const coinId = parts[1].toLowerCase();
      const category = resolveCategory(parts[2]);
      if (!category) {
        await reply(chatId, `❌ Invalid category: \`${parts[2]}\`\nValid: ${VALID_CATEGORIES.join(', ')}`, botToken);
        return res.status(200).send('OK');
      }

      // Optional conviction flag
      const conviction = parts[3]?.toLowerCase();
      const validConviction = conviction === 'high' || conviction === 'low' ? conviction : undefined;

      // Validate on CoinGecko
      await reply(chatId, `🔍 Looking up \`${coinId}\` on CoinGecko...`, botToken);
      const coinInfo = await validateCoinGeckoId(coinId);
      if (!coinInfo) {
        await reply(chatId, `❌ Token \`${coinId}\` not found on CoinGecko.\nMake sure you use the CoinGecko ID (e.g., \`pendle\`, \`render-token\`).`, botToken);
        return res.status(200).send('OK');
      }

      const cfg = await readConfig();
      cfg.tokens = cfg.tokens || {};
      cfg.tokens[coinId] = {
        name: coinInfo.name,
        symbol: coinInfo.symbol,
        category,
        ...(validConviction && { conviction: validConviction }),
      };
      await writeConfig(cfg);

      await reply(chatId, `✅ Added *${coinInfo.name}* (${coinInfo.symbol}) to *${category}*${validConviction ? ` [${validConviction} conviction]` : ''}\n\nDashboard will update on next refresh.`, botToken);
    } else if (cmd === '/remove') {
      if (parts.length < 2) {
        await reply(chatId, '❌ Usage: `/remove <coingecko-id>`', botToken);
        return res.status(200).send('OK');
      }
      const coinId = parts[1].toLowerCase();
      const cfg = await readConfig();
      if (!cfg.tokens || !cfg.tokens[coinId]) {
        await reply(chatId, `❌ Token \`${coinId}\` not in custom list.`, botToken);
        return res.status(200).send('OK');
      }
      const removed = cfg.tokens[coinId];
      delete cfg.tokens[coinId];
      await writeConfig(cfg);
      await reply(chatId, `🗑️ Removed *${removed.name}* (${removed.symbol}) from ${removed.category}.`, botToken);
    } else if (cmd === '/clear') {
      await writeConfig({ tokens: {} });
      await reply(chatId, '🗑️ All custom tokens cleared.', botToken);
    } else {
      await reply(chatId, `Unknown command. Type /help for usage.`, botToken);
    }
  } catch (error) {
    console.error('[Telegram Bot] Error:', error);
    await reply(chatId, `⚠️ Error: ${error.message}`, botToken);
  }

  return res.status(200).send('OK');
}
