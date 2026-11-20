import {
  LayoutDashboard,
  User,
  MessageSquareText,
  Brain,
  Menu,
  X,
  Bot,
  Megaphone,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  Zap,
} from 'lucide-react';
import CurrencySwitcher from './CurrencySwitcher';
import FikoConnectLogo from './FikoConnectLogo';

interface MobileTopBarProps {
  onGoHome: () => void;
}

export function MobileTopBar({ onGoHome }: MobileTopBarProps) {
  return (
    <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-[#07070a]/95 backdrop-blur-md border-b border-zinc-900 flex items-center justify-center">
      <button
        type="button"
        onClick={onGoHome}
        aria-label="Accueil Fiko Connect"
        className="min-h-[44px] px-3 flex items-center justify-center cursor-pointer"
      >
        <FikoConnectLogo variant="full" size="sm" surface="dark" />
      </button>
    </header>
  );
}

interface MobileBottomNavProps {
  activeItem: string;
  unreadCount: number;
  moreOpen: boolean;
  onSelectItem: (name: string) => void;
  onToggleMore: () => void;
}

export function MobileBottomNav({
  activeItem,
  unreadCount,
  moreOpen,
  onSelectItem,
  onToggleMore,
}: MobileBottomNavProps) {
  const isSecondaryActive =
    !['Dashboard', 'Fiko leads', 'Conversations', 'Knowledge Center'].includes(activeItem) ||
    moreOpen;

  const navTabs = [
    { id: 'Dashboard', label: 'Accueil', icon: LayoutDashboard },
    { id: 'Fiko leads', label: 'Leads', icon: User },
    { id: 'Conversations', label: 'Chats', icon: MessageSquareText, badge: unreadCount },
    { id: 'Knowledge Center', label: 'Fiko IA', icon: Brain },
  ];

  return (
    <nav
      aria-label="Navigation mobile principale"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#09090d]/95 backdrop-blur-md border-t border-zinc-900 grid grid-cols-5 items-center px-1"
    >
      {navTabs.map((tab) => {
        const active = !moreOpen && activeItem === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectItem(tab.id)}
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition cursor-pointer ${
              active ? 'text-[#E10600]' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="relative">
              <tab.icon size={20} className={active ? 'stroke-[2.4px]' : 'stroke-[1.9px]'} />
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-[#E10600] text-white text-[9px] font-black flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">
              {tab.label}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onToggleMore}
        className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition cursor-pointer ${
          isSecondaryActive ? 'text-[#E10600]' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Menu size={20} className={isSecondaryActive ? 'stroke-[2.4px]' : 'stroke-[1.9px]'} />
        <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">Plus</span>
      </button>
    </nav>
  );
}

interface MobileMoreSheetProps {
  open: boolean;
  activeItem: string;
  isDemoMode: boolean;
  onboardingData?: any;
  onClose: () => void;
  onSelectItem: (name: string) => void;
  onUpgrade: () => void;
  onLogout: () => void;
}

export function MobileMoreSheet({
  open,
  activeItem,
  isDemoMode,
  onboardingData,
  onClose,
  onSelectItem,
  onUpgrade,
  onLogout,
}: MobileMoreSheetProps) {
  if (!open) return null;

  const secondaryModules = [
    {
      name: 'Automation',
      label: 'Autopilot & Règles IA',
      sub: 'Activer et configurer vos automatisations',
      icon: Bot,
    },
    {
      name: 'Campagnes',
      label: 'Campagnes WhatsApp',
      sub: 'Diffusions ciblées & relances clients',
      icon: Megaphone,
    },
    {
      name: 'Paiements',
      label: 'Paiements Paystack',
      sub: 'Liens d’encaissement & Grand Livre FCFA',
      icon: CreditCard,
    },
    {
      name: 'Analytics',
      label: 'Analytics',
      sub: 'Performances & entonnoir vérifiables',
      icon: BarChart3,
    },
    {
      name: 'Settings',
      label: 'Paramètres',
      sub: 'Infrastructure & identifiant entreprise',
      icon: Settings,
    },
  ];

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="relative bg-[#0a0a0f] border-t border-zinc-800 rounded-t-3xl max-h-[84vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Centered drag handle */}
        <div className="pt-3 pb-2 px-5 flex items-center justify-between border-b border-zinc-900">
          <div className="w-8" />
          <div className="w-10 h-1.5 bg-zinc-700 rounded-full" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable secondary menu items */}
        <div className="p-4 overflow-y-auto space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 px-1 pb-1">
            Devise &amp; Affichage
          </p>

          <CurrencySwitcher embedded />

          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 px-1 pt-2 pb-1">
            Modules secondaires
          </p>

          {secondaryModules.map((mod) => {
            const isSelected = activeItem === mod.name;
            return (
              <button
                key={mod.name}
                type="button"
                onClick={() => {
                  onSelectItem(mod.name);
                  onClose();
                }}
                className={`w-full min-h-[56px] px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-[#E10600]/15 border-[#E10600] text-white'
                    : 'bg-black/60 border-zinc-900 hover:border-zinc-700 text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-[#E10600] text-white' : 'bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    <mod.icon size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white truncate">{mod.label}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{mod.sub}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-500 shrink-0" />
              </button>
            );
          })}

          {/* Workspace account & actions footer */}
          <div className="mt-4 pt-4 border-t border-zinc-900 space-y-3">
            <div className="px-3.5 py-3 rounded-2xl bg-black/70 border border-zinc-900 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-black text-white truncate">
                  {onboardingData?.companyName || 'Mon Entreprise'}
                </p>
                <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                  {onboardingData?.connectedNumber || '+225 05 92 84 77 15'} ·{' '}
                  <span className={isDemoMode ? 'text-amber-400' : 'text-emerald-400'}>
                    {isDemoMode ? 'Mode Démo' : `Plan ${onboardingData?.selectedPlan || 'free'}`}
                  </span>
                </p>
              </div>
              <FikoConnectLogo variant="full" size="xs" surface="dark" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pb-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onUpgrade();
                }}
                className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#E10600] hover:bg-red-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap size={14} />
                {isDemoMode ? 'Déployer OS' : 'Forfaits'}
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="min-h-[44px] px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut size={14} />
                Quitter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
