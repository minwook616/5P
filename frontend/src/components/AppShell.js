import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Home, MessageCircle, PlusSquare, User, LogOut, Flame } from "lucide-react";

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const navItem = (to, label, Icon, testid) => (
    <NavLink
      to={to}
      data-testid={testid}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-[#1A1A1A] font-bold transition-all ${
          isActive
            ? "bg-[#FDE047] nb-shadow-xs"
            : "bg-white hover:bg-[#F3F2EE]"
        }`
      }
      end
    >
      <Icon size={20} strokeWidth={2.5} />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6] border-b-2 border-[#1A1A1A]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/feed")}
            data-testid="brand-logo"
          >
            <div className="w-9 h-9 bg-[#FF5E5B] border-2 border-[#1A1A1A] rounded-lg flex items-center justify-center nb-shadow-xs">
              <Flame size={20} color="#fff" strokeWidth={2.8} />
            </div>
            <span className="font-display font-black text-xl tracking-tight">CampusTalk</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm font-semibold text-[#4B5563]" data-testid="current-nickname">
              @{user?.nickname}
            </span>
            <button
              onClick={handleLogout}
              className="nb-btn nb-btn-white text-sm"
              data-testid="logout-btn"
            >
              <LogOut size={16} className="mr-1.5" strokeWidth={2.5} />
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          {/* Sidebar */}
          <aside className="md:col-span-3 space-y-3">
            <div className="nb-card p-4 space-y-2">
              {navItem("/feed", "피드", Home, "nav-feed")}
              {navItem("/post/new", "글쓰기", PlusSquare, "nav-new-post")}
              {navItem("/messages", "쪽지", MessageCircle, "nav-messages")}
              {navItem("/profile", "내 정보", User, "nav-profile")}
            </div>
            <div className="nb-card p-4 bg-[#A7F3D0]">
              <div className="font-display font-black text-sm uppercase tracking-wider mb-1">오늘의 한 마디</div>
              <p className="text-sm font-semibold leading-relaxed">
                오늘도 하루 <span className="font-black">5개</span>까지 게시글을 쓸 수 있어요.
                신중하게 써봐요 🌱
              </p>
            </div>
          </aside>

          {/* Main */}
          <main className="md:col-span-9 animate-fade-up">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#1A1A1A] flex justify-around py-2 z-50">
        <NavLink to="/feed" data-testid="mnav-feed" className={({isActive})=>`p-3 rounded-lg ${isActive?"bg-[#FDE047]":""}`}><Home size={22}/></NavLink>
        <NavLink to="/post/new" data-testid="mnav-new" className={({isActive})=>`p-3 rounded-lg ${isActive?"bg-[#FDE047]":""}`}><PlusSquare size={22}/></NavLink>
        <NavLink to="/messages" data-testid="mnav-messages" className={({isActive})=>`p-3 rounded-lg ${isActive?"bg-[#FDE047]":""}`}><MessageCircle size={22}/></NavLink>
        <NavLink to="/profile" data-testid="mnav-profile" className={({isActive})=>`p-3 rounded-lg ${isActive?"bg-[#FDE047]":""}`}><User size={22}/></NavLink>
      </nav>
    </div>
  );
}
