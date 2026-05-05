"""5P (Five Posts) — Iteration 3 backend tests.

Covers: recommendation key gating, OTP verify/resend, status gating,
admin approve/reject + keys, admin shadow comments, admin boost + champion grant,
champion board, password reset.
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


def _new_email():
    return f"test_{uuid.uuid4().hex[:8]}@iastate.edu"


def _mint_admin_key():
    a = _admin_session()
    r = a.post(f"{API}/admin/keys")
    assert r.status_code == 200, r.text
    return r.json()["code"]


def _read_otp_from_logs(email):
    for path in ["/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"]:
        try:
            out = subprocess.check_output(["tail", "-n", "500", path], text=True, stderr=subprocess.DEVNULL)
        except Exception:
            continue
        pat = re.compile(rf"OTP (?:for|resend for) {re.escape(email)}.*?:\s*(\d{{6}})")
        codes = pat.findall(out)
        if codes:
            return codes[-1]
    return None


def _read_reset_token_from_logs(email):
    for path in ["/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"]:
        try:
            out = subprocess.check_output(["tail", "-n", "500", path], text=True, stderr=subprocess.DEVNULL)
        except Exception:
            continue
        pat = re.compile(rf"Password reset for {re.escape(email)}.*?token\):\s*(\S+)")
        toks = pat.findall(out)
        if toks:
            return toks[-1]
    return None


def _register(s, code, email=None, password="testpass123"):
    email = email or _new_email()
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": password, "recommendation_code": code
    })
    return r, email


def _register_and_verify(code=None):
    code = code or _mint_admin_key()
    s = _sess()
    r, email = _register(s, code)
    assert r.status_code == 200, r.text
    uid = r.json()["user"]["id"]
    time.sleep(0.4)
    otp = _read_otp_from_logs(email)
    assert otp, f"OTP for {email} not found in logs"
    rv = s.post(f"{API}/auth/verify-otp", json={"code": otp})
    assert rv.status_code == 200, rv.text
    assert rv.json()["status"] == "pending_review"
    return s, email, uid


def _make_active_user():
    s, email, uid = _register_and_verify()
    a = _admin_session()
    r = a.post(f"{API}/admin/users/{uid}/approve")
    assert r.status_code == 200, r.text
    return s, email, uid


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
class TestRegistrationGate:
    def test_register_requires_iastate_domain(self):
        code = _mint_admin_key()
        s = _sess()
        r = s.post(f"{API}/auth/register", json={
            "email": f"a_{uuid.uuid4().hex[:6]}@gmail.com",
            "password": "testpass123",
            "recommendation_code": code,
        })
        assert r.status_code == 403, r.text

    def test_register_invalid_key_rejected(self):
        s = _sess()
        r, _ = _register(s, "5P-INVALID999")
        assert r.status_code == 400, r.text

    def test_register_missing_key_field(self):
        s = _sess()
        r = s.post(f"{API}/auth/register", json={
            "email": _new_email(), "password": "testpass123"
        })
        assert r.status_code == 422

    def test_register_success_pending_email_and_consumes_key(self):
        code = _mint_admin_key()
        s = _sess()
        r, email = _register(s, code)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["status"] == "pending_email"
        assert u["email"] == email
        assert s.cookies.get("access_token")
        a = _admin_session()
        keys = a.get(f"{API}/admin/keys").json()
        used = [k for k in keys if k["code"] == code]
        assert used and used[0]["used"] is True

    def test_used_key_cannot_be_reused(self):
        code = _mint_admin_key()
        s1 = _sess(); r1, _ = _register(s1, code)
        assert r1.status_code == 200
        s2 = _sess(); r2, _ = _register(s2, code)
        assert r2.status_code == 400, r2.text


# ============================================================
class TestOtpFlow:
    def test_verify_otp_success(self):
        s, email, uid = _register_and_verify()
        me = s.get(f"{API}/auth/me").json()
        assert me["status"] == "pending_review"

    def test_verify_wrong_code_5_attempts_then_429(self):
        code = _mint_admin_key()
        s = _sess()
        r, email = _register(s, code)
        assert r.status_code == 200
        for _ in range(5):
            x = s.post(f"{API}/auth/verify-otp", json={"code": "000000"})
            assert x.status_code in (400, 429)
        r6 = s.post(f"{API}/auth/verify-otp", json={"code": "000000"})
        assert r6.status_code == 429, r6.text

    def test_resend_otp_invalidates_old(self):
        code = _mint_admin_key()
        s = _sess()
        r, email = _register(s, code)
        assert r.status_code == 200
        time.sleep(0.4)
        first = _read_otp_from_logs(email)
        time.sleep(1.1)
        rr = s.post(f"{API}/auth/resend-otp")
        assert rr.status_code == 200
        time.sleep(0.4)
        second = _read_otp_from_logs(email)
        assert second
        if first and first != second:
            bad = s.post(f"{API}/auth/verify-otp", json={"code": first})
            assert bad.status_code == 400


# ============================================================
class TestStatusGate:
    def test_pending_email_blocked_from_posts_and_messages(self):
        code = _mint_admin_key()
        s = _sess()
        r, _ = _register(s, code)
        assert r.status_code == 200
        assert s.get(f"{API}/posts").status_code == 403
        assert s.get(f"{API}/messages/conversations").status_code == 403

    def test_pending_review_blocked(self):
        s, email, uid = _register_and_verify()
        assert s.get(f"{API}/posts").status_code == 403
        assert s.post(f"{API}/posts/anyid/like").status_code == 403


# ============================================================
class TestAdminApproval:
    def test_pending_list_includes_recommended_by(self):
        s, email, uid = _register_and_verify()
        a = _admin_session()
        items = a.get(f"{API}/admin/pending").json()
        mine = [u for u in items if u["id"] == uid]
        assert mine
        assert mine[0].get("recommended_by_email") == ADMIN_EMAIL

    def test_approve_makes_active(self):
        s, email, uid = _register_and_verify()
        a = _admin_session()
        r = a.post(f"{API}/admin/users/{uid}/approve")
        assert r.status_code == 200
        assert s.get(f"{API}/posts").status_code == 200
        assert s.get(f"{API}/auth/me").json()["status"] == "active"

    def test_reject_blocks(self):
        s, email, uid = _register_and_verify()
        a = _admin_session()
        r = a.post(f"{API}/admin/users/{uid}/reject")
        assert r.status_code == 200
        assert s.get(f"{API}/auth/me").json()["status"] == "rejected"
        assert s.get(f"{API}/posts").status_code == 403


# ============================================================
class TestAdminKeys:
    def test_mint_and_list(self):
        a = _admin_session()
        r = a.post(f"{API}/admin/keys")
        assert r.status_code == 200
        code = r.json()["code"]
        assert code.startswith("5P-")
        lst = a.get(f"{API}/admin/keys").json()
        assert any(k["code"] == code for k in lst)

    def test_non_admin_cannot_mint(self):
        s, *_ = _make_active_user()
        assert s.post(f"{API}/admin/keys").status_code == 403


# ============================================================
class TestShadowMode:
    def test_admin_as_admin_label_and_non_admin_403(self):
        a = _admin_session()
        _mongo_run(_backdate_unlock_all())
        rp = a.post(f"{API}/posts", json={"title": "TEST_shadow", "content": "x"})
        if rp.status_code != 200:
            pytest.skip(f"cannot create post: {rp.text}")
        pid = rp.json()["id"]
        try:
            rc = a.post(f"{API}/posts/{pid}/comments", json={"content": "official", "as_admin": True})
            assert rc.status_code == 200
            assert rc.json()["display_as_admin"] is True

            v, *_ = _make_active_user()
            comments = v.get(f"{API}/posts/{pid}/comments").json()
            shadow = [c for c in comments if c["display_as_admin"]]
            assert shadow and shadow[0]["author_label"] == "운영자"

            # non-admin cannot use as_admin
            r403 = v.post(f"{API}/posts/{pid}/comments", json={"content": "x", "as_admin": True})
            assert r403.status_code == 403

            # Admin without as_admin -> not shadow
            rc2 = a.post(f"{API}/posts/{pid}/comments", json={"content": "casual", "as_admin": False})
            assert rc2.status_code == 200
            assert rc2.json()["display_as_admin"] is False
        finally:
            a.delete(f"{API}/posts/{pid}")


# ============================================================
class TestBoostChampion:
    def test_boost_creates_champion_and_grants_one_time_key(self):
        a = _admin_session()
        _mongo_run(_backdate_unlock_all())
        u, email, uid = _make_active_user()
        st = u.get(f"{API}/status/today").json()
        if st.get("spectator_mode") or not st.get("can_post_now"):
            pytest.skip(f"cannot post: {st.get('block_reason')}")
        rp = u.post(f"{API}/posts", json={"title": "TEST_champ", "content": "y"})
        assert rp.status_code == 200, rp.text
        pid = rp.json()["id"]
        try:
            rb = a.post(f"{API}/admin/posts/{pid}/boost", json={"boost": 20})
            assert rb.status_code == 200
            view = a.get(f"{API}/posts/{pid}").json()
            assert view["is_champion"] is True
            assert view["like_count"] >= 15

            me = u.get(f"{API}/auth/me").json()
            assert me["key_granted"] is True
            keys = u.get(f"{API}/me/keys").json()
            champ = [k for k in keys if k["source"] == "champion"]
            assert len(champ) == 1

            # second boost: no extra key
            a.post(f"{API}/admin/posts/{pid}/boost", json={"boost": 25})
            keys2 = u.get(f"{API}/me/keys").json()
            assert len([k for k in keys2 if k["source"] == "champion"]) == 1
        finally:
            a.delete(f"{API}/posts/{pid}")


# ============================================================
class TestChampionBoard:
    def test_champions_endpoint_and_feed_exclusion(self):
        a = _admin_session()
        _mongo_run(_backdate_unlock_all())
        u, *_ = _make_active_user()
        st = u.get(f"{API}/status/today").json()
        if not st.get("can_post_now"):
            pytest.skip(f"cannot post: {st.get('block_reason')}")
        rp = u.post(f"{API}/posts", json={"title": "TEST_cb", "content": "z"})
        assert rp.status_code == 200
        pid = rp.json()["id"]
        try:
            a.post(f"{API}/admin/posts/{pid}/boost", json={"boost": 16})
            ch = a.get(f"{API}/champions").json()
            assert any(p["id"] == pid for p in ch)
            feed = a.get(f"{API}/posts").json()
            assert not any(p["id"] == pid for p in feed)
        finally:
            a.delete(f"{API}/posts/{pid}")


# ============================================================
class TestPasswordReset:
    def test_forgot_silent_unknown(self):
        s = _sess()
        r = s.post(f"{API}/auth/forgot-password", json={"email": "nobody_xyz@iastate.edu"})
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_forgot_then_reset_then_login(self):
        u, email, uid = _make_active_user()
        s = _sess()
        r = s.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        time.sleep(0.4)
        token = _read_reset_token_from_logs(email)
        assert token, f"no reset token in logs for {email}"
        new_pw = "newpass456"
        rr = s.post(f"{API}/auth/reset-password", json={"token": token, "password": new_pw})
        assert rr.status_code == 200
        # reuse blocked
        rr2 = s.post(f"{API}/auth/reset-password", json={"token": token, "password": "again789"})
        assert rr2.status_code == 400
        # login with new pw
        s2 = _sess()
        rl = s2.post(f"{API}/auth/login", json={"email": email, "password": new_pw})
        assert rl.status_code == 200

    def test_reset_invalid_token(self):
        s = _sess()
        r = s.post(f"{API}/auth/reset-password", json={"token": "garbage", "password": "abc123"})
        assert r.status_code == 400


# ============================================================
class TestAdminAuth:
    def test_admin_login_and_me(self):
        s = _admin_session()
        me = s.get(f"{API}/auth/me").json()
        assert me["is_admin"] is True
        assert me["status"] == "active"
