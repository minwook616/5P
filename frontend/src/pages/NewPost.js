import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function NewPost() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const locations = [
    "Parks Library 어딘가",
    "Campanile 종소리가 들리는 곳",
    "어느 기숙사 방 안",
    "CyRide 버스 안",
    "랩실 구석",
    "직접 입력..."
  ];

  useEffect(() => {
    api.get("/status/today").then((r) => setStatus(r.data)).catch(() => {});
  }, []);

  const handleLocationChange = (val) => {
    if (val === "직접 입력...") {
      setShowCustom(true);
      setLocation("");
    } else {
      setShowCustom(false);
      setLocation(val);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!status?.can_post_now) {
      toast.error("지금은 작성할 수 없습니다.");
      return;
    }
    setSubmitting(true);
    try {
      const finalLoc = showCustom ? customLocation.trim() : location;
      const { data } = await api.post("/posts", { title, content, location: finalLoc });
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

      <div className="flex justify-between items-start">
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

        {status?.keyword && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Daily Keyword</div>
            <div className="text-[14px] uppercase tracking-[0.2em] fp-mono text-[var(--red)] font-black border border-[var(--red)]/30 px-3 py-1 bg-[var(--red)]/5 rounded-full animate-pulse inline-block">
              {status.keyword}
            </div>
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
          <label className="block text-[13px] uppercase tracking-[0.3em] fp-mono text-[var(--text-mute)] mb-2">Location</label>
          <div className="space-y-3">
            <select 
              className="fp-input bg-[#1A1A1A] text-[var(--text)] border-[var(--line-strong)]"
              value={showCustom ? "직접 입력..." : location}
              onChange={(e) => handleLocationChange(e.target.value)}
              data-testid="location-select"
            >
              <option value="" className="bg-[#1A1A1A] text-[var(--text)]">(어디쯤 계신가요?)</option>
              {locations.map((loc) => (
                <option key={loc} value={loc} className="bg-[#1A1A1A] text-[var(--text)]">{loc}</option>
              ))}
            </select>

            {showCustom && (
              <input
                className="fp-input animate-in fade-in slide-in-from-top-1 duration-200"
                placeholder="장소를 직접 입력해주세요 (예: 호수 앞 벤치)"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                maxLength={30}
                required
              />
            )}
          </div>
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
