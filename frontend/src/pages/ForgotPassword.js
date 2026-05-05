import { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm fp-fade">
        <Link to="/login" className="text-xs uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] hover:text-[var(--text)]">
          ← Back
        </Link>
        {!sent ? (
          <>
            <div className="mt-12">
              <div className="font-bold text-3xl tracking-tight">Forgot<span className="text-[var(--red)]">.</span></div>
              <div className="mt-2 text-xs uppercase tracking-[0.25em] fp-mono text-[var(--text-mute)]">
                We'll send a reset link to your inbox.
              </div>
            </div>
            <form onSubmit={submit} className="mt-10 space-y-6">
              <input
                type="email"
                className="fp-input"
                placeholder="netid@iastate.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="forgot-email"
              />
              <button type="submit" disabled={loading} className="fp-btn fp-btn-solid w-full" data-testid="forgot-submit">
                {loading ? "..." : "Send link"}
              </button>
            </form>
          </>
        ) : (
          <div className="mt-20 text-center">
            <div className="text-2xl font-bold tracking-tighter">Sent<span className="text-[var(--red)]">.</span></div>
            <p className="mt-3 text-xs fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)]">
              If that email exists, a link is on the way.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
