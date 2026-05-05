import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function VerifyEmail() {
  const { user, verifyOtp, resendOtp, logout } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(code.trim());
      toast.success("Verified. Awaiting admin approval.");
      navigate("/pending");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setResending(true);
    try {
      await resendOtp();
      toast.success("New code sent.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm fp-fade text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)]">Step 1 / 2</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tighter">
          Check your inbox<span className="text-[var(--red)]">.</span>
        </h1>
        <p className="mt-3 text-xs fp-mono uppercase tracking-[0.2em] text-[var(--text-mute)] break-all">
          {user?.email}
        </p>

        <form onSubmit={submit} className="mt-12 space-y-5">
          <input
            className="fp-input text-center fp-mono text-2xl tracking-[0.6em]"
            placeholder="000000"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            data-testid="otp-input"
          />
          <button type="submit" disabled={loading || code.length !== 6} className="fp-btn fp-btn-solid w-full" data-testid="otp-submit">
            {loading ? "..." : "Verify"}
          </button>
        </form>

        <div className="mt-8 text-xs fp-mono uppercase tracking-[0.25em]">
          <button onClick={onResend} disabled={resending} className="text-[var(--text-mute)] hover:text-[var(--text)]" data-testid="otp-resend">
            {resending ? "Sending..." : "Resend code"}
          </button>
          <span className="mx-3 text-[var(--text-mute)]">·</span>
          <button onClick={logout} className="text-[var(--text-mute)] hover:text-[var(--red)]" data-testid="otp-logout">
            Cancel
          </button>
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--line)] text-[11px] fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] leading-relaxed">
          This is not your place yet.<br/>
          Check your @iastate.edu inbox.
        </div>
      </div>
    </div>
  );
}
