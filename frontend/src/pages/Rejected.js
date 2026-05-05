import { useAuth } from "@/context/AuthContext";

export default function Rejected() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="text-center fp-fade max-w-md">
        <div className="text-[13px] uppercase tracking-[0.4em] fp-mono text-[var(--red)]">Closed</div>
        <h1 className="mt-4 text-4xl font-bold tracking-tighter">
          Not this time<span className="text-[var(--red)]">.</span>
        </h1>
        <p className="mt-4 text-sm text-[var(--text-dim)] leading-relaxed">
          The admin did not approve your application.<br/>
          5P is small on purpose.
        </p>
        <div className="mt-12 text-[11px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]" data-testid="rejected-email">
          {user?.email}
        </div>
        <button onClick={logout} className="mt-8 fp-btn fp-btn-red" data-testid="rejected-logout">
          Sign out
        </button>
      </div>
    </div>
  );
}
