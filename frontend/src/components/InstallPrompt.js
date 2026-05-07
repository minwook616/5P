import React, { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if device is iOS
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // Check if already in standalone mode (PWA installed)
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    // Show prompt only on iOS if not installed and not dismissed before
    const isDismissed = localStorage.getItem('pwa_prompt_dismissed');
    
    if (isiOS && !isStandalone && !isDismissed) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-2xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--red)] to-transparent opacity-50" />
        
        <button 
          onClick={dismiss}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200 transition-colors p-1"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y1="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black border border-zinc-800 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-[var(--red)] font-black text-xl">5P</span>
          </div>
          
          <div className="flex-1 pr-6">
            <p className="text-zinc-100 font-bold text-[15px] leading-tight mb-1">
              5P를 앱처럼 사용해 보세요!
            </p>
            <p className="text-zinc-400 text-[13px] leading-snug">
              하단의 공유 아이콘을 누르고 <br/>
              <span className="text-zinc-200 font-medium">'홈 화면에 추가'</span>를 선택하세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
