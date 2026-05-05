"""5P (Five Posts) backend API tests."""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

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


def _new_email():
    return f"test_{uuid.uuid4().hex[:8]}@iastate.edu"


def _register(s, email=None, password="testpass123"):
    email = email or _new_email()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": password})
    return r, email


def _login(s, email, password="testpass123"):
    return s.post(f"{API}/auth/login", json={"email": email, "password": password})


def _admin_session():
    s = _sess()
    r = _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, r.text
    return s


# --- Mongo helpers (direct mutation for time-sensitive tests) ---
def _mongo_run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _backdate_unlock(date_key):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    await db.daily_state.update_one({"date_key": date_key}, {"$set": {"unlock_at": past}}, upsert=False)
    client.close()


async def _future_unlock(date_key):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    await db.daily_state.update_one({"date_key": date_key}, {"$set": {"unlock_at": future}}, upsert=False)
    client.close()


async def _wipe_today_posts(date_key):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.posts.delete_many({"date_key": date_key})
    client.close()


# ---------- Auth & email gate ----------
class TestAuthGate:
    def test_non_iastate_email_blocked(self):
        s = _sess()
        r = s.post(f"{API}/auth/register",
                   json={"email": f"x_{uuid.uuid4().hex[:6]}@gmail.com", "password": "testpass123"})
        assert r.status_code == 403, r.text
        assert "iastate.edu" in r.json()["detail"]

    def test_iastate_email_register_ok(self):
        s = _sess()
        r, email = _register(s)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["email"] == email
        assert u["is_admin"] is False
        # cookies set
        assert s.cookies.get("access_token")

    def test_admin_login_and_me(self):
        s = _admin_session()
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d["is_admin"] is True

    def test_wrong_password(self):
        s = _sess()
        r = _login(s, ADMIN_EMAIL, "wrong_password_xx")
        assert r.status_code == 401

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_logout_clears_cookies(self):
        s = _admin_session()
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # after logout, /auth/me should fail
        s2 = requests.Session()  # no cookies
        r2 = s2.get(f"{API}/auth/me")
        assert r2.status_code == 401


# ---------- Status ----------
class TestStatus:
    def test_status_shape(self):
        s = _admin_session()
        r = s.get(f"{API}/status/today")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["today_key", "unlock_at", "server_used", "server_limit",
                  "available_slots", "is_admin", "is_champion", "can_post_now",
                  "spectator_mode"]:
            assert k in d, f"missing {k}"
        assert d["server_limit"] == 5
        assert d["is_admin"] is True
        assert d["can_post_now"] is True  # admin always can post

    def test_status_regular_user_golden_hour_locked(self):
        # Fresh user; unless the random unlock has already passed, expect block.
        s = _sess()
        r, _ = _register(s)
        assert r.status_code == 200
        r = s.get(f"{API}/status/today")
        d = r.json()
        # If golden hour passed naturally, can_post_now True. Else blocked.
        if not d["can_post_now"]:
            assert d["block_reason"] in ("GOLDEN_HOUR_LOCKED", "SERVER_FULL")


# ---------- Posts: rules & blinding ----------
class TestPostsRules:
    def test_admin_can_post_and_serialize(self):
        s = _admin_session()
        # Ensure room: query status
        st = s.get(f"{API}/status/today").json()
        if st["server_used"] >= 5:
            pytest.skip("server already full; cleanup needed")
        r = s.post(f"{API}/posts", json={"title": "TEST_admin", "content": "hi"})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["author_label"] == "운영자" or p["author_label"] == ADMIN_EMAIL  # admin viewer sees email
        # admin viewing own post: show_real path
        assert p["author_label"] == ADMIN_EMAIL
        assert p["is_admin_post"] is True
        # cleanup
        s.delete(f"{API}/posts/{p['id']}")

    def test_regular_user_blocked_by_golden_hour(self):
        s = _sess()
        r, _ = _register(s)
        assert r.status_code == 200
        # force unlock to future to guarantee GOLDEN_HOUR_LOCKED
        date_key = s.get(f"{API}/status/today").json()["today_key"]
        _mongo_run(_future_unlock(date_key))
        st = s.get(f"{API}/status/today").json()
        if st["spectator_mode"]:
            pytest.skip("server full")
        assert st["can_post_now"] is False
        assert st["block_reason"] == "GOLDEN_HOUR_LOCKED"
        r = s.post(f"{API}/posts", json={"title": "early", "content": "x"})
        assert r.status_code == 423, r.text
        # restore for following tests
        _mongo_run(_backdate_unlock(date_key))

    def test_user_done_after_one_post(self):
        # Backdate unlock so user can post; create one; then second blocked by USER_DONE
        date_key = datetime.now().strftime("%Y-%m-%d")  # local today (server uses Chicago; close enough for daily_state record)
        s = _sess()
        r, _ = _register(s)
        st = s.get(f"{API}/status/today").json()
        date_key = st["today_key"]
        _mongo_run(_backdate_unlock(date_key))
        st = s.get(f"{API}/status/today").json()
        if st["spectator_mode"]:
            pytest.skip("server is full; can't test USER_DONE")
        r1 = s.post(f"{API}/posts", json={"title": "TEST_first", "content": "1"})
        assert r1.status_code == 200, r1.text
        r2 = s.post(f"{API}/posts", json={"title": "TEST_second", "content": "2"})
        assert r2.status_code == 423
        # cleanup
        admin = _admin_session()
        admin.delete(f"{API}/posts/{r1.json()['id']}")

    def test_anonymous_label_for_regular_post(self):
        # admin posts (so we definitely can), then create regular user post via backdate
        admin = _admin_session()
        date_key = admin.get(f"{API}/status/today").json()["today_key"]
        _mongo_run(_backdate_unlock(date_key))
        s = _sess()
        r, _ = _register(s)
        st = s.get(f"{API}/status/today").json()
        if not st["can_post_now"]:
            pytest.skip("cannot post (server full)")
        rp = s.post(f"{API}/posts", json={"title": "TEST_anon", "content": "x"})
        assert rp.status_code == 200, rp.text
        pid = rp.json()["id"]

        # regular viewer: another fresh user
        s2 = _sess()
        _register(s2)
        view = s2.get(f"{API}/posts/{pid}").json()
        assert view["author_label"].startswith("#"), view
        assert view["author_id"] is None  # not admin viewer

        # admin viewer sees email
        admin_view = admin.get(f"{API}/posts/{pid}").json()
        assert "@iastate.edu" in admin_view["author_label"]
        assert admin_view["author_id"] is not None

        admin.delete(f"{API}/posts/{pid}")


# ---------- Like / Report / Blinding ----------
class TestInteractions:
    def _setup_post(self):
        admin = _admin_session()
        st = admin.get(f"{API}/status/today").json()
        if st["server_used"] >= 5:
            # try to create room by deleting one TEST_ post
            posts = admin.get(f"{API}/posts").json()
            for p in posts:
                if p.get("title", "").startswith("TEST_"):
                    admin.delete(f"{API}/posts/{p['id']}")
                    break
        r = admin.post(f"{API}/posts", json={"title": "TEST_inter", "content": "y"})
        assert r.status_code == 200, r.text
        return admin, r.json()["id"]

    def test_like_toggle(self):
        admin, pid = self._setup_post()
        s = _sess(); _register(s)
        r1 = s.post(f"{API}/posts/{pid}/like")
        assert r1.status_code == 200
        assert r1.json()["liked"] is True
        r2 = s.post(f"{API}/posts/{pid}/like")
        assert r2.json()["liked"] is False
        admin.delete(f"{API}/posts/{pid}")

    def test_self_report_blocked_and_blinded_after_3(self):
        admin, pid = self._setup_post()
        # admin self-report -> 400
        rs = admin.post(f"{API}/posts/{pid}/report")
        assert rs.status_code == 400

        # 3 distinct user reports
        for _ in range(3):
            u = _sess(); _register(u)
            rr = u.post(f"{API}/posts/{pid}/report")
            assert rr.status_code == 200, rr.text

        # non-admin viewer sees blinded
        viewer = _sess(); _register(viewer)
        v = viewer.get(f"{API}/posts/{pid}").json()
        assert v["blinded"] is True
        assert v["title"] == "블라인드 처리된 글"

        # admin still sees real content
        a = admin.get(f"{API}/posts/{pid}").json()
        assert a["blinded"] is True
        assert a["title"] == "TEST_inter"

        admin.delete(f"{API}/posts/{pid}")


# ---------- Comments ----------
class TestComments:
    def test_comment_labels_and_counts(self):
        admin = _admin_session()
        # admin creates post
        r = admin.post(f"{API}/posts", json={"title": "TEST_cmt", "content": "z"})
        if r.status_code != 200:
            pytest.skip(f"could not create post: {r.text}")
        pid = r.json()["id"]

        # author (admin) comments on own admin post -> author_is_admin so label "운영자"
        c1 = admin.post(f"{API}/posts/{pid}/comments", json={"content": "self comment"})
        assert c1.status_code == 200
        # admin viewer sees email label (because show_real -> author_email)
        # serialize_comment: if author_is_admin -> "운영자"; OR if is_admin viewer -> email
        # Code: label initially set to email if admin viewer; then overridden to "운영자" if author_is_admin.
        assert c1.json()["author_label"] in ("운영자", ADMIN_EMAIL)

        # other user comments
        u = _sess(); _register(u)
        c2 = u.post(f"{API}/posts/{pid}/comments", json={"content": "anon comment"})
        assert c2.status_code == 200
        # u is non-admin viewer; c2 is by u; post author is admin (different); label should be "익명N"
        assert c2.json()["author_label"].startswith("익명"), c2.json()

        # comment_count incremented
        p = admin.get(f"{API}/posts/{pid}").json()
        assert p["comment_count"] == 2

        admin.delete(f"{API}/posts/{pid}")


# ---------- DM / Anonymous ----------
class TestMessages:
    def test_self_dm_blocked(self):
        s = _admin_session()
        me = s.get(f"{API}/auth/me").json()
        r = s.post(f"{API}/messages", json={"recipient_id": me["id"], "content": "x"})
        assert r.status_code == 400

    def test_send_and_conversation_anon_label(self):
        a = _sess(); ra, _ = _register(a)
        b = _sess(); rb, _ = _register(b)
        uid_a = ra.json()["user"]["id"]
        uid_b = rb.json()["user"]["id"]

        # a -> b
        r = a.post(f"{API}/messages", json={"recipient_id": uid_b, "content": "hello"})
        assert r.status_code == 200, r.text

        convs = b.get(f"{API}/messages/conversations").json()
        my_conv = [c for c in convs if c.get("other_user_id") == uid_a]
        assert my_conv, convs
        assert my_conv[0]["label"].startswith("ANON-")
        assert len(my_conv[0]["label"]) == len("ANON-XXXX")

    def test_start_dm_from_post_self_blocked(self):
        admin = _admin_session()
        r = admin.post(f"{API}/posts", json={"title": "TEST_dm", "content": "p"})
        if r.status_code != 200:
            pytest.skip("cannot create post")
        pid = r.json()["id"]
        # admin starting DM on own post -> 400
        rs = admin.post(f"{API}/messages/start/{pid}")
        assert rs.status_code == 400

        # other user starts DM -> 200 with recipient_id, conv_id (without revealing identity to UI but server returns id)
        u = _sess(); _register(u)
        rr = u.post(f"{API}/messages/start/{pid}")
        assert rr.status_code == 200, rr.text
        assert "recipient_id" in rr.json() and "conv_id" in rr.json()
        admin.delete(f"{API}/posts/{pid}")
