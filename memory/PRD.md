# 5P (Five Posts) — PRD

## Original Problem Statement
- "에브리타임 같은 사이트 만들어줘" (Build an Everytime-like site)
- Pivoted to **5P (Five Posts)**: minimalist anonymous community for Iowa State students with strict scarcity rules
- Slogan: "5 Stories, 5 People, Once a day."

## Architecture
- **Backend**: FastAPI + Motor + MongoDB. JWT (httpOnly cookies, samesite=none, secure). bcrypt passwords.
- **Frontend**: React + Tailwind. Pure dark theme (#0A0A0A) with Cardinal Red (#C8102E) accents only. Pretendard font.
- **Auth**: Email/password, gated to `@iastate.edu` only (admin bypass).
- **Storage**: collections — users, posts, comments, messages, daily_state.

## User Personas
1. **Iowa State student**: receives only 1 post/day, must wait through Golden Hour, may become Champion next day if their post tops likes.
2. **Champion (yesterday's #1)**: instant 00:00 unlock + 24h auto-purging private channel to admin.
3. **Admin (operator)**: bypasses all gates, sees real author identities, can post 5/day, can moderate.

## Core Game Rules (P0 — implemented)
- Server-wide cap: 5 posts/day
- Per-user cap: 1 post/day (admin: 5/day)
- Golden Hour: random unlock between 00:00–01:00 America/Chicago
- Champion priority + admin direct line (24h auto-purge)
- 3 reports → blinded blur
- Full anonymity (posts labeled `#1`–`#5`, comments `익명N` or `글쓴이`, DMs `ANON-XXXX`)

## Implemented (2026-02-05)
- ✅ Pure dark Pure-Minimal UI (Gate, Login, Register, Feed, NewPost, PostDetail, Messages, Profile)
- ✅ @iastate.edu email gate (admin override)
- ✅ Slot visualization (`AVAILABLE: X/5` + 5-bar slot grid)
- ✅ Status state machine (Spectator / Done / Waiting + countdown / CanPost)
- ✅ Posts with reactions (like, report, delete)
- ✅ Anonymous comments with stable per-user labels (`익명1`, `글쓴이`, `운영자`)
- ✅ Double-blind DMs (ANON-XXXX handles)
- ✅ Champion → Admin Direct Line (24h purge)
- ✅ Admin views with real author emails
- ✅ Test suite (18/18 passing)

## Backlog (P1)
- Real-time updates via WebSockets/SSE (live slot fill, new comments, new DMs)
- Email verification + password reset (currently no verification — anyone with iastate-style address can register)
- Rate limit on /auth/register
- Push notifications for unread DMs
- Champion history / leaderboard archive
- Multi-school support (per-domain feeds)

## P2
- Mobile native app
- Themes (different cardinal colors per school)
- Daily digest email
- Post scheduling (release at exact unlock time)
- Better admin moderation panel (search, batch actions)

## Next Tasks
- User testing on the Iowa State campus
- Set up email verification before public launch
- Pin CORS origin (currently `*` with credentials)
- Consider splitting server.py into routers as it approaches 700 lines
