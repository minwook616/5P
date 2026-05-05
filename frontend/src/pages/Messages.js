import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { relTime } from "@/pages/Feed";

export default function Messages() {
  const { convId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const loadConvs = useCallback(async () => {
    try {
      const { data } = await api.get("/messages/conversations");
      setConversations(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  }, []);

  const loadThread = useCallback(async () => {
    if (!convId) { setThread(null); return; }
    try {
      const { data } = await api.get(`/messages/${convId}`);
      setThread(data);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  }, [convId]);

  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { loadThread(); }, [loadThread]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !thread) return;
    try {
      const baseCid = convId.replace("::admin_line", "");
      const parts = baseCid.split("__");
      // recipient_id = the other party from conv_id
      const recipient = parts[0]; // we pass conv_id sided; but server uses recipient_id directly
      // We need real recipient id; pass other_user_id via thread (we don't have it). Use first id that's not the user. We'll fetch via /me to filter.
      const meRes = await api.get("/auth/me");
      const me = meRes.data;
      const r = parts[0] === me.id ? parts[1] : parts[0];
      const { data } = await api.post("/messages", { recipient_id: r, content: text });
      setThread((t) => t ? { ...t, messages: [...t.messages, data] } : t);
      setText("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      loadConvs();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
      <aside className={`md:col-span-4 ${convId ? "hidden md:block" : ""}`}>
        <div className="text-[10px] uppercase tracking-[0.4em] fp-mono text-[var(--text-mute)] mb-4">Inbox</div>
        {conversations.length === 0 ? (
          <div className="text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)] py-8">
            No threads
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-testid="conv-list">
            {conversations.map((c) => (
              <button
                key={c.conv_id}
                onClick={() => navigate(`/messages/${c.conv_id}`)}
                className={`w-full text-left py-4 group ${convId === c.conv_id ? "" : ""}`}
                data-testid={`conv-${c.conv_id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs fp-mono uppercase tracking-[0.25em] ${c.is_admin_line ? "text-[var(--red)]" : "text-[var(--text)]"}`}>
                    {c.label}
                  </span>
                  <span className="flex items-center gap-2 text-[10px] fp-mono text-[var(--text-mute)]">
                    {c.unread > 0 && <span className="fp-dot"/>}
                    {relTime(c.last_at)}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-dim)] truncate">{c.last_message}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className={`md:col-span-8 ${convId ? "" : "hidden md:block"}`}>
        {!thread ? (
          <div className="py-20 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
            Select a thread
          </div>
        ) : (
          <div className="flex flex-col" style={{ minHeight: 480 }}>
            <div className="flex items-center gap-3 pb-4 border-b border-[var(--line)] mb-4">
              <button onClick={() => navigate("/messages")} className="md:hidden text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]" data-testid="back-list">←</button>
              <div className={`text-base font-bold ${thread.is_admin_line ? "text-[var(--red)]" : ""}`} data-testid="thread-label">
                {thread.other_label}
              </div>
              {thread.is_admin_line && (
                <span className="ml-auto text-[10px] fp-mono uppercase tracking-[0.3em] text-[var(--red)]">
                  Auto-purge 24h
                </span>
              )}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto pr-2" style={{ maxHeight: 460 }} data-testid="msg-list">
              {thread.messages.length === 0 ? (
                <div className="py-10 text-center text-xs fp-mono uppercase tracking-[0.3em] text-[var(--text-mute)]">
                  Say something.
                </div>
              ) : thread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
                  <div className={`max-w-[75%] px-4 py-2 border ${m.from_me ? "border-[var(--red)] text-[var(--text)]" : "border-[var(--line-strong)] text-[var(--text-dim)]"}`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                    <div className="text-[10px] fp-mono text-[var(--text-mute)] mt-1">{relTime(m.created_at)}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>

            <form onSubmit={send} className="pt-4 border-t border-[var(--line)] flex gap-2">
              <input
                className="fp-input flex-1"
                placeholder="Type. Anonymous."
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                data-testid="msg-input"
              />
              <button type="submit" disabled={!text.trim()} className="fp-btn" data-testid="send-btn">Send</button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
