# Amazon Price Tracker

Track Amazon product prices and get email alerts when prices drop. Built with Next.js, Supabase, and TypeScript.

## Features

- **User Authentication**: Email/password and Google OAuth via Supabase Auth
- **Price Tracking**: Track any Amazon product by URL, ASIN, or ISBN
- **Price History**: View historical price data with charts
- **Email Alerts**: Get notified when prices drop below your target price
- **Modular Scraping**: Easy to swap between web scraping and third-party APIs
- **Row Level Security**: All user data is isolated and secure

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database/Auth**: Supabase (PostgreSQL with RLS)
- **Scraping**: Modular web scraping (API-ready)

## Getting Started

### Prerequisites

- Node.js 18+ (use conda environment: `conda activate amazon-price-tracking`)
- Supabase account (free tier works)
- npm or yarn

### 1. Clone and Install

```bash
cd amazon-price-tracking

# Activate conda environment (if using)
conda activate amazon-price-tracking

# Install dependencies
npm install --legacy-peer-deps
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase-schema.sql`
3. Enable Google OAuth in Authentication > Providers > Google
4. Copy your project URL and anon key from Settings > API

### 3. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Email Service (Resend) - Optional
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Cron Job Security
CRON_SECRET=generate-a-random-string
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Database Schema

The database includes the following tables:

- **profiles**: User profiles and preferences
- **tracked_items**: Products being tracked with alert thresholds
- **price_history**: Historical price data points
- **price_alerts**: Triggered alerts for price drops

All tables have Row Level Security (RLS) enabled to ensure data isolation between users.

## Project Structure

```
amazon-price-tracking/
├── app/
│   ├── (auth)/              # Login/signup pages
│   ├── (dashboard)/         # Protected dashboard pages
│   ├── api/                 # API routes
│   └── auth/callback/       # OAuth callback
├── components/
│   ├── auth/                # Authentication components
│   └── ...
├── lib/
│   ├── hooks/               # React hooks
│   ├── services/
│   │   ├── database/        # Database service layer
│   │   └── scraping/        # Modular scraping service
│   ├── supabase/            # Supabase client
│   ├── types/               # TypeScript definitions
│   └── utils/               # Helper functions
└── supabase-schema.sql      # Database schema
```

## Swapping Scraping Methods

The scraping service is modular and can be easily swapped:

```typescript
// lib/services/scraping/scraper-factory.ts
import { ScraperFactory, ScraperType } from '@/lib/services/scraping/scraper-factory'

// Switch to API when ready
ScraperFactory.switchScraper(ScraperType.API)
```

To use a third-party API (e.g., Rainforest API, Keepa):

1. Create a new class extending `BaseScraper`
2. Implement the required methods
3. Add it to the `ScraperFactory`

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Cron Jobs

Set up a cron job to process alerts periodically:

```typescript
// vercel.json
{
  "crons": [{
    "path": "/api/cron/process-alerts",
    "schedule": "0 */6 * * *"
  }]
}
```

## Future Enhancements

- [ ] Implement actual web scraping (Cheerio/Puppeteer)
- [ ] Add third-party API integration
- [ ] Email service integration (Resend)
- [ ] Price history charts with Recharts
- [ ] Framer Motion animations
- [ ] Mobile app version

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a PR.
