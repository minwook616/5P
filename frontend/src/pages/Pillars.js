import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { relTime } from "@/pages/Feed";
import { useAuth } from "@/context/AuthContext";

export default function Pillars() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/pillars")
      .then((r) => setPosts(r.data))
      .catch((err) => toast.error(formatApiError(err.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10">
      <header className="relative overflow-hidden border border-[var(--red)] p-8" data-testid="pillar-hero">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse at top right, rgba(200,16,46,0.18), transparent 60%), radial-gradient(ellipse at bottom left, rgba(212,175,55,0.10), transparent 60%)",
        }}/>
        <div className="relative">
          <div className="text-[11px] fp-mono uppercase tracking-[0.5em]" style={{color:"#D4AF37"}}>
            Hall of Permanence
          </div>
          <h1 className="mt-3 text-5xl sm:text-6xl font-bold tracking-tighter">
            <span style={{color:"#F5F5F5"}}>The</span>
            <span className="text-[var(--red)]"> Pillars</span>
            <span className="text-[var(--red)]">.</span>
          </h1>
          <p className="mt-3 text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-dim)]">
            15+ likes · Permanent · The legendary stories of Ames
          </p>
        </div>
      </header>

      {loading ? (
        <div className="text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">Loading.</div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <div className="fp-mono text-xs uppercase tracking-[0.3em] text-[var(--text-mute)]">
            No pillars yet.
          </div>
          <div className="mt-3 text-xs text-[var(--text-mute)]">First legend awaits.</div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="pillar-list">
          {posts.map((p) => (
            <article
              key={p.id}
              onClick={() => navigate(`/post/${p.id}`)}
              className="cursor-pointer p-6 border transition-colors group relative"
              style={{
                borderColor: "rgba(212,175,55,0.4)",
                background: "linear-gradient(135deg, rgba(200,16,46,0.04), rgba(212,175,55,0.02))",
              }}
              data-testid={`pillar-${p.id}`}
            >
              <div className="absolute top-0 left-0 w-1 h-full" style={{background: "linear-gradient(180deg, #D4AF37, #C8102E)"}}/>
              <div className="flex items-center gap-3 text-[13px] uppercase tracking-[0.3em] fp-mono mb-3" style={{color: "#D4AF37"}}>
                <span className="flex-shrink-0">★ Pillar</span>
                <span className="text-[var(--text-mute)]">·</span>
                <span className="text-[var(--text-mute)] truncate min-w-0">{p.is_admin_post ? <span className="text-[var(--red)]">{p.author_label}</span> : p.author_label}</span>
                <span className="text-[var(--text-mute)] flex-shrink-0">·</span>
                <span className="text-[var(--text-mute)] flex-shrink-0">{relTime(p.created_at)}</span>
                <span className="ml-auto flex-shrink-0 fp-mono text-[var(--red)] text-base font-bold pl-2">♥ {p.like_count}</span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight mb-2 text-[var(--text)]">{p.title}</h3>
              <p className="text-sm text-[var(--text-dim)] line-clamp-2 leading-relaxed">{p.content}</p>
              {user?.is_admin && p.boost_likes > 0 && (
                <div className="mt-3 text-[13px] fp-mono uppercase tracking-[0.3em] text-[var(--red)]">
                  Admin boost: +{p.boost_likes} (real {p.real_like_count})
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
