# X

> **X is a bot.** A tiny Discord utility bot built with Hono and Cloudflare Workers.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/22552/Xqweeerbit)

## Commands

- `/hash text algorithm` — SHA-256 / SHA-384 / SHA-512
- `/random number` — cryptographically secure random integer
- `/random choice` — pick from `a | b | c`
- `/random uuid` — generate a UUID
- `/qr text` — generate and attach a QR code as SVG
- `/about` — bot information

## Architecture

```text
Discord Interaction
        |
        v
POST /interactions
        |
        v
Hono on Cloudflare Workers
```

No Gateway connection, database, or always-on server is required. Incoming Discord requests are verified with Ed25519 before commands are handled.

## Deploy

### One-click

Click **Deploy to Cloudflare** above. Cloudflare will ask for `DISCORD_PUBLIC_KEY` from:

**Discord Developer Portal -> your application -> General Information -> Public Key**

> Cloudflare's Deploy button requires the source repository to be public. If this repository is private, make it public first or use the manual deployment below.

### Manual

```bash
npm install
cp .dev.vars.example .dev.vars
# edit .dev.vars and set DISCORD_PUBLIC_KEY
npm run dev
```

For production:

```bash
npx wrangler login
npx wrangler secret put DISCORD_PUBLIC_KEY
npm run deploy
```

After deployment, copy the Worker URL and set the Discord application's **Interactions Endpoint URL** to:

```text
https://YOUR-WORKER.workers.dev/interactions
```

Discord will send a signed PING request to verify the endpoint.

## Register slash commands

Get the **Application ID** and **Bot Token** from the Discord Developer Portal. The token is only needed by the registration script and is not used by the Worker at runtime.

```bash
DISCORD_APPLICATION_ID=123456789 \
DISCORD_TOKEN='your-bot-token' \
npm run register
```

For faster development, register commands in one test server first:

```bash
DISCORD_APPLICATION_ID=123456789 \
DISCORD_TOKEN='your-bot-token' \
DISCORD_GUILD_ID=987654321 \
npm run register
```

The script uses Discord's bulk overwrite endpoint, so rerunning it keeps these commands in sync.

## Endpoints

- `GET /` — tiny landing page
- `GET /health` — health check
- `POST /interactions` — Discord Interactions endpoint

## Security notes

- Discord Ed25519 signatures are verified before parsing commands.
- `/hash` responses are ephemeral.
- QR input is generated in memory and attached to the interaction response; there is no database.
- User-provided output disables Discord mentions.

## Local checks

```bash
npm run check
```

This runs TypeScript checking and a Wrangler dry-run build.
