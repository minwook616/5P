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

### 2026-02-05 — MVP3 (current)
- ✅ Recommendation Key initiation (one-per-life, per-key consumption)
- ✅ Email OTP via Resend (dark-themed HTML emails)
- ✅ Admin approval workflow (pending_email → pending_review → active/rejected)
- ✅ Champion Board (≥15 likes, permanent, red+gold theme)
- ✅ Admin Shadow Mode (comment as 운영자 toggle)
- ✅ Admin Like Pump (slider + number input)
- ✅ Password reset via email
- ✅ Strict status gating (no peek before active)
- ✅ Status pages: VerifyEmail, PendingReview, Rejected with infinite-loading aesthetic
- ✅ 22/22 backend tests + frontend smoke

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
