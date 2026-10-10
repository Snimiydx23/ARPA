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
TRIAL_DAYS=90
DAILY_LIMIT_TRIAL=50
DAILY_LIMIT_PAID=300
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
