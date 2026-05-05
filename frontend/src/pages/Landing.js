import { Link } from "react-router-dom";
import { Flame, MessageCircle, ShieldCheck, Zap, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-[#FF5E5B] border-2 border-[#1A1A1A] rounded-lg flex items-center justify-center nb-shadow-xs">
            <Flame size={20} color="#fff" strokeWidth={2.8} />
          </div>
          <span className="font-display font-black text-xl tracking-tight">CampusTalk</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="nb-btn nb-btn-white text-sm" data-testid="landing-login-btn">로그인</Link>
          <Link to="/register" className="nb-btn nb-btn-primary text-sm" data-testid="landing-register-btn">시작하기</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-12 md:pt-20 pb-16">
        <div className="grid md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#A7F3D0] border-2 border-[#1A1A1A] rounded-full text-xs font-black uppercase tracking-wider nb-shadow-xs">
              <span className="w-2 h-2 bg-[#1A1A1A] rounded-full animate-pulse" />
              대학생 커뮤니티
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[1.02]">
              익명이라서 <br/>
              <span className="bg-[#FDE047] px-3 border-2 border-[#1A1A1A] inline-block -rotate-1 nb-shadow-sm">진짜로</span> 말할 수 있어.
            </h1>
            <p className="text-lg font-medium text-[#4B5563] max-w-xl leading-relaxed">
              시험 망했다고 울고, 꿀강의 추천받고, 좋아하는 사람 자랑하고.
              하루 5개 제한으로 쓸데없는 글 없이 알짜배기만 모이는
              캠퍼스 익명 놀이터.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/register" className="nb-btn nb-btn-primary text-base" data-testid="hero-register-btn">
                무료로 시작하기
                <ArrowRight size={18} className="ml-2" strokeWidth={2.5}/>
              </Link>
              <Link to="/login" className="nb-btn nb-btn-secondary text-base" data-testid="hero-login-btn">
                로그인
              </Link>
            </div>
            <div className="flex items-center gap-2 pt-4 text-sm font-semibold text-[#4B5563]">
              <div className="flex -space-x-2">
                {['#FF5E5B','#B8B8FF','#A3E635','#FDE047'].map((c,i)=>(
                  <div key={i} className="w-7 h-7 rounded-full border-2 border-[#1A1A1A]" style={{background:c}}/>
                ))}
              </div>
              <span>오늘도 수천 명이 수다떠는 중</span>
            </div>
          </div>

          {/* Stack of cards on right */}
          <div className="md:col-span-5 relative h-[440px]">
            <div className="absolute top-0 right-4 w-72 nb-card p-5 rotate-3">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-block text-xs font-black uppercase px-2 py-0.5 bg-[#A7F3D0] border-2 border-[#1A1A1A] rounded-full">자유</span>
                <span className="text-xs font-bold text-[#4B5563]">방금</span>
              </div>
              <h3 className="font-display font-black text-lg mb-1">도서관 4층 자리 왜 이렇게 없냐</h3>
              <p className="text-sm font-medium text-[#4B5563]">시험기간 진짜 실화냐...</p>
            </div>
            <div className="absolute top-36 right-24 w-72 nb-card p-5 -rotate-2 bg-[#FDE047]">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-block text-xs font-black uppercase px-2 py-0.5 bg-white border-2 border-[#1A1A1A] rounded-full">정보</span>
                <span className="text-xs font-bold">2분 전</span>
              </div>
              <h3 className="font-display font-black text-lg mb-1">김교수님 꿀강의 인증</h3>
              <p className="text-sm font-medium">출첵만 하면 B+ 보장...</p>
            </div>
            <div className="absolute top-72 right-0 w-72 nb-card p-5 rotate-1 bg-[#B8B8FF]">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-block text-xs font-black uppercase px-2 py-0.5 bg-white border-2 border-[#1A1A1A] rounded-full">비밀</span>
                <span className="text-xs font-bold">5분 전</span>
              </div>
              <h3 className="font-display font-black text-lg mb-1">과 선배 짝사랑 중</h3>
              <p className="text-sm font-medium">어떡하지 진짜...</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          <Feature icon={ShieldCheck} title="완전 익명" desc="학교 사람들도 내가 쓴 글인지 몰라요. 진짜 마음을 풀어놔요." color="#A7F3D0"/>
          <Feature icon={Zap} title="하루 5개 제한" desc="24시간 리셋. 도배 없이 알짜 글만 남아요." color="#FDE047"/>
          <Feature icon={MessageCircle} title="1:1 쪽지" desc="마음 맞는 사람이랑만 조용히 대화해요." color="#B8B8FF"/>
        </div>
      </section>

      <footer className="border-t-2 border-[#1A1A1A] bg-white py-6 text-center text-sm font-semibold text-[#4B5563]">
        © 2026 CampusTalk. Built with 🔥 on Emergent.
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, desc, color }) {
  return (
    <div className="nb-card p-6">
      <div className="w-12 h-12 rounded-xl border-2 border-[#1A1A1A] flex items-center justify-center mb-4 nb-shadow-xs" style={{background: color}}>
        <Icon size={22} strokeWidth={2.5}/>
      </div>
      <h3 className="font-display font-black text-xl mb-2">{title}</h3>
      <p className="text-sm font-medium text-[#4B5563] leading-relaxed">{desc}</p>
    </div>
  );
}
