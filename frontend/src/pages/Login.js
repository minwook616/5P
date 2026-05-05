import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
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
      navigate("/feed");
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
          <div className="font-bold text-3xl tracking-tight">Welcome back<span className="text-[var(--red)]">.</span></div>
          <div className="mt-2 text-xs uppercase tracking-[0.25em] fp-mono text-[var(--text-mute)]">
            Log in to continue
          </div>
        </div>

        <form onSubmit={submit} className="mt-10 space-y-6">
          <div>
            <label className="block text-[13px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Email</label>
            <input
              type="email"
              className="fp-input"
              placeholder="netid@iastate.edu"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              required
              data-testid="login-email-input"
            />
          </div>
          <div>
            <label className="block text-[13px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Password</label>
            <input
              type="password"
              className="fp-input"
              placeholder="••••••••"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              required
              data-testid="login-password-input"
            />
          </div>
          {error && <div className="text-xs text-[var(--red)] fp-mono" data-testid="login-error">{error}</div>}
          <button type="submit" disabled={loading} className="fp-btn fp-btn-solid w-full" data-testid="login-submit-btn">
            {loading ? "..." : "Log in"}
          </button>
        </form>

        <div className="mt-10 flex items-center justify-between text-xs text-[var(--text-mute)] fp-mono uppercase tracking-[0.2em]">
          <Link to="/register" className="text-[var(--text)] hover:text-[var(--red)]" data-testid="goto-register">Start →</Link>
          <Link to="/forgot" className="hover:text-[var(--text)]" data-testid="goto-forgot">Forgot?</Link>
        </div>
      </div>
    </div>
  );
}
