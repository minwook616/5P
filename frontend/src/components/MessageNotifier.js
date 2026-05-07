import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
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
      console.log("Attempting to initialize and unlock audio...");
      
      // Create fresh audio object if it doesn't exist
      if (!audioRef.current) {
        audioRef.current = new Audio("/ding.mp3");
      }

      audioRef.current.play()
        .then(() => {
          // Immediately pause and reset after success
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          console.log("Audio unlocked successfully");
          document.removeEventListener("click", unlockAudio);
          document.removeEventListener("touchstart", unlockAudio);
        })
        .catch(e => {
          console.warn("Audio unlock failed, will retry on next interaction:", e);
          // If it fails with "No supported sources", try re-initializing
          audioRef.current = new Audio("/ding.mp3");
        });
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

        console.log(`Checking unread: prev=${unreadCount}, new=${newCount}`);

        if (newCount > unreadCount) {
          console.log("New message detected! Attempting to play sound...");
          // Play sound
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play()
              .then(() => console.log("Sound played successfully"))
              .catch(e => {
                console.error("Audio play failed after detection:", e);
                // Fallback: try re-loading if it failed
                audioRef.current.load();
              });
          }
          
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
