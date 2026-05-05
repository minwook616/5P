import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const CATEGORIES = [
  { key: "free", label: "자유", color: "bg-[#A7F3D0]" },
  { key: "secret", label: "비밀", color: "bg-[#B8B8FF]" },
  { key: "info", label: "정보", color: "bg-[#FDE047]" },
  { key: "question", label: "질문", color: "bg-[#FFC7A7]" },
];

export default function NewPost() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("free");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState({ used: 0, limit: 5, remaining: 5 });

  useEffect(() => {
    api.get("/posts/quota").then((r) => setQuota(r.data)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (quota.remaining === 0) {
      toast.error("오늘 작성 한도를 모두 사용했어요");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/posts", {
        title, content, category, is_anonymous: isAnonymous,
      });
      toast.success("게시글이 등록됐어요 🎉");
      navigate(`/post/${data.id}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 font-bold text-sm hover:underline" data-testid="back-btn">
        <ArrowLeft size={16}/> 뒤로
      </button>

      <div className="nb-card p-6 md:p-8">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-2xl font-black tracking-tight">새 글쓰기</h1>
          <div className="text-sm font-bold" data-testid="quota-indicator">
            오늘 <span className="text-[#FF5E5B]">{quota.remaining}</span>/{quota.limit}개 남음
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold mb-2">카테고리</label>
            <div className="flex flex-wrap gap-2" data-testid="new-post-categories">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`px-4 py-2 border-2 border-[#1A1A1A] rounded-full font-bold text-sm transition-all ${
                    category === c.key ? `${c.color} nb-shadow-xs` : "bg-white hover:bg-[#F3F2EE]"
                  }`}
                  data-testid={`cat-btn-${c.key}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">제목</label>
            <input
              type="text"
              className="nb-input"
              placeholder="무슨 얘기 할 건가요?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
              data-testid="new-post-title"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">내용</label>
            <textarea
              className="nb-input min-h-[200px] resize-y"
              placeholder="진짜 속마음을 써봐요. 여기는 익명이니까요."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              required
              data-testid="new-post-content"
            />
            <div className="text-xs font-semibold text-[#4B5563] text-right mt-1">{content.length}/5000</div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-[#F3F2EE] border-2 border-[#1A1A1A] rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-5 h-5 accent-[#FF5E5B]"
              data-testid="anonymous-checkbox"
            />
            <div>
              <div className="font-bold text-sm">익명으로 게시</div>
              <div className="text-xs text-[#4B5563]">체크 해제 시 닉네임이 공개돼요</div>
            </div>
          </label>

          <div className="flex gap-3">
            <button type="button" onClick={() => navigate(-1)} className="nb-btn nb-btn-white flex-1" data-testid="cancel-btn">
              취소
            </button>
            <button
              type="submit"
              disabled={loading || quota.remaining === 0}
              className="nb-btn nb-btn-primary flex-1"
              data-testid="submit-post-btn"
            >
              {loading ? "등록 중..." : "게시하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
