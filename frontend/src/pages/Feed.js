import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Heart, MessageSquare, Eye, Plus } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { key: "all", label: "전체", color: "bg-white" },
  { key: "free", label: "자유", color: "bg-[#A7F3D0]" },
  { key: "secret", label: "비밀", color: "bg-[#B8B8FF]" },
  { key: "info", label: "정보", color: "bg-[#FDE047]" },
  { key: "question", label: "질문", color: "bg-[#FFC7A7]" },
];

export default function Feed() {
  const { category } = useParams();
  const active = category || "all";
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState({ used: 0, limit: 5, remaining: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, quotaRes] = await Promise.all([
        api.get("/posts", { params: active !== "all" ? { category: active } : {} }),
        api.get("/posts/quota"),
      ]);
      setPosts(postsRes.data);
      setQuota(quotaRes.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => { load(); }, [load]);

  const toggleLike = async (id, e) => {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/posts/${id}/like`);
      setPosts((ps) => ps.map((p) => p.id === id ? { ...p, liked_by_me: data.liked, like_count: data.like_count } : p));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6">
      {/* Quota card */}
      <div className="nb-card p-5 flex items-center justify-between gap-4" data-testid="quota-card">
        <div className="flex-1">
          <div className="text-xs font-black uppercase tracking-wider text-[#4B5563] mb-1">오늘의 글쓰기 할당량</div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-black" data-testid="quota-remaining">{quota.remaining}</span>
            <span className="text-sm font-bold text-[#4B5563]">/ {quota.limit}개 남음</span>
          </div>
          <div className="mt-3 h-3 bg-[#F3F2EE] border-2 border-[#1A1A1A] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF5E5B] transition-all"
              style={{ width: `${(quota.used / quota.limit) * 100}%` }}
            />
          </div>
        </div>
        <button
          onClick={() => navigate("/post/new")}
          disabled={quota.remaining === 0}
          className="nb-btn nb-btn-primary whitespace-nowrap"
          data-testid="write-post-btn"
        >
          <Plus size={18} strokeWidth={2.8} className="mr-1"/>
          글쓰기
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2" data-testid="category-tabs">
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            to={c.key === "all" ? "/feed" : `/feed/${c.key}`}
            data-testid={`category-${c.key}`}
            className={`px-4 py-2 border-2 border-[#1A1A1A] rounded-full font-bold text-sm transition-all ${
              active === c.key
                ? `${c.color} nb-shadow-xs`
                : "bg-white hover:bg-[#F3F2EE]"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {/* Posts */}
      {loading ? (
        <div className="nb-card p-10 text-center font-bold">로딩중...</div>
      ) : posts.length === 0 ? (
        <div className="nb-card p-10 text-center">
          <p className="font-display font-black text-xl mb-2">아직 글이 없어요</p>
          <p className="text-sm font-medium text-[#4B5563] mb-4">첫 번째 글을 남겨볼까요?</p>
          <button onClick={() => navigate("/post/new")} className="nb-btn nb-btn-primary" data-testid="empty-write-btn">
            첫 글쓰기
          </button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="posts-list">
          {posts.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/post/${p.id}`)}
              className="nb-card p-5 cursor-pointer"
              data-testid={`post-card-${p.id}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <CategoryBadge cat={p.category} />
                <span className="text-xs font-bold text-[#4B5563]">{p.author_nickname}</span>
                <span className="text-xs text-[#9CA3AF]">·</span>
                <span className="text-xs font-semibold text-[#4B5563]">{timeAgo(p.created_at)}</span>
              </div>
              <h3 className="font-display font-black text-lg mb-1.5">{p.title}</h3>
              <p className="text-sm font-medium text-[#4B5563] line-clamp-2 leading-relaxed">{p.content}</p>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-dashed border-[#D1D5DB]">
                <button
                  onClick={(e) => toggleLike(p.id, e)}
                  className={`flex items-center gap-1 text-sm font-bold ${p.liked_by_me ? "text-[#FF5E5B]" : "text-[#4B5563]"}`}
                  data-testid={`like-btn-${p.id}`}
                >
                  <Heart size={16} fill={p.liked_by_me ? "#FF5E5B" : "none"} strokeWidth={2.5}/>
                  {p.like_count}
                </button>
                <span className="flex items-center gap-1 text-sm font-bold text-[#4B5563]">
                  <MessageSquare size={16} strokeWidth={2.5}/> {p.comment_count}
                </span>
                <span className="flex items-center gap-1 text-sm font-bold text-[#4B5563]">
                  <Eye size={16} strokeWidth={2.5}/> {p.views}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryBadge({ cat }) {
  const map = {
    free: { label: "자유", cls: "bg-[#A7F3D0]" },
    secret: { label: "비밀", cls: "bg-[#B8B8FF]" },
    info: { label: "정보", cls: "bg-[#FDE047]" },
    question: { label: "질문", cls: "bg-[#FFC7A7]" },
  };
  const c = map[cat] || { label: cat, cls: "bg-white" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border-2 border-[#1A1A1A] ${c.cls}`}>
      {c.label}
    </span>
  );
}

export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}
