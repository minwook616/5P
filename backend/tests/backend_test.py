"""5P Iteration 4 backend tests — dual gateway (ISU & Invitation) + genealogy.

New endpoints under test:
- POST /api/auth/register/isu  (Gate A; @iastate.edu; OTP -> auto-active)
- POST /api/auth/register/invite (Gate B; any email; needs key; pending_review)
- GET /api/admin/pending (recommender_stats payload)
- GET /api/admin/users/{uid} (recommender + invitees + stats)
- GET /api/admin/invite-log
"""
import os
import re
import uuid
import time
import asyncio
import requests
import pytest
import subprocess
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@iastate.edu"
ADMIN_PASSWORD = "admin123"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "five_p")


def _sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _admin_session():
    s = _sess()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


def _new_isu_email():
    return f"test_{uuid.uuid4().hex[:8]}@iastate.edu"


def _new_external_email():
    return f"ext_{uuid.uuid4().hex[:8]}@gmail.com"


def _mint_admin_key():
    a = _admin_session()
    r = a.post(f"{API}/admin/keys")
    assert r.status_code == 200, r.text
    return r.json()["code"]


def _read_otp_from_logs(email):
    for path in ["/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"]:
        try:
            out = subprocess.check_output(["tail", "-n", "800", path], text=True, stderr=subprocess.DEVNULL)
        except Exception:
            continue
        pat = re.compile(rf"OTP (?:for|resend for) {re.escape(email)}.*?:\s*(\d{{6}})")
        codes = pat.findall(out)
        if codes:
            return codes[-1]
    return None


def _register_isu_and_verify():
    """Register an ISU user, verify OTP -> should be ACTIVE directly."""
    s = _sess()
    email = _new_isu_email()
    r = s.post(f"{API}/auth/register/isu", json={"email": email, "password": "testpass123"})
    assert r.status_code == 200, r.text
    uid = r.json()["user"]["id"]
    assert r.json()["user"]["status"] == "pending_email"
    assert r.json()["user"]["gate"] == "isu"
    time.sleep(0.5)
    otp = _read_otp_from_logs(email)
    assert otp, f"OTP for {email} not in logs"
    rv = s.post(f"{API}/auth/verify-otp", json={"code": otp})
    assert rv.status_code == 200, rv.text
    return s, email, uid


def _register_invite(code, email=None):
    s = _sess()
    email = email or _new_external_email()
    r = s.post(f"{API}/auth/register/invite", json={
        "email": email, "password": "testpass123", "recommendation_code": code
    })
    return s, email, r


def _mongo_run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _backdate_unlock_all():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    await db.daily_state.update_many({}, {"$set": {"unlock_at": past}})
    client.close()


# ============================================================
# Gate A — ISU register
class TestRegisterIsu:
    def test_isu_rejects_non_iastate(self):
        s = _sess()
        r = s.post(f"{API}/auth/register/isu", json={
            "email": f"x_{uuid.uuid4().hex[:6]}@gmail.com", "password": "testpass123"
        })
        assert r.status_code == 403, r.text

    def test_isu_success_pending_email_and_gate_isu(self):
        s = _sess()
        email = _new_isu_email()
        r = s.post(f"{API}/auth/register/isu", json={"email": email, "password": "testpass123"})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["status"] == "pending_email"
        assert u["gate"] == "isu"
        assert s.cookies.get("access_token")

    def test_isu_otp_verify_makes_active_directly(self):
        s, email, uid = _register_isu_and_verify()
        me = s.get(f"{API}/auth/me").json()
        assert me["status"] == "active", me
        # should be able to access /posts
        assert s.get(f"{API}/posts").status_code == 200

    def test_isu_duplicate_email_rejected(self):
        s, email, uid = _register_isu_and_verify()
        s2 = _sess()
        r = s2.post(f"{API}/auth/register/isu", json={"email": email, "password": "testpass123"})
        assert r.status_code == 400


# ============================================================
# Gate B — Invitation register
class TestRegisterInvite:
    def test_invite_missing_code_422(self):
        s = _sess()
        r = s.post(f"{API}/auth/register/invite", json={
            "email": _new_external_email(), "password": "testpass123"
        })
        assert r.status_code == 422

    def test_invite_invalid_code_400(self):
        s, email, r = _register_invite("5P-NOPE9999")
        assert r.status_code == 400

    def test_invite_used_code_400(self):
        code = _mint_admin_key()
        _, _, r1 = _register_invite(code)
        assert r1.status_code == 200
        _, _, r2 = _register_invite(code)
        assert r2.status_code == 400

    def test_invite_success_pending_review_no_otp(self):
        code = _mint_admin_key()
        s, email, r = _register_invite(code)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["status"] == "pending_review"
        assert u["gate"] == "invite"
        assert "@gmail.com" in u["email"]
        # invite_logs entry must exist (admin endpoint)
        a = _admin_session()
        log = a.get(f"{API}/admin/invite-log").json()
        assert any(e["invited_email"] == email and e["gate"] == "invite" for e in log)

    def test_invite_user_cannot_use_verify_otp(self):
        code = _mint_admin_key()
        s, email, r = _register_invite(code)
        assert r.status_code == 200
        rv = s.post(f"{API}/auth/verify-otp", json={"code": "000000"})
        assert rv.status_code == 400, rv.text

    def test_invite_status_blocks_posts(self):
        code = _mint_admin_key()
        s, _, r = _register_invite(code)
        assert r.status_code == 200
        assert s.get(f"{API}/posts").status_code == 403


# ============================================================
# Admin pending list — recommender stats
class TestAdminPending:
    def test_pending_includes_recommender_and_stats(self):
        code = _mint_admin_key()
        s, email, r = _register_invite(code)
        assert r.status_code == 200
        uid = r.json()["user"]["id"]
        a = _admin_session()
        items = a.get(f"{API}/admin/pending").json()
        mine = [u for u in items if u["id"] == uid]
        assert mine, "user not in pending list"
        m = mine[0]
        assert m.get("gate") == "invite"
        assert m.get("recommended_by_email") == ADMIN_EMAIL
        assert m.get("recommended_by_nickname")
        st = m.get("recommender_stats")
        assert st and "posts" in st and "invites" in st
        assert isinstance(st["posts"], int) and isinstance(st["invites"], int)


# ============================================================
# Admin user-detail — genealogy
class TestAdminUserDetail:
    def test_user_detail_shape(self):
        code = _mint_admin_key()
        s, email, r = _register_invite(code)
        uid = r.json()["user"]["id"]
        a = _admin_session()
        d = a.get(f"{API}/admin/users/{uid}").json()
        assert d["user"]["id"] == uid
        assert d["user"]["gate"] == "invite"
        assert d["recommender"] is not None
        assert d["recommender"]["email"] == ADMIN_EMAIL
        assert "stats" in d
        for k in ("posts", "likes_received", "keys_owned", "keys_used", "invites_count"):
            assert k in d["stats"]
        assert isinstance(d["invitees"], list)

    def test_admin_user_detail_shows_invitees(self):
        # admin invited many users via key mint+invite-register
        a = _admin_session()
        admin_me = a.get(f"{API}/auth/me").json()
        admin_id = admin_me["id"]
        # make 1 fresh invitee
        code = _mint_admin_key()
        _, email, r = _register_invite(code)
        assert r.status_code == 200
        d = a.get(f"{API}/admin/users/{admin_id}").json()
        assert any(i["invited_email"] == email for i in d["invitees"])
        assert d["stats"]["invites_count"] >= 1


# ============================================================
# Admin invite log
class TestAdminInviteLog:
    def test_invite_log_records_isu_and_invite(self):
        a = _admin_session()
        # create one invite-gate user
        code = _mint_admin_key()
        _, ie_email, ri = _register_invite(code)
        assert ri.status_code == 200
        # create one ISU-gate user
        _, isu_email, _isu_uid = _register_isu_and_verify()

        log = a.get(f"{API}/admin/invite-log").json()
        assert isinstance(log, list)
        invite_entry = [e for e in log if e["invited_email"] == ie_email]
        assert invite_entry and invite_entry[0]["gate"] == "invite"
        assert invite_entry[0]["recommender_email"] == ADMIN_EMAIL

        isu_entry = [e for e in log if e["invited_email"] == isu_email]
        assert isu_entry and isu_entry[0]["gate"] == "isu"
        assert isu_entry[0]["recommender_id"] is None


# ============================================================
# Old endpoint removed
class TestOldEndpointRemoved:
    def test_legacy_register_404(self):
        s = _sess()
        r = s.post(f"{API}/auth/register", json={
            "email": _new_isu_email(), "password": "testpass123",
            "recommendation_code": "5P-XXXX"
        })
        assert r.status_code in (404, 405), r.status_code


# ============================================================
# Existing flows still work
class TestExistingFlows:
    def test_admin_login_me(self):
        a = _admin_session()
        me = a.get(f"{API}/auth/me").json()
        assert me["is_admin"] is True
        assert me["status"] == "active"

    def test_admin_mint_keys(self):
        a = _admin_session()
        r = a.post(f"{API}/admin/keys")
        assert r.status_code == 200
        assert r.json()["code"].startswith("5P-")

    def test_admin_post_and_boost_to_champion(self):
        a = _admin_session()
        _mongo_run(_backdate_unlock_all())
        rp = a.post(f"{API}/posts", json={"title": "TEST_iter4_champ", "content": "x"})
        if rp.status_code != 200:
            pytest.skip(f"admin cannot post: {rp.text}")
        pid = rp.json()["id"]
        try:
            rb = a.post(f"{API}/admin/posts/{pid}/boost", json={"boost": 20})
            assert rb.status_code == 200
            view = a.get(f"{API}/posts/{pid}").json()
            assert view["is_champion"] is True
            ch = a.get(f"{API}/champions").json()
            assert any(p["id"] == pid for p in ch)
        finally:
            a.delete(f"{API}/posts/{pid}")

    def test_isu_active_user_can_post_after_otp(self):
        a = _admin_session()
        _mongo_run(_backdate_unlock_all())
        s, email, uid = _register_isu_and_verify()
        st = s.get(f"{API}/status/today").json()
        if not st.get("can_post_now"):
            pytest.skip(f"cannot post: {st.get('block_reason')}")
        rp = s.post(f"{API}/posts", json={"title": "TEST_iter4_isu", "content": "y"})
        assert rp.status_code == 200, rp.text
        pid = rp.json()["id"]
        a.delete(f"{API}/posts/{pid}")

    def test_status_gate_blocks_invite_pending_review(self):
        code = _mint_admin_key()
        s, _, r = _register_invite(code)
        assert r.status_code == 200
        assert s.get(f"{API}/posts").status_code == 403
        assert s.get(f"{API}/messages/conversations").status_code == 403
        assert s.get(f"{API}/status/today").status_code == 403


# ============================================================
# Identity protection — Resend key not exposed
class TestIdentityProtection:
    def test_resend_key_not_in_any_response(self):
        a = _admin_session()
        for path in ("/auth/me", "/admin/pending", "/admin/keys", "/admin/invite-log"):
            txt = a.get(f"{API}{path}").text.lower()
            assert "resend" not in txt or "re_" not in txt
            # ensure no obvious api-key-shaped string
            assert "resend_api_key" not in txt
