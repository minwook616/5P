import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
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
      await register({ email, password, recommendation_code: code.trim().toUpperCase() });
      toast.success("Verification code sent.");
      navigate("/verify");
    } catch (err) {
      const m = formatApiError(err.response?.data?.detail) || err.message;
      setError(m);
      toast.error(m);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm fp-fade">
        <Link to="/" className="text-xs uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] hover:text-[var(--text)]" data-testid="back-link">
          ← Back
        </Link>
        <div className="mt-12">
          <div className="font-bold text-3xl tracking-tight">Initiation<span className="text-[var(--red)]">.</span></div>
          <div className="mt-2 text-xs uppercase tracking-[0.25em] fp-mono text-[var(--text-mute)]">
            Recommendation key required · @iastate.edu only
          </div>
        </div>

        <form onSubmit={submit} className="mt-10 space-y-6">
          <div>
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
              Ask a champion. They have one. Once.
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">School Email</label>
            <input
              type="email"
              className="fp-input"
              placeholder="netid@iastate.edu"
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
            {loading ? "..." : "Apply"}
          </button>
        </form>

        <div className="mt-10 text-xs text-[var(--text-mute)] fp-mono uppercase tracking-[0.2em]">
          Already in? <Link to="/login" className="text-[var(--text)] hover:text-[var(--red)]" data-testid="goto-login">Log in →</Link>
        </div>
      </div>
    </div>
  );
}
