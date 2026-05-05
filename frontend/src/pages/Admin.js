import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Admin() {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [keys, setKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [p, k, l] = await Promise.all([
        api.get("/admin/pending"),
        api.get("/admin/keys"),
        api.get("/admin/invite-log"),
      ]);
      setPending(p.data);
      setKeys(k.data);
      setLogs(l.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)]">Admin</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tighter">Control<span className="text-[var(--red)]">.</span></h1>
        </div>
        <button onClick={mintKey} className="fp-btn fp-btn-red" data-testid="mint-key-btn">
          + Mint Key
        </button>
      </div>

      <nav className="flex gap-6 border-b border-[var(--line)] flex-wrap">
        {[
          ["pending", `Initiation (${pending.length})`],
          ["keys", `Keys (${keys.length})`],
          ["logs", `Invite Log (${logs.length})`],
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
          <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-testid="pending-list">
            {pending.map((u) => (
              <div key={u.id} className="py-5 flex items-start justify-between gap-4 flex-wrap" data-testid={`pending-${u.id}`}>
                <button onClick={() => openDetail(u.id)} className="flex-1 text-left hover:opacity-80" data-testid={`detail-${u.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">{u.email}</span>
                    <span className={`text-[9px] fp-mono uppercase tracking-[0.3em] px-1.5 py-0.5 border ${u.gate === "isu" ? "border-[var(--text-mute)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                      {u.gate === "isu" ? "ISU" : "Invite"}
                    </span>
                  </div>
                  <div className="text-[10px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
                    추천인: <span className="text-[var(--text-dim)]">{u.recommended_by_nickname || "—"}</span>
                    {u.recommender_stats && <span className="ml-3">posts {u.recommender_stats.posts} · invites {u.recommender_stats.invites}</span>}
                  </div>
                  {u.email_verified_at && (
                    <div className="text-[10px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
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
        )
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
                <div className="text-[10px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
                  {k.source} · {k.used ? `used by ${k.used_by_id?.slice(0, 8)}…` : "available"}
                </div>
              </div>
              <span className={`text-[10px] fp-mono uppercase tracking-[0.3em] px-2 py-1 border ${k.used ? "border-[var(--line-strong)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                {k.used ? "Used" : "Available"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-testid="invite-logs-list">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
              No invites yet.
            </div>
          ) : logs.map((l) => (
            <div key={l.id} className="py-4 flex items-center justify-between gap-3 flex-wrap" data-testid={`invite-log-${l.id}`}>
              <div>
                <div className="font-bold text-sm">{l.invited_email}</div>
                <div className="text-[10px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
                  via {l.gate === "isu" ? "ISU Self-Auth" : `초대받음 from ${l.recommender_nickname || l.recommender_email || "?"}`}
                </div>
              </div>
              <span className="text-[10px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)]">
                {new Date(l.joined_at).toLocaleString()}
              </span>
            </div>
          ))}
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
              <div className="text-[10px] fp-mono uppercase tracking-[0.4em] text-[var(--red)] mb-2">User Detail</div>
              <div className="text-2xl font-bold tracking-tighter break-all">{detail.user.email}</div>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] fp-mono uppercase tracking-[0.25em]">
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

            {/* Recommender */}
            <div className="border-t border-[var(--line)] pt-4">
              <div className="text-[10px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] mb-2">Recommended By</div>
              {detail.recommender ? (
                <div className="text-sm" data-testid="detail-recommender">
                  <div className="font-bold">{detail.recommender.nickname}</div>
                  <div className="text-xs fp-mono text-[var(--text-mute)] mt-1">{detail.recommender.email}</div>
                </div>
              ) : (
                <div className="text-xs fp-mono text-[var(--text-mute)]">Self (ISU verification)</div>
              )}
            </div>

            {/* Invitees genealogy */}
            <div className="border-t border-[var(--line)] pt-4">
              <div className="text-[10px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] mb-3">
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

            <div className="flex gap-2 pt-2">
              {detail.user.status === "pending_review" && (
                <>
                  <button onClick={() => decide(detail.user.id, "approve")} className="fp-btn flex-1" data-testid="modal-approve">Approve</button>
                  <button onClick={() => decide(detail.user.id, "reject")} className="fp-btn fp-btn-red flex-1" data-testid="modal-reject">Reject</button>
                </>
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
