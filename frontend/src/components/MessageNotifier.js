import { useState, useEffect, useRef } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function MessageNotifier() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const audioRef = useRef(null);

  // Initialize and unlock audio on first user interaction
  useEffect(() => {
    const unlockAudio = () => {
      console.log("Interaction detected. Initializing audio...");
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio("/ding.mp3");
          audioRef.current.volume = 0.4; // Reduce volume to 40%
          audioRef.current.load(); // Force load
        }
        
        audioRef.current.play()
          .then(() => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            console.log("Audio context unlocked.");
            document.removeEventListener("click", unlockAudio);
            document.removeEventListener("touchstart", unlockAudio);
          })
          .catch(e => console.warn("Audio play blocked by browser:", e));
      } catch (err) {
        console.error("Failed to initialize audio:", err);
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
    if (!user || user.status !== "active") return;

    const checkUnread = async () => {
      try {
        const res = await api.get("/messages/unread-count");
        const newCount = res.data.count;

        if (newCount > unreadCount) {
          console.log("New message! Playing sound...");
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.error("Playback failed:", e));
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
        // Log but don't spam the console if it's a persistent error
        if (err.response?.status !== 403) {
          console.error("Unread count poll failed:", err.message);
        }
      }
    };

    checkUnread();
    const interval = setInterval(checkUnread, 10000);
    return () => clearInterval(interval);
  }, [user, unreadCount, navigate]);

  return null;
}
