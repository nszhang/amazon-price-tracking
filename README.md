# Amazon Price Tracker

Track Amazon product prices and get email alerts when prices drop. Built with Next.js, PostgreSQL, and TypeScript.

**Now supports both cloud (Supabase/Vercel) and self-hosted deployment!**

## Features

- **User Authentication**: Email/password authentication
- **Price Tracking**: Track any Amazon product by URL, ASIN, or ISBN
- **Price History**: View historical price data with charts
- **Email Alerts**: Get notified when prices drop below your target price
- **Modular Scraping**: Easy to swap between web scraping and third-party APIs (Rainforest API)
- **Flexible Deployment**: Run on Supabase/Vercel OR self-host on your own Linux server

## Deployment Options

### Option 1: Cloud Deployment (Supabase + Vercel)
- **Database**: Supabase PostgreSQL with RLS
- **Auth**: Supabase Auth
- **Hosting**: Vercel
- **Cron Jobs**: Vercel Cron

### Option 2: Self-Hosted (Your Own Linux Server)
- **Database**: Local PostgreSQL
- **Auth**: NextAuth.js with local database
- **Hosting**: Systemd service on Ubuntu
- **Cron Jobs**: Linux cron

See [SELF_HOSTED_DEPLOYMENT.md](SELF_HOSTED_DEPLOYMENT.md) for detailed self-hosting instructions.

## Quick Start (Self-Hosted)

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Ubuntu 20.04+ (for self-hosting)

### 1. Clone and Install

```bash
git clone <your-repo>
cd amazon-price-tracking
npm install --legacy-peer-deps
```

### 2. Set Up PostgreSQL

```bash
# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE amazon_price_tracker;
CREATE USER price_tracker_user WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE amazon_price_tracker TO price_tracker_user;
EOF

# Run schema
sudo -u postgres psql -d amazon_price_tracker -f database-schema.sql
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=amazon_price_tracker
DB_USER=price_tracker_user
DB_PASSWORD=your-password

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Optional
RAINFOREST_API_KEY=your-key
RESEND_API_KEY=your-key
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (local or Supabase)
- **Auth**: NextAuth.js (self-hosted) or Supabase Auth (cloud)
- **Scraping**: Modular web scraping or Rainforest API

## Project Structure

```
amazon-price-tracking/
├── app/                     # Next.js app router
│   ├── (auth)/             # Authentication pages
│   ├── (dashboard)/        # Protected dashboard
│   ├── api/                # API routes
│   └── auth/callback/      # Auth callback
├── components/             # React components
├── lib/
│   ├── auth/              # NextAuth configuration
│   ├── db/                # Database configuration
│   ├── services/          # Business logic
│   │   ├── database/      # Database services
│   │   ├── scraping/      # Scraping services
│   │   └── email/         # Email service
│   └── types/             # TypeScript types
├── scripts/               # Utility scripts
├── database-schema.sql    # PostgreSQL schema
└── SELF_HOSTED_DEPLOYMENT.md  # Self-hosting guide
```

## Database Schema

The database includes the following tables:

- **users**: User accounts and authentication
- **sessions**: NextAuth sessions
- **tracked_items**: Products being tracked
- **price_history**: Historical price data
- **price_alerts**: Triggered price drop alerts

## Scraping Methods

### Web Scraping (Default)
Uses regex-based HTML parsing. May be blocked by Amazon without proxy.

### Rainforest API (Recommended)
Reliable API for Amazon product data:

1. Get API key from [rainforestapi.com](https://www.rainforestapi.com)
2. Add to `.env.local`: `RAINFOREST_API_KEY=your-key`
3. The app automatically uses API when key is present

## Email Notifications

Optional email alerts via Resend:

1. Get API key from [resend.com](https://resend.com)
2. Add to `.env.local`: `RESEND_API_KEY=re_xxxxxx`

## Production Deployment

### Self-Hosted (Ubuntu)

See [SELF_HOSTED_DEPLOYMENT.md](SELF_HOSTED_DEPLOYMENT.md) for complete instructions including:
- PostgreSQL setup
- Systemd service configuration
- Nginx reverse proxy
- SSL with Let's Encrypt
- Automated backups
- Cron job configuration

### Cloud (Vercel + Supabase)

1. Push to GitHub
2. Import in Vercel
3. Connect Supabase database
4. Add environment variables
5. Deploy

## Environment Variables

### Required (Self-Hosted)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL config
- `NEXTAUTH_URL` - Your app URL
- `NEXTAUTH_SECRET` - Random secret (32+ chars)

### Optional
- `RAINFOREST_API_KEY` - For reliable scraping
- `RESEND_API_KEY` - For email notifications
- `CRON_SECRET` - For securing cron endpoints

### Legacy (Cloud Only)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

## API Routes

- `POST /api/auth/register` - User registration
- `POST /api/auth/[...nextauth]` - NextAuth endpoints
- `POST /api/scrape` - Scrape product data
- `POST /api/cron/process-alerts` - Process price alerts (cron)

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a PR.
