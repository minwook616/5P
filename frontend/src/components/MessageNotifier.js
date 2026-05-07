import { useState, useEffect, useRef } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function MessageNotifier() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const audioRef = useRef(new Audio("/ding.mp3"));

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlockAudio = () => {
      console.log("Interaction detected. Attempting to unlock audio...");
      if (audioRef.current) {
        audioRef.current.play()
          .then(() => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            console.log("Audio context unlocked.");
            document.removeEventListener("click", unlockAudio);
            document.removeEventListener("touchstart", unlockAudio);
          })
          .catch(e => console.warn("Audio unlock pending interaction:", e));
      }
    };

    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);
    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const checkUnread = async () => {
      try {
        const res = await api.get("/messages/unread-count");
        const newCount = res.data.count;

        console.log(`Unread poll: prev=${unreadCount}, new=${newCount}`);

        if (newCount > unreadCount) {
          console.log("New message! Playing sound...");
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play()
              .then(() => console.log("Playback success"))
              .catch(e => console.error("Playback failed:", e));
          }
          
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
        const detail = err.response?.data?.detail || err.message;
        console.error(`Unread poll failed (Status ${err.response?.status}):`, detail);
        
        if (err.response?.status === 403) {
          console.log("Current user object from context:", user);
        }
      }
    };

    checkUnread();
    const interval = setInterval(checkUnread, 15000);
    return () => clearInterval(interval);
  }, [user, unreadCount, navigate]);

  return null;
}
