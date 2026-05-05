import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Flame, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      toast.success("로그인 성공!");
      navigate("/feed");
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail) || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-[#FAF9F6]">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 mb-6 font-bold text-sm hover:underline" data-testid="back-home-link">
          <ArrowLeft size={16}/> 홈으로
        </Link>

        <div className="nb-card p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-[#FF5E5B] border-2 border-[#1A1A1A] rounded-lg flex items-center justify-center nb-shadow-xs">
              <Flame size={22} color="#fff" strokeWidth={2.8} />
            </div>
            <span className="font-display font-black text-2xl tracking-tight">CampusTalk</span>
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight mb-1">다시 만나서 반가워요</h1>
          <p className="text-sm font-medium text-[#4B5563] mb-6">익명 커뮤니티가 당신을 기다리고 있어요.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-1.5">이메일</label>
              <input
                type="email"
                className="nb-input"
                placeholder="you@univ.ac.kr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email-input"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">비밀번호</label>
              <input
                type="password"
                className="nb-input"
                placeholder="최소 6자"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
              />
            </div>
            {error && (
              <div className="p-3 bg-[#FFE5E5] border-2 border-[#FF5E5B] rounded-xl text-sm font-bold" data-testid="login-error">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="nb-btn nb-btn-primary w-full text-base"
              data-testid="login-submit-btn"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="mt-5 text-sm text-center font-semibold">
            아직 계정이 없나요?{" "}
            <Link to="/register" className="underline underline-offset-2" data-testid="goto-register-link">
              회원가입
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
