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

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-12 gap-10">
        <aside className="md:col-span-3 space-y-1">
          {link("/feed", "Feed", "nav-feed")}
          {link("/pillars", "★ The Pillars", "nav-pillars")}
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

          <div className="pt-10 space-y-6">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono">Principles</div>
            <div className="space-y-4 text-[13px] font-bold leading-snug tracking-tight">
              <div>
                <span className="text-[var(--red)] block mb-1">01. 전체 제한</span>
                <span className="text-[var(--text)]">하루 딱 5개의 글만 허용됩니다.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">02. 개별 제한</span>
                <span className="text-[var(--text)]">한 명당 하루에 1개의 글만 작성 가능합니다.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">03. 초기화</span>
                <span className="text-[var(--text)]">매일 오전 12시(자정)에 모든 권한이 리셋됩니다.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">04. 자동 삭제</span>
                <span className="text-[var(--text)]">모든 기록은 24시간 뒤 흔적 없이 사라집니다.</span>
              </div>
              <div>
                <span className="text-[var(--red)] block mb-1">05. 클린 커뮤니티</span>
                <span className="text-[var(--text)]">욕설 및 광고는 운영진에 의해 즉시 삭제됩니다.</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="md:col-span-9 fp-fade">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
