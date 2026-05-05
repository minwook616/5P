import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export default function PendingReview() {
  const { user, logout, refresh } = useAuth();
  const [dots, setDots] = useState("");

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 600);
    return () => clearInterval(t);
  }, []);

  const recheck = useCallback(() => refresh(), [refresh]);
  useEffect(() => {
    const t = setInterval(recheck, 15000);
    return () => clearInterval(t);
  }, [recheck]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="text-center fp-fade max-w-md">
        <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)]">Step 2 / 2</div>
        <h1 className="mt-4 text-4xl font-bold tracking-tighter">
          The Initiation<span className="text-[var(--red)]">.</span>
        </h1>
        <p className="mt-4 text-sm text-[var(--text-dim)] leading-relaxed">
          Your application is in the admin's hands.<br/>
          Approval is not automatic. It is a judgment.
        </p>

        <div className="mt-12 text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
          Reviewing<span className="text-[var(--red)]">{dots}</span>
        </div>
        <div className="mt-3 mx-auto h-px w-32 bg-[var(--line-strong)] overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-8 bg-[var(--red)] animate-[marquee_2s_linear_infinite]" />
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--line)] text-[11px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] leading-relaxed">
          This is not your place yet.<br/>
          Check your @iastate.edu inbox for the verdict.
        </div>

        <div className="mt-10 text-xs fp-mono uppercase tracking-[0.25em]">
          <button onClick={recheck} className="text-[var(--text-mute)] hover:text-[var(--text)]" data-testid="recheck">
            Recheck
          </button>
          <span className="mx-3 text-[var(--text-mute)]">·</span>
          <button onClick={logout} className="text-[var(--text-mute)] hover:text-[var(--red)]" data-testid="pending-logout">
            Sign out
          </button>
        </div>
      </div>
      <div className="mt-12 text-[10px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]" data-testid="pending-email">
        {user?.email}
      </div>
    </div>
  );
}
