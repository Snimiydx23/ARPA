# ARPA V3 — Deploy Guide

## Quick Start (Local)

```bash
# 1. Extract zip
unzip arpa-v3-full.zip -d arpa-v3
cd arpa-v3

# 2. Install dependencies
bun install

# 3. Set up environment
cp .env.example .env  # edit if needed

# 4. Push database schema
bun run db:push

# 5. Start dev server
bun run dev
# → http://localhost:3000
```

## Environment Variables (.env)

```env
# Database (SQLite — default, local file)
DATABASE_URL=file:./db/custom.db

# Auth secret (change in production!)
ARPA_AUTH_SECRET=your-random-secret-here

# App config (optional — defaults shown)
APP_NAME=ARPA
# 90-day free trial removed — chat token limit instead (input+output tokens, 0 = unlimited)
TOKEN_LIMIT_FREE=50000
TOKEN_LIMIT_PAID=1000000
TOKEN_LIMIT_PERIOD=month        # day | month | total
DAILY_LIMIT_FREE=50             # daily message limit (free)
DAILY_LIMIT_PAID=300
# Google sign-in button (Google Cloud → APIs & Services → Credentials → OAuth client ID, type "Web application",
# add your site URL in "Authorized JavaScript origins")
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
SUPPORT_EMAIL=support@yourdomain.com

# Models (comma-separated id|Label)
MODELS=arpa-pro|ARPA Pro,arpa-fast|ARPA Fast,arpa-mini|ARPA Mini

# Payment (optional — simulated without these)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Custom system prompt (optional)
SYSTEM_PROMPT=
```

## Deploy Options

### 1. Vercel (Recommended — easiest)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Note:** Vercel doesn't support SQLite. Change to PostgreSQL:
1. Edit `prisma/schema.prisma`: `provider = "postgresql"`
2. Set `DATABASE_URL` to your Postgres connection string
3. Run `bun run db:push`
4. Deploy: `vercel --prod`

### 2. VPS / Cloud Server (DigitalOcean, AWS EC2, etc.)

```bash
# Install bun
curl -fsSL https://bun.sh/install | bash

# Clone/extract project
unzip arpa-v3-full.zip -d /opt/arpa
cd /opt/arpa
bun install
bun run db:push

# Build
bun run build

# Start production server
bun run start

# Use PM2 for process management
npm i -g pm2
pm2 start "bun run start" --name arpa
pm2 save
pm2 startup
```

**Nginx reverse proxy:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Docker

```dockerfile
# Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun run db:push
RUN bun run build
EXPOSE 3000
CMD ["bun", "run", "start"]
```

```bash
docker build -t arpa-v3 .
docker run -p 3000:3000 -v $(pwd)/db:/app/db arpa-v3
```

### 4. Railway / Render / Fly.io

These platforms support Node.js/Bun apps:
1. Connect your GitHub repo
2. Set environment variables in dashboard
3. For database: use their managed PostgreSQL
4. Build command: `bun run build`
5. Start command: `bun run start`

## Database Options

| Platform | Database | Change needed |
|----------|----------|----------------|
| Local/VPS | SQLite (file) | None — works out of box |
| Vercel | PostgreSQL | Change schema provider + DATABASE_URL |
| Railway | PostgreSQL/MySQL | Change schema provider + DATABASE_URL |
| Docker | SQLite (volume) | Mount volume for persistence |

**To switch to PostgreSQL:**
```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"  // was "sqlite"
  url      = env("DATABASE_URL")
}
```

## Key Files

```
src/
├── app/
│   ├── page.tsx              # Main entry (Landing or ChatApp)
│   ├── layout.tsx            # Root layout + ThemeProvider
│   ├── globals.css           # Tailwind + ARPA theme
│   └── api/                  # All API routes
│       ├── auth/login        # Email login (HMAC token)
│       ├── chat/             # AI streaming (z-ai-web-dev-sdk)
│       ├── chats/            # CRUD + search + archived
│       ├── asr/              # Voice input
│       ├── tts/              # Read aloud
│       ├── vision/           # Image understanding (VLM)
│       ├── search/           # Web search
│       ├── stats/            # Usage analytics
│       ├── share/[token]/    # Public shared chat viewer
│       ├── pay-order/        # Razorpay order (simulated)
│       └── pay-verify/       # Payment verification
├── components/arpa/          # All ARPA React components
├── lib/
│   ├── arpa.ts               # Server-side helpers (auth, quota, system prompt)
│   ├── arpa-client.ts        # Client-side types + helpers
│   ├── store.ts              # Zustand state
│   └── db.ts                 # Prisma client
└── hooks/                   # React hooks
prisma/schema.prisma          # Database schema
```

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Database:** Prisma ORM (SQLite/PostgreSQL)
- **AI:** z-ai-web-dev-sdk (LLM, ASR, TTS, VLM, Web Search)
- **State:** Zustand
- **Theme:** next-themes (dark/light)
- **Toasts:** Sonner
- **Markdown:** react-markdown + remark-gfm + Prism

## Production Checklist

- [ ] Set `ARPA_AUTH_SECRET` to a random string
- [ ] Set `SUPPORT_EMAIL` to your email
- [ ] Configure payment keys (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
- [ ] Set up PostgreSQL if deploying to serverless (Vercel/Railway)
- [ ] Run `bun run db:push` after first deploy
- [ ] Configure custom domain
- [ ] Set up HTTPS (Let's Encrypt / Cloudflare)
- [ ] Review legal pages content

## AI provider — koi bhi API env se set karo (chat ke liye)
Jis provider ki key env me hogi, wo apne aap ON ho jayega. Ek ya zyada provider ek saath chala sakte ho.

| Provider | API key env | Models env (optional) |
|---|---|---|
| NVIDIA NIM | `NVIDIA_API_KEY` | `MODELS` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODELS` |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODELS` |
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODELS` |
| Groq | `GROQ_API_KEY` | `GROQ_MODELS` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODELS` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODELS` |
| Mistral | `MISTRAL_API_KEY` | `MISTRAL_MODELS` |
| xAI Grok | `XAI_API_KEY` | `XAI_MODELS` |
| Together | `TOGETHER_API_KEY` | `TOGETHER_MODELS` |
| Fireworks | `FIREWORKS_API_KEY` | `FIREWORKS_MODELS` |
| Cerebras | `CEREBRAS_API_KEY` | `CEREBRAS_MODELS` |
| Perplexity | `PERPLEXITY_API_KEY` | `PERPLEXITY_MODELS` |

Models format: `modelId|Label,modelId2|Label2`  e.g. `OPENAI_MODELS=gpt-4.1-mini|GPT Mini,gpt-4.1|GPT 4.1`
Har provider ka apna endpoint/proxy: `<PREFIX>_BASE_URL` (e.g. `OPENAI_BASE_URL`, `GEMINI_BASE_URL`).

Koi bhi aur OpenAI-compatible API (Sarvam, Azure, LM Studio, vLLM, apna server…), max 10:
```
AI_PROVIDER_1_NAME=Sarvam
AI_PROVIDER_1_URL=https://api.example.com/v1     # /chat/completions ke pehle tak
AI_PROVIDER_1_KEY=xxxx
AI_PROVIDER_1_MODELS=model-id|Label
```

Control:
```
DEFAULT_MODEL=openai:gpt-4.1-mini   # "Auto" par yahi model pehle chalega (baaki fallback)
                                    # id format: <provider>:<modelId>, custom = p1:<modelId>, NVIDIA = sirf modelId
AI_ONLY_PROVIDERS=openai            # sirf in providers ko use karo (comma list), baaki keys ignore
AI_MODELS=[...]                     # (advanced) JSON se poori model list manually
```
Note: image generation (/api/imagine) aur embeddings abhi bhi NVIDIA key use karte hain.

## Google sign-in — Firebase se (Google Cloud Console ki zaroorat nahi)
1. https://console.firebase.google.com → Add project (ya existing project kholo)
2. Build → Authentication → Get started → Sign-in method → **Google** → Enable → support email chuno → Save
3. Authentication → Settings → **Authorized domains** → Add domain → `arpa-tan.vercel.app` (aur apna custom domain)
4. Project settings (⚙) → General → Your apps → **Web (</>)** → app register karo → `firebaseConfig` values copy karo
5. Vercel env:
```
FIREBASE_API_KEY=AIza...            # firebaseConfig.apiKey
FIREBASE_AUTH_DOMAIN=xxx.firebaseapp.com
FIREBASE_PROJECT_ID=xxx
FIREBASE_APP_ID=1:123:web:abc       # optional
```
6. Redeploy. Firebase set hone par email login band ho jata hai (chahiye to ALLOW_EMAIL_LOGIN=true).
