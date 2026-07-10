# BB28 Fantasy Pool · Time Trip

Big Brother 28 season-long fantasy pool: pre-season picks, weekly HOH / Veto /
Block Buster / eviction predictions, bonus awards, and a scored leaderboard.
React + Vite front end, Supabase for shared pool state.

## Deploy (Cursor → GitHub → Vercel)

### 1. Supabase (one time, ~2 min)
1. In your Supabase project, open **SQL Editor** and run `supabase/schema.sql`.
2. Grab the **anon public key** from Settings → API (the project URL is already baked in).

### 2. Push to GitHub
```bash
cd bb28-pool
npm install
git init && git add . && git commit -m "BB28 fantasy pool"
gh repo create bb28-fantasy-pool --public --source=. --push
```

### 3. Vercel
1. Add New Project → import `bb28-fantasy-pool` (auto-detects Vite).
2. Settings → Environment Variables:
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. Every push to `main` redeploys automatically.

### Local dev
```bash
cp .env.example .env   # fill in your Supabase values
npm run dev
```

## How the pool works
- Players join with a name (identity is per-device via localStorage).
- Picks save to Supabase instantly; the Standings tab scores everyone against
  the official results entered in the Results tab.
- Scoring — Pre-season: Winner 10 · Runner-up 5 · First HOH 3 · First evicted 3 ·
  America's Favorite 3 · Final 4 picks 2 each. Weekly: Eviction 3 · HOH 2 ·
  Veto 2 · Block Buster 1. Bonus: Villain 4 · Best Strategy 4 · Worst Social
  Game 3 · Showmance 3 each · Alliance 2 each.

## Trust model (worth knowing)
Anyone with the URL can read/write pool data — same honor system as an office
March Madness sheet. Fine for a friends pool; if it ever needs to be tamper-
proof, the upgrade path is Supabase Auth + per-player row-level security.
