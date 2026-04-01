# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Health Tracker is a personal web app (single user: Nino) for tracking daily health habits. It tracks 4 streak categories (no snacking, healthy breakfast/lunch/dinner), plus check-only items (eiwitshake, stretchen) and a multi-check item (arm masseren 2x/dag). Features include per-category streaks, cheat tokens (earned every 5 or 7 streak days), a perfect day streak, a progress dashboard since start date, and an iPhone-style calendar view.

## Tech Stack

- Pure HTML/CSS/JS — no frameworks, no build tools, no bundler
- Firebase Realtime Database (compat CDN v10.12.2) for cross-device sync
- Firebase Anonymous Authentication (no login flow)
- localStorage as offline cache, Firebase as source of truth

## Hosting & Deployment

- **Hosted on GitHub Pages**: https://nvantour.github.io/health-tracker/
- **GitHub repo**: https://github.com/nvantour/health-tracker (public)
- **GitHub account**: `nvantour` — already authenticated via `gh` CLI
- **`gh` CLI path**: `/Users/ninovantour/bin/gh`
- **Deploy**: push to `main` branch → GitHub Pages auto-deploys

```
git push origin main
```

## Firebase (already configured)

Alles is al opgezet — geen setup nodig bij nieuwe sessies.

- **Project**: `health-tracker-9b6e1` (region `europe-west1`)
- **Anonymous Authentication**: ingeschakeld, geen login nodig
- **Database rules**: `auth != null` (permanent, geen test mode)
- **Config**: hardcoded in `app.js` (apiKey, databaseURL, etc.)
- **Database path**: `health-tracker/days/`
- **API key restriction**: beperkt tot `nvantour.github.io/*` via Google Cloud Console → Credentials → HTTP referrers

## Development

Open `index.html` directly in a browser. No build step, no dev server needed.

## Architecture

All logic lives in three files:

- **`index.html`** — Static shell. Firebase CDN scripts load before `app.js`.
- **`app.js`** — All application logic in one file, organized in sections marked with `// ===== SECTION =====` comments.
- **`style.css`** — All styles. CSS custom properties defined in `:root`. Category-specific styles use `[data-category="keyName"]` selectors.

### Data Flow (app.js)

1. **Firebase dual-write pattern**: `saveData()` writes to localStorage (instant) then `syncToFirebase()` (async). The `isSyncing` flag prevents the Firebase `onValue` listener from creating feedback loops.
2. **Firebase listener**: `listenToFirebase()` uses `onValue()` — when another device writes, it updates `appData` and calls `renderAll()`.
3. **`saveDataLocal()`** exists separately for the Firebase listener to update localStorage without triggering another Firebase write.

### Data Model

```
appData = {
  days: {
    "2026-02-24": {
      noSnack: { checked: true, tokenUsed: false },
      breakfastHealthy: { checked: false, tokenUsed: false },
      lunchHealthy: { checked: true, tokenUsed: false },
      dinnerHealthy: { checked: false, tokenUsed: false },
      proteinShake: { checked: true, tokenUsed: false }
    }
  }
}
```

Firebase path: `health-tracker/days/`

### Category Keys

Defined in the `CATEGORIES` array at top of `app.js`. Adding a new category means adding to this array — rendering and calculations derive from it.

- **Streak categories** (`STREAK_CATEGORIES`): `noSnack`, `breakfastHealthy`, `lunchHealthy`, `dinnerHealthy` — these build streaks, earn tokens, and count toward perfect day.
- **Check-only categories**: `proteinShake` (Eiwitshake), `stretching` (Stretchen) — has `trackStreak: false`. Shows in checklist and calendar day detail, but no streak/token logic.
- **Multi-check categories**: `armMassage` (Arm masseren) — has `trackStreak: false` and `maxChecks: 2`. Uses `count` field instead of `checked` boolean. Button cycles through 0 → 1 → 2 → 0.
- **Per-category token intervals**: Meal categories (`breakfastHealthy`, `lunchHealthy`, `dinnerHealthy`) have `tokenInterval: 7`. Default (`noSnack`) uses `TOKEN_INTERVAL = 5`.

When adding a new category: set `trackStreak: false` if it should be check-only. Set `maxChecks: N` for multi-check. Set `tokenInterval: N` to override the default token interval. Also add matching CSS variables (`--key-border`, `--key-bg`) and `[data-category="key"]` selectors in `style.css`.

`ensureDayExists()` backfills missing category keys on existing days, so adding a new category won't break old data.

### Streak/Token Logic

- **Streak**: walks backwards from today counting consecutive days where category is "valid" (checked OR tokenUsed). Only applies to `STREAK_CATEGORIES`.
- **Tokens**: `earned = floor(streak / interval)`, `available = earned - used`. Token usage is tracked per-day per-category. Only for `STREAK_CATEGORIES`. Default interval is 5 (noSnack), meals use 7.
- **`calculateTokensForDay(data, catKey, dateKey)`**: calculates tokens based on the streak leading UP TO that specific date (not from today). Used for retroactive token use on past days and for the daily checklist. `calculateTokens()` uses today's global streak — only used in the tokens overview section.
- **Perfect streak**: counts consecutive days where ALL `STREAK_CATEGORIES` are valid.

### Rendering

`renderAll()` calls all render functions. Each render function reads from the global `appData` object. State variables: `expandedCard` (which checklist card is tapped open), `selectedCalendarDay` (which calendar day is selected), `currentCalendarDate` (calendar month navigation).

## Language

The app UI is in Dutch. All user-facing strings are in Dutch. Code comments and variable names are in English.

## Design

Duolingo/iPhone-stijl met pastelkleuren, 3D buttons (translateY trick), bounce animaties (cubic-bezier(.3,.7,.4,1.5)). Progressive disclosure: card details verschijnen bij tap.
