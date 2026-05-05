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
  const [asAdmin, setAsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [boostInput, setBoostInput] = useState(0);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.get(`/posts/${id}`), api.get(`/posts/${id}/comments`)]);
      setPost(p.data);
      setComments(c.data);
      setBoostInput(p.data.boost_likes ?? 0);
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

  const confirmReport = async () => {
    if (!reportReason.trim()) {
      toast.error("Please enter a reason.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/posts/${id}/report`, { reason: reportReason });
      toast.success(`Reported (${data.report_count}/3)`);
      setShowReportModal(false);
      setReportReason("");
      if (data.report_count >= 3) load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
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
      const { data } = await api.post(`/posts/${id}/comments`, { content: text, as_admin: asAdmin });
      setComments((cs) => [...cs, data]);
      setPost((p) => ({ ...p, comment_count: (p.comment_count || 0) + 1 }));
      setText("");
      setAsAdmin(false);
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

  const applyBoost = async () => {
    try {
      const { data } = await api.post(`/admin/posts/${id}/boost`, { boost: parseInt(boostInput) || 0 });
      toast.success(`Boost set: ${data.boost}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  if (!post) return <div className="text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] mt-10 text-center">Loading.</div>;
  const blindedToView = post.blinded && !user?.is_admin;
  const isPillarLevel = post.like_count >= 15 || post.is_pillar;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20">
      <button 
        onClick={() => navigate(-1)} 
        className="text-[13px] uppercase tracking-[0.3em] fp-mono text-zinc-500 hover:text-white transition-colors flex items-center gap-2" 
        data-testid="back-btn"
      >
        ← BACK TO FEED
      </button>

      <article 
        className="relative overflow-hidden bg-[#111111] border border-white/5 rounded-3xl p-8 sm:p-10 shadow-2xl" 
        data-testid="post-detail"
        style={isPillarLevel ? {
          borderColor: "rgba(212,175,55,0.4)",
          background: "linear-gradient(135deg, rgba(200,16,46,0.04), rgba(212,175,55,0.02))"
        } : {}}
      >
        {isPillarLevel && (
          <div className="absolute top-0 left-0 w-1.5 h-full" style={{background: "linear-gradient(180deg, #D4AF37, #C8102E)"}}/>
        )}

        <div className="relative z-10 flex items-center gap-3 text-[13px] uppercase tracking-[0.3em] fp-mono text-zinc-400 mb-6 flex-wrap">
          <span className={`font-semibold ${post.is_admin_post ? "text-[var(--red)]" : ""}`}>{post.author_label}</span>
          <span className="opacity-40">·</span>
          <span>{relTime(post.created_at)}</span>
          {isPillarLevel && <>
            <span className="opacity-40">·</span>
            <span style={{color:"#D4AF37"}} className="font-bold">★ Pillar</span>
          </>}
          {post.blinded && <>
            <span className="opacity-40">·</span>
            <span className="text-[var(--red)] font-bold">Blinded {post.report_count != null ? `(${post.report_count})` : ""}</span>
          </>}
          
          <span className="ml-auto" />
          {post.is_mine || user?.is_admin ? (
            <button onClick={remove} className="hover:text-red-500 transition-colors" data-testid="delete-post-btn">Delete</button>
          ) : (
            <button onClick={() => setShowReportModal(true)} className="hover:text-red-500 transition-colors" data-testid="report-btn">Report</button>
          )}
        </div>

        <div className={`relative z-10 ${blindedToView ? "fp-blinded" : ""}`}>
          <h1 className="font-black text-3xl sm:text-4xl tracking-tight text-white mb-8">{post.title}</h1>
          <p className="text-[16px] sm:text-[17px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{post.content}</p>
        </div>

        <div className="relative z-10 mt-12 pt-6 border-t border-zinc-800 flex items-center gap-8 text-[13px] uppercase tracking-[0.3em] fp-mono text-zinc-400 flex-wrap">
          <button 
            onClick={toggleLike} 
            className={`hover:text-white flex items-center gap-2 transition-colors ${post.liked_by_me ? "text-[var(--red)] font-bold" : ""}`} 
            data-testid="detail-like-btn"
          >
            {post.liked_by_me && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>}
            Like {post.like_count}
          </button>
          <span>Comment {post.comment_count}</span>
          {!post.is_mine && (
            <button onClick={startDM} className="ml-auto hover:text-white transition-colors" data-testid="dm-author-btn">
              Anon DM →
            </button>
          )}
        </div>

        {user?.is_admin && (
          <div className="relative z-10 mt-8 p-6 bg-red-950/20 border border-red-900/50 rounded-2xl" data-testid="admin-boost-panel">
            <div className="text-[13px] fp-mono uppercase tracking-[0.4em] text-red-500 mb-4 font-bold">Admin · Like Pump</div>
            <div className="text-sm fp-mono text-zinc-400 mb-4">
              Real {post.real_like_count ?? 0} + Boost {post.boost_likes ?? 0} = <span className="text-white font-bold">{post.like_count}</span>
            </div>
            <div className="flex items-center gap-4">
              <input type="range" min="0" max="200" value={boostInput} onChange={(e) => setBoostInput(e.target.value)} className="flex-1 accent-red-600" />
              <input type="number" min="0" max="10000" value={boostInput} onChange={(e) => setBoostInput(e.target.value)} className="fp-input w-24 text-center bg-black/50 border-zinc-800" />
              <button onClick={applyBoost} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">Apply</button>
            </div>
          </div>
        )}
      </article>

      <section className="pt-4" data-testid="comments-section">
        <div className="text-[13px] uppercase tracking-[0.3em] fp-mono text-zinc-500 mb-6 font-semibold px-2">
          Comments · {comments.length}
        </div>

        <form onSubmit={submitComment} className="mb-10 bg-[#111111] p-4 sm:p-6 rounded-3xl border border-white/5 shadow-lg">
          <textarea
            className="w-full bg-black/40 border border-zinc-800 rounded-2xl p-4 text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors min-h-[100px] resize-none"
            placeholder="Whisper anonymously."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={800}
            required
            data-testid="comment-input"
          />
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap px-2">
            {user?.is_admin ? (
              <label className="flex items-center gap-2 text-[11px] fp-mono uppercase tracking-[0.2em] cursor-pointer">
                <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} className="accent-red-500" />
                <span className={asAdmin ? "text-red-500 font-bold" : "text-zinc-500"}>운영자로 표시</span>
              </label>
            ) : <div/>}
            <button 
              type="submit" 
              disabled={submitting} 
              className={`px-6 py-2.5 rounded-full text-xs fp-mono uppercase tracking-widest font-bold transition-colors ${asAdmin ? "bg-red-600 hover:bg-red-700 text-white" : "bg-white text-black hover:bg-zinc-200 disabled:opacity-50"}`}
            >
              Post
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="py-12 text-center bg-zinc-900/20 rounded-3xl border border-white/5">
              <div className="text-[13px] fp-mono uppercase tracking-[0.3em] text-zinc-500">
                No comments
              </div>
            </div>
          ) : comments.map((c) => (
            <div key={c.id} className="p-6 bg-[#111111] border border-white/5 rounded-2xl hover:border-zinc-700 transition-colors" data-testid={`comment-${c.id}`}>
              <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.3em] fp-mono text-zinc-500 mb-3 flex-wrap">
                <span className={`font-semibold ${c.display_as_admin ? "text-[var(--red)]" : ""}`}>{c.author_label}</span>
                {c.display_as_admin && (
                  <span className="px-1.5 py-0.5 border border-[var(--red)] text-[var(--red)] text-[9px] rounded-sm">ADMIN</span>
                )}
                <span className="opacity-40">·</span>
                <span>{relTime(c.created_at)}</span>
                {(c.is_mine || user?.is_admin) && (
                  <button onClick={() => removeComment(c.id)} className="ml-auto hover:text-red-500 transition-colors" data-testid={`del-comment-${c.id}`}>
                    Delete
                  </button>
                )}
              </div>
              <p className="text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      </section>

      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111111] border border-zinc-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
            <h2 className="text-xl text-white font-bold mb-4 tracking-tight">Report Post</h2>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Why are you reporting this post?
            </p>
            <textarea
              className="w-full bg-black/40 border border-zinc-800 rounded-2xl p-4 text-zinc-200 focus:outline-none focus:border-red-500 transition-colors min-h-[100px] resize-none mb-6"
              placeholder="Enter reason here..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason("");
                }}
                className="px-6 py-2.5 rounded-full text-xs fp-mono uppercase tracking-widest font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReport}
                disabled={!reportReason.trim() || submitting}
                className="px-6 py-2.5 rounded-full text-xs fp-mono uppercase tracking-widest font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}