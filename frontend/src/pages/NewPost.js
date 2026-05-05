import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function NewPost() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/status/today").then((r) => setStatus(r.data)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!status?.can_post_now) {
      toast.error("지금은 작성할 수 없습니다.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/posts", { title, content });
      toast.success("작성되었습니다.");
      navigate(`/post/${data.id}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <button onClick={() => navigate(-1)} className="text-xs uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] hover:text-[var(--text)]" data-testid="back-btn">
        ← Back
      </button>

      <div>
        <div className="text-[13px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)] mb-2">Compose</div>
        <h1 className="font-bold text-3xl tracking-tighter">One shot<span className="text-[var(--red)]">.</span></h1>
        {status && (
          <div className="mt-2 text-xs fp-mono uppercase tracking-[0.25em] text-[var(--text-mute)]" data-testid="compose-meta">
            {status.is_admin ? `Admin · ${status.admin_daily_limit}/day` : "1 post per day"}
            {" · "}
            Slot {Math.min(status.server_limit, status.server_used + 1)}/{status.server_limit}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="space-y-8">
        <div>
          <label className="block text-[13px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Title</label>
          <input
            className="fp-input text-lg font-bold"
            placeholder="What do you want them to see?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
            data-testid="title-input"
          />
        </div>

        <div>
          <label className="block text-[13px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Body</label>
          <textarea
            className="fp-input min-h-[260px] resize-y leading-relaxed"
            placeholder="Speak. The room is dark. Nobody knows it's you."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={3000}
            required
            data-testid="content-input"
          />
          <div className="mt-2 text-right text-[13px] fp-mono text-[var(--text-mute)]">{content.length}/3000</div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--line)]">
          <button type="button" onClick={() => navigate(-1)} className="fp-btn" data-testid="cancel-btn">Cancel</button>
          <button
            type="submit"
            disabled={submitting || !status?.can_post_now}
            className="fp-btn fp-btn-red"
            data-testid="submit-btn"
          >
            {submitting ? "..." : "Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}
