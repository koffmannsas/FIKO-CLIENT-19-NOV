import { useEffect, useState } from 'react';
import {
  Bot,
  ChevronRight,
  Brain,
  Users,
  MessageSquareText,
  TrendingUp,
  Wallet,
  Layers,
} from 'lucide-react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useCurrency } from '../lib/currency';

interface MobileHomeProps {
  onboardingData?: any;
  isDemoMode: boolean;
  autoPilot: boolean;
  unreadCount: number;
  onToggleAutoPilot: () => void;
  onNavigate: (itemName: string) => void;
  onUpgrade: () => void;
  onExpandDesktopDashboard: () => void;
}

export default function MobileHome({
  onboardingData,
  isDemoMode,
  autoPilot,
  unreadCount,
  onToggleAutoPilot,
  onNavigate,
  onUpgrade,
  onExpandDesktopDashboard,
}: MobileHomeProps) {
  const { formatMoney } = useCurrency();

  const [loadingReal, setLoadingReal] = useState(!isDemoMode);
  const [realLeadsCount, setRealLeadsCount] = useState<number>(0);
  const [realMessagesCount, setRealMessagesCount] = useState<number>(0);
  const [realPaidCount, setRealPaidCount] = useState<number>(0);
  const [realRevenueFCFA, setRealRevenueFCFA] = useState<number>(0);

  useEffect(() => {
    if (isDemoMode) {
      setLoadingReal(false);
      return;
    }

    let unsubLeads: (() => void) | undefined;
    let unsubTx: (() => void) | undefined;
    let unsubMsgs: (() => void) | undefined;
    let cancelled = false;

    async function subscribeRealMetrics() {
      const user = auth.currentUser;
      if (!user) {
        if (!cancelled) setLoadingReal(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const companyId = userSnap.exists()
          ? userSnap.data()?.companyId
          : onboardingData?.companyId;

        if (!companyId || cancelled) {
          if (!cancelled) setLoadingReal(false);
          return;
        }

        unsubLeads = onSnapshot(
          query(collection(db, 'leads'), where('companyId', '==', companyId)),
          (snap) => {
            if (!cancelled) setRealLeadsCount(snap.size);
          },
          () => undefined
        );

        unsubTx = onSnapshot(
          query(collection(db, 'transactions'), where('companyId', '==', companyId)),
          (snap) => {
            let sum = 0;
            let count = 0;
            snap.forEach((docSnap) => {
              const d = docSnap.data();
              if (d.status === 'SUCCESS') {
                sum += Number(d.amount) || 0;
                count += 1;
              }
            });
            if (!cancelled) {
              setRealRevenueFCFA(sum);
              setRealPaidCount(count);
              setLoadingReal(false);
            }
          },
          () => {
            if (!cancelled) setLoadingReal(false);
          }
        );

        unsubMsgs = onSnapshot(
          query(collection(db, 'messages'), where('companyId', '==', companyId)),
          (snap) => {
            if (!cancelled) setRealMessagesCount(snap.size);
          },
          () => undefined
        );
      } catch {
        if (!cancelled) setLoadingReal(false);
      }
    }

    subscribeRealMetrics();

    return () => {
      cancelled = true;
      if (unsubLeads) unsubLeads();
      if (unsubTx) unsubTx();
      if (unsubMsgs) unsubMsgs();
    };
  }, [isDemoMode, onboardingData?.companyId]);

  // Compute transparent display metrics strictly adhering to Demo vs Real isolation
  const performanceScore = isDemoMode
    ? 60
    : Math.min(
        100,
        (onboardingData?.connectedNumber ? 40 : 20) +
          (realLeadsCount > 0 ? 20 : 0) +
          (realMessagesCount > 0 ? 15 : 0) +
          (realPaidCount > 0 ? 15 : 0) +
          (autoPilot ? 10 : 0)
      );

  const leadsDisplay = isDemoMode ? '4' : loadingReal ? '…' : String(realLeadsCount);
  const messagesDisplay = isDemoMode
    ? '42'
    : loadingReal
    ? '…'
    : realMessagesCount > 0
    ? String(realMessagesCount)
    : '—';

  const conversionPercent =
    !isDemoMode && realLeadsCount > 0 && realPaidCount > 0
      ? Math.min(100, Math.round((realPaidCount / realLeadsCount) * 100))
      : null;

  const conversionDisplay = isDemoMode
    ? '—'
    : loadingReal
    ? '…'
    : conversionPercent !== null
    ? `${conversionPercent}%`
    : '—';

  const revenueDisplay = isDemoMode
    ? '—'
    : loadingReal
    ? '…'
    : realRevenueFCFA > 0
    ? formatMoney(realRevenueFCFA)
    : '—';

  return (
    <div className="space-y-4 pb-6 w-full max-w-full">
      {/* 1. MOBILE HERO GREETING */}
      <section className="pt-1 space-y-1">
        <h1 className="text-2xl font-[900] tracking-tight text-white text-balance">
          Bonjour, bienvenue 👋
        </h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Votre activité commerciale, partout avec vous.
          {!isDemoMode && onboardingData?.companyName && (
            <span className="text-zinc-300 font-semibold"> · {onboardingData.companyName}</span>
          )}
        </p>
      </section>

      {/* 2. FIKO PERFORMANCE SCORE */}
      <section className="bg-[#0b0b10] border border-zinc-900 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-400">
            FIKO PERFORMANCE SCORE
          </span>
          <span className="text-xl font-black font-mono tabular-nums text-white">
            {performanceScore}/100
          </span>
        </div>

        <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E10600] rounded-full transition-all duration-500"
            style={{ width: `${performanceScore}%` }}
          />
        </div>

        <p className="text-[11px] text-zinc-400">
          {isDemoMode
            ? 'Valeurs illustratives pour la maquette mobile'
            : `Score calculé en temps réel · Plan ${onboardingData?.selectedPlan || 'free'}`}
        </p>
      </section>

      {/* 3. 2x2 TOUCH-FRIENDLY KPI CARDS GRID */}
      <section className="grid grid-cols-2 gap-3">
        {/* Card 1: Prospects */}
        <button
          type="button"
          onClick={() => onNavigate('Fiko leads')}
          className="text-left bg-[#0b0b10] hover:bg-zinc-900/70 active:scale-[0.98] border border-zinc-900 rounded-2xl p-4 min-h-[112px] flex flex-col justify-between transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold text-zinc-300">Prospects</span>
            <Users size={15} className="text-[#E10600]" />
          </div>
          <div>
            <p className="text-2xl font-black font-mono tabular-nums text-white leading-tight">
              {leadsDisplay}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">Leads capturés</p>
          </div>
        </button>

        {/* Card 2: Messages IA */}
        <button
          type="button"
          onClick={() => onNavigate('Conversations')}
          className="text-left bg-[#0b0b10] hover:bg-zinc-900/70 active:scale-[0.98] border border-zinc-900 rounded-2xl p-4 min-h-[112px] flex flex-col justify-between transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold text-zinc-300">Messages IA</span>
            <MessageSquareText size={15} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-black font-mono tabular-nums text-white leading-tight">
              {messagesDisplay}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {unreadCount > 0 ? `${unreadCount} non lu(s)` : 'Conversations traitées'}
            </p>
          </div>
        </button>

        {/* Card 3: Conversion */}
        <button
          type="button"
          onClick={() => onNavigate('Analytics')}
          className="text-left bg-[#0b0b10] hover:bg-zinc-900/70 active:scale-[0.98] border border-zinc-900 rounded-2xl p-4 min-h-[112px] flex flex-col justify-between transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold text-zinc-300">Conversion</span>
            <TrendingUp size={15} className="text-sky-400" />
          </div>
          <div>
            <p className="text-2xl font-black font-mono tabular-nums text-white leading-tight">
              {conversionDisplay}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {conversionPercent !== null ? 'Taux vérifié' : 'À calculer'}
            </p>
          </div>
        </button>

        {/* Card 4: Revenus */}
        <button
          type="button"
          onClick={() => onNavigate('Paiements')}
          className="text-left bg-[#0b0b10] hover:bg-zinc-900/70 active:scale-[0.98] border border-zinc-900 rounded-2xl p-4 min-h-[112px] flex flex-col justify-between transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold text-zinc-300">Revenus</span>
            <Wallet size={15} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-black font-mono tabular-nums text-white leading-tight truncate">
              {revenueDisplay}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1 truncate">
              {realRevenueFCFA > 0 && !isDemoMode
                ? 'Paystack vérifiés'
                : 'Données réelles requises'}
            </p>
          </div>
        </button>
      </section>

      {/* 4. FIKO AUTOPILOT™ CONTROL CARD */}
      <section className="bg-[#0b0b10] border border-zinc-900 rounded-2xl p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E10600]/15 border border-[#E10600]/30 text-[#E10600] flex items-center justify-center shrink-0">
              <Bot size={19} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-white">Fiko Autopilot™</h2>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span
                  className={`text-xs font-bold ${
                    autoPilot ? 'text-emerald-400' : 'text-zinc-400'
                  }`}
                >
                  {autoPilot ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Contrôlez votre agent commercial et ses automatisations.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleAutoPilot}
            disabled={isDemoMode}
            aria-label={autoPilot ? 'Désactiver Autopilot' : 'Activer Autopilot'}
            className={`w-11 h-6 rounded-full relative transition shrink-0 mt-1 ${
              autoPilot ? 'bg-emerald-600' : 'bg-zinc-800'
            } ${isDemoMode ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                autoPilot ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('Automation')}
          className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#E10600] hover:bg-red-700 active:scale-[0.98] text-white text-xs font-black tracking-wide transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Configurer Autopilot</span>
          <ChevronRight size={15} />
        </button>
      </section>

      {/* 5. QUICK TACTILE ROW TO FIKO IA KNOWLEDGE CENTER */}
      <button
        type="button"
        onClick={() => onNavigate('Knowledge Center')}
        className="w-full bg-[#0b0b10] hover:bg-zinc-900/60 active:scale-[0.99] border border-zinc-900 rounded-2xl px-4 py-3.5 min-h-[56px] flex items-center justify-between gap-3 text-left transition cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 text-[#E10600] flex items-center justify-center shrink-0">
            <Brain size={17} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-white truncate">Fiko IA — Knowledge Center</p>
            <p className="text-[11px] text-zinc-400 truncate">
              Deep Scan & formation métier en direct
            </p>
          </div>
        </div>
        <ChevronRight size={16} className="text-zinc-500 shrink-0" />
      </button>

      {/* 6. HONEST DISCLAIMER + OPTIONAL FULL DESKTOP TOOLS SWITCH */}
      <div className="pt-1 space-y-2.5 text-center">
        <p className="text-[11px] text-zinc-500 leading-relaxed px-2">
          {isDemoMode
            ? 'Maquette interactive mobile. Les chiffres illustratifs ne sont pas des données CRM en direct.'
            : 'Indicateurs synchronisés avec votre espace Fiko Connect.'}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {isDemoMode && (
            <button
              type="button"
              onClick={onUpgrade}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline min-h-[36px] px-2 cursor-pointer"
            >
              Déployer un espace réel OS
            </button>
          )}
          <button
            type="button"
            onClick={onExpandDesktopDashboard}
            className="text-[11px] font-semibold text-zinc-400 hover:text-white inline-flex items-center gap-1.5 min-h-[36px] px-2 cursor-pointer"
          >
            <Layers size={13} />
            Outils avancés (Closer, Rapports, Board)
          </button>
        </div>
      </div>
    </div>
  );
}
