import { useAuth } from "@/context/AuthContext";
import { User, Mail, School, Calendar } from "lucide-react";

export default function Profile() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="nb-card p-6 md:p-8" data-testid="profile-card">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 bg-[#FDE047] border-2 border-[#1A1A1A] rounded-2xl flex items-center justify-center nb-shadow-xs">
            <User size={40} strokeWidth={2.5}/>
          </div>
          <div>
            <h1 className="font-display text-2xl font-black tracking-tight">@{user.nickname}</h1>
            <p className="text-sm font-semibold text-[#4B5563]">{user.school || "학교 미설정"}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Row icon={Mail} label="이메일" value={user.email}/>
          <Row icon={School} label="학교" value={user.school || "미설정"}/>
          <Row icon={Calendar} label="가입일" value={new Date(user.created_at).toLocaleDateString("ko-KR")}/>
        </div>

        <button onClick={logout} className="nb-btn nb-btn-primary mt-6 w-full" data-testid="profile-logout-btn">
          로그아웃
        </button>
      </div>

      <div className="nb-card p-6 bg-[#A7F3D0]">
        <div className="font-display font-black text-lg mb-1">익명 보장 원칙</div>
        <p className="text-sm font-medium leading-relaxed">
          닉네임은 쪽지에만 사용되고, 게시글에는 절대 표시되지 않아요.
          마음 편하게 솔직해져도 괜찮아요.
        </p>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-[#F3F2EE] border-2 border-[#1A1A1A] rounded-xl">
      <Icon size={18} strokeWidth={2.5}/>
      <span className="text-sm font-bold text-[#4B5563] w-16">{label}</span>
      <span className="text-sm font-semibold truncate">{value}</span>
    </div>
  );
}
