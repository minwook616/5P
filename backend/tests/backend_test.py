"""CampusTalk backend API tests"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://campus-connect-955.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@everytime.com"
ADMIN_PASSWORD = "admin123"


def _sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register(s, suffix=None):
    suffix = suffix or uuid.uuid4().hex[:8]
    payload = {
        "email": f"TEST_{suffix}@example.com",
        "password": "testpass123",
        "nickname": f"TEST_{suffix}",
        "school": "TestU",
    }
    r = s.post(f"{API}/auth/register", json=payload)
    return r, payload


# ---------- Auth ----------
class TestAuth:
    def test_admin_login(self):
        s = _sess()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == ADMIN_EMAIL
        assert "access_token" in data
        # cookies
        assert "access_token" in s.cookies.get_dict() or r.cookies.get("access_token")

    def test_register_login_me_logout(self):
        s = _sess()
        r, payload = _register(s)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["email"] == payload["email"].lower()
        assert user["nickname"] == payload["nickname"]

        # /me via cookie
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == payload["email"]

        # logout
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200

        # login back
        r = s.post(f"{API}/auth/login", json={"email": payload["email"], "password": payload["password"]})
        assert r.status_code == 200

    def test_duplicate_email_and_nickname(self):
        s = _sess()
        r, payload = _register(s)
        assert r.status_code == 200
        # dup email
        s2 = _sess()
        r2 = s2.post(f"{API}/auth/register", json=payload)
        assert r2.status_code == 400
        # dup nickname with different email
        p2 = dict(payload, email=f"TEST_{uuid.uuid4().hex[:8]}@example.com")
        r3 = s2.post(f"{API}/auth/register", json=p2)
        assert r3.status_code == 400

    def test_wrong_password(self):
        s = _sess()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_without_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Posts / quota / like ----------
class TestPosts:
    def setup_method(self):
        self.s = _sess()
        r, self.payload = _register(self.s)
        assert r.status_code == 200
        self.user_id = r.json()["user"]["id"]

    def test_quota_initial(self):
        r = self.s.get(f"{API}/posts/quota")
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 5
        assert d["used"] == 0
        assert d["remaining"] == 5

    def test_create_list_get_like_delete(self):
        body = {"title": "TEST title", "content": "hello", "category": "free", "is_anonymous": True}
        r = self.s.post(f"{API}/posts", json=body)
        assert r.status_code == 200, r.text
        p = r.json()
        pid = p["id"]
        assert p["author_nickname"] == "익명"
        assert p["author_id"] is None
        assert p["is_mine"] is True

        # list
        r = self.s.get(f"{API}/posts")
        assert r.status_code == 200
        assert any(x["id"] == pid for x in r.json())

        # list with category filter
        r = self.s.get(f"{API}/posts", params={"category": "free"})
        assert r.status_code == 200

        # get single
        r = self.s.get(f"{API}/posts/{pid}")
        assert r.status_code == 200
        assert r.json()["views"] >= 1

        # like toggle on
        r = self.s.post(f"{API}/posts/{pid}/like")
        assert r.status_code == 200
        assert r.json()["liked"] is True
        assert r.json()["like_count"] == 1
        # toggle off
        r = self.s.post(f"{API}/posts/{pid}/like")
        assert r.json()["liked"] is False
        assert r.json()["like_count"] == 0

        # delete
        r = self.s.delete(f"{API}/posts/{pid}")
        assert r.status_code == 200
        r = self.s.get(f"{API}/posts/{pid}")
        assert r.status_code == 404

    def test_daily_limit(self):
        for i in range(5):
            r = self.s.post(f"{API}/posts", json={"title": f"t{i}", "content": "c", "category": "free"})
            assert r.status_code == 200, r.text
        r = self.s.post(f"{API}/posts", json={"title": "t6", "content": "c", "category": "free"})
        assert r.status_code == 429
        assert "5" in r.json()["detail"]

    def test_invalid_category(self):
        r = self.s.post(f"{API}/posts", json={"title": "t", "content": "c", "category": "bad"})
        assert r.status_code == 400

    def test_delete_other_user_forbidden(self):
        r = self.s.post(f"{API}/posts", json={"title": "t", "content": "c", "category": "free"})
        pid = r.json()["id"]
        s2 = _sess()
        _register(s2)
        r = s2.delete(f"{API}/posts/{pid}")
        assert r.status_code == 403


# ---------- Comments ----------
class TestComments:
    def test_comment_flow(self):
        s = _sess()
        _register(s)
        r = s.post(f"{API}/posts", json={"title": "pt", "content": "pc", "category": "free"})
        pid = r.json()["id"]
        # create comment
        r = s.post(f"{API}/posts/{pid}/comments", json={"content": "hi", "is_anonymous": True})
        assert r.status_code == 200
        cid = r.json()["id"]
        assert r.json()["author_nickname"] == "익명"
        # list
        r = s.get(f"{API}/posts/{pid}/comments")
        assert r.status_code == 200
        assert len(r.json()) == 1
        # post comment_count incremented
        p = s.get(f"{API}/posts/{pid}").json()
        assert p["comment_count"] == 1
        # delete
        r = s.delete(f"{API}/comments/{cid}")
        assert r.status_code == 200
        p = s.get(f"{API}/posts/{pid}").json()
        assert p["comment_count"] == 0


# ---------- Messages ----------
class TestMessages:
    def test_dm_flow(self):
        a = _sess(); _register(a)
        b = _sess(); rb, _ = _register(b)
        uid_b = rb.json()["user"]["id"]
        uid_a = a.get(f"{API}/auth/me").json()["id"]

        # cannot DM self
        r = a.post(f"{API}/messages", json={"recipient_id": uid_a, "content": "hi"})
        assert r.status_code == 400

        # a -> b
        r = a.post(f"{API}/messages", json={"recipient_id": uid_b, "content": "hello b"})
        assert r.status_code == 200

        # b sees conversation with unread=1
        r = b.get(f"{API}/messages/conversations")
        assert r.status_code == 200
        convs = r.json()
        assert any(c["other_user"]["id"] == uid_a and c["unread"] >= 1 for c in convs)

        # b reads thread -> marks read
        r = b.get(f"{API}/messages/{uid_a}")
        assert r.status_code == 200
        assert len(r.json()["messages"]) >= 1

        r = b.get(f"{API}/messages/conversations")
        convs = r.json()
        assert all(c["unread"] == 0 for c in convs if c["other_user"]["id"] == uid_a)

    def test_search(self):
        s = _sess()
        r, payload = _register(s)
        uid = r.json()["user"]["id"]
        s2 = _sess(); _register(s2)
        r = s2.get(f"{API}/users/search", params={"q": payload["nickname"][:6]})
        assert r.status_code == 200
        assert any(u["id"] == uid for u in r.json())
