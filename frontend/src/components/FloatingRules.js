import React from 'react';

const rules = [
  "Global Limit: Exactly 5 posts per day.",
  "Individual Limit: 1 post per user daily.",
  "Daily Reset: Access refreshes every midnight.",
  "Auto-Purge: Everything vanishes after 24h.",
  "Community: Zero tolerance for hate or ads.",
  "Anonymous: Your identity is always hidden.",
  "Five Stories: Five People. Once a day."
];

export default function FloatingRules() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden select-none" style={{ zIndex: 1, opacity: 0.12 }}>
      <style>{`
        @keyframes float-up {
          from { transform: translateY(110vh) rotate(-2deg); }
          to { transform: translateY(-30vh) rotate(2deg); }
        }
        @keyframes float-down {
          from { transform: translateY(-30vh) rotate(2deg); }
          to { transform: translateY(110vh) rotate(-2deg); }
        }
        @keyframes float-left {
          from { transform: translateX(110vw) rotate(5deg); }
          to { transform: translateX(-60vw) rotate(-5deg); }
        }
        @keyframes float-right {
          from { transform: translateX(-60vw) rotate(-5deg); }
          to { transform: translateX(110vw) rotate(5deg); }
        }
        @keyframes float-diag {
          from { transform: translate(-20vw, -20vh) rotate(-10deg); }
          to { transform: translate(110vw, 110vh) rotate(10deg); }
        }

        .floating-rule {
          position: absolute;
          white-space: nowrap;
          font-family: 'Pretendard Variable', 'Pretendard', sans-serif;
          font-style: italic;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--text);
          filter: blur(0.3px);
        }
      `}</style>
      
      {/* 1. Up */}
      <div className="floating-rule font-black text-[18px]" style={{
        left: '5%',
        animation: 'float-up 40s linear infinite',
      }}>
        {rules[0]}
      </div>

      {/* 2. Right */}
      <div className="floating-rule font-light text-[24px]" style={{
        top: '15%',
        animation: 'float-right 55s linear infinite',
        animationDelay: '-5s'
      }}>
        {rules[1]}
      </div>

      {/* 3. Down */}
      <div className="floating-rule font-medium text-[14px]" style={{
        right: '10%',
        animation: 'float-down 45s linear infinite',
        animationDelay: '-12s'
      }}>
        {rules[2]}
      </div>

      {/* 4. Left */}
      <div className="floating-rule font-bold text-[20px]" style={{
        bottom: '25%',
        animation: 'float-left 50s linear infinite',
        animationDelay: '-2s'
      }}>
        {rules[3]}
      </div>

      {/* 5. Diag */}
      <div className="floating-rule font-thin text-[32px] opacity-40" style={{
        top: '40%',
        left: '20%',
        animation: 'float-diag 65s linear infinite',
        animationDelay: '-20s'
      }}>
        {rules[4]}
      </div>

      {/* 6. Up */}
      <div className="floating-rule font-black text-[16px] text-[var(--red)]" style={{
        left: '40%',
        animation: 'float-up 35s linear infinite',
        animationDelay: '-15s'
      }}>
        {rules[5]}
      </div>

      {/* 7. Right */}
      <div className="floating-rule font-light text-[22px]" style={{
        bottom: '10%',
        animation: 'float-right 48s linear infinite',
        animationDelay: '-8s'
      }}>
        {rules[6]}
      </div>

      {/* 8. Down */}
      <div className="floating-rule font-medium text-[15px]" style={{
        left: '70%',
        animation: 'float-down 52s linear infinite',
        animationDelay: '-25s'
      }}>
        {rules[0]}
      </div>

      {/* 9. Diag */}
      <div className="floating-rule font-bold text-[28px] opacity-30" style={{
        top: '10%',
        left: '5%',
        animation: 'float-diag 75s linear infinite',
        animationDelay: '-35s'
      }}>
        {rules[3]}
      </div>

      {/* 10. Left */}
      <div className="floating-rule font-thin text-[26px]" style={{
        top: '70%',
        right: '5%',
        animation: 'float-left 60s linear infinite',
        animationDelay: '-18s'
      }}>
        {rules[1]}
      </div>
    </div>
  );
}
