# 5P (Five Posts) — PRD

## Original Problem Statement
"에브리타임 같은 사이트 만들어줘" → pivoted to **5P** — minimalist, scarcity-driven anonymous community for Iowa State.

## Architecture
- **Backend**: FastAPI + Motor + MongoDB. JWT (httpOnly cookies). bcrypt. Resend for email.
- **Frontend**: React + Tailwind. Pure dark + Cardinal Red `#C8102E`. Pretendard.
- **Collections**: users, posts, comments, messages, daily_state, recommendation_keys, email_otps, password_resets.
- **Timezone**: America/Chicago.

## User Personas
1. Iowa State student (recommended in by a champion, approved by admin)
2. Champion (yesterday's #1 likes OR post crossed 15 likes — gets lifetime key)
3. Admin (operator) — full visibility, unlimited keys, like-pump, identity toggle

## Core Game Rules
- 5 posts/day server-wide · 1/user · admin 5/user
- Golden Hour: random unlock 00:00-01:00 CST
- Champion: yesterday's top likes → instant 00:00 unlock + 24h auto-purge admin DM
- 3 reports → blinded
- Posts ≥15 likes → permanent Champion Board archive
- Author's first ever 15-like post → 1 lifetime recommendation key

## Implementation Timeline

### 2026-02-05 — MVP1 (Everytime-style)
- Initial anonymous board + DM (later replaced)

### 2026-02-05 — MVP2 (5P concept)
- Pure dark UI, slot system, Golden Hour, daily_state
- Anonymous handles + admin direct line
- Reports + blind

### 2026-02-05 — MVP5 (current — Pillar Rename + Hardening)
- ✅ Champion → Pillar global rename (code, DB, UI). `/champions` kept as backwards-compat alias.
- ✅ Startup migration: `is_champion`→`is_pillar`, `champion_at`→`pillar_at`, `champion_id`→`pillar_id`, `keys.source` "champion"→"pillar"
- ✅ `APP_ENV='prod'` gates dev OTP/reset-token log lines (3 sites: register OTP, resend OTP, reset token)
- ✅ Rate-limit via slowapi: `/auth/register/isu` 5/min, `/auth/register/invite` 5/min, `/auth/login` 10/min, `/auth/forgot-password` 3/min — Korean 429 message
- ✅ Batch admin: `POST /api/admin/users/batch-approve|batch-reject {user_ids}` — UI checkboxes + select-all
- ✅ Suspicious recommender flags in `/admin/pending`: HIGH_VOLUME, FRESH_SPAMMER, HIGH_REJECT_RATE
- ✅ `/admin/leaderboard` — top recommenders by approved invites (auto IG-shareable concept)
- ✅ Pillar key emails rebranded ("Pillar's Key", "Pillar Key Granted")
- ✅ 39/39 backend pytest + frontend smoke 90% (1 pillar-badge edge case fixed post-test)

### 2026-02-05 — MVP4 (Dual Gateway)
- See history.

## Backlog (P1 — explicit user requests retained for next iteration)
- **Resend domain verification** (USER ACTION at https://resend.com/domains; update `SENDER_EMAIL` in .env when done)
- **server.py router split** (~1216 lines → auth, admin, pillars, posts, comments, messages routers)
- One-time migration flag in `meta` collection to skip Pillar migration on subsequent restarts
- `asyncio.gather` for batch_approve email sends (currently serial)
- Login rate-limit keyed on (ip, email) to avoid throttling real users from shared k8s ingress IP
- Slowapi storage → Redis for tighter accuracy in multi-worker

### 2026-02-05 — MVP3 (Initiation + Champion Board)
- (See history above)

### 2026-02-05 — MVP2 (5P concept) / MVP1 (Everytime style)
- Pure dark UI, slot system, Golden Hour, daily_state, anonymous handles, admin direct line, reports + blind

## Backlog (P1)
- Resend domain verification (currently testing-mode = Resend only delivers to account owner; OTP also logged to backend for dev)
- Split server.py into routers (~970 lines, past 700-line guideline)
- Gate dev-mode OTP logging behind APP_ENV
- Wrap email sends in asyncio.create_task to avoid request hangs
- Brute-force lockout on /auth/login + rate limit on /forgot-password
- Pin CORS origin (currently `*` with credentials)
- WebSocket/SSE for real-time slot/comment/DM updates

## Backlog (P2)
- Champion archive views (search, year, top-of-time)
- Admin batch ops (multi-approve, batch mint)
- Champion winner card auto-generated for IG sharing (Nano Banana 1-line)
- Mobile native app
- Multi-school deployment per-domain feeds
- TTL index on admin-line messages

## Next Tasks
- Verify Resend domain (e.g. `5p.app`) so OTPs reach real users
- Split server.py before next feature iteration
- Add APP_ENV check to suppress secret logging in production
