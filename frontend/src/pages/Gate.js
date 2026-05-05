import { Link } from "react-router-dom";

export default function Gate() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center fp-fade">
          <div className="font-bold text-[88px] sm:text-[140px] leading-none tracking-tighter">
            5P<span className="text-[var(--red)]">.</span>
          </div>
          <div className="mt-4 text-[10px] sm:text-xs uppercase tracking-[0.5em] text-[var(--text-mute)] fp-mono">
            Five Stories. Five People. Once a day.
          </div>
          <div className="mt-16 flex items-center justify-center gap-3" data-testid="gate-actions">
            <Link to="/login" className="fp-btn min-w-[140px]" data-testid="gate-login-btn">Log in</Link>
            <Link to="/register" className="fp-btn fp-btn-solid min-w-[140px]" data-testid="gate-start-btn">Start</Link>
          </div>
          <div className="mt-10 text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono">
            @iastate.edu only
          </div>
        </div>
      </div>
      <footer className="text-center pb-6 text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono">
        <span className="fp-dot mr-2"/>2026 5P
      </footer>
    </div>
  );
}
