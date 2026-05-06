import React from 'react';

const rules = [
  "전체 제한: 하루에 딱 5개의 글만 올라옵니다.",
  "개별 제한: 한 명당 하루에 1개의 글만 작성 가능합니다.",
  "초기화: 매일 오전 12시(자정)에 작성 권한이 초기화됩니다.",
  "자동 삭제: 모든 글과 쪽지는 24시간 뒤 삭제됩니다.",
  "커뮤니티: 비방, 욕설, 광고글은 운영자나 Pillar가 즉시 삭제합니다."
];

export default function FloatingRules() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none opacity-[0.07]">
      <style>{`
        @keyframes float-up {
          from { transform: translateY(105vh) rotate(-5deg); }
          to { transform: translateY(-10vh) rotate(5deg); }
        }
        @keyframes float-down {
          from { transform: translateY(-10vh) rotate(5deg); }
          to { transform: translateY(105vh) rotate(-5deg); }
        }
        @keyframes float-left {
          from { transform: translateX(105vw) rotate(5deg); }
          to { transform: translateX(-20vw) rotate(-5deg); }
        }
        @keyframes float-right {
          from { transform: translateX(-20vw) rotate(-5deg); }
          to { transform: translateX(105vw) rotate(5deg); }
        }
        @keyframes float-diag {
          from { transform: translate(-10vw, -10vh) rotate(0deg); }
          to { transform: translate(100vw, 100vh) rotate(10deg); }
        }

        .floating-rule {
          position: absolute;
          white-space: nowrap;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--text);
          text-shadow: 0 0 10px rgba(255,255,255,0.1);
        }
      `}</style>
      
      {/* Rule 1: Up */}
      <div className="floating-rule" style={{
        left: '10%',
        animation: 'float-up 25s linear infinite',
        animationDelay: '0s'
      }}>
        {rules[0]}
      </div>

      {/* Rule 2: Right */}
      <div className="floating-rule" style={{
        top: '20%',
        animation: 'float-right 30s linear infinite',
        animationDelay: '-5s'
      }}>
        {rules[1]}
      </div>

      {/* Rule 3: Down */}
      <div className="floating-rule" style={{
        right: '15%',
        animation: 'float-down 28s linear infinite',
        animationDelay: '-12s'
      }}>
        {rules[2]}
      </div>

      {/* Rule 4: Left */}
      <div className="floating-rule" style={{
        bottom: '30%',
        animation: 'float-left 35s linear infinite',
        animationDelay: '-2s'
      }}>
        {rules[3]}
      </div>

      {/* Rule 5: Diagonal */}
      <div className="floating-rule" style={{
        top: '50%',
        left: '50%',
        animation: 'float-diag 40s linear infinite',
        animationDelay: '-20s'
      }}>
        {rules[4]}
      </div>

      {/* Duplicates for density */}
      <div className="floating-rule" style={{
        left: '60%',
        animation: 'float-up 32s linear infinite',
        animationDelay: '-15s'
      }}>
        {rules[0]}
      </div>
      <div className="floating-rule" style={{
        top: '70%',
        animation: 'float-right 38s linear infinite',
        animationDelay: '-10s'
      }}>
        {rules[3]}
      </div>
    </div>
  );
}
