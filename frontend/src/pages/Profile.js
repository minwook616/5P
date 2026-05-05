import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Profile() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get("/status/today").then((r) => setStatus(r.data)).catch(() => {});
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-10 max-w-md">
      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)] mb-2">Profile</div>
        <div className="text-3xl font-bold tracking-tighter break-all">
          {user.email}
          <span className="text-[var(--red)]">.</span>
        </div>
        {user.is_admin && (
          <div className="mt-3 inline-block text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)] border border-[var(--red)] px-2 py-1">
            Administrator
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] pt-6 space-y-3 text-xs fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)]">
        <Row label="Joined" value={new Date(user.created_at).toLocaleDateString()} />
        {status && <>
          <Row label="Today" value={status.today_key} />
          <Row label="Slots" value={`${status.server_used}/${status.server_limit}`} />
          <Row label="Posted today" value={status.user_posted_today ? "Yes" : "No"} />
          {status.is_champion && <Row label="Status" value="Champion · Priority" red />}
        </>}
      </div>

      <button onClick={logout} className="fp-btn fp-btn-red" data-testid="profile-logout">Sign out</button>

      <div className="text-[11px] text-[var(--text-mute)] leading-relaxed border-t border-[var(--line)] pt-6">
        Your identity is hidden in posts, comments, and DMs. Even the recipient of your DM
        sees a different anonymous handle. Champions speak to admin via a 24-hour
        self-destructing channel.
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
