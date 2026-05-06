import React from 'react';

const krRules = [
  "전체 제한: 하루에 딱 5개의 글만 올라옵니다.",
  "개별 제한: 한 명당 하루에 1개의 글만 작성 가능합니다.",
  "초기화: 매일 오전 12시(자정)에 작성 권한이 초기화됩니다.",
  "자동 삭제: 모든 글과 쪽지는 24시간 뒤 삭제됩니다.",
  "커뮤니티: 비방, 욕설, 광고글은 즉시 삭제됩니다."
];

const enRules = [
  "Global Limit: Exactly 5 posts per day.",
  "Individual Limit: 1 post per user daily.",
  "Daily Reset: Access refreshes every midnight.",
  "Auto-Purge: Everything vanishes after 24h.",
  "Community: Zero tolerance for hate or ads."
];

export default function FloatingRules() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden select-none" style={{ zIndex: 1, opacity: 0.15 }}>
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
      
      {/* 1. KR Up */}
      <div className="floating-rule font-black text-[18px]" style={{
        left: '5%',
        animation: 'float-up 40s linear infinite',
      }}>
        {krRules[0]}
      </div>

      {/* 2. EN Right */}
      <div className="floating-rule font-light text-[24px]" style={{
        top: '15%',
        animation: 'float-right 55s linear infinite',
        animationDelay: '-5s'
      }}>
        {enRules[0]}
      </div>

      {/* 3. KR Down */}
      <div className="floating-rule font-medium text-[14px]" style={{
        right: '10%',
        animation: 'float-down 45s linear infinite',
        animationDelay: '-12s'
      }}>
        {krRules[1]}
      </div>

      {/* 4. EN Left */}
      <div className="floating-rule font-bold text-[20px]" style={{
        bottom: '25%',
        animation: 'float-left 50s linear infinite',
        animationDelay: '-2s'
      }}>
        {enRules[3]}
      </div>

      {/* 5. KR Diag */}
      <div className="floating-rule font-thin text-[32px] opacity-40" style={{
        top: '40%',
        left: '20%',
        animation: 'float-diag 65s linear infinite',
        animationDelay: '-20s'
      }}>
        {krRules[4]}
      </div>

      {/* 6. EN Up */}
      <div className="floating-rule font-black text-[16px] text-[var(--red)]" style={{
        left: '40%',
        animation: 'float-up 35s linear infinite',
        animationDelay: '-15s'
      }}>
        {enRules[1]}
      </div>

      {/* 7. KR Right */}
      <div className="floating-rule font-light text-[22px]" style={{
        bottom: '10%',
        animation: 'float-right 48s linear infinite',
        animationDelay: '-8s'
      }}>
        {krRules[3]}
      </div>

      {/* 8. EN Down */}
      <div className="floating-rule font-medium text-[15px]" style={{
        left: '70%',
        animation: 'float-down 52s linear infinite',
        animationDelay: '-25s'
      }}>
        {enRules[2]}
      </div>

      {/* 9. EN Diag */}
      <div className="floating-rule font-bold text-[28px] opacity-30" style={{
        top: '10%',
        left: '5%',
        animation: 'float-diag 75s linear infinite',
        animationDelay: '-35s'
      }}>
        {enRules[4]}
      </div>

      {/* 10. KR Left */}
      <div className="floating-rule font-thin text-[26px]" style={{
        top: '70%',
        right: '5%',
        animation: 'float-left 60s linear infinite',
        animationDelay: '-18s'
      }}>
        {krRules[2]}
      </div>
    </div>
  );
}
