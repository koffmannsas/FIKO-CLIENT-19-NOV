import { useRef, useState } from 'react';
import {
  Brain,
  MessageSquare,
  CreditCard,
  LineChart,
  Sparkles,
  ChevronRight,
  LogOut,
  ArrowRight,
  Lock,
} from 'lucide-react';
import FikoConnectLogo from './FikoConnectLogo';

interface MobileQuantumEntryProps {
  currentUser: any;
  loading: boolean;
  onOpenLogin: () => void;
  onStartSignup: () => void;
  onEnterDemo: () => void;
  onSignOut: () => Promise<void>;
}

const ONBOARDING_SLIDES = [
  {
    index: '01',
    title: 'IA commerciale',
    description: 'Répond, qualifie et guide chaque prospect automatiquement 24h/24.',
    icon: Brain,
  },
  {
    index: '02',
    title: 'WhatsApp Business intégré',
    description: 'Centralisez vos conversations et convertissez vos clients plus vite.',
    icon: MessageSquare,
  },
  {
    index: '03',
    title: 'Paiements & automation',
    description: 'Accélérez vos ventes, relances J+1/J+2 et encaissements Mobile Money.',
    icon: CreditCard,
  },
  {
    index: '04',
    title: 'CRM & pilotage',
    description: 'Suivez vos leads, taux de conversion et revenus vérifiés en FCFA.',
    icon: LineChart,
  },
  {
    index: '05',
    title: 'Croissance assistée',
    description: 'Faites évoluer votre entreprise avec une IA formée sur vos vraies règles.',
    icon: Sparkles,
  },
];

export default function MobileQuantumEntry({
  currentUser,
  loading,
  onOpenLogin,
  onStartSignup,
  onEnterDemo,
  onSignOut,
}: MobileQuantumEntryProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const handleTrackScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const cards = Array.from(el.children) as HTMLElement[];
    if (cards.length === 0) return;

    const trackCenter = el.scrollLeft + el.clientWidth / 2;
    let closestIdx = 0;
    let minDist = Infinity;

    cards.forEach((card, idx) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - trackCenter);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    if (closestIdx !== activeSlide) {
      setActiveSlide(closestIdx);
    }
  };

  const scrollToSlide = (idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(idx, ONBOARDING_SLIDES.length - 1));
    const card = el.children[clamped] as HTMLElement | undefined;
    if (card) {
      el.scrollTo({
        left: card.offsetLeft - 20,
        behavior: 'smooth',
      });
    }
    setActiveSlide(clamped);
  };

  return (
    <div className="lg:hidden relative min-h-[100dvh] w-full bg-[#050505] text-white flex flex-col justify-between overflow-x-hidden overflow-y-auto select-none">
      {/* Cinematic atmospheric background: radial red glow + architectural micro-grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 14%, rgba(225, 6, 0, 0.22) 0%, rgba(225, 6, 0, 0.06) 36%, rgba(5, 5, 5, 0) 68%), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 42px 42px, 42px 42px',
        }}
      />

      {/* A. COMPACT PREMIUM HEADER */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-5 pt-4 pb-2 shrink-0">
        <FikoConnectLogo variant="full" size="sm" surface="dark" />

        {currentUser ? (
          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut size={13} className="text-[#E10600]" />
            Déconnexion
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenLogin}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Lock size={12} className="text-[#E10600]" />
            Espace Client
          </button>
        )}
      </header>

      {/* B. CENTRAL IMPACT HERO + D. HORIZONTAL ONBOARDING CAROUSEL */}
      <main className="relative z-10 flex-1 flex flex-col justify-center gap-4 py-2 min-h-0">
        <section className="px-5 space-y-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-400">
            Fiko OS <span aria-hidden="true" className="mx-1.5 text-zinc-600">·</span> Intelligence commerciale WhatsApp
          </p>

          <h1 className="text-[clamp(1.7rem,6.8vw,2.25rem)] font-black tracking-tight leading-[1.08] text-white text-balance">
            Transformez chaque conversation en{' '}
            <span className="text-[#E10600]">croissance.</span>
          </h1>

          <p className="text-[13.5px] leading-relaxed text-zinc-300 max-w-md">
            Fiko Connect centralise vos échanges, automatise votre relation client et transforme WhatsApp en moteur de vente.
          </p>
        </section>

        {/* Horizontal Swipeable Onboarding Slider */}
        <section aria-label="Découverte Fiko Connect" className="space-y-2.5">
          <div
            ref={trackRef}
            onScroll={handleTrackScroll}
            className="flex items-stretch gap-3 overflow-x-auto snap-x snap-mandatory px-5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {ONBOARDING_SLIDES.map((slide, idx) => {
              const Icon = slide.icon;
              const isActive = activeSlide === idx;
              return (
                <article
                  key={slide.index}
                  onClick={() => scrollToSlide(idx)}
                  className={`w-[82%] sm:w-[60%] shrink-0 snap-center rounded-2xl p-4 border transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#101016]/90 border-white/15 shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
                      : 'bg-[#0b0b10]/70 border-white/[0.06] opacity-80'
                  } backdrop-blur-xl`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#E10600]/15 border border-[#E10600]/30 flex items-center justify-center text-[#E10600] shrink-0">
                      <Icon size={16} />
                    </div>
                    <span className="text-[11px] font-mono tabular-nums font-semibold text-zinc-500">
                      {slide.index} / 0{ONBOARDING_SLIDES.length}
                    </span>
                  </div>
                  <h2 className="text-sm font-extrabold text-white tracking-tight leading-snug">
                    {slide.title}
                  </h2>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1 line-clamp-2">
                    {slide.description}
                  </p>
                </article>
              );
            })}
          </div>

          {/* Interactive Slide Dots + Swipe Cue */}
          <div className="px-5 flex items-center justify-between">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Slides onboarding">
              {ONBOARDING_SLIDES.map((slide, idx) => (
                <button
                  key={slide.index}
                  type="button"
                  role="tab"
                  aria-selected={activeSlide === idx}
                  aria-label={`Afficher ${slide.title}`}
                  onClick={() => scrollToSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                    activeSlide === idx ? 'w-6 bg-[#E10600]' : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                scrollToSlide(activeSlide < ONBOARDING_SLIDES.length - 1 ? activeSlide + 1 : 0)
              }
              className="text-[11px] font-semibold text-zinc-400 hover:text-white flex items-center gap-1 py-1 cursor-pointer transition-colors"
            >
              <span>Glisser pour explorer</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </section>
      </main>

      {/* C. THUMB-ZONE PRIMARY ACTION BLOCK */}
      <footer className="relative z-10 px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-2.5 shrink-0 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent">
        <button
          type="button"
          onClick={onOpenLogin}
          disabled={loading}
          className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-r from-[#E10600] to-[#c40500] hover:from-[#f00800] hover:to-[#E10600] text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(225,6,0,0.32)] active:scale-[0.98] transition-all cursor-pointer"
        >
          <span>{currentUser ? 'Accéder à mon espace' : 'Se connecter'}</span>
          <ChevronRight size={16} />
        </button>

        <button
          type="button"
          onClick={onStartSignup}
          disabled={loading}
          className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/15 text-white font-semibold text-sm tracking-wide backdrop-blur-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
        >
          <span>Créer un compte</span>
        </button>

        <div className="flex justify-center pt-0.5">
          <button
            type="button"
            onClick={onEnterDemo}
            className="min-h-[38px] px-4 text-xs font-medium text-zinc-400 hover:text-white transition-colors underline underline-offset-4 decoration-zinc-700 hover:decoration-white cursor-pointer"
          >
            Découvrir la démo
          </button>
        </div>
      </footer>
    </div>
  );
}
