import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const getLikeStyle = (count) => {
  if (count >= 15) {
    return "border-white shadow-[0_0_20px_rgba(255,255,255,0.4)] bg-zinc-900/20 hover:scale-[1.02] transition-all duration-300";
  }  if (count >= 6) return "border-red-900	bg-[#131111]";
  if (count >= 3) return "border-zinc-600";
  return "border-white/5";
};
export default function Feed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.get("/status/today"), api.get("/posts")]);
      setStatus(s.data);
      setPosts(p.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const toggleLike = async (id, e) => {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/posts/${id}/like`);
      setPosts((ps) => ps.map((x) => x.id === id ? { ...x, liked_by_me: data.liked, like_count: data.like_count } : x));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  if (loading || !status) {
    return <div className="text-xs uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)]">Loading.</div>;
  }

  return (
    <div className="space-y-12 pb-20">
      <div className="bg-zinc-900/30 p-8 rounded-2xl border border-white/5 shadow-xl">
        <SlotHeader status={status} now={now} onCompose={() => navigate("/post/new")} />
      </div>

      <section className="px-2">
        <div className="flex items-center justify-between mb-6 px-4">
          <div className="text-[13px] uppercase tracking-[0.3em] fp-mono text-zinc-100 font-semibold">
            Today's Five
          </div>
          {user?.is_admin && (
            <div className="text-[11px] uppercase tracking-[0.3em] fp-mono text-[var(--red)] opacity-80">
              Admin View · names visible
            </div>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="py-16 text-center">
            <div className="fp-mono text-xs uppercase tracking-[0.3em] text-[var(--text-mute)]">
              No stories yet.
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="posts-list">
            {posts.map((p) => {
  const isPillarLevel = p.like_count >= 15;

  return (
    <article
      key={p.id}
      onClick={() => navigate(`/post/${p.id}`)}
      className={`relative overflow-hidden py-8 px-8 cursor-pointer group bg-[#111111] border rounded-2xl transition-all duration-300 shadow-lg ${getLikeStyle(p.like_count)}`}
      style={{
        ...(isPillarLevel ? {
          borderColor: "rgba(212,175,55,0.4)",
          background: "linear-gradient(135deg, rgba(200,16,46,0.04), rgba(212,175,55,0.02))"
        } : {}),
        ...(p.has_keyword ? {
          borderColor: "var(--red)",
          boxShadow: "0 0 25px rgba(200, 16, 46, 0.15)"
        } : {})
      }}
    >
      {isPillarLevel && (
        <div className="absolute top-0 left-0 w-1 h-full" style={{background: "linear-gradient(180deg, #D4AF37, #C8102E)"}}/>
      )}
      
      <div className="relative z-10 flex items-center flex-wrap gap-x-3 gap-y-1 text-[13px] uppercase tracking-[0.3em] fp-mono text-gray-300 mb-3">
        <span>{p.is_admin_post ? <span className="text-[var(--red)]">{p.author_label}</span> : p.author_label}</span>
        <span>·</span>
        <span>{relTime(p.created_at)}</span>
        {p.location && (
          <>
            <span>·</span>
            <span className="text-zinc-500 italic opacity-80">{p.location}</span>
          </>
        )}
        {p.blinded && <><span>·</span><span className="text-[var(--red)]">Blinded</span></>}
      </div>
      <div className={`relative z-10 ${p.blinded && !user?.is_admin ? "fp-blinded" : ""}`}>
        <h3 className="text-xl font-bold tracking-tight group-hover:text-[var(--text)] text-[var(--text)] mb-2 flex items-center gap-2">
          {p.title}
          {p.has_keyword && (
            <span className="bg-[var(--red)] text-white text-[9px] px-1.5 py-0.5 rounded-sm tracking-widest align-middle">KEY</span>
          )}
        </h3>
      </div>
      <div className="relative z-10 mt-4 flex items-center gap-6 text-[13px] uppercase tracking-[0.3em] fp-mono text-gray-300">
        <button
          onClick={(e) => toggleLike(p.id, e)}
          className={`hover:text-[var(--text)] flex items-center gap-2 ${p.liked_by_me ? "text-[var(--red)]" : ""}`}
          data-testid={`like-${p.id}`}
        >
          {p.liked_by_me && <span className="fp-dot" />}
          Like {p.like_count}
        </button>
        <span>Comment {p.comment_count}</span>
      </div>
    </article>
  );
})}
          </div>
        )}
      </section>
    </div>
  );
}

function SlotHeader({ status, now, onCompose }) {
  const slots = status.server_limit;
  const used = status.server_used;
  const available = status.available_slots;

  let headlineState = "OPEN";
  if (status.spectator_mode) headlineState = "FULL";
  else if (status.user_posted_today && !status.is_admin) headlineState = "DONE";
  else if (!status.can_post_now && status.block_reason === "GOLDEN_HOUR_LOCKED") headlineState = "WAITING";

  const unlockMs = new Date(status.unlock_at).getTime();
  const remaining = Math.max(0, unlockMs - now);
  const remainSec = Math.floor(remaining / 1000);
  const hh = String(Math.floor(remainSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remainSec % 3600) / 60)).padStart(2, "0");
  const ss = String(remainSec % 60).padStart(2, "0");

  return (
    <section data-testid="slot-header">
      <div className="flex justify-between items-start mb-3">
        <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)]">
          {status.today_key}
        </div>
        {status.keyword && (
          <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)] font-bold animate-pulse">
            Today's Keyword: {status.keyword}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-4 flex-wrap">
        <h1 className="font-bold text-5xl sm:text-6xl tracking-tighter" data-testid="available-headline">
          AVAILABLE<span className="text-[var(--red)]">:</span> {available}/{slots}
        </h1>
        {(status.is_pillar || status.is_champion) && (
          <span className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)] border border-[var(--red)] px-2 py-1" data-testid="pillar-badge">
            Pillar · Priority Access
          </span>
        )}
        {status.is_admin && (
          <span className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)] border border-[var(--red)] px-2 py-1" data-testid="admin-flag">
            Admin · {status.admin_daily_limit}/day
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-5 gap-2" data-testid="slot-grid">
        {Array.from({ length: slots }).map((_, i) => {
          const filled = i < used;
          return (
            <div
              key={i}
              className={`h-1 ${filled ? "bg-[var(--red)]" : "bg-[var(--line-strong)]"}`}
              data-testid={`slot-${i}-${filled ? "filled" : "empty"}`}
            />
          );
        })}
      </div>

      <div className="mt-8 border-t border-[var(--line)] pt-6">
        {status.spectator_mode && !status.is_admin && (
          <div data-testid="state-spectator">
            <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)] mb-2">Spectator Mode</div>
            <div className="text-base text-[var(--text-dim)]">오늘의 기회는 모두 소진되었습니다.</div>
          </div>
        )}
        {status.user_posted_today && !status.is_admin && (
          <div data-testid="state-done">
            <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)] mb-2">Today is Done</div>
            <div className="text-base text-[var(--text-dim)]">오늘은 이미 작성하셨습니다. 내일 다시 만나요.</div>
          </div>
        )}
        {!status.spectator_mode && !status.user_posted_today && !status.can_post_now && status.block_reason === "GOLDEN_HOUR_LOCKED" && (
          <div data-testid="state-waiting">
            <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)] mb-2">Golden Hour</div>
            <div className="text-2xl fp-mono tracking-widest" data-testid="countdown">
              {hh}:{mm}:{ss}
            </div>
            <div className="text-xs text-[var(--text-mute)] mt-2 fp-mono uppercase tracking-[0.2em]">
              Unlock at random within window. Stay close.
            </div>
          </div>
        )}
        {status.can_post_now && (
          <div className="flex items-center justify-between gap-4 flex-wrap" data-testid="state-can-post">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--red)] mb-2 flex items-center gap-2">
                <span className="fp-dot" /> Now Open
              </div>
              <div className="text-base text-[var(--text-dim)]">한 번 클릭하면 끝. 신중하게.</div>
            </div>
            <button onClick={onCompose} className="fp-btn fp-btn-red" data-testid="compose-btn">
              Compose
            </button>
          </div>
        )}
        {status.is_admin && status.block_reason === "ADMIN_LIMIT" && (
          <div data-testid="state-admin-limit">
            <div className="text-base text-[var(--text-dim)]">운영자 일일 한도({status.admin_daily_limit}개)에 도달했습니다.</div>
          </div>
        )}
      </div>
    </section>
  );
}

export function relTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
