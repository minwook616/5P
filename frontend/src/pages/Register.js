import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Register() {
  const { registerIsu, registerInvite } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("isu");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "isu") {
        await registerIsu({ email, password });
        toast.success("Verification code sent.");
        navigate("/verify");
      } else {
        await registerInvite({ email, password, recommendation_code: code.trim().toUpperCase() });
        toast.success("Application submitted. Awaiting admin review.");
        navigate("/pending");
      }
    } catch (err) {
      const m = formatApiError(err.response?.data?.detail) || err.message;
      setError(m);
      toast.error(m);
    } finally {
      setLoading(false);
    }
  };

  const isIsu = tab === "isu";

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md fp-fade">
        <Link to="/" className="text-xs uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] hover:text-[var(--text)]" data-testid="back-link">
          ← Back
        </Link>

        <div className="mt-12">
          <div className="font-bold text-3xl tracking-tight">Enter<span className="text-[var(--red)]">.</span></div>
          <div className="mt-2 text-xs uppercase tracking-[0.25em] fp-mono text-[var(--text-mute)]">
            Two ways in. Pick yours.
          </div>
        </div>

        {/* Dual gateway tabs */}
        <div className="mt-8 grid grid-cols-2 gap-0 border border-[var(--line-strong)]" data-testid="gateway-tabs">
          <button
            onClick={() => { setTab("isu"); setError(""); }}
            className={`p-4 text-left transition-colors border-r border-[var(--line-strong)] ${isIsu ? "bg-[var(--red)] text-white" : "bg-transparent text-[var(--text-dim)] hover:text-[var(--text)]"}`}
            data-testid="tab-isu"
          >
            <div className="text-[10px] fp-mono uppercase tracking-[0.3em] mb-1">Gate A</div>
            <div className="font-bold text-base">ISU Auth</div>
            <div className={`text-[10px] mt-1 ${isIsu ? "text-white/80" : "text-[var(--text-mute)]"}`}>@iastate.edu only · Email OTP</div>
          </button>
          <button
            onClick={() => { setTab("invite"); setError(""); }}
            className={`p-4 text-left transition-colors ${!isIsu ? "bg-[var(--red)] text-white" : "bg-transparent text-[var(--text-dim)] hover:text-[var(--text)]"}`}
            data-testid="tab-invite"
          >
            <div className="text-[10px] fp-mono uppercase tracking-[0.3em] mb-1">Gate B</div>
            <div className="font-bold text-base">Invitation</div>
            <div className={`text-[10px] mt-1 ${!isIsu ? "text-white/80" : "text-[var(--text-mute)]"}`}>Any email · Champion key + admin review</div>
          </button>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-6">
          {!isIsu && (
            <div data-testid="invite-key-section">
              <label className="block text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Recommendation Key</label>
              <input
                className="fp-input fp-mono uppercase tracking-[0.2em]"
                placeholder="5P-XXXXXXXX"
                value={code}
                onChange={(e)=>setCode(e.target.value)}
                required
                data-testid="register-key-input"
              />
              <div className="mt-2 text-[10px] fp-mono uppercase tracking-[0.2em] text-[var(--text-mute)]">
                Champions get one. For life.
              </div>
            </div>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">
              {isIsu ? "School Email" : "Email"}
            </label>
            <input
              type="email"
              className="fp-input"
              placeholder={isIsu ? "netid@iastate.edu" : "you@anywhere.com"}
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              required
              data-testid="register-email-input"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Password</label>
            <input
              type="password"
              className="fp-input"
              placeholder="min 6 chars"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              minLength={6}
              required
              data-testid="register-password-input"
            />
          </div>
          {error && <div className="text-xs text-[var(--red)] fp-mono" data-testid="register-error">{error}</div>}
          <button type="submit" disabled={loading} className="fp-btn fp-btn-solid w-full" data-testid="register-submit-btn">
            {loading ? "..." : (isIsu ? "Send Verification" : "Apply")}
          </button>

          <div className="text-[10px] fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)] leading-relaxed">
            {isIsu
              ? "An ISU email proves you. We'll send a 6-digit code, you verify, you're in."
              : "Without an ISU email, your champion vouches for you. The admin still has the final word."}
          </div>
        </form>

        <div className="mt-10 text-xs text-[var(--text-mute)] fp-mono uppercase tracking-[0.2em]">
          Already in? <Link to="/login" className="text-[var(--text)] hover:text-[var(--red)]" data-testid="goto-login">Log in →</Link>
        </div>
      </div>
    </div>
  );
}
