import { useEffect, useState, useCallback } from 'react';
import {
  Crown,
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  Receipt,
  Calendar,
  CreditCard,
  RefreshCw,
  Printer,
  Download,
  Clock,
  CheckCircle2,
  Info,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Lock,
  ExternalLink,
} from 'lucide-react';
import {
  PLAN_CATALOG,
  PLAN_CATALOG_BY_ID,
  CATALOG_VERSION,
  CATALOG_APPROVAL_STATUS,
  LEGACY_PLAN_AUDIT_DIFFS,
  PlanId,
  BillingCycle,
  SubscriptionSnapshot,
  UsageMetersSnapshot,
  CompanyEntitlements,
  BillingInsight,
  normalizePlanId,
  calculateBillingQuote,
  resolvePlanEntitlements,
  generateBillingInsights,
  addDaysUtc,
} from '../lib/subscriptionCatalog';
import {
  apiGetSubscriptionOverview,
  apiCreateSubscriptionQuote,
  apiCheckoutSubscriptionChange,
  apiCancelScheduledDowngrade,
  apiCancelSubscriptionAtPeriodEnd,
  apiReconcileSubscriptionPayment,
} from '../lib/api';
import { useCurrency } from '../lib/currency';

interface OffersModuleProps {
  onboardingData?: any;
  isDemoMode: boolean;
  onSubscriptionUpdated?: (newPlanId: PlanId) => void;
  onRequestDeployRealWorkspace?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  trialing: { label: 'Essai 7J actif', cls: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  active: { label: 'Actif', cls: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  pending_payment: { label: 'Paiement en attente', cls: 'bg-amber-950 text-amber-300 border-amber-800' },
  past_due: { label: 'Retard de paiement', cls: 'bg-red-950 text-red-300 border-red-800' },
  canceled: { label: 'Résilié', cls: 'bg-zinc-900 text-zinc-400 border-zinc-700' },
  expired: { label: 'Expiré', cls: 'bg-red-950 text-red-400 border-red-800' },
};

function formatDateFr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OffersModule({
  onboardingData,
  isDemoMode,
  onSubscriptionUpdated,
  onRequestDeployRealWorkspace,
}: OffersModuleProps) {
  const { formatMoney, formatFcfa, isBaseFcfa } = useCurrency();

  const [activeTab, setActiveTab] = useState<'overview' | 'catalog' | 'billing'>('overview');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(!isDemoMode);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showAuditDetails, setShowAuditDetails] = useState(false);

  // Server / Demo State
  const [paystackInfo, setPaystackInfo] = useState<{
    configured: boolean;
    mode: 'test' | 'live';
    currency: string;
    supportsMobileMoneyRecurring: boolean;
  }>({
    configured: false,
    mode: 'test',
    currency: 'XOF',
    supportsMobileMoneyRecurring: false,
  });
  const [subscription, setSubscription] = useState<SubscriptionSnapshot>(() => {
    const initialPlan = normalizePlanId(onboardingData?.selectedPlan);
    const now = new Date().toISOString();
    return {
      companyId: onboardingData?.companyId || 'sandbox_demo_reviewer_68',
      planId: initialPlan,
      billingCycle: 'monthly',
      status: initialPlan === 'essai' ? 'trialing' : 'active',
      trialUsed: initialPlan !== 'essai',
      trialEndsAt: addDaysUtc(now, 7),
      currentPeriodStart: now,
      currentPeriodEnd: addDaysUtc(now, initialPlan === 'essai' ? 7 : 30),
      availableCreditFCFA: 0,
      cancelAtPeriodEnd: false,
      scheduledChange: null,
      paymentMode: initialPlan === 'essai' ? 'none' : 'manual_renewal',
      catalogVersion: CATALOG_VERSION,
    };
  });
  const [usageMeters, setUsageMeters] = useState<UsageMetersSnapshot>({
    whatsappConnections: isDemoMode ? 1 : 0,
    monthlyConversations: isDemoMode ? 42 : 0,
    leadsCount: isDemoMode ? 4 : 0,
    aiAgents: 1,
    campaignsThisMonth: 0,
  });
  const [entitlements, setEntitlements] = useState<CompanyEntitlements | null>(null);
  const [insights, setInsights] = useState<BillingInsight[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [changeHistory, setChangeHistory] = useState<any[]>([]);

  // Quote & Confirmation Modal State
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<{
    quoteId: string;
    expiresAt: string;
    quote: any;
    isSimulatedPreview?: boolean;
  } | null>(null);
  const [selectedKeepResources, setSelectedKeepResources] = useState<string[]>([]);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [pendingPaystackCheckout, setPendingPaystackCheckout] = useState<{
    reference: string;
    authorizationUrl: string;
    amountDueFCFA: number;
    mode: 'test' | 'live';
  } | null>(null);
  const [reconcilingRef, setReconcilingRef] = useState<string | null>(null);
  const [receiptInvoice, setReceiptInvoice] = useState<any | null>(null);

  const loadOverview = useCallback(async () => {
    if (isDemoMode) {
      const demoUsage: UsageMetersSnapshot = {
        whatsappConnections: 1,
        monthlyConversations: 42,
        leadsCount: 4,
        aiAgents: 1,
        campaignsThisMonth: 0,
      };
      setUsageMeters(demoUsage);
      setEntitlements(
        resolvePlanEntitlements({
          companyId: subscription.companyId,
          planId: subscription.planId,
          status: subscription.status,
          usageMeters: demoUsage,
        })
      );
      setInsights(generateBillingInsights(subscription, demoUsage));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiGetSubscriptionOverview();
      setPaystackInfo(data.paystack);
      setSubscription(data.subscription);
      setBillingCycle(data.subscription.billingCycle || 'monthly');
      setUsageMeters(data.usageMeters);
      setEntitlements(data.entitlements);
      setInsights(data.insights || []);
      setInvoices(data.invoices || []);
      setLedger(data.ledger || []);
      setChangeHistory(data.changeHistory || []);
      if (onSubscriptionUpdated && data.subscription?.planId) {
        onSubscriptionUpdated(data.subscription.planId);
      }
    } catch (err: any) {
      setBannerMsg({
        type: 'error',
        text: err.message || "Erreur lors du chargement de vos offres et abonnements.",
      });
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Check callback return (?paystack_ref=...) once authenticated
  useEffect(() => {
    if (isDemoMode) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('paystack_ref');
    if (ref && ref.startsWith('FIKO_SUB_')) {
      setReconcilingRef(ref);
      apiReconcileSubscriptionPayment(ref)
        .then((res) => {
          if (res.settled) {
            setBannerMsg({
              type: 'success',
              text: `Paiement confirmé (${ref}) ! Votre nouvelle offre est immédiatement active.`,
            });
            loadOverview();
          } else {
            setBannerMsg({
              type: 'info',
              text: `Statut Paystack pour ${ref} : ${res.gatewayStatus || 'en attente'}.`,
            });
          }
        })
        .catch((err) => {
          setBannerMsg({ type: 'error', text: err.message });
        })
        .finally(() => {
          setReconcilingRef(null);
        });
    }
  }, [isDemoMode, loadOverview]);

  const handleOpenQuoteModal = async (targetPlanId: PlanId, targetCycle: BillingCycle = billingCycle) => {
    setBannerMsg(null);
    setPendingPaystackCheckout(null);
    setSelectedKeepResources([]);

    if (isDemoMode) {
      try {
        const simulated = calculateBillingQuote({
          subscription,
          targetPlanId,
          targetCycle,
          usageMeters,
        });
        setPendingQuote({
          quoteId: `PREVIEW_${Date.now()}`,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          quote: simulated,
          isSimulatedPreview: true,
        });
        setQuoteModalOpen(true);
      } catch (err: any) {
        setBannerMsg({ type: 'error', text: err.message });
      }
      return;
    }

    setQuoteLoading(true);
    setQuoteModalOpen(true);
    setPendingQuote(null);
    try {
      const res = await apiCreateSubscriptionQuote(targetPlanId, targetCycle);
      setPendingQuote({
        quoteId: res.quoteId,
        expiresAt: res.expiresAt,
        quote: res.quote,
        isSimulatedPreview: false,
      });
    } catch (err: any) {
      setQuoteModalOpen(false);
      setBannerMsg({ type: 'error', text: err.message || "Impossible d'établir le devis." });
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleConfirmCheckout = async () => {
    if (!pendingQuote) return;
    if (pendingQuote.isSimulatedPreview || isDemoMode) {
      setQuoteModalOpen(false);
      if (onRequestDeployRealWorkspace) onRequestDeployRealWorkspace();
      return;
    }

    setCheckoutSubmitting(true);
    setBannerMsg(null);
    try {
      const res = await apiCheckoutSubscriptionChange(pendingQuote.quoteId, selectedKeepResources);
      if (res.status === 'payment_required') {
        setPendingPaystackCheckout({
          reference: res.reference,
          authorizationUrl: res.authorizationUrl,
          amountDueFCFA: res.amountDueFCFA,
          mode: res.mode,
        });
        setBannerMsg({
          type: 'info',
          text: `Lien Paystack généré (${res.reference}). Finalisez le règlement sur la page sécurisée puis cliquez sur « Vérifier mon paiement ».`,
        });
        loadOverview();
      } else {
        setQuoteModalOpen(false);
        setBannerMsg({
          type: 'success',
          text: res.message || 'Changement d’offre enregistré avec succès.',
        });
        await loadOverview();
      }
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: err.message });
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  const handleReconcile = async (reference: string) => {
    if (isDemoMode) return;
    setReconcilingRef(reference);
    try {
      const res = await apiReconcileSubscriptionPayment(reference);
      if (res.settled) {
        setPendingPaystackCheckout(null);
        setQuoteModalOpen(false);
        setBannerMsg({
          type: 'success',
          text: `Paiement ${reference} vérifié ! Vos nouveaux droits sont actifs.`,
        });
        await loadOverview();
      } else {
        setBannerMsg({
          type: 'info',
          text: `Statut actuel sur Paystack : ${res.gatewayStatus || 'en attente'}.`,
        });
      }
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: err.message });
    } finally {
      setReconcilingRef(null);
    }
  };

  const handleCancelScheduledDowngrade = async () => {
    if (isDemoMode) return;
    try {
      const res = await apiCancelScheduledDowngrade();
      setBannerMsg({ type: 'success', text: res.message });
      await loadOverview();
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: err.message });
    }
  };

  const handleCancelAtPeriodEnd = async () => {
    if (isDemoMode) return;
    try {
      const res = await apiCancelSubscriptionAtPeriodEnd();
      setBannerMsg({ type: 'info', text: res.message });
      await loadOverview();
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: err.message });
    }
  };

  const handleDownloadReceiptHtml = (inv: any) => {
    const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Facture ${inv.invoiceNumber}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;padding:32px;max-width:720px;margin:auto;color:#111}
.top{display:flex;justify-content:space-between;border-bottom:2px solid #E10600;padding-bottom:16px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #ddd;padding:10px;text-align:left}
.total{font-size:18px;font-weight:800;text-align:right;margin-top:16px}</style></head>
<body>
  <div class="top">
    <div><h1 style="margin:0">FIKO CONNECT™</h1><p style="margin:4px 0;color:#555">${inv.legalEntity?.issuer || 'Fiko Connect / Koffmann Capital Group'}</p>
    <small>Identifiant fiscal : ${inv.legalEntity?.taxId || 'À configurer'}</small></div>
    <div style="text-align:right"><strong>FACTURE ${inv.invoiceNumber}</strong><br/><small>Émise le ${formatDateFr(inv.issuedAt)}</small><br/><small>Mode : ${(inv.mode || 'test').toUpperCase()}</small></div>
  </div>
  <p><strong>Entreprise :</strong> ${onboardingData?.companyName || inv.companyId}</p>
  <p><strong>Référence Paystack :</strong> ${inv.transactionReference}</p>
  <table>
    <thead><tr><th>Désignation</th><th>Cycle</th><th>Sous-total</th><th>Crédits appliqués</th><th>Total payé</th></tr></thead>
    <tbody><tr>
      <td>${inv.description}</td>
      <td>${inv.billingCycle === 'annual' ? 'Annuel (-20%)' : 'Mensuel'}</td>
      <td>${Number(inv.subtotalFCFA || 0).toLocaleString('fr-FR')} FCFA</td>
      <td>-${Number((inv.unusedCreditAppliedFCFA || 0) + (inv.availableCreditAppliedFCFA || 0)).toLocaleString('fr-FR')} FCFA</td>
      <td><strong>${Number(inv.totalPaidFCFA || 0).toLocaleString('fr-FR')} FCFA</strong></td>
    </tr></tbody>
  </table>
  <p class="total">Net réglé : ${Number(inv.totalPaidFCFA || 0).toLocaleString('fr-FR')} FCFA (${inv.status})</p>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inv.invoiceNumber || 'facture-fiko'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentPlan = PLAN_CATALOG_BY_ID[normalizePlanId(subscription.planId)];
  const currentStatusBadge = STATUS_LABELS[subscription.status] || STATUS_LABELS.active;
  const currentCyclePrice =
    subscription.billingCycle === 'annual' ? currentPlan.annualTotalFCFA : currentPlan.monthlyPriceFCFA;

  const quotaItems = [
    {
      label: 'Connexions WhatsApp',
      used: usageMeters.whatsappConnections,
      limit: entitlements?.maxWhatsappConnections ?? currentPlan.quotas.maxWhatsappConnections,
    },
    {
      label: 'Conversations / mois',
      used: usageMeters.monthlyConversations,
      limit: entitlements?.maxMonthlyConversations ?? currentPlan.quotas.maxMonthlyConversations,
    },
    {
      label: 'Leads CRM',
      used: usageMeters.leadsCount,
      limit: entitlements?.maxLeads ?? currentPlan.quotas.maxLeads,
    },
    {
      label: 'Agents IA actifs',
      used: usageMeters.aiAgents,
      limit: entitlements?.maxAiAgents ?? currentPlan.quotas.maxAiAgents,
    },
    {
      label: 'Campagnes ce mois',
      used: usageMeters.campaignsThisMonth,
      limit: entitlements?.maxCampaignsPerMonth ?? currentPlan.quotas.maxCampaignsPerMonth,
    },
  ];

  return (
    <div className="space-y-6 pb-14 animate-in fade-in duration-500">
      {/* TOP STATUS & GOVERNANCE STRIP */}
      <div className="bg-[#0a0a0f] border border-zinc-800/90 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-white">
              <Crown size={15} className="text-[#E10600]" />
              Nos Offres &amp; Facturation Intelligente
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              Catalogue {CATALOG_VERSION}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                isDemoMode
                  ? 'bg-amber-950/50 border-amber-800 text-amber-300'
                  : paystackInfo.mode === 'live' && paystackInfo.configured
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                  : 'bg-amber-950/50 border-amber-800 text-amber-300'
              }`}
            >
              {isDemoMode
                ? 'Mode Bac à sable'
                : paystackInfo.configured
                ? `Paystack ${paystackInfo.mode.toUpperCase()} (XOF)`
                : 'Paystack à configurer'}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Calculs de prorata, crédits et droits calculés exclusivement côté serveur · Base comptable FCFA (XOF).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAuditDetails((p) => !p)}
          className="text-xs font-semibold text-zinc-300 hover:text-white bg-black border border-zinc-800 px-3 py-2 rounded-xl flex items-center gap-2 self-start lg:self-auto cursor-pointer"
        >
          <ShieldCheck size={14} className="text-amber-400" />
          <span>
            {CATALOG_APPROVAL_STATUS === 'pending_presidential_approval'
              ? 'Audit Catalogue : validation tarifaire requise'
              : 'Catalogue certifié'}
          </span>
          {showAuditDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* EXPANDABLE CATALOG AUDIT DISCLOSURE */}
      {showAuditDetails && (
        <div className="bg-amber-950/15 border border-amber-900/50 rounded-2xl p-4 space-y-3 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-200">
                Gouvernance tarifaire — Écarts historiques détectés lors de l’audit Phase 0
              </p>
              <p className="text-amber-300/80 leading-relaxed">
                L’ancien assistant d’onboarding contenait des libellés et montants légèrement différents (ex. Starter 19 900 vs 19 000 FCFA ; Business → Growth 49 900 vs 49 000 FCFA ; Scale → Pro). Les alias historiques restent automatiquement mappés sans couper vos contrats existants ; la validation présidentielle du catalogue {CATALOG_VERSION} est requise avant facturation Live.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            {LEGACY_PLAN_AUDIT_DIFFS.map((diff) => (
              <div key={diff.legacyId} className="bg-black/60 border border-zinc-800 rounded-xl p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    {diff.legacyName} → {diff.targetName}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      diff.status === 'aligned' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-300'
                    }`}
                  >
                    {diff.status === 'aligned' ? 'Aligné' : 'Écart audit'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-zinc-400">
                  Ancien : {diff.legacyMonthlyPriceFCFA.toLocaleString('fr-FR')} FCFA · Cible :{' '}
                  {diff.targetMonthlyPriceFCFA.toLocaleString('fr-FR')} FCFA
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FEEDBACK BANNER */}
      {bannerMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            bannerMsg.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : bannerMsg.type === 'info'
              ? 'bg-sky-950/40 border-sky-800 text-sky-300'
              : 'bg-red-950/40 border-red-800 text-red-300'
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-zinc-400 hover:text-white px-2 py-0.5 font-bold cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* MODULE TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-900 pb-3">
        {[
          { id: 'overview', label: 'Mon abonnement', icon: ShieldCheck },
          { id: 'catalog', label: 'Offres & Comparateur', icon: Crown },
          { id: 'billing', label: 'Facturation & Historique', icon: Receipt },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                active
                  ? 'bg-[#E10600] text-white'
                  : 'bg-[#0a0a0f] border border-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              <tab.icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="bg-[#0a0a0f] border border-zinc-900 rounded-2xl p-10 text-center text-xs font-mono text-zinc-400 flex items-center justify-center gap-2">
          <RefreshCw size={15} className="animate-spin text-[#E10600]" />
          <span>Synchronisation de votre abonnement, quotas et grand livre...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: MON ABONNEMENT */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* CURRENT SUBSCRIPTION SUMMARY */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-[#0a0a0f] border border-zinc-850 rounded-2xl p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-zinc-900">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                          Offre actuelle
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${currentStatusBadge.cls}`}
                        >
                          {currentStatusBadge.label}
                        </span>
                        {subscription.cancelAtPeriodEnd && (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border bg-amber-950 text-amber-300 border-amber-800">
                            Résiliation programmée
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        {currentPlan.name}
                      </h2>
                      <p className="text-xs text-zinc-400">{currentPlan.tagline}</p>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-white">
                        {formatMoney(currentCyclePrice)}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                        {currentPlan.isFreeTrial
                          ? 'Essai 7 jours'
                          : subscription.billingCycle === 'annual'
                          ? 'Facturation annuelle (-20%)'
                          : 'Facturation mensuelle'}
                        {!isBaseFcfa && currentCyclePrice > 0 ? ` · ${formatFcfa(currentCyclePrice)}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* KEY BILLING METADATA */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-black/60 border border-zinc-900 rounded-xl p-3">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Début cycle</span>
                      <strong className="text-white font-mono mt-1 block">
                        {formatDateFr(subscription.currentPeriodStart)}
                      </strong>
                    </div>
                    <div className="bg-black/60 border border-zinc-900 rounded-xl p-3">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">
                        {currentPlan.isFreeTrial ? 'Fin essai' : 'Échéance'}
                      </span>
                      <strong className="text-white font-mono mt-1 block">
                        {formatDateFr(
                          currentPlan.isFreeTrial ? subscription.trialEndsAt : subscription.currentPeriodEnd
                        )}
                      </strong>
                    </div>
                    <div className="bg-black/60 border border-zinc-900 rounded-xl p-3">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">
                        Prochain montant
                      </span>
                      <strong className="text-white font-mono tabular-nums mt-1 block">
                        {subscription.cancelAtPeriodEnd
                          ? formatMoney(0)
                          : formatMoney(
                              subscription.scheduledChange
                                ? PLAN_CATALOG_BY_ID[subscription.scheduledChange.targetPlanId].monthlyPriceFCFA
                                : currentCyclePrice
                            )}
                      </strong>
                    </div>
                    <div className="bg-black/60 border border-zinc-900 rounded-xl p-3">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Crédit compte</span>
                      <strong className="text-emerald-400 font-mono tabular-nums mt-1 block">
                        {formatMoney(subscription.availableCreditFCFA || 0)}
                      </strong>
                    </div>
                  </div>

                  {/* PAYMENT MODE CLARITY */}
                  <div className="bg-black/50 border border-zinc-900 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <CreditCard size={15} className="text-zinc-400 shrink-0" />
                      <span>
                        Mode de paiement :{' '}
                        <strong className="text-white">
                          {subscription.paymentMode === 'none'
                            ? 'Aucun moyen enregistré (Essai sans carte)'
                            : 'Renouvellement manuel Paystack (Wave / Orange / MTN / Carte)'}
                        </strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500">Aucun débit automatique caché</span>
                  </div>

                  {/* SCHEDULED DOWNGRADE BANNER */}
                  {subscription.scheduledChange && (
                    <div className="bg-amber-950/20 border border-amber-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-bold text-amber-200">
                          Changement programmé : {currentPlan.name} →{' '}
                          {PLAN_CATALOG_BY_ID[subscription.scheduledChange.targetPlanId].name} (
                          {subscription.scheduledChange.targetCycle === 'annual' ? 'Annuel' : 'Mensuel'})
                        </p>
                        <p className="text-amber-300/80">
                          Effectif le {formatDateFr(subscription.scheduledChange.effectiveAt)}. Vos droits{' '}
                          {currentPlan.name} restent complets jusqu’à cette date.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelScheduledDowngrade}
                        className="px-3.5 py-2 rounded-lg bg-black border border-amber-700 text-amber-200 hover:bg-amber-950 font-bold shrink-0 cursor-pointer"
                      >
                        Annuler ce changement
                      </button>
                    </div>
                  )}

                  {/* PRIMARY CTAS */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#E10600] hover:bg-red-700 text-white text-xs font-black flex items-center gap-2 transition cursor-pointer"
                    >
                      <span>Changer d’offre</span>
                      <ArrowRight size={15} />
                    </button>

                    {!currentPlan.isFreeTrial && subscription.billingCycle === 'monthly' && (
                      <button
                        type="button"
                        onClick={() => handleOpenQuoteModal(currentPlan.id, 'annual')}
                        className="min-h-[42px] px-4 py-2.5 rounded-xl bg-emerald-950/50 hover:bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-bold cursor-pointer"
                      >
                        Passer à l’annuel (-20%)
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveTab('billing')}
                      className="min-h-[42px] px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-bold cursor-pointer"
                    >
                      Voir mes factures ({invoices.length})
                    </button>

                    {!isDemoMode &&
                      !currentPlan.isFreeTrial &&
                      subscription.status === 'active' &&
                      !subscription.cancelAtPeriodEnd && (
                        <button
                          type="button"
                          onClick={handleCancelAtPeriodEnd}
                          className="text-xs text-zinc-500 hover:text-red-400 font-semibold ml-auto cursor-pointer"
                        >
                          Résilier à l’échéance
                        </button>
                      )}
                  </div>
                </div>

                {/* SMART BILLING ASSISTANT™ */}
                <div className="bg-[#0a0a0f] border border-zinc-850 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-900">
                      <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <Sparkles size={15} className="text-[#E10600]" />
                        Smart Billing Assistant™
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">Temps réel</span>
                    </div>

                    {insights.length === 0 ? (
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Votre forfait {currentPlan.name} est dimensionné de manière équilibrée par rapport à votre activité actuelle.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {insights.map((ins) => (
                          <div
                            key={ins.id}
                            className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                              ins.severity === 'warning'
                                ? 'bg-amber-950/20 border-amber-900/60'
                                : ins.severity === 'opportunity'
                                ? 'bg-emerald-950/15 border-emerald-900/50'
                                : 'bg-black/60 border-zinc-900'
                            }`}
                          >
                            <p className="font-bold text-white">{ins.title}</p>
                            <p className="text-zinc-400 leading-relaxed text-[11px]">{ins.message}</p>
                            {ins.recommendedPlanId && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenQuoteModal(
                                    ins.recommendedPlanId!,
                                    ins.id === 'annual_discount_opportunity' ? 'annual' : billingCycle
                                  )
                                }
                                className="text-[11px] font-bold text-[#E10600] hover:underline flex items-center gap-1 pt-0.5 cursor-pointer"
                              >
                                <span>
                                  Simuler {PLAN_CATALOG_BY_ID[ins.recommendedPlanId].name}
                                  {ins.id === 'annual_discount_opportunity' ? ' (Annuel)' : ''}
                                </span>
                                <ArrowRight size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-900">
                    Recommandations strictement informatives. Aucun changement ou paiement n’est déclenché sans votre confirmation.
                  </p>
                </div>
              </div>

              {/* REAL QUOTA USAGE METERS */}
              <div className="bg-[#0a0a0f] border border-zinc-850 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      Quotas &amp; Consommation réelle
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Compteurs synchronisés avec vos leads, conversations WhatsApp, agents et campagnes.
                    </p>
                  </div>
                  {isDemoMode && (
                    <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-amber-950/50 border border-amber-800 text-amber-300 self-start">
                      Valeurs de démonstration
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {quotaItems.map((q) => {
                    const pct = Math.min(100, Math.round((q.used / Math.max(1, q.limit)) * 100));
                    const isHigh = pct >= 80;
                    return (
                      <div key={q.label} className="bg-black/60 border border-zinc-900 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-zinc-400 font-semibold truncate">{q.label}</span>
                          <span
                            className={`text-[10px] font-mono font-bold ${
                              isHigh ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {pct}%
                          </span>
                        </div>
                        <p className="text-base font-black font-mono tabular-nums text-white">
                          {q.used.toLocaleString('fr-FR')}{' '}
                          <span className="text-zinc-500 text-xs font-normal">
                            / {q.limit.toLocaleString('fr-FR')}
                          </span>
                        </p>
                        <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct >= 95 ? 'bg-[#E10600]' : isHigh ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CATALOGUE DES 5 OFFRES & COMPARATEUR */}
          {activeTab === 'catalog' && (
            <div className="space-y-8">
              {/* BILLING CYCLE TOGGLE */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-white">Choisissez votre niveau de croissance</h2>
                  <p className="text-xs text-zinc-400">
                    Passage immédiat sur les offres supérieures avec déduction prorata automatique.
                  </p>
                </div>

                <div className="inline-flex items-center bg-[#0a0a0f] border border-zinc-800 rounded-xl p-1 self-start">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                      billingCycle === 'monthly' ? 'bg-[#E10600] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Mensuel
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      billingCycle === 'annual' ? 'bg-[#E10600] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span>Annuel</span>
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                      -20%
                    </span>
                  </button>
                </div>
              </div>

              {/* 5 PLAN CARDS (Horizontal swipe carousel on mobile, 5-column grid on xl) */}
              <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 xl:grid xl:grid-cols-5 xl:overflow-visible">
                {PLAN_CATALOG.map((plan) => {
                  const isCurrentPlan = plan.id === currentPlan.id;
                  const isExactCurrent =
                    isCurrentPlan &&
                    (plan.isFreeTrial || subscription.billingCycle === billingCycle) &&
                    subscription.status !== 'expired' &&
                    subscription.status !== 'canceled';

                  const displayPrice = plan.isFreeTrial
                    ? 0
                    : billingCycle === 'annual'
                    ? plan.annualMonthlyEquivalentFCFA
                    : plan.monthlyPriceFCFA;

                  let ctaLabel = 'Passer à cette offre';
                  let isDisabled = false;
                  let isDowngradeAction = false;

                  if (isExactCurrent) {
                    ctaLabel = 'Offre actuelle';
                    isDisabled = true;
                  } else if (plan.isFreeTrial) {
                    if (subscription.trialUsed && currentPlan.id === 'essai') {
                      ctaLabel = 'Essai terminé';
                      isDisabled = true;
                    } else if (currentPlan.rank > 0 && subscription.status === 'active') {
                      ctaLabel = 'Réduire mon forfait';
                      isDowngradeAction = true;
                    } else {
                      ctaLabel = 'Essayer gratuitement';
                    }
                  } else if (plan.rank < currentPlan.rank && subscription.status === 'active') {
                    ctaLabel = 'Réduire mon forfait';
                    isDowngradeAction = true;
                  } else if (
                    isCurrentPlan &&
                    subscription.billingCycle === 'annual' &&
                    billingCycle === 'monthly' &&
                    subscription.status === 'active'
                  ) {
                    ctaLabel = 'Passer en mensuel (échéance)';
                    isDowngradeAction = true;
                  } else if (
                    isCurrentPlan &&
                    subscription.billingCycle === 'monthly' &&
                    billingCycle === 'annual'
                  ) {
                    ctaLabel = 'Passer à l’annuel (-20%)';
                  }

                  return (
                    <div
                      key={plan.id}
                      className={`min-w-[265px] snap-center xl:min-w-0 rounded-2xl border p-5 flex flex-col justify-between transition ${
                        isCurrentPlan
                          ? 'bg-[#120b0d] border-[#E10600]'
                          : plan.id === 'growth'
                          ? 'bg-[#0a0d16] border-blue-800/70'
                          : 'bg-[#0a0a0f] border-zinc-850 hover:border-zinc-700'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2 min-h-[22px]">
                          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
                            {plan.name}
                          </span>
                          {isCurrentPlan ? (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#E10600]/20 text-[#ff6b66] border border-[#E10600]/40">
                              Actuelle
                            </span>
                          ) : plan.badge ? (
                            <span
                              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border"
                              style={{
                                borderColor: `${plan.accentHex}55`,
                                color: plan.accentHex,
                                backgroundColor: `${plan.accentHex}15`,
                              }}
                            >
                              {plan.badge}
                            </span>
                          ) : null}
                        </div>

                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black font-mono tabular-nums text-white">
                              {formatMoney(displayPrice)}
                            </span>
                            {!plan.isFreeTrial && (
                              <span className="text-[11px] text-zinc-500">/mois</span>
                            )}
                          </div>
                          {!plan.isFreeTrial && billingCycle === 'annual' && (
                            <p className="text-[11px] font-mono text-emerald-400 mt-0.5">
                              Facturé {formatMoney(plan.annualTotalFCFA)} / an
                            </p>
                          )}
                          {plan.isFreeTrial && (
                            <p className="text-[11px] font-mono text-emerald-400 mt-0.5">
                              Durée : 7 jours
                            </p>
                          )}
                          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{plan.tagline}</p>
                        </div>

                        <div className="space-y-2 pt-3 border-t border-zinc-900">
                          {plan.highlights.map((h) => (
                            <div key={h} className="flex items-start gap-2 text-xs text-zinc-300">
                              <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                              <span>{h}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isDisabled || quoteLoading}
                        onClick={() => handleOpenQuoteModal(plan.id, billingCycle)}
                        className={`mt-5 w-full min-h-[42px] px-4 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                          isDisabled
                            ? 'bg-zinc-900 text-zinc-500 cursor-not-allowed'
                            : isDowngradeAction
                            ? 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 cursor-pointer'
                            : 'bg-[#E10600] hover:bg-red-700 text-white cursor-pointer'
                        }`}
                      >
                        <span>{ctaLabel}</span>
                        {!isDisabled && <ArrowRight size={14} />}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* DETAILED COMPARISON MATRIX */}
              <div className="bg-[#0a0a0f] border border-zinc-850 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-zinc-900">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Comparateur détaillé des quotas et fonctionnalités
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Données extraites directement du catalogue serveur {CATALOG_VERSION}.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black text-zinc-400 text-[10px] font-black uppercase">
                      <tr>
                        <th className="p-3.5 min-w-[180px]">Capacité / Module</th>
                        {PLAN_CATALOG.map((p) => (
                          <th key={p.id} className="p-3.5 text-center min-w-[120px]">
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Connexions WhatsApp</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center font-mono font-bold text-white">
                            {p.quotas.maxWhatsappConnections}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Conversations / mois</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center font-mono text-white">
                            {p.quotas.maxMonthlyConversations.toLocaleString('fr-FR')}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Leads CRM</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center font-mono text-white">
                            {p.quotas.maxLeads.toLocaleString('fr-FR')}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Agents IA</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center font-mono text-white">
                            {p.quotas.maxAiAgents}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Campagnes / mois</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center font-mono text-white">
                            {p.quotas.maxCampaignsPerMonth}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Relances auto J+1 / J+2</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center">
                            {p.features.autoFollowUp ? (
                              <Check size={15} className="text-emerald-400 mx-auto" />
                            ) : (
                              <X size={15} className="text-zinc-600 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Intégrations &amp; API</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center text-[11px] text-zinc-300">
                            {p.features.integrationsLabel}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3.5 font-semibold text-zinc-300">Support</td>
                        {PLAN_CATALOG.map((p) => (
                          <td key={p.id} className="p-3.5 text-center text-[11px] text-zinc-300">
                            {p.features.supportLabel}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FACTURATION & HISTORIQUE */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              {/* INVOICES TABLE */}
              <div className="bg-[#0a0a0f] border border-zinc-850 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      Factures &amp; Reçus vérifiés
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Émises uniquement après confirmation serveur (Paystack ou crédit appliqué).
                    </p>
                  </div>
                </div>

                {invoices.length === 0 ? (
                  <div className="p-10 text-center text-xs text-zinc-500">
                    Aucune facture d’abonnement émise pour le moment.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-black text-zinc-400 text-[10px] font-black uppercase">
                        <tr>
                          <th className="p-3.5">Facture / Date</th>
                          <th className="p-3.5">Offre</th>
                          <th className="p-3.5">Net réglé</th>
                          <th className="p-3.5">Canal / Mode</th>
                          <th className="p-3.5">Statut</th>
                          <th className="p-3.5 text-right">Reçu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-zinc-950/60">
                            <td className="p-3.5">
                              <p className="font-mono font-bold text-white">{inv.invoiceNumber}</p>
                              <p className="text-[11px] text-zinc-500">{formatDateFr(inv.issuedAt)}</p>
                            </td>
                            <td className="p-3.5">
                              <p className="font-bold text-white">{inv.planName}</p>
                              <p className="text-[11px] text-zinc-400 font-mono">{inv.transactionReference}</p>
                            </td>
                            <td className="p-3.5 font-mono font-black text-white tabular-nums">
                              {formatMoney(Number(inv.totalPaidFCFA || 0))}
                            </td>
                            <td className="p-3.5 text-zinc-300">
                              {inv.paymentChannel} ·{' '}
                              <span className="uppercase font-mono text-[10px] text-zinc-400">
                                {inv.mode || 'test'}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 text-[10px] font-mono font-bold">
                                {inv.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => setReceiptInvoice(inv)}
                                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Printer size={12} />
                                <span>Voir / Imprimer</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* CHANGE HISTORY + LEDGER */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#0a0a0f] border border-zinc-850 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Historique des changements d’offre
                  </h3>
                  {changeHistory.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-4">Aucun changement d’offre enregistré.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {changeHistory.map((ch) => (
                        <div
                          key={ch.id}
                          className="bg-black/60 border border-zinc-900 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">
                              {PLAN_CATALOG_BY_ID[normalizePlanId(ch.fromPlanId)]?.name} →{' '}
                              {PLAN_CATALOG_BY_ID[normalizePlanId(ch.toPlanId)]?.name} ({ch.toCycle})
                            </p>
                            <p className="text-[11px] text-zinc-400 font-mono">
                              {formatDateFr(ch.createdAt)} · {formatMoney(Number(ch.amountDueFCFA || 0))}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                ch.status === 'COMPLETED'
                                  ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                                  : ch.status === 'PENDING_PAYMENT'
                                  ? 'bg-amber-950 border-amber-800 text-amber-300'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              {ch.status}
                            </span>
                            {ch.status === 'PENDING_PAYMENT' && ch.transactionReference && (
                              <button
                                type="button"
                                disabled={reconcilingRef === ch.transactionReference}
                                onClick={() => handleReconcile(ch.transactionReference)}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold cursor-pointer"
                              >
                                {reconcilingRef === ch.transactionReference ? '...' : 'Vérifier'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#0a0a0f] border border-zinc-850 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Grand Livre Abonnement (Crédits &amp; Débits)
                  </h3>
                  {ledger.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-4">Aucune écriture comptable enregistrée.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {ledger.map((entry) => (
                        <div
                          key={entry.id}
                          className="bg-black/60 border border-zinc-900 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{entry.description}</p>
                            <p className="text-[11px] text-zinc-500 font-mono">
                              {entry.entryType} · {formatDateFr(entry.createdAt)}
                            </p>
                          </div>
                          <span
                            className={`font-mono font-black tabular-nums shrink-0 ${
                              Number(entry.amountFCFA) < 0 ? 'text-emerald-400' : 'text-white'
                            }`}
                          >
                            {Number(entry.amountFCFA) < 0 ? '-' : '+'}
                            {formatMoney(Math.abs(Number(entry.amountFCFA || 0)))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: CONFIRMER MON CHANGEMENT D'OFFRE */}
      {quoteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#0a0a0f] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Confirmer mon changement d’offre
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Devis calculé côté serveur · Validité 15 minutes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuoteModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {quoteLoading || !pendingQuote ? (
                <div className="py-10 text-center text-zinc-400 font-mono flex items-center justify-center gap-2">
                  <RefreshCw size={16} className="animate-spin text-[#E10600]" />
                  <span>Calcul du prorata UTC et vérification des droits...</span>
                </div>
              ) : (
                <>
                  {pendingQuote.isSimulatedPreview && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800 text-amber-200 flex items-start gap-2">
                      <Lock size={15} className="shrink-0 mt-0.5" />
                      <span>
                        Aperçu Mode Bac à sable. Connectez ou créez votre espace entreprise réel pour payer via Paystack.
                      </span>
                    </div>
                  )}

                  {/* TRANSITION HEADER */}
                  <div className="bg-black/60 border border-zinc-900 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                        Transition
                      </span>
                      <p className="text-base font-black text-white mt-0.5">
                        {PLAN_CATALOG_BY_ID[normalizePlanId(pendingQuote.quote.fromPlanId)].name} →{' '}
                        {PLAN_CATALOG_BY_ID[normalizePlanId(pendingQuote.quote.toPlanId)].name}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono font-bold text-zinc-200">
                      {pendingQuote.quote.toCycle === 'annual' ? 'Annuel (-20%)' : 'Mensuel'}
                    </span>
                  </div>

                  {/* FINANCIAL BREAKDOWN */}
                  <div className="bg-black/60 border border-zinc-900 rounded-xl p-4 space-y-2.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-sans">Tarif cycle cible</span>
                      <span className="text-white">
                        {formatMoney(pendingQuote.quote.targetCyclePriceFCFA)}
                      </span>
                    </div>
                    {pendingQuote.quote.unusedCreditFCFA > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span className="font-sans">Crédit prorata période restante</span>
                        <span>-{formatMoney(pendingQuote.quote.unusedCreditFCFA)}</span>
                      </div>
                    )}
                    {pendingQuote.quote.availableCreditAppliedFCFA > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span className="font-sans">Crédit compte disponible appliqué</span>
                        <span>-{formatMoney(pendingQuote.quote.availableCreditAppliedFCFA)}</span>
                      </div>
                    )}
                    <div className="pt-2.5 border-t border-zinc-800 flex justify-between items-baseline">
                      <span className="font-sans font-black text-white text-sm">Net à payer maintenant</span>
                      <span className="text-xl font-black text-white tabular-nums">
                        {formatMoney(pendingQuote.quote.amountDueFCFA)}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-sans flex justify-between pt-1">
                      <span>Date d’effet : {formatDateFr(pendingQuote.quote.effectiveAt)}</span>
                      <span>
                        Prochaine échéance : {formatDateFr(pendingQuote.quote.nextRenewalDate)} (
                        {formatMoney(pendingQuote.quote.nextRenewalAmountFCFA)})
                      </span>
                    </div>
                  </div>

                  {/* FEATURE DELTA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pendingQuote.quote.gainedFeatures?.length > 0 && (
                      <div className="bg-emerald-950/15 border border-emerald-900/50 rounded-xl p-3 space-y-1.5">
                        <p className="text-[10px] font-black uppercase text-emerald-400">
                          Gagné / Débloqué
                        </p>
                        {pendingQuote.quote.gainedFeatures.map((g: string) => (
                          <div key={g} className="flex items-start gap-1.5 text-[11px] text-zinc-200">
                            <Check size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                            <span>{g}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {pendingQuote.quote.lostFeatures?.length > 0 && (
                      <div className="bg-amber-950/15 border border-amber-900/50 rounded-xl p-3 space-y-1.5">
                        <p className="text-[10px] font-black uppercase text-amber-400">
                          Réduit à l’échéance
                        </p>
                        {pendingQuote.quote.lostFeatures.map((l: string) => (
                          <div key={l} className="flex items-start gap-1.5 text-[11px] text-zinc-300">
                            <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
                            <span>{l}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* DOWNGRADE OVERAGE PRESERVATION WARNING */}
                  {pendingQuote.quote.resourceOverages?.length > 0 && (
                    <div className="bg-amber-950/25 border border-amber-800 rounded-xl p-3.5 space-y-2">
                      <p className="font-bold text-amber-200 flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        Ressources dépassant les quotas du nouveau palier
                      </p>
                      <p className="text-[11px] text-amber-300/80">
                        Aucune donnée ne sera supprimée. À l’échéance, les ressources excédentaires seront mises en veille jusqu’à sélection ou retour à une offre supérieure :
                      </p>
                      <div className="space-y-1.5">
                        {pendingQuote.quote.resourceOverages.map((ov: any) => {
                          const checked = selectedKeepResources.includes(ov.resourceKey);
                          return (
                            <label
                              key={ov.resourceKey}
                              className="flex items-start gap-2 bg-black/50 p-2 rounded-lg border border-amber-900/40 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setSelectedKeepResources((prev) =>
                                    e.target.checked
                                      ? [...prev, ov.resourceKey]
                                      : prev.filter((k) => k !== ov.resourceKey)
                                  )
                                }
                                className="mt-0.5"
                              />
                              <div className="text-[11px]">
                                <strong className="text-white">
                                  {ov.label} : {ov.currentCount} / {ov.targetLimit} (+{ov.excessCount} en veille)
                                </strong>
                                <p className="text-zinc-400">{ov.preservationRule}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* PAYSTACK REDIRECT PANEL WHEN CHECKOUT INITIALIZED */}
                  {pendingPaystackCheckout && (
                    <div className="bg-emerald-950/25 border border-emerald-700 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300">
                          Session Paystack prête ({pendingPaystackCheckout.mode.toUpperCase()})
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          {pendingPaystackCheckout.reference}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <a
                          href={pendingPaystackCheckout.authorizationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center justify-center gap-2"
                        >
                          <span>Payer {formatMoney(pendingPaystackCheckout.amountDueFCFA)} sur Paystack</span>
                          <ExternalLink size={14} />
                        </a>
                        <button
                          type="button"
                          disabled={reconcilingRef === pendingPaystackCheckout.reference}
                          onClick={() => handleReconcile(pendingPaystackCheckout.reference)}
                          className="min-h-[42px] px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-bold cursor-pointer"
                        >
                          {reconcilingRef === pendingPaystackCheckout.reference
                            ? 'Vérification...'
                            : 'J’ai payé — Vérifier'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {pendingQuote && !pendingPaystackCheckout && (
              <div className="p-5 border-t border-zinc-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-[11px] text-zinc-500">
                  Mobile Money XOF en renouvellement manuel · Facture générée après confirmation
                </span>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setQuoteModalOpen(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white font-bold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={checkoutSubmitting}
                    onClick={handleConfirmCheckout}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-[#E10600] hover:bg-red-700 text-white font-black flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {checkoutSubmitting ? (
                      <span>Traitement...</span>
                    ) : pendingQuote.isSimulatedPreview ? (
                      <span>Déployer un espace réel</span>
                    ) : pendingQuote.quote.transitionType === 'downgrade' ? (
                      <span>Programmer le changement</span>
                    ) : pendingQuote.quote.amountDueFCFA === 0 ? (
                      <span>Confirmer et activer</span>
                    ) : (
                      <span>Confirmer et payer ({formatMoney(pendingQuote.quote.amountDueFCFA)})</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: RECEIPT / PRINTABLE INVOICE */}
      {receiptInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0a0a0f] border border-zinc-800 rounded-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div>
                <h3 className="text-sm font-black text-white">Reçu {receiptInvoice.invoiceNumber}</h3>
                <p className="text-zinc-400 text-[11px]">
                  Émis le {formatDateFr(receiptInvoice.issuedAt)} · Statut {receiptInvoice.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptInvoice(null)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-black/60 border border-zinc-900 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400">
                Émetteur :{' '}
                <strong className="text-white">
                  {receiptInvoice.legalEntity?.issuer || 'Fiko Connect / Koffmann Capital Group'}
                </strong>
              </p>
              <p className="text-zinc-400">
                Identifiant fiscal :{' '}
                <span className="text-amber-300 font-mono">
                  {receiptInvoice.legalEntity?.taxId || 'À configurer'}
                </span>
              </p>
              <p className="text-zinc-400">
                Désignation : <strong className="text-white">{receiptInvoice.description}</strong>
              </p>
              <p className="text-zinc-400">
                Référence : <span className="font-mono text-zinc-200">{receiptInvoice.transactionReference}</span>
              </p>
              <p className="text-zinc-400 pt-2 border-t border-zinc-900 flex justify-between text-sm">
                <span>Total payé :</span>
                <strong className="font-mono text-white">
                  {formatMoney(Number(receiptInvoice.totalPaidFCFA || 0))}
                </strong>
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDownloadReceiptHtml(receiptInvoice)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>Télécharger reçu HTML</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#E10600] hover:bg-red-700 text-white font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={14} />
                <span>Imprimer / PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
