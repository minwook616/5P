import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Admin() {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [keys, setKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [board, setBoard] = useState([]);
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterGate, setFilterGate] = useState("");
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [p, k, l, b, s] = await Promise.all([
        api.get("/admin/pending"),
        api.get("/admin/keys"),
        api.get("/admin/invite-log"),
        api.get("/admin/leaderboard"),
        api.get("/status/today"),
      ]);
      setPending(p.data);
      setKeys(k.data);
      setLogs(l.data);
      setBoard(b.data);
      setStatus(s.data);
      setNewKeyword(s.data.keyword || "");
      setSelected(new Set());
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const searchUsers = async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (userSearch) params.set("q", userSearch);
      if (filterStatus) params.set("status", filterStatus);
      if (filterGate) params.set("gate", filterGate);
      params.set("limit", "100");
      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setUsers(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (tab === "users") searchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const banUser = async (uid) => {
    const reason = window.prompt("차단 사유 (선택):", "") ?? null;
    if (reason === null) return;
    try {
      await api.post(`/admin/users/${uid}/ban`, { reason });
      toast.success("차단 완료");
      searchUsers();
      setDetail(null);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };
  const unbanUser = async (uid) => {
    try {
      await api.post(`/admin/users/${uid}/unban`);
      toast.success("차단 해제");
      searchUsers();
      setDetail(null);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const exportCsv = () => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/admin/users/export.csv`;
    window.open(url, "_blank");
  };

  const decide = async (uid, action) => {
    try {
      await api.post(`/admin/users/${uid}/${action}`);
      toast.success(action === "approve" ? "Approved" : "Rejected");
      setDetail(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const batchDecide = async (action) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length}명 ${action === "batch-approve" ? "승인" : "거절"}할까요?`)) return;
    try {
      const { data } = await api.post(`/admin/users/${action}`, { user_ids: ids });
      toast.success(`${data.count}명 처리됨`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const mintKey = async () => {
    try {
      const { data } = await api.post("/admin/keys");
      toast.success(`Key minted: ${data.code}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const openDetail = async (uid) => {
    try {
      const { data } = await api.get(`/admin/users/${uid}`);
      setDetail(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const updateKeyword = async () => {
    if (!newKeyword.trim()) return;
    try {
      await api.post("/admin/daily-keyword", { keyword: newKeyword.trim() });
      toast.success("Keyword updated");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const toggleSel = (uid) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid); else n.add(uid);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((u) => u.id)));
  };

  const flagLabel = (f) => ({
    HIGH_VOLUME: "다량 초대", FRESH_SPAMMER: "신규 폭주", HIGH_REJECT_RATE: "거절률 높음",
  }[f] || f);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[13px] uppercase tracking-[0.4em] fp-mono text-[var(--red)]">Admin</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tighter">Control<span className="text-[var(--red)]">.</span></h1>
        </div>
        <button onClick={mintKey} className="fp-btn fp-btn-red" data-testid="mint-key-btn">
          + Mint Key
        </button>
      </div>

      <nav className="flex gap-6 border-b border-[var(--line)] flex-wrap">
        {[
          ["pending", `Initiation (${pending.length})`],
          ["users", "Users"],
          ["keys", `Keys (${keys.length})`],
          ["logs", `Invite Log (${logs.length})`],
          ["board", `Leaderboard (${board.length})`],
          ["system", "System"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`pb-3 text-xs fp-mono uppercase tracking-[0.3em] border-b-2 -mb-px transition-colors ${
              tab === k ? "border-[var(--red)] text-[var(--text)]" : "border-transparent text-[var(--text-mute)] hover:text-[var(--text-dim)]"
            }`}
            data-testid={`tab-${k}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">Loading.</div>
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <div className="py-12 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
            No applications.
          </div>
        ) : (
          <div>
            {/* Batch toolbar */}
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-[var(--line)] text-xs fp-mono uppercase tracking-[0.25em]" data-testid="batch-toolbar">
              <button onClick={toggleAll} className="text-[var(--text-mute)] hover:text-[var(--text)]" data-testid="select-all">
                {selected.size === pending.length ? "Deselect all" : "Select all"}
              </button>
              <span className="text-[var(--text-mute)]">·</span>
              <span className="text-[var(--text-dim)]">{selected.size} selected</span>
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() => batchDecide("batch-approve")}
                  disabled={selected.size === 0}
                  className="fp-btn text-xs"
                  data-testid="batch-approve-btn"
                >Approve {selected.size > 0 ? selected.size : ""}</button>
                <button
                  onClick={() => batchDecide("batch-reject")}
                  disabled={selected.size === 0}
                  className="fp-btn fp-btn-red text-xs"
                  data-testid="batch-reject-btn"
                >Reject {selected.size > 0 ? selected.size : ""}</button>
              </span>
            </div>

            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-testid="pending-list">
              {pending.map((u) => (
                <div key={u.id} className="py-5 flex items-start gap-4 flex-wrap" data-testid={`pending-${u.id}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSel(u.id)}
                    className="mt-1.5 accent-[var(--red)]"
                    data-testid={`select-${u.id}`}
                  />
                  <button onClick={() => openDetail(u.id)} className="flex-1 text-left hover:opacity-80" data-testid={`detail-${u.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base">{u.email}</span>
                      <span className={`text-[9px] fp-mono uppercase tracking-[0.3em] px-1.5 py-0.5 border ${u.gate === "isu" ? "border-[var(--text-mute)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                        {u.gate === "isu" ? "ISU" : "Invite"}
                      </span>
                      {(u.recommender_flags || []).map((f) => (
                        <span key={f} className="text-[9px] fp-mono uppercase tracking-[0.3em] px-1.5 py-0.5 border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)]" data-testid={`flag-${f}`}>
                          ⚠ {flagLabel(f)}
                        </span>
                      ))}
                    </div>
                    <div className="text-[13px] fp-mono uppercase tracking-[0.25em] text-gray-300 mt-1">
                      추천인: <span className="text-[var(--text-dim)]">{u.recommended_by_nickname || "—"}</span>
                      {u.recommender_stats && (
                        <span className="ml-3">
                          posts {u.recommender_stats.posts} · invites {u.recommender_stats.invites}
                          {" · "}reject {Math.round((u.recommender_stats.reject_rate || 0) * 100)}%
                        </span>
                      )}
                    </div>
                    {u.email_verified_at && (
                      <div className="text-[13px] fp-mono uppercase tracking-[0.25em] text-gray-300 mt-1">
                        Verified · {new Date(u.email_verified_at).toLocaleString()}
                      </div>
                    )}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => decide(u.id, "approve")} className="fp-btn" data-testid={`approve-${u.id}`}>Approve</button>
                    <button onClick={() => decide(u.id, "reject")} className="fp-btn fp-btn-red" data-testid={`reject-${u.id}`}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : tab === "users" ? (
        <div data-testid="users-panel" className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") searchUsers(); }}
              placeholder="Search email or nickname"
              className="fp-input flex-1 min-w-[200px]"
              data-testid="user-search-input"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="fp-input w-auto bg-[var(--bg)] text-xs fp-mono uppercase tracking-[0.25em]"
              data-testid="filter-status"
            >
              <option value="">All status</option>
              <option value="active">active</option>
              <option value="pending_email">pending_email</option>
              <option value="pending_review">pending_review</option>
              <option value="rejected">rejected</option>
              <option value="banned">banned</option>
            </select>
            <select
              value={filterGate}
              onChange={(e) => setFilterGate(e.target.value)}
              className="fp-input w-auto bg-[var(--bg)] text-xs fp-mono uppercase tracking-[0.25em]"
              data-testid="filter-gate"
            >
              <option value="">All gates</option>
              <option value="isu">isu</option>
              <option value="invite">invite</option>
            </select>
            <button onClick={searchUsers} disabled={searching} className="fp-btn" data-testid="search-btn">
              {searching ? "..." : "Search"}
            </button>
            <button onClick={exportCsv} className="fp-btn fp-btn-red" data-testid="export-csv-btn">
              ⬇ CSV
            </button>
          </div>

          {users.length === 0 ? (
            <div className="py-12 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
              No users.
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-testid="users-list">
              {users.map((u) => (
                <div key={u.id} className="py-4 flex items-start justify-between gap-3 flex-wrap" data-testid={`user-${u.id}`}>
                  <button onClick={() => openDetail(u.id)} className="flex-1 text-left hover:opacity-80">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{u.email}</span>
                      <span className="text-xs text-[var(--text-mute)]">@{u.nickname}</span>
                      <span className={`text-[9px] fp-mono uppercase tracking-[0.3em] px-1.5 py-0.5 border ${u.gate === "isu" ? "border-[var(--text-mute)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                        {u.gate || "—"}
                      </span>
                      <span className={`text-[9px] fp-mono uppercase tracking-[0.3em] px-1.5 py-0.5 border ${
                        u.status === "active" ? "border-[var(--text-dim)] text-[var(--text-dim)]" :
                        u.status === "banned" ? "border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)]" :
                        "border-[var(--text-mute)] text-[var(--text-mute)]"
                      }`}>
                        {u.status}
                      </span>
                      {u.is_admin && <span className="text-[9px] fp-mono uppercase tracking-[0.3em] px-1.5 py-0.5 border border-[var(--red)] text-[var(--red)]">ADMIN</span>}
                    </div>
                    <div className="text-[13px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
                      posts {u.posts_count} · invites {u.invites_count}
                      {u.recommended_by_nickname && <span> · ←{u.recommended_by_nickname}</span>}
                      {u.ban_reason && <span className="text-[var(--red)]"> · banned: {u.ban_reason}</span>}
                    </div>
                  </button>
                  <div className="flex gap-2">
                    {u.status === "pending_review" && (
                      <>
                        <button onClick={() => decide(u.id, "approve")} className="fp-btn text-xs" data-testid={`u-approve-${u.id}`}>Approve</button>
                        <button onClick={() => decide(u.id, "reject")} className="fp-btn fp-btn-red text-xs" data-testid={`u-reject-${u.id}`}>Reject</button>
                      </>
                    )}
                    {u.status === "banned" && (
                      <button onClick={() => unbanUser(u.id)} className="fp-btn text-xs" data-testid={`unban-${u.id}`}>Unban</button>
                    )}
                    {u.status !== "banned" && !u.is_admin && (
                      <button onClick={() => banUser(u.id)} className="fp-btn fp-btn-red text-xs" data-testid={`ban-${u.id}`}>Ban</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "keys" ? (
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-testid="keys-list">
          {keys.map((k) => (
            <div key={k.code} className="py-4 flex items-center justify-between gap-3 flex-wrap" data-testid={`key-${k.code}`}>
              <div>
                <button
                  onClick={() => copy(k.code)}
                  className={`fp-mono text-base tracking-[0.15em] ${k.used ? "text-[var(--text-mute)] line-through" : "text-[var(--text)]"} hover:text-[var(--red)]`}
                >
                  {k.code}
                </button>
                <div className="text-[13px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
                  {k.source} · {k.used ? `used by ${k.used_by_id?.slice(0, 8)}…` : "available"}
                </div>
              </div>
              <span className={`text-[13px] fp-mono uppercase tracking-[0.3em] px-2 py-1 border ${k.used ? "border-[var(--line-strong)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                {k.used ? "Used" : "Available"}
              </span>
            </div>
          ))}
        </div>
      ) : tab === "logs" ? (
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-testid="invite-logs-list">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
              No invites yet.
            </div>
          ) : logs.map((l) => (
            <div key={l.id} className="py-4 flex items-center justify-between gap-3 flex-wrap" data-testid={`invite-log-${l.id}`}>
              <div>
                <div className="font-bold text-sm">{l.invited_email}</div>
                <div className="text-[13px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
                  via {l.gate === "isu" ? "ISU Self-Auth" : `초대받음 from ${l.recommender_nickname || l.recommender_email || "?"}`}
                </div>
              </div>
              <span className="text-[13px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)]">
                {new Date(l.joined_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : tab === "board" ? (
        <div data-testid="leaderboard-list">
          <div className="text-[13px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] mb-3">
            Top recommenders by approved invites
          </div>
          {board.length === 0 ? (
            <div className="py-12 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
              Empty.
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {board.map((row, i) => (
                <div key={row.recommender_id} className="py-4 flex items-center gap-4" data-testid={`board-row-${row.recommender_id}`}>
                  <span className="fp-mono text-2xl tracking-tighter w-10" style={{color: i < 3 ? "#D4AF37" : "var(--text-mute)"}}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">{row.nickname || row.email}</div>
                    <div className="text-[13px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">{row.email}</div>
                  </div>
                  <span className="fp-mono text-base text-[var(--red)]">{row.invites}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-md space-y-8" data-testid="system-panel">
          <div className="p-6 border border-[var(--line-strong)] bg-zinc-900/20 rounded-xl space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono mb-2">Daily Keyword</div>
              <div className="text-2xl font-bold tracking-tight">
                {status?.keyword || "None"}
              </div>
            </div>
            
            <div className="pt-4 border-t border-[var(--line)]">
              <label className="block text-[11px] uppercase tracking-[0.2em] fp-mono text-[var(--text-mute)] mb-2">Change Keyword</label>
              <div className="flex gap-2">
                <input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Enter new keyword"
                  className="fp-input"
                />
                <button onClick={updateKeyword} className="fp-btn fp-btn-red">Update</button>
              </div>
              <p className="mt-2 text-[10px] text-[var(--text-mute)] leading-relaxed">
                Updating will immediately change the keyword for all users today.
              </p>
            </div>
          </div>

          <div className="p-6 border border-[var(--line-strong)] bg-zinc-900/20 rounded-xl space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono mb-2">System Info</div>
              <div className="text-sm space-y-1 fp-mono">
                <div className="flex justify-between">
                  <span className="text-[var(--text-mute)]">Date Key:</span>
                  <span>{status?.today_key}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-mute)]">Posts:</span>
                  <span>{status?.server_used} / {status?.server_limit}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setDetail(null)}
          data-testid="detail-modal"
        >
          <div
            className="bg-[var(--bg)] border border-[var(--line-strong)] max-w-lg w-full max-h-[85vh] overflow-y-auto p-8 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="text-[13px] fp-mono uppercase tracking-[0.4em] text-[var(--red)] mb-2">User Detail</div>
              <div className="text-2xl font-bold tracking-tighter break-all">{detail.user.email}</div>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[13px] fp-mono uppercase tracking-[0.25em]">
                <span className={`px-1.5 py-0.5 border ${detail.user.gate === "isu" ? "border-[var(--text-mute)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                  {detail.user.gate === "isu" ? "ISU" : "Invite"}
                </span>
                <span className="text-[var(--text-mute)]">{detail.user.status}</span>
                <span className="text-[var(--text-mute)]">·</span>
                <span className="text-[var(--text-mute)]">joined {new Date(detail.user.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs fp-mono uppercase tracking-[0.25em]">
              <Stat label="Posts" value={detail.stats.posts} />
              <Stat label="Likes recv" value={detail.stats.likes_received} />
              <Stat label="Keys owned" value={`${detail.stats.keys_used}/${detail.stats.keys_owned}`} />
              <Stat label="Invites" value={detail.stats.invites_count} />
            </div>

            <div className="border-t border-[var(--line)] pt-4">
              <div className="text-[13px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] mb-2">Recommended By</div>
              {detail.recommender ? (
                <div className="text-sm" data-testid="detail-recommender">
                  <div className="font-bold">{detail.recommender.nickname}</div>
                  <div className="text-xs fp-mono text-[var(--text-mute)] mt-1">{detail.recommender.email}</div>
                </div>
              ) : (
                <div className="text-xs fp-mono text-[var(--text-mute)]">Self (ISU verification)</div>
              )}
            </div>

            <div className="border-t border-[var(--line)] pt-4">
              <div className="text-[13px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] mb-3">
                Invited ({detail.invitees.length})
              </div>
              {detail.invitees.length === 0 ? (
                <div className="text-xs fp-mono text-[var(--text-mute)]">No invites yet.</div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {detail.invitees.map((i) => (
                    <div key={i.id} className="text-xs fp-mono flex items-center justify-between" data-testid={`invitee-${i.id}`}>
                      <span>{i.invited_email}</span>
                      <span className="text-[var(--text-mute)]">{new Date(i.joined_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 flex-wrap">
              {detail.user.status === "pending_review" && (
                <>
                  <button onClick={() => decide(detail.user.id, "approve")} className="fp-btn flex-1" data-testid="modal-approve">Approve</button>
                  <button onClick={() => decide(detail.user.id, "reject")} className="fp-btn fp-btn-red flex-1" data-testid="modal-reject">Reject</button>
                </>
              )}
              {detail.user.status === "banned" ? (
                <button onClick={() => unbanUser(detail.user.id)} className="fp-btn" data-testid="modal-unban">Unban</button>
              ) : !detail.user.is_admin && (
                <button onClick={() => banUser(detail.user.id)} className="fp-btn fp-btn-red" data-testid="modal-ban">Ban</button>
              )}
              <button onClick={() => setDetail(null)} className="fp-btn" data-testid="modal-close">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border border-[var(--line-strong)] p-3">
      <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--text-mute)]">{label}</div>
      <div className="mt-1 text-lg font-bold text-[var(--text)] fp-mono">{value}</div>
    </div>
  );
}
