import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated. Log in.");
      navigate("/login");
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
        <div className="mt-12">
          <div className="font-bold text-3xl tracking-tight">New password<span className="text-[var(--red)]">.</span></div>
        </div>
        <form onSubmit={submit} className="mt-10 space-y-6">
          <input
            type="password"
            className="fp-input"
            placeholder="min 6 chars"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            data-testid="reset-password-input"
          />
          <button type="submit" disabled={loading} className="fp-btn fp-btn-solid w-full" data-testid="reset-submit">
            {loading ? "..." : "Update"}
          </button>
        </form>
      </div>
    </div>
  );
}
