import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Profile() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState(null);
  const [keys, setKeys] = useState([]);

  useEffect(() => {
    api.get("/status/today").then((r) => setStatus(r.data)).catch(() => {});
    api.get("/me/keys").then((r) => setKeys(r.data)).catch(() => {});
  }, []);

  if (!user) return null;

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <div className="space-y-10 max-w-md">
      <div>
        <div className="text-[13px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)] mb-2">Profile</div>
        <div className="text-3xl font-bold tracking-tighter break-all">
          {user.email}<span className="text-[var(--red)]">.</span>
        </div>
        {user.is_admin && (
          <div className="mt-3 inline-block text-[13px] uppercase tracking-[0.4em] fp-mono text-[var(--red)] border border-[var(--red)] px-2 py-1">
            Administrator
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] pt-6 space-y-3 text-xs fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)]">
        <Row label="Joined" value={new Date(user.created_at).toLocaleDateString()} />
        <Row label="Status" value={user.status} />
        <Row label="Key granted" value={user.key_granted ? "Yes" : "No"} />
        {status && <>
          <Row label="Today" value={status.today_key} />
          <Row label="Slots" value={`${status.server_used}/${status.server_limit}`} />
          <Row label="Posted today" value={status.user_posted_today ? "Yes" : "No"} />
          {(status.is_pillar || status.is_champion) && <Row label="Status" value="Pillar · Priority" red />}
        </>}
      </div>

      {/* Recommendation Keys */}
      <div className="border-t border-[var(--line)] pt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)]">My Recommendation Keys</div>
        </div>
        {keys.length === 0 ? (
          <div className="text-xs text-[var(--text-mute)] fp-mono uppercase tracking-[0.25em]">
            None yet. Pillars receive one — for life.
          </div>
        ) : (
          <div className="space-y-2" data-testid="my-keys">
            {keys.map((k) => (
              <div key={k.code} className="p-3 border border-[var(--line-strong)] flex items-center justify-between gap-2">
                <button
                  onClick={() => copy(k.code)}
                  className={`fp-mono text-base tracking-[0.15em] ${k.used ? "text-[var(--text-mute)] line-through" : "text-[var(--text)] hover:text-[var(--red)]"}`}
                  data-testid={`my-key-${k.code}`}
                >
                  {k.code}
                </button>
                <span className={`text-[13px] fp-mono uppercase tracking-[0.3em] px-2 py-0.5 border ${k.used ? "border-[var(--line-strong)] text-[var(--text-mute)]" : "border-[var(--red)] text-[var(--red)]"}`}>
                  {k.used ? "Used" : "Available"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={logout} className="fp-btn fp-btn-red" data-testid="profile-logout">Sign out</button>

      <div className="text-[11px] text-[var(--text-mute)] leading-relaxed border-t border-[var(--line)] pt-6">
        Your identity is hidden in posts, comments, and DMs.
        Pillars receive one Pillar Key for life — share it carefully.
      </div>
    </div>
  );
}

function Row({ label, value, red }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-mute)]">{label}</span>
      <span className={red ? "text-[var(--red)]" : "text-[var(--text)]"}>{value}</span>
    </div>
  );
}
