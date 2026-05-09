import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const link = (to, label, testid) => (
    <NavLink
      to={to}
      data-testid={testid}
      className={({ isActive }) =>
        `block py-2 text-xs uppercase tracking-[0.25em] fp-mono transition-colors ${
          isActive ? "text-[var(--text)]" : "text-[var(--text-mute)] hover:text-[var(--text-dim)]"
        }`
      }
      end
    >
      {label}
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--line)]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div onClick={() => navigate("/feed")} className="cursor-pointer flex items-center gap-2" data-testid="brand-logo">
            <span className="font-bold text-base tracking-tight">5P</span>
            <span className="fp-dot" />
          </div>
          <div className="flex items-center gap-5 text-xs uppercase tracking-[0.25em] fp-mono">
            {user?.is_admin && <span className="text-[var(--red)]" data-testid="admin-badge">ADMIN</span>}
            <span className="text-[var(--text-mute)] hidden sm:inline" data-testid="user-email">{user?.email}</span>
            <button onClick={handleLogout} className="text-[var(--text-dim)] hover:text-[var(--text)]" data-testid="logout-btn">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col md:grid md:grid-cols-12 gap-10">
        {/* Sidebar: Top on mobile, Left on desktop */}
        <aside className="md:col-span-3 space-y-1">
          {link("/feed", "Feed", "nav-feed")}
          {link("/pillars", "★ The Pillars", "nav-pillars")}
          {link("/dining", "Dining", "nav-dining")}
          {link("/post/new", "Compose", "nav-new")}
          {link("/messages", "Messages", "nav-messages")}
          {link("/profile", "Profile", "nav-profile")}
          {user?.is_admin && link("/admin", "Admin · Console", "nav-admin")}
          
          <div className="pt-8">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono">Slogan</div>
            <div className="text-xs text-[var(--text-dim)] mt-2 leading-relaxed">
              5 Stories,<br/>5 People,<br/>Once a day.
            </div>
          </div>

          {/* Principles in sidebar for Desktop only */}
          <div className="hidden md:block pt-10 space-y-6">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono">Principles</div>
            <div className="space-y-4 text-[13px] font-bold leading-snug tracking-tight">
              <div>
                <span className="text-[var(--red)] block mb-1">01. Global Limit</span>
                <span className="text-[var(--text)]">Exactly 5 posts per day allowed.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">02. Individual Limit</span>
                <span className="text-[var(--text)]">1 post per person daily.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">03. Auto-Purge</span>
                <span className="text-[var(--text)]">Everything vanishes after 24h.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">04. The Pillars</span>
                <span className="text-[var(--text)]">15+ likes promote you to Pillar status and grant an invite key.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">05. Clean Community</span>
                <span className="text-[var(--text)]">Zero tolerance for hate, ads, or real names.</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content: Middle on mobile, Right on desktop */}
        <main className="md:col-span-9 fp-fade">
          <Outlet />
        </main>

        {/* Principles at the very bottom for Mobile only */}
        <aside className="md:hidden">
          <div className="pt-10 pb-20 space-y-6">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono">Principles</div>
            <div className="space-y-4 text-[13px] font-bold leading-snug tracking-tight">
              <div>
                <span className="text-[var(--red)] block mb-1">01. Global Limit</span>
                <span className="text-[var(--text)]">Exactly 5 posts per day allowed.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">02. Individual Limit</span>
                <span className="text-[var(--text)]">1 post per person daily.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">03. Auto-Purge</span>
                <span className="text-[var(--text)]">Everything vanishes after 24h.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">04. The Pillars</span>
                <span className="text-[var(--text)]">15+ likes promote you to Pillar status and grant an invite key.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">05. Clean Community</span>
                <span className="text-[var(--text)]">Zero tolerance for hate, ads, or real names.</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
