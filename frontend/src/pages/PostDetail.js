import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Heart, MessageSquare, Eye, Trash2, Send, MessageCircle } from "lucide-react";
import { CategoryBadge, timeAgo } from "@/pages/Feed";
import { useAuth } from "@/context/AuthContext";

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentAnon, setCommentAnon] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.get(`/posts/${id}`),
        api.get(`/posts/${id}/comments`),
      ]);
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

  const deletePost = async () => {
    if (!window.confirm("정말 삭제할까요?")) return;
    try {
      await api.delete(`/posts/${id}`);
      toast.success("삭제되었어요");
      navigate("/feed");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/posts/${id}/comments`, {
        content: newComment,
        is_anonymous: commentAnon,
      });
      setComments((cs) => [...cs, data]);
      setPost((p) => ({ ...p, comment_count: p.comment_count + 1 }));
      setNewComment("");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (cid) => {
    try {
      await api.delete(`/comments/${cid}`);
      setComments((cs) => cs.filter((c) => c.id !== cid));
      setPost((p) => ({ ...p, comment_count: Math.max(0, p.comment_count - 1) }));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const startDM = async () => {
    if (!post.author_id) return;
    navigate(`/messages/${post.author_id}`);
  };

  if (!post) return <div className="nb-card p-10 text-center font-bold">로딩중...</div>;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 font-bold text-sm hover:underline" data-testid="back-btn">
        <ArrowLeft size={16}/> 피드로
      </button>

      <article className="nb-card p-6 md:p-8" data-testid="post-detail">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <CategoryBadge cat={post.category}/>
          <span className="text-sm font-bold text-[#4B5563]">{post.author_nickname}</span>
          <span className="text-xs text-[#9CA3AF]">·</span>
          <span className="text-sm font-semibold text-[#4B5563]">{timeAgo(post.created_at)}</span>
          {post.is_mine && (
            <button
              onClick={deletePost}
              className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-[#FF5E5B] hover:underline"
              data-testid="delete-post-btn"
            >
              <Trash2 size={14}/> 삭제
            </button>
          )}
        </div>
        <h1 className="font-display text-3xl font-black tracking-tight mb-4">{post.title}</h1>
        <p className="text-base font-medium leading-relaxed whitespace-pre-wrap">{post.content}</p>

        <div className="flex items-center gap-6 mt-6 pt-5 border-t-2 border-dashed border-[#D1D5DB]">
          <button
            onClick={toggleLike}
            className={`flex items-center gap-1.5 font-bold ${post.liked_by_me ? "text-[#FF5E5B]" : "text-[#1A1A1A]"}`}
            data-testid="detail-like-btn"
          >
            <Heart size={20} fill={post.liked_by_me ? "#FF5E5B" : "none"} strokeWidth={2.5}/> {post.like_count}
          </button>
          <span className="flex items-center gap-1.5 font-bold">
            <MessageSquare size={20} strokeWidth={2.5}/> {post.comment_count}
          </span>
          <span className="flex items-center gap-1.5 font-bold">
            <Eye size={20} strokeWidth={2.5}/> {post.views}
          </span>
          {!post.is_anonymous && !post.is_mine && post.author_id && (
            <button
              onClick={startDM}
              className="ml-auto nb-btn nb-btn-secondary text-sm"
              data-testid="dm-author-btn"
            >
              <MessageCircle size={16} className="mr-1.5"/> 쪽지 보내기
            </button>
          )}
        </div>
      </article>

      {/* Comments */}
      <section className="nb-card p-6 md:p-8" data-testid="comments-section">
        <h2 className="font-display text-xl font-black tracking-tight mb-4">
          댓글 <span className="text-[#FF5E5B]">{comments.length}</span>
        </h2>

        <form onSubmit={submitComment} className="space-y-3 mb-6">
          <textarea
            className="nb-input min-h-[80px] resize-y"
            placeholder="댓글을 남겨보세요"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            maxLength={1000}
            required
            data-testid="new-comment-input"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={commentAnon}
                onChange={(e) => setCommentAnon(e.target.checked)}
                className="w-4 h-4 accent-[#FF5E5B]"
                data-testid="comment-anon-checkbox"
              />
              익명
            </label>
            <button type="submit" disabled={submitting} className="nb-btn nb-btn-primary text-sm" data-testid="submit-comment-btn">
              <Send size={14} className="mr-1.5"/> 등록
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {comments.length === 0 ? (
            <div className="text-sm text-[#4B5563] font-semibold text-center py-6">
              첫 댓글을 남겨보세요
            </div>
          ) : comments.map((c) => (
            <div key={c.id} className="p-4 bg-[#F3F2EE] border-2 border-[#1A1A1A] rounded-xl" data-testid={`comment-${c.id}`}>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-sm font-bold">{c.author_nickname}</span>
                <span className="text-xs text-[#9CA3AF]">·</span>
                <span className="text-xs font-semibold text-[#4B5563]">{timeAgo(c.created_at)}</span>
                {c.is_mine && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="ml-auto text-xs font-bold text-[#FF5E5B] hover:underline"
                    data-testid={`delete-comment-${c.id}`}
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
