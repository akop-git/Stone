# Stone — Android To-Do Tracker

A two-page personal to-do app:
- **Canvas** — tasks live as draggable "stones" you can position anywhere on the page
- **Calendar** — drag those same stones into hourly time slots, or back to the unscheduled tray

Built as a React + Vite web app, wrapped with Capacitor for Android, built to APK via GitHub Actions — same pipeline as 6pills.

---

## Quick start (push → APK on your phone)

### 1. Create a new GitHub repo

1. Go to github.com and click **New repository**
2. Name it `stone` → set to Private (or Public) → Create
3. Don't initialize with a README — you'll push these files

### 2. Push this code

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/stone.git
git push -u origin main
```

### 3. Wait for GitHub Actions to build

1. Open the repo on github.com → **Actions** tab
2. Watch the **Build Android APK** workflow run (~6–8 min first time, ~3–4 min thereafter)
3. When it finishes, click the run → scroll to **Artifacts** → tap `stone-debug-apk` to download
4. Unzip → you'll have `app-debug.apk`

### 4. Install on your phone

1. Email the APK to yourself or use Drive
2. On Android: tap the APK → allow "install from unknown sources" if prompted
3. Open "Stone" from the app drawer

To iterate after launch: edit any file via GitHub's web editor, commit, Actions rebuilds the APK automatically.

---

## Sync across devices (optional)

The app works offline by default using `localStorage`. To sync across your devices:

1. Create a free Supabase project at supabase.com
2. In the SQL editor, run:

```sql
create table tasks (
  id uuid primary key,
  title text not null,
  x int default 24,
  y int default 24,
  scheduled_hour int,
  created_at timestamptz default now()
);

-- For personal use, simplest path: enable anon access
alter table tasks enable row level security;
create policy "anon all" on tasks for all using (true) with check (true);
```

3. In Supabase project settings → API, copy the **URL** and **anon key**
4. In your repo settings → Secrets and variables → Actions, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Update the workflow to inject them at build time (add an `env:` block to the "Build web bundle" step):

```yaml
      - name: Build web bundle
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: npm run build
```

The store layer (`src/lib/store.js`) detects whether Supabase credentials are present and automatically uses cloud storage when configured, falling back to localStorage otherwise.

**Note on security:** the anon-all policy above is fine for personal use since only you and your friends will have the APK. If you ever share more broadly, add proper auth (Supabase has email magic-link or Google sign-in built in).

---

## Customizing

- **App name / package**: edit `capacitor.config.json`. Change `appName` and `appId` (use reverse-domain like `com.yourname.stone`)
- **Look & feel**: all styling lives in `src/styles.css`. The palette is defined as CSS variables at the top.
- **Hours shown on calendar**: `HOURS` array in `src/App.jsx` (default 6am–9pm)

---

## Local dev (optional, for faster iteration)

If you want to preview in a browser before pushing:

```bash
npm install
npm run dev
```

Open the printed URL on your phone (same WiFi) for a live mobile preview.

To test the Android wrapper locally you'd need Android Studio installed — but for casual iteration, the Actions build is enough.
