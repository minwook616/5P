import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { relTime } from "@/pages/Feed";

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.get(`/posts/${id}`), api.get(`/posts/${id}/comments`)]);
      setPost(p.data);
      setComments(c.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
      navigate("/feed");
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const toggleLike = async () => {
    try {
      const { data } = await api.post(`/posts/${id}/like`);
      setPost((p) => ({ ...p, liked_by_me: data.liked, like_count: data.like_count }));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const report = async () => {
    if (!window.confirm("이 글을 신고할까요? 3회 누적 시 블라인드 처리됩니다.")) return;
    try {
      const { data } = await api.post(`/posts/${id}/report`);
      toast.success(`신고 접수되었습니다 (${data.report_count}/3)`);
      if (data.report_count >= 3) load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const remove = async () => {
    if (!window.confirm("정말 삭제할까요?")) return;
    try {
      await api.delete(`/posts/${id}`);
      toast.success("삭제되었습니다.");
      navigate("/feed");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/posts/${id}/comments`, { content: text });
      setComments((cs) => [...cs, data]);
      setPost((p) => ({ ...p, comment_count: (p.comment_count || 0) + 1 }));
      setText("");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const removeComment = async (cid) => {
    try {
      await api.delete(`/comments/${cid}`);
      setComments((cs) => cs.filter((c) => c.id !== cid));
      setPost((p) => ({ ...p, comment_count: Math.max(0, (p.comment_count || 1) - 1) }));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const startDM = async () => {
    try {
      const { data } = await api.post(`/messages/start/${id}`);
      navigate(`/messages/${data.conv_id}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  if (!post) return <div className="text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">Loading.</div>;

  const blindedToView = post.blinded && !user?.is_admin;

  return (
    <div className="space-y-10">
      <button onClick={() => navigate(-1)} className="text-xs uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] hover:text-[var(--text)]" data-testid="back-btn">
        ← Back
      </button>

      <article data-testid="post-detail">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-4">
          <span className={post.is_admin_post ? "text-[var(--red)]" : ""}>{post.author_label}</span>
          <span>·</span>
          <span>{relTime(post.created_at)}</span>
          {post.blinded && <><span>·</span><span className="text-[var(--red)]">Blinded {post.report_count != null ? `(${post.report_count})` : ""}</span></>}
          <span className="ml-auto" />
          {post.is_mine || user?.is_admin ? (
            <button onClick={remove} className="hover:text-[var(--red)]" data-testid="delete-post-btn">Delete</button>
          ) : (
            <button onClick={report} className="hover:text-[var(--red)]" data-testid="report-btn">Report</button>
          )}
        </div>

        <div className={blindedToView ? "fp-blinded" : ""}>
          <h1 className="font-bold text-4xl tracking-tighter mb-6">{post.title}</h1>
          <p className="text-base leading-relaxed text-[var(--text)] whitespace-pre-wrap">{post.content}</p>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--line)] flex items-center gap-6 text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)]">
          <button onClick={toggleLike} className={`hover:text-[var(--text)] flex items-center gap-2 ${post.liked_by_me ? "text-[var(--red)]" : ""}`} data-testid="detail-like-btn">
            {post.liked_by_me && <span className="fp-dot"/>}
            Like {post.like_count}
          </button>
          <span>Comment {post.comment_count}</span>
          {!post.is_mine && (
            <button onClick={startDM} className="ml-auto hover:text-[var(--text)]" data-testid="dm-author-btn">
              Anon DM →
            </button>
          )}
        </div>
      </article>

      <section data-testid="comments-section">
        <div className="text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-4">
          Comments · {comments.length}
        </div>

        <form onSubmit={submitComment} className="mb-8 space-y-3">
          <textarea
            className="fp-input min-h-[90px]"
            placeholder="Whisper anonymously."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={800}
            required
            data-testid="comment-input"
          />
          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="fp-btn" data-testid="submit-comment-btn">Post</button>
          </div>
        </form>

        <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {comments.length === 0 ? (
            <div className="py-8 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
              No comments
            </div>
          ) : comments.map((c) => (
            <div key={c.id} className="py-4" data-testid={`comment-${c.id}`}>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">
                <span className={c.is_admin_post ? "text-[var(--red)]" : ""}>{c.author_label}</span>
                <span>·</span>
                <span>{relTime(c.created_at)}</span>
                {(c.is_mine || user?.is_admin) && (
                  <button onClick={() => removeComment(c.id)} className="ml-auto hover:text-[var(--red)]" data-testid={`del-comment-${c.id}`}>
                    Delete
                  </button>
                )}
              </div>
              <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
