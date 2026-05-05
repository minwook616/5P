import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Send, Search, ArrowLeft, MessageCircle } from "lucide-react";
import { timeAgo } from "@/pages/Feed";

export default function Messages() {
  const { otherId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get("/messages/conversations");
      setConversations(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async () => {
    if (!otherId) { setThread(null); return; }
    try {
      const { data } = await api.get(`/messages/${otherId}`);
      setThread(data);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  }, [otherId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadThread(); }, [loadThread]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !otherId) return;
    try {
      const { data } = await api.post("/messages", { recipient_id: otherId, content: text });
      setThread((t) => t ? { ...t, messages: [...t.messages, data] } : t);
      setText("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      loadConversations();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const doSearch = async (q) => {
    setSearchQ(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const { data } = await api.get("/users/search", { params: { q } });
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    }
  };

  return (
    <div className="grid md:grid-cols-12 gap-4">
      {/* Conversations list */}
      <div className={`md:col-span-5 nb-card p-4 ${otherId ? "hidden md:block" : ""}`} data-testid="conversations-panel">
        <h2 className="font-display text-xl font-black tracking-tight mb-3">쪽지함</h2>

        {/* Search */}
        <div className="mb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4B5563]" />
            <input
              value={searchQ}
              onChange={(e) => doSearch(e.target.value)}
              placeholder="닉네임으로 유저 찾기"
              className="nb-input pl-9 text-sm"
              data-testid="user-search-input"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1" data-testid="search-results">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSearchQ(""); setSearchResults([]); navigate(`/messages/${u.id}`); }}
                  className="w-full text-left p-2 rounded-lg hover:bg-[#F3F2EE] font-bold text-sm border border-dashed border-[#D1D5DB]"
                  data-testid={`search-result-${u.id}`}
                >
                  @{u.nickname}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-6 font-bold text-sm">로딩중...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-10 text-sm font-semibold text-[#4B5563]">
            <MessageCircle size={36} className="mx-auto mb-2 opacity-50"/>
            아직 쪽지가 없어요<br/>
            위에서 유저를 검색해 시작해보세요
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((c) => (
              <button
                key={c.conv_id}
                onClick={() => navigate(`/messages/${c.other_user.id}`)}
                className={`w-full text-left p-3 rounded-xl border-2 border-[#1A1A1A] transition-all ${
                  otherId === c.other_user.id ? "bg-[#FDE047] nb-shadow-xs" : "bg-white hover:bg-[#F3F2EE]"
                }`}
                data-testid={`conv-${c.other_user.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">@{c.other_user.nickname}</span>
                  <div className="flex items-center gap-1.5">
                    {c.unread > 0 && (
                      <span className="px-2 py-0.5 bg-[#FF5E5B] text-white text-xs font-black rounded-full border-2 border-[#1A1A1A]">
                        {c.unread}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-[#4B5563]">{timeAgo(c.last_at)}</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-[#4B5563] truncate">{c.last_message}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thread view */}
      <div className={`md:col-span-7 nb-card p-4 flex flex-col ${otherId ? "" : "hidden md:flex"}`} style={{ minHeight: 520 }} data-testid="thread-panel">
        {!thread ? (
          <div className="flex-1 flex items-center justify-center text-center text-[#4B5563] font-semibold">
            <div>
              <MessageCircle size={48} className="mx-auto mb-3 opacity-50"/>
              쪽지를 선택하거나 새 대화를 시작하세요
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 pb-3 border-b-2 border-[#1A1A1A] mb-3">
              <button onClick={() => navigate("/messages")} className="md:hidden" data-testid="back-to-list"><ArrowLeft size={20}/></button>
              <div>
                <div className="font-display font-black text-lg">@{thread.other_user.nickname}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-2" style={{ maxHeight: 420 }} data-testid="message-list">
              {thread.messages.length === 0 ? (
                <div className="text-center text-sm text-[#4B5563] font-semibold py-10">
                  첫 쪽지를 보내보세요
                </div>
              ) : thread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-4 py-2 border-2 border-[#1A1A1A] rounded-2xl ${m.from_me ? "bg-[#FF5E5B] text-white rounded-br-md" : "bg-white rounded-bl-md"}`} data-testid={`msg-${m.id}`}>
                    <p className="text-sm font-medium whitespace-pre-wrap break-words">{m.content}</p>
                    <div className={`text-[10px] font-semibold mt-1 ${m.from_me ? "text-white/80" : "text-[#4B5563]"}`}>
                      {timeAgo(m.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="flex gap-2 pt-3 border-t-2 border-dashed border-[#D1D5DB]">
              <input
                className="nb-input flex-1"
                placeholder="메시지를 입력하세요"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                data-testid="message-input"
              />
              <button type="submit" disabled={!text.trim()} className="nb-btn nb-btn-primary" data-testid="send-message-btn">
                <Send size={16}/>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
