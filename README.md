# Road Ledger

Road Ledger is a Fuelio-style tracking app designed for GitHub Pages. The frontend is a static site, while persistence is handled by Supabase through a lightweight Edge Function.

## What it does

- Create a nickname-based profile and keep the linked profile on the current browser
- Save vehicles, fuel-ups, trip logs, settings, and chart data to Supabase
- Track fuel costs, price per litre, full-tank efficiency, trip distance, and extra trip costs
- View richer charts for efficiency, fuel prices, monthly spend, and trip distance
- Capture weather snapshots from Open-Meteo for fuel and trip entries
- Export or import local backups if you want a manual copy

## Architecture

- Static frontend: [index.html](/Users/teotsisme/Documents/carFuelCalc/index.html), [styles.css](/Users/teotsisme/Documents/carFuelCalc/styles.css), [app.js](/Users/teotsisme/Documents/carFuelCalc/app.js)
- Supabase migration: [supabase/migrations/20260602_road_ledger_profiles.sql](/Users/teotsisme/Documents/carFuelCalc/supabase/migrations/20260602_road_ledger_profiles.sql)
- Supabase Edge Function: [supabase/functions/road-ledger-api/index.ts](/Users/teotsisme/Documents/carFuelCalc/supabase/functions/road-ledger-api/index.ts)

## GitHub Pages

This repository includes [.github/workflows/deploy-pages.yml](/Users/teotsisme/Documents/carFuelCalc/.github/workflows/deploy-pages.yml).

1. Push the repository to GitHub.
2. In the repository settings, open `Pages`.
3. Set the source to `GitHub Actions`.
4. Push to `main` and GitHub will publish the site.

## Notes

- The nickname flow is lightweight, not full user authentication.
- The app keeps the linked profile ID and profile key in the browser so returning users on the same browser keep their data.
- The deployed frontend calls the `road-ledger-api` Supabase Edge Function to load and save profile data.
