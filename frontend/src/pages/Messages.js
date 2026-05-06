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
      setThread((prev) => {
        if (!prev || prev.messages.length < data.messages.length) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
        return data;
      });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  }, [convId]);

  useEffect(() => { 
    loadConvs(); 
    const t = setInterval(loadConvs, 3000);
    return () => clearInterval(t);
  }, [loadConvs]);

  useEffect(() => { 
    loadThread(); 
    const t = setInterval(loadThread, 3000);
    return () => clearInterval(t);
  }, [loadThread]);

const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !thread) return;
    try {
      const baseCid = convId.replace("::admin_line", "");
      const parts = baseCid.split("__"); // 예: ["user1", "user2", "postId"]
      
      const meRes = await api.get("/auth/me");
      const me = meRes.data;
      
      // 1. 상대방 ID 찾기 (parts[0] 또는 parts[1])
      const r = parts[0] === me.id ? parts[1] : parts[0];
      
      // 2. convId의 3번째 파트에서 post_id 추출하기 (추가된 부분)
      const p = parts[2]; 

      // 3. API 요청 시 post_id를 포함해서 보냄 (수정된 부분)
      const { data } = await api.post("/messages", { 
        recipient_id: r, 
        content: text,
        post_id: p  // 백엔드에서 이 값을 보고 새로운 방을 만들거나 찾게 됩니다.
      });

      setThread((t) => t ? { ...t, messages: [...t.messages, data] } : t);
      setText("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      loadConvs();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 h-[80vh] min-h-[600px] pb-10">
      
      {/* 📌 왼쪽 사이드바 (대화 목록) */}
      <aside className={`md:col-span-4 bg-[#111111] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col h-full ${convId ? "hidden md:flex" : "flex"}`}>
        <div className="text-[13px] uppercase tracking-[0.4em] fp-mono text-zinc-500 mb-6 font-bold px-2">Inbox</div>
        
        {conversations.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm fp-mono uppercase tracking-[0.3em] text-zinc-600">
            No threads
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar" data-testid="conv-list">
            {conversations.map((c) => (
              <button
                key={c.conv_id}
                onClick={() => navigate(`/messages/${c.conv_id}`)}
                className={`w-full text-left p-4 rounded-2xl transition-all duration-200 border ${
                  convId === c.conv_id 
                    ? "bg-zinc-800/50 border-zinc-600 shadow-md" 
                    : "bg-transparent border-transparent hover:bg-zinc-900/50 hover:border-white/5"
                }`}
                data-testid={`conv-${c.conv_id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[12px] font-bold fp-mono uppercase tracking-[0.2em] truncate pr-4 ${c.is_admin_line ? "text-red-500" : "text-white"}`}>
                    {c.label}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] fp-mono text-zinc-500 whitespace-nowrap">
                    {c.unread > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>}
                    {relTime(c.last_at)}
                  </span>
                </div>
                <div className={`text-[14px] truncate ${c.unread > 0 ? "text-white font-medium" : "text-zinc-400"}`}>
                  {c.last_message}
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* 📌 오른쪽 메인 화면 (대화창) */}
      <section className={`md:col-span-8 bg-[#111111] border border-white/5 rounded-3xl flex flex-col h-full shadow-2xl overflow-hidden ${convId ? "flex" : "hidden md:flex"}`}>
        {!thread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
              <span className="text-2xl">✉️</span>
            </div>
            <div className="text-sm fp-mono uppercase tracking-[0.3em] text-zinc-500">
              Select a thread
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full relative">
            
            {/* 대화창 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-zinc-900/20 backdrop-blur-sm z-10">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => navigate("/messages")} 
                  className="md:hidden w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-colors" 
                  data-testid="back-list"
                >
                  ←
                </button>
                <div className={`text-lg font-black tracking-tight ${thread.is_admin_line ? "text-red-500" : "text-white"}`} data-testid="thread-label">
                  {thread.other_label}
                </div>
              </div>
              
              {thread.is_admin_line && (
                <span className="px-3 py-1 bg-red-950/30 border border-red-900/50 rounded-full text-[11px] fp-mono uppercase tracking-[0.2em] text-red-500 font-bold">
                  Auto-purge 24h
                </span>
              )}
            </div>

            {/* 메시지 리스트 영역 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" data-testid="msg-list">
              {thread.messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm fp-mono uppercase tracking-[0.3em] text-zinc-600">
                  Say something.
                </div>
              ) : thread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
                  <div className={`max-w-[80%] sm:max-w-[70%] px-5 py-3.5 rounded-2xl shadow-md ${
                    m.from_me 
                      ? "bg-red-950/30 border border-red-900/50 rounded-br-sm" 
                      : "bg-zinc-900/80 border border-zinc-800 rounded-bl-sm"
                  }`}>
                    <p className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${m.from_me ? "text-red-50" : "text-zinc-200"}`}>
                      {m.content}
                    </p>
                    <div className={`text-[11px] fp-mono mt-2 text-right ${m.from_me ? "text-red-500/60" : "text-zinc-500"}`}>
                      {relTime(m.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} className="h-2"/>
            </div>

            {/* 입력 폼 영역 */}
            <div className="p-4 sm:p-6 bg-zinc-900/20 border-t border-white/5 backdrop-blur-sm z-10">
              <form onSubmit={send} className="flex gap-3 relative">
                <input
                  className="flex-1 bg-black/40 border border-zinc-800 rounded-full pl-6 pr-24 py-4 text-[15px] text-white focus:outline-none focus:border-zinc-500 transition-colors shadow-inner"
                  placeholder="Type a message. Anonymous."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={2000}
                  data-testid="msg-input"
                />
                <button 
                  type="submit" 
                  disabled={!text.trim()} 
                  className="absolute right-2 top-2 bottom-2 px-6 rounded-full text-[12px] fp-mono uppercase tracking-widest font-bold bg-white text-black hover:bg-zinc-200 disabled:opacity-0 disabled:pointer-events-none transition-all duration-200" 
                  data-testid="send-btn"
                >
                  Send
                </button>
              </form>
            </div>
            
          </div>
        )}
      </section>
    </div>
  );
}