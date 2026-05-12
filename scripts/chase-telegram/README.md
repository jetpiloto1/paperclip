# chase-telegram — Telegram-to-Paperclip Bridge

Supabase Edge Function that forwards Telegram messages from @AvvAChaseBot to the
Paperclip API using Chase's credentials and personality.

```
Telegram → Webhook → Edge Function → Paperclip API → Formatted Response
             ↑                                         |
             └──────── Response back via Telegram ←─────┘
```

## Architecture

The edge function is a thin front-end — it does not run the Chase agent itself.
It uses Chase's Paperclip API key to query live data, formats the response using
Chase's defined personality (warm, efficient dispatcher tone), and replies via
Telegram.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token for @AvvAChaseBot |
| `PAPERCLIP_API_URL` | Yes | Paperclip API base URL (e.g. `https://paperclip.avva.aero`) |
| `CHASE_PAPERCLIP_API_KEY` | Yes | Chase's Paperclip API key (read-only) |
| `PAPERCLIP_COMPANY_ID` | Yes | Company UUID for API queries |
| `ALLOWED_TELEGRAM_USER_IDS` | No | Comma-separated Telegram user IDs to restrict access (empty = open) |
| `WEBHOOK_SETUP_SECRET` | No | Secret for `/setup-webhook` endpoint auth |

## Deployment

### Supabase

```bash
# 1. Install Supabase CLI
# 2. Link your project
supabase link --project-ref <ref>

# 3. Deploy the function
supabase functions deploy chase-telegram --no-verify-jwt

# 4. Set environment variables
supabase secrets set TELEGRAM_BOT_TOKEN=<token>
supabase secrets set PAPERCLIP_API_URL=<url>
supabase secrets set CHASE_PAPERCLIP_API_KEY=<key>
supabase secrets set PAPERCLIP_COMPANY_ID=<id>
supabase secrets set ALLOWED_TELEGRAM_USER_IDS=<ids>
supabase secrets set WEBHOOK_SETUP_SECRET=<secret>

# 5. Configure Telegram webhook to point at the function URL
#    (the function URL is https://<ref>.functions.supabase.co/chase-telegram)
```

### Alternative: Deno Deploy or other

The function is a standard Deno HTTP server. Deploy anywhere that supports Deno:

```bash
deno run --allow-net --allow-env index.ts
```

## Setting the Telegram Webhook

Once deployed, configure the Telegram bot to send updates to the function:

```bash
curl -X POST https://<function-url>/setup-webhook \
  -H "Authorization: Bearer <WEBHOOK_SETUP_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<function-url>/"}'
```

Or use the Telegram API directly:

```bash
curl -X POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<function-url>/"}'
```

## Commands

| Command | Description |
|---|---|
| `/start`, `hello`, `hi` | Welcome message |
| `/help`, `/commands` | Show available commands |
| `/overview`, `/status` | Company overview |
| `/blocked` | Blocked issues |
| `/approvals` | Pending approvals |
| `/agents` | List agents |
| `/detail <ID>` | Issue details (e.g. `/detail CRE-123`) |
| `/search <query>` | Search issues |
| Free text | Natural language routing to queries |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` or `/health` | Health check |
| POST | `/` | Telegram webhook handler |
| POST | `/setup-webhook` | Configure Telegram webhook URL |
