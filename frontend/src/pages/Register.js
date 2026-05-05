import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Flame, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", nickname: "", school: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      toast.success("가입 완료! 환영해요 🎉");
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
          <h1 className="font-display text-3xl font-black tracking-tight mb-1">지금 시작하기</h1>
          <p className="text-sm font-medium text-[#4B5563] mb-6">닉네임은 다른 사람에게 보이지 않아요 (익명 보장).</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-1.5">이메일</label>
              <input type="email" className="nb-input" placeholder="you@univ.ac.kr" value={form.email} onChange={setField("email")} required data-testid="register-email-input"/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">닉네임</label>
              <input type="text" className="nb-input" placeholder="2~20자, 내부 식별용" value={form.nickname} onChange={setField("nickname")} minLength={2} maxLength={20} required data-testid="register-nickname-input"/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">학교 (선택)</label>
              <input type="text" className="nb-input" placeholder="예: Emergent Univ" value={form.school} onChange={setField("school")} maxLength={50} data-testid="register-school-input"/>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">비밀번호</label>
              <input type="password" className="nb-input" placeholder="최소 6자" value={form.password} onChange={setField("password")} minLength={6} required data-testid="register-password-input"/>
            </div>

            {error && (
              <div className="p-3 bg-[#FFE5E5] border-2 border-[#FF5E5B] rounded-xl text-sm font-bold" data-testid="register-error">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="nb-btn nb-btn-primary w-full text-base" data-testid="register-submit-btn">
              {loading ? "가입 중..." : "회원가입"}
            </button>
          </form>

          <div className="mt-5 text-sm text-center font-semibold">
            이미 계정이 있나요?{" "}
            <Link to="/login" className="underline underline-offset-2" data-testid="goto-login-link">
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
