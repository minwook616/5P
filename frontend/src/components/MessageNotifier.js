import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function MessageNotifier() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const audioRef = useRef(new Audio("/ding.mp3"));

  useEffect(() => {
    if (!user) return;

    const checkUnread = async () => {
      try {
        const res = await api.get("/messages/unread-count");
        const newCount = res.data.count;

        if (newCount > unreadCount) {
          // Play sound
          audioRef.current.play().catch(e => console.error("Audio play failed:", e));
          
          // Show toast
          toast("새로운 쪽지가 도착했습니다", {
            description: "쪽지함에서 확인하세요.",
            action: {
              label: "이동",
              onClick: () => navigate("/messages"),
            },
          });
        }
        setUnreadCount(newCount);
      } catch (err) {
        console.error("Unread count check failed:", err);
      }
    };

    // Initial check
    checkUnread();

    const interval = setInterval(checkUnread, 10000); // 10s
    return () => clearInterval(interval);
  }, [user, unreadCount, navigate]);

  return null; // Background only
}
