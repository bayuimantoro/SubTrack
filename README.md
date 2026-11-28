# SubTrack

Personal finance web app for tracking recurring subscriptions, installment/PayLater plans, renewal calendars, and spending analytics.

## Features

- **Subscriptions:** Recurring billing tracking (weekly, monthly, quarterly, semi-annual, annual, or custom intervals), pause/resume, payment recording, cycle skipping, and refund logging.
- **Installments & PayLater:** Fixed and variable payment schedules, principal vs. interest/fee breakdown, partial/full payment recording, and early settlement.
- **Dashboard & Analytics:** Combined monthly obligations, 6-month renewal projections, category breakdowns, and provider summaries.
- **Calendar & Reminders:** Monthly due-date grid and configurable in-app reminder windows (7d, 3d, 1d, due date).
- **Storage & Portability:** Works offline in Local Mode (`localStorage`) or synced via Supabase (PostgreSQL + Row-Level Security), with JSON backup export/import.
- **Localization & Themes:** English, Bahasa Indonesia, Bahasa Melayu, and Japanese; Light, Dark, and System themes.

## Stack

- React 19, TypeScript (strict), React Router 7
- Vite 8 (Rolldown) & Tailwind CSS 4
- Recharts, Lucide React, Sonner
- Supabase JS (optional cloud backend)
- Vitest & Oxlint

## Scripts

```bash
npm install
npm run dev      # Start local dev server
npm test         # Run Vitest unit tests
npm run lint     # Run Oxlint
npm run build    # Type-check and build production bundle
npm run preview  # Serve production build locally
```

## Environment

Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Cloud Mode. Without them, SubTrack runs in Local Mode.
