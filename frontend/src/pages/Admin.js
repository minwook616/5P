import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Admin() {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [p, k] = await Promise.all([
        api.get("/admin/pending"),
        api.get("/admin/keys"),
      ]);
      setPending(p.data);
      setKeys(k.data);
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

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)]">Admin</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tighter">Control<span className="text-[var(--red)]">.</span></h1>
        </div>
        <button onClick={mintKey} className="fp-btn fp-btn-red" data-testid="mint-key-btn">
          + Mint Key
        </button>
      </div>

      <nav className="flex gap-6 border-b border-[var(--line)]">
        {[["pending", `Initiation (${pending.length})`], ["keys", `Keys (${keys.length})`]].map(([k, label]) => (
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
              <div key={u.id} className="py-5 flex items-center justify-between gap-4 flex-wrap" data-testid={`pending-${u.id}`}>
                <div>
                  <div className="font-bold text-base">{u.email}</div>
                  <div className="text-[10px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] mt-1">
                    Recommended by {u.recommended_by_email || u.recommended_by} · Verified {new Date(u.email_verified_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decide(u.id, "approve")} className="fp-btn" data-testid={`approve-${u.id}`}>Approve</button>
                  <button onClick={() => decide(u.id, "reject")} className="fp-btn fp-btn-red" data-testid={`reject-${u.id}`}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
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
                  {k.source} · {k.used ? `used by ${k.used_by_id}` : "available"}
                </div>
              </div>
              <span className={`text-[10px] fp-mono uppercase tracking-[0.3em] px-2 py-1 border ${k.used ? "border-[var(--line-strong)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                {k.used ? "Used" : "Available"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
