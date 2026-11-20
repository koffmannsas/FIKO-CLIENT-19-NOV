/**
 * FIKO CONNECT™ — NOS OFFRES V1.0 / SUBSCRIPTION INTELLIGENCE ENGINE
 * Catalogue versionné, moteur de calcul financier FCFA (entiers stricts),
 * gestion des proratas UTC, remises annuelles (-20%), sur-quotas et droits (Entitlements).
 */

export type PlanId = 'essai' | 'starter' | 'growth' | 'pro' | 'elite';
export type LegacyPlanId = 'free' | 'starter' | 'business' | 'scale' | 'elite';
export type BillingCycle = 'monthly' | 'annual';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'pending_payment'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type TransitionType =
  | 'trial_activation'
  | 'first_subscription'
  | 'upgrade'
  | 'downgrade'
  | 'renewal'
  | 'no_op';

export type AnalyticsLevel = 'basic' | 'standard' | 'advanced' | 'executive' | 'executive_ai';
export type SupportLevel = 'standard' | 'email_whatsapp' | 'priority' | 'dedicated_sla' | 'vip_consultant';

export interface PlanQuotas {
  maxWhatsappConnections: number;
  maxMonthlyConversations: number;
  maxLeads: number;
  maxAiAgents: number;
  maxCampaignsPerMonth: number;
}

export interface PlanFeatures {
  crm: boolean;
  crmLabel: string;
  aiQualification: boolean;
  aiQualificationLabel: string;
  campaigns: boolean;
  campaignsLabel: string;
  autoFollowUp: boolean;
  autoFollowUpLabel: string;
  analyticsLevel: AnalyticsLevel;
  analyticsLabel: string;
  integrations: boolean;
  integrationsLabel: string;
  supportLevel: SupportLevel;
  supportLabel: string;
}

export interface PlanCatalogEntry {
  id: PlanId;
  legacyAlias?: LegacyPlanId;
  rank: number;
  name: string;
  tagline: string;
  badge?: string;
  accentHex: string;
  currency: 'XOF';
  monthlyPriceFCFA: number;
  annualDiscountPercent: number;
  annualMonthlyEquivalentFCFA: number;
  annualTotalFCFA: number;
  trialDays: number;
  isFreeTrial: boolean;
  quotas: PlanQuotas;
  features: PlanFeatures;
  highlights: string[];
}

export interface LegacyAuditDiff {
  legacyId: LegacyPlanId;
  canonicalId: PlanId;
  legacyName: string;
  targetName: string;
  legacyMonthlyPriceFCFA: number;
  targetMonthlyPriceFCFA: number;
  status: 'price_or_name_mismatch' | 'aligned';
  note: string;
}

export const CATALOG_VERSION = '2026.11-V1';
export const CATALOG_EFFECTIVE_DATE = '2026-11-20T00:00:00.000Z';
export const CATALOG_APPROVAL_STATUS: 'pending_presidential_approval' | 'approved' =
  'pending_presidential_approval';
export const ANNUAL_DISCOUNT_PERCENT = 20;
export const DEFAULT_TRIAL_DAYS = 7;
export const QUOTE_TTL_MINUTES = 15;

export const LEGACY_PLAN_AUDIT_DIFFS: LegacyAuditDiff[] = [
  {
    legacyId: 'free',
    canonicalId: 'essai',
    legacyName: 'ESSAI GRATUIT',
    targetName: 'Essai Gratuit',
    legacyMonthlyPriceFCFA: 0,
    targetMonthlyPriceFCFA: 0,
    status: 'aligned',
    note: 'Essai 7 jours conservé (alias historique free -> essai).',
  },
  {
    legacyId: 'starter',
    canonicalId: 'starter',
    legacyName: 'STARTER',
    targetName: 'Starter',
    legacyMonthlyPriceFCFA: 19900,
    targetMonthlyPriceFCFA: 19000,
    status: 'price_or_name_mismatch',
    note: 'Écart tarifaire détecté : 19 900 FCFA (OnboardingWizard) vs 19 000 FCFA (Catalogue V1.0). Soumis à validation présidentielle avant facturation Live.',
  },
  {
    legacyId: 'business',
    canonicalId: 'growth',
    legacyName: 'BUSINESS',
    targetName: 'Growth',
    legacyMonthlyPriceFCFA: 49900,
    targetMonthlyPriceFCFA: 49000,
    status: 'price_or_name_mismatch',
    note: 'Renommage Business -> Growth et écart tarifaire 49 900 FCFA vs 49 000 FCFA. Alias business conservé pour les contrats existants.',
  },
  {
    legacyId: 'scale',
    canonicalId: 'pro',
    legacyName: 'SCALE',
    targetName: 'Pro',
    legacyMonthlyPriceFCFA: 99000,
    targetMonthlyPriceFCFA: 99000,
    status: 'price_or_name_mismatch',
    note: 'Renommage Scale -> Pro (tarif 99 000 FCFA identique). Alias scale conservé pour les contrats existants.',
  },
  {
    legacyId: 'elite',
    canonicalId: 'elite',
    legacyName: 'ELITE',
    targetName: 'Elite',
    legacyMonthlyPriceFCFA: 199000,
    targetMonthlyPriceFCFA: 199000,
    status: 'aligned',
    note: 'Nom et tarif 199 000 FCFA alignés.',
  },
];

function computeAnnualAmounts(monthlyFCFA: number, discountPercent: number): {
  annualMonthlyEquivalentFCFA: number;
  annualTotalFCFA: number;
} {
  if (monthlyFCFA <= 0) {
    return { annualMonthlyEquivalentFCFA: 0, annualTotalFCFA: 0 };
  }
  const annualTotalFCFA = Math.round(monthlyFCFA * 12 * ((100 - discountPercent) / 100));
  const annualMonthlyEquivalentFCFA = Math.round(annualTotalFCFA / 12);
  return { annualMonthlyEquivalentFCFA, annualTotalFCFA };
}

const starterAnnual = computeAnnualAmounts(19000, ANNUAL_DISCOUNT_PERCENT);
const growthAnnual = computeAnnualAmounts(49000, ANNUAL_DISCOUNT_PERCENT);
const proAnnual = computeAnnualAmounts(99000, ANNUAL_DISCOUNT_PERCENT);
const eliteAnnual = computeAnnualAmounts(199000, ANNUAL_DISCOUNT_PERCENT);

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: 'essai',
    legacyAlias: 'free',
    rank: 0,
    name: 'Essai Gratuit',
    tagline: 'Testez Fiko Connect en conditions réelles pendant 7 jours.',
    badge: 'Essai 7 jours',
    accentHex: '#25D366',
    currency: 'XOF',
    monthlyPriceFCFA: 0,
    annualDiscountPercent: 0,
    annualMonthlyEquivalentFCFA: 0,
    annualTotalFCFA: 0,
    trialDays: DEFAULT_TRIAL_DAYS,
    isFreeTrial: true,
    quotas: {
      maxWhatsappConnections: 1,
      maxMonthlyConversations: 50,
      maxLeads: 5,
      maxAiAgents: 1,
      maxCampaignsPerMonth: 1,
    },
    features: {
      crm: true,
      crmLabel: 'CRM basique (5 fiches)',
      aiQualification: true,
      aiQualificationLabel: 'Qualification IA (50 messages)',
      campaigns: true,
      campaignsLabel: '1 campagne test / mois',
      autoFollowUp: false,
      autoFollowUpLabel: 'Non inclus',
      analyticsLevel: 'basic',
      analyticsLabel: 'Indicateurs essentiels',
      integrations: false,
      integrationsLabel: 'Sandbox uniquement',
      supportLevel: 'standard',
      supportLabel: 'Support email',
    },
    highlights: [
      '1 connexion WhatsApp',
      '50 conversations IA / mois',
      '5 leads CRM max',
      'Sans engagement ni carte requise',
    ],
  },
  {
    id: 'starter',
    legacyAlias: 'starter',
    rank: 1,
    name: 'Starter',
    tagline: 'Votre premier commercial IA opérationnel sur WhatsApp.',
    accentHex: '#E10600',
    currency: 'XOF',
    monthlyPriceFCFA: 19000,
    annualDiscountPercent: ANNUAL_DISCOUNT_PERCENT,
    annualMonthlyEquivalentFCFA: starterAnnual.annualMonthlyEquivalentFCFA,
    annualTotalFCFA: starterAnnual.annualTotalFCFA,
    trialDays: 0,
    isFreeTrial: false,
    quotas: {
      maxWhatsappConnections: 1,
      maxMonthlyConversations: 500,
      maxLeads: 300,
      maxAiAgents: 1,
      maxCampaignsPerMonth: 5,
    },
    features: {
      crm: true,
      crmLabel: 'CRM complet (300 leads)',
      aiQualification: true,
      aiQualificationLabel: 'Qualification IA & Knowledge Center',
      campaigns: true,
      campaignsLabel: '5 campagnes / mois',
      autoFollowUp: false,
      autoFollowUpLabel: 'Relance manuelle',
      analyticsLevel: 'standard',
      analyticsLabel: 'Analytics standards',
      integrations: false,
      integrationsLabel: 'Paystack Liens manuels',
      supportLevel: 'email_whatsapp',
      supportLabel: 'Support WhatsApp & Email',
    },
    highlights: [
      '1 connexion WhatsApp Business',
      '500 conversations / mois',
      '300 leads CRM vérifiés',
      'Liens Paystack XOF intégrés',
    ],
  },
  {
    id: 'growth',
    legacyAlias: 'business',
    rank: 2,
    name: 'Growth',
    tagline: 'Accélérez vos conversions avec relances auto et multi-numéros.',
    badge: 'Populaire',
    accentHex: '#3B82F6',
    currency: 'XOF',
    monthlyPriceFCFA: 49000,
    annualDiscountPercent: ANNUAL_DISCOUNT_PERCENT,
    annualMonthlyEquivalentFCFA: growthAnnual.annualMonthlyEquivalentFCFA,
    annualTotalFCFA: growthAnnual.annualTotalFCFA,
    trialDays: 0,
    isFreeTrial: false,
    quotas: {
      maxWhatsappConnections: 3,
      maxMonthlyConversations: 2500,
      maxLeads: 2000,
      maxAiAgents: 3,
      maxCampaignsPerMonth: 25,
    },
    features: {
      crm: true,
      crmLabel: 'CRM avancé (2 000 leads)',
      aiQualification: true,
      aiQualificationLabel: 'Qualification IA + Deep Scan™',
      campaigns: true,
      campaignsLabel: '25 campagnes / mois',
      autoFollowUp: true,
      autoFollowUpLabel: 'Relances auto J+1 & J+2',
      analyticsLevel: 'advanced',
      analyticsLabel: 'Analytics entonnoir & ROI',
      integrations: true,
      integrationsLabel: 'Paystack Auto + Webhooks',
      supportLevel: 'priority',
      supportLabel: 'Support prioritaire',
    },
    highlights: [
      '3 connexions WhatsApp',
      '2 500 conversations / mois',
      'Relances automatiques J+1 & J+2',
      'Paystack Checkout + Analytics ROI',
    ],
  },
  {
    id: 'pro',
    legacyAlias: 'scale',
    rank: 3,
    name: 'Pro',
    tagline: 'Orchestration multi-agents et API pour équipes commerciales.',
    accentHex: '#8B5CF6',
    currency: 'XOF',
    monthlyPriceFCFA: 99000,
    annualDiscountPercent: ANNUAL_DISCOUNT_PERCENT,
    annualMonthlyEquivalentFCFA: proAnnual.annualMonthlyEquivalentFCFA,
    annualTotalFCFA: proAnnual.annualTotalFCFA,
    trialDays: 0,
    isFreeTrial: false,
    quotas: {
      maxWhatsappConnections: 10,
      maxMonthlyConversations: 10000,
      maxLeads: 10000,
      maxAiAgents: 10,
      maxCampaignsPerMonth: 100,
    },
    features: {
      crm: true,
      crmLabel: 'CRM Multi-équipes (10 000 leads)',
      aiQualification: true,
      aiQualificationLabel: 'Multi-agents IA + Validation humaine',
      campaigns: true,
      campaignsLabel: '100 campagnes / mois',
      autoFollowUp: true,
      autoFollowUpLabel: 'Séquences multi-étapes',
      analyticsLevel: 'executive',
      analyticsLabel: 'Analytics Exécutifs',
      integrations: true,
      integrationsLabel: 'API Fiko Connect & Webhooks',
      supportLevel: 'dedicated_sla',
      supportLabel: 'Account Manager & SLA',
    },
    highlights: [
      '10 connexions WhatsApp',
      '10 000 conversations / mois',
      '10 agents IA spécialisés',
      'API Fiko Connect & Webhooks',
    ],
  },
  {
    id: 'elite',
    legacyAlias: 'elite',
    rank: 4,
    name: 'Elite',
    tagline: 'Infrastructure commerciale dédiée et gouvernance IA sur-mesure.',
    badge: 'Recommandé',
    accentHex: '#F5C542',
    currency: 'XOF',
    monthlyPriceFCFA: 199000,
    annualDiscountPercent: ANNUAL_DISCOUNT_PERCENT,
    annualMonthlyEquivalentFCFA: eliteAnnual.annualMonthlyEquivalentFCFA,
    annualTotalFCFA: eliteAnnual.annualTotalFCFA,
    trialDays: 0,
    isFreeTrial: false,
    quotas: {
      maxWhatsappConnections: 25,
      maxMonthlyConversations: 50000,
      maxLeads: 50000,
      maxAiAgents: 25,
      maxCampaignsPerMonth: 500,
    },
    features: {
      crm: true,
      crmLabel: 'CRM Enterprise (50 000 leads)',
      aiQualification: true,
      aiQualificationLabel: 'Fiko Brain dédié + Gouvernance complète',
      campaigns: true,
      campaignsLabel: '500 campagnes / mois',
      autoFollowUp: true,
      autoFollowUpLabel: 'Relances omnicanales & Closer IA',
      analyticsLevel: 'executive_ai',
      analyticsLabel: 'Board Exécutif & Export Audit',
      integrations: true,
      integrationsLabel: 'API dédiée + ERP / Paystack Live',
      supportLevel: 'vip_consultant',
      supportLabel: 'Consultant VIP dédié 24/7',
    },
    highlights: [
      '25 connexions WhatsApp',
      '50 000 conversations / mois',
      'Fiko Brain & Consultant VIP dédié',
      'Audit & SLA Enterprise',
    ],
  },
];

export const PLAN_CATALOG_BY_ID: Record<PlanId, PlanCatalogEntry> = PLAN_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<PlanId, PlanCatalogEntry>
);

export function normalizePlanId(rawPlan?: string | null): PlanId {
  const cleaned = String(rawPlan || 'essai').trim().toLowerCase();
  if (cleaned === 'free' || cleaned === 'essai') return 'essai';
  if (cleaned === 'starter') return 'starter';
  if (cleaned === 'business' || cleaned === 'growth') return 'growth';
  if (cleaned === 'scale' || cleaned === 'pro') return 'pro';
  if (cleaned === 'elite') return 'elite';
  return 'essai';
}

export function toLegacyPlanId(planId: PlanId): LegacyPlanId {
  if (planId === 'essai') return 'free';
  if (planId === 'growth') return 'business';
  if (planId === 'pro') return 'scale';
  return planId;
}

export function getPlanDefinition(planOrAlias?: string | null): PlanCatalogEntry {
  return PLAN_CATALOG_BY_ID[normalizePlanId(planOrAlias)];
}

export function calculateCyclePriceFCFA(planId: PlanId, cycle: BillingCycle): number {
  const plan = PLAN_CATALOG_BY_ID[planId];
  if (!plan) throw new Error(`Offre inconnue : ${planId}`);
  if (plan.isFreeTrial) return 0;
  return cycle === 'annual' ? plan.annualTotalFCFA : plan.monthlyPriceFCFA;
}

/**
 * Adds exactly 1 calendar month (or 1 calendar year) in UTC, handling
 * 28/29/30/31-day months and leap years deterministically.
 */
export function addBillingCycleUtc(startIso: string, cycle: BillingCycle): string {
  const base = new Date(startIso);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Date invalide pour calcul de cycle : ${startIso}`);
  }

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const hours = base.getUTCHours();
  const minutes = base.getUTCMinutes();
  const seconds = base.getUTCSeconds();
  const ms = base.getUTCMilliseconds();

  if (cycle === 'annual') {
    const targetYear = year + 1;
    const maxDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
    const clampedDay = Math.min(day, maxDay);
    return new Date(Date.UTC(targetYear, month, clampedDay, hours, minutes, seconds, ms)).toISOString();
  }

  const nextMonthIndex = month + 1;
  const targetYear = year + Math.floor(nextMonthIndex / 12);
  const targetMonth = nextMonthIndex % 12;
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDay);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, ms)).toISOString();
}

export function addDaysUtc(startIso: string, days: number): string {
  const base = new Date(startIso);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Date invalide : ${startIso}`);
  }
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export interface UsageMetersSnapshot {
  whatsappConnections: number;
  monthlyConversations: number;
  leadsCount: number;
  aiAgents: number;
  campaignsThisMonth: number;
  periodKey?: string;
  updatedAt?: string;
}

export interface ResourceOverage {
  resourceKey: keyof UsageMetersSnapshot;
  label: string;
  currentCount: number;
  targetLimit: number;
  excessCount: number;
  preservationRule: string;
}

export function computeResourceOverages(
  targetPlanId: PlanId,
  usage: UsageMetersSnapshot
): ResourceOverage[] {
  const targetPlan = PLAN_CATALOG_BY_ID[targetPlanId];
  const overages: ResourceOverage[] = [];

  if (usage.whatsappConnections > targetPlan.quotas.maxWhatsappConnections) {
    overages.push({
      resourceKey: 'whatsappConnections',
      label: 'Connexions WhatsApp',
      currentCount: usage.whatsappConnections,
      targetLimit: targetPlan.quotas.maxWhatsappConnections,
      excessCount: usage.whatsappConnections - targetPlan.quotas.maxWhatsappConnections,
      preservationRule:
        'Aucune connexion supprimée. Les numéros excédentaires seront mis en veille jusqu’à sélection ou ré-upgrade.',
    });
  }

  if (usage.aiAgents > targetPlan.quotas.maxAiAgents) {
    overages.push({
      resourceKey: 'aiAgents',
      label: 'Agents IA actifs',
      currentCount: usage.aiAgents,
      targetLimit: targetPlan.quotas.maxAiAgents,
      excessCount: usage.aiAgents - targetPlan.quotas.maxAiAgents,
      preservationRule:
        'Historique et connaissances conservés. Les agents excédentaires seront mis en pause.',
    });
  }

  if (usage.leadsCount > targetPlan.quotas.maxLeads) {
    overages.push({
      resourceKey: 'leadsCount',
      label: 'Leads CRM enregistrés',
      currentCount: usage.leadsCount,
      targetLimit: targetPlan.quotas.maxLeads,
      excessCount: usage.leadsCount - targetPlan.quotas.maxLeads,
      preservationRule:
        'Tous les leads historiques restent consultables ; la création de nouveaux leads nécessitera un palier supérieur.',
    });
  }

  if (usage.monthlyConversations > targetPlan.quotas.maxMonthlyConversations) {
    overages.push({
      resourceKey: 'monthlyConversations',
      label: 'Conversations mensuelles',
      currentCount: usage.monthlyConversations,
      targetLimit: targetPlan.quotas.maxMonthlyConversations,
      excessCount: usage.monthlyConversations - targetPlan.quotas.maxMonthlyConversations,
      preservationRule:
        'Les conversations passées restent accessibles ; le compteur mensuel bloque les nouveaux envois automatisés au-delà du plafond.',
    });
  }

  if (usage.campaignsThisMonth > targetPlan.quotas.maxCampaignsPerMonth) {
    overages.push({
      resourceKey: 'campaignsThisMonth',
      label: 'Campagnes ce mois',
      currentCount: usage.campaignsThisMonth,
      targetLimit: targetPlan.quotas.maxCampaignsPerMonth,
      excessCount: usage.campaignsThisMonth - targetPlan.quotas.maxCampaignsPerMonth,
      preservationRule:
        'Les campagnes existantes restent archivées ; les nouvelles diffusions attendront le cycle suivant.',
    });
  }

  return overages;
}

export interface SubscriptionSnapshot {
  companyId: string;
  planId: PlanId;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  trialUsed: boolean;
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  availableCreditFCFA: number;
  cancelAtPeriodEnd?: boolean;
  scheduledChange?: {
    requestId: string;
    targetPlanId: PlanId;
    targetCycle: BillingCycle;
    effectiveAt: string;
    createdAt: string;
  } | null;
  paymentMode: 'manual_renewal' | 'recurring_supported' | 'none';
  catalogVersion: string;
}

export interface BillingQuoteCalculation {
  fromPlanId: PlanId;
  fromCycle: BillingCycle;
  toPlanId: PlanId;
  toCycle: BillingCycle;
  transitionType: TransitionType;
  catalogVersion: string;
  targetCyclePriceFCFA: number;
  unusedCreditFCFA: number;
  availableCreditAppliedFCFA: number;
  totalCreditConsumedFCFA: number;
  remainingCreditAfterFCFA: number;
  taxFCFA: number;
  amountDueFCFA: number;
  effectiveAt: string;
  newPeriodStart: string;
  newPeriodEnd: string;
  nextRenewalDate: string;
  nextRenewalAmountFCFA: number;
  gainedFeatures: string[];
  lostFeatures: string[];
  resourceOverages: ResourceOverage[];
  prorataFractionRemaining: number;
  explanation: string;
}

function summarizePlanFeatures(plan: PlanCatalogEntry): string[] {
  const list: string[] = [
    `${plan.quotas.maxWhatsappConnections} connexion(s) WhatsApp`,
    `${plan.quotas.maxMonthlyConversations.toLocaleString('fr-FR')} conversations / mois`,
    `${plan.quotas.maxLeads.toLocaleString('fr-FR')} leads CRM`,
    `${plan.quotas.maxAiAgents} agent(s) IA`,
    `${plan.quotas.maxCampaignsPerMonth} campagne(s) / mois`,
  ];
  if (plan.features.autoFollowUp) list.push('Relances automatiques J+1 / J+2');
  if (plan.features.integrations) list.push(plan.features.integrationsLabel);
  return list;
}

export function computeFeatureDelta(fromPlanId: PlanId, toPlanId: PlanId): {
  gainedFeatures: string[];
  lostFeatures: string[];
} {
  const fromPlan = PLAN_CATALOG_BY_ID[fromPlanId];
  const toPlan = PLAN_CATALOG_BY_ID[toPlanId];

  const gained: string[] = [];
  const lost: string[] = [];

  if (toPlan.quotas.maxWhatsappConnections > fromPlan.quotas.maxWhatsappConnections) {
    gained.push(`Connexions WhatsApp : ${fromPlan.quotas.maxWhatsappConnections} → ${toPlan.quotas.maxWhatsappConnections}`);
  } else if (toPlan.quotas.maxWhatsappConnections < fromPlan.quotas.maxWhatsappConnections) {
    lost.push(`Connexions WhatsApp réduites : ${fromPlan.quotas.maxWhatsappConnections} → ${toPlan.quotas.maxWhatsappConnections}`);
  }

  if (toPlan.quotas.maxMonthlyConversations > fromPlan.quotas.maxMonthlyConversations) {
    gained.push(
      `Conversations/mois : ${fromPlan.quotas.maxMonthlyConversations.toLocaleString('fr-FR')} → ${toPlan.quotas.maxMonthlyConversations.toLocaleString('fr-FR')}`
    );
  } else if (toPlan.quotas.maxMonthlyConversations < fromPlan.quotas.maxMonthlyConversations) {
    lost.push(
      `Conversations/mois réduites : ${fromPlan.quotas.maxMonthlyConversations.toLocaleString('fr-FR')} → ${toPlan.quotas.maxMonthlyConversations.toLocaleString('fr-FR')}`
    );
  }

  if (toPlan.quotas.maxLeads > fromPlan.quotas.maxLeads) {
    gained.push(`Leads CRM : ${fromPlan.quotas.maxLeads.toLocaleString('fr-FR')} → ${toPlan.quotas.maxLeads.toLocaleString('fr-FR')}`);
  } else if (toPlan.quotas.maxLeads < fromPlan.quotas.maxLeads) {
    lost.push(`Leads CRM réduits : ${fromPlan.quotas.maxLeads.toLocaleString('fr-FR')} → ${toPlan.quotas.maxLeads.toLocaleString('fr-FR')}`);
  }

  if (toPlan.quotas.maxAiAgents > fromPlan.quotas.maxAiAgents) {
    gained.push(`Agents IA : ${fromPlan.quotas.maxAiAgents} → ${toPlan.quotas.maxAiAgents}`);
  } else if (toPlan.quotas.maxAiAgents < fromPlan.quotas.maxAiAgents) {
    lost.push(`Agents IA réduits : ${fromPlan.quotas.maxAiAgents} → ${toPlan.quotas.maxAiAgents}`);
  }

  if (toPlan.features.autoFollowUp && !fromPlan.features.autoFollowUp) {
    gained.push('Relances automatiques J+1 & J+2 activées');
  } else if (!toPlan.features.autoFollowUp && fromPlan.features.autoFollowUp) {
    lost.push('Perte des relances automatiques J+1 & J+2');
  }

  if (toPlan.features.integrations && !fromPlan.features.integrations) {
    gained.push(`Intégrations débloquées (${toPlan.features.integrationsLabel})`);
  } else if (!toPlan.features.integrations && fromPlan.features.integrations) {
    lost.push(`Perte des intégrations avancées (${fromPlan.features.integrationsLabel})`);
  }

  if (toPlan.rank > fromPlan.rank && toPlan.features.supportLabel !== fromPlan.features.supportLabel) {
    gained.push(`Support : ${toPlan.features.supportLabel}`);
  } else if (toPlan.rank < fromPlan.rank && toPlan.features.supportLabel !== fromPlan.features.supportLabel) {
    lost.push(`Support ramené à : ${toPlan.features.supportLabel}`);
  }

  if (fromPlanId === toPlanId && gained.length === 0 && lost.length === 0) {
    gained.push(...summarizePlanFeatures(toPlan).slice(0, 2));
  }

  return { gainedFeatures: gained, lostFeatures: lost };
}

export interface CalculateBillingQuoteParams {
  subscription: SubscriptionSnapshot;
  targetPlanId: PlanId;
  targetCycle: BillingCycle;
  usageMeters: UsageMetersSnapshot;
  nowIso?: string;
  taxRateBps?: number;
}

/**
 * Computes an exact, deterministic integer-FCFA quote for any subscription change.
 * Zero floating-point monetary leakage.
 */
export function calculateBillingQuote(params: CalculateBillingQuoteParams): BillingQuoteCalculation {
  const {
    subscription,
    targetPlanId,
    targetCycle,
    usageMeters,
    nowIso = new Date().toISOString(),
    taxRateBps = 0,
  } = params;

  const nowMs = new Date(nowIso).getTime();
  const fromPlan = PLAN_CATALOG_BY_ID[normalizePlanId(subscription.planId)];
  const toPlan = PLAN_CATALOG_BY_ID[normalizePlanId(targetPlanId)];
  const fromCycle: BillingCycle = subscription.billingCycle || 'monthly';
  const normalizedAvailableCredit = Math.max(0, Math.round(subscription.availableCreditFCFA || 0));

  const targetCyclePriceFCFA = calculateCyclePriceFCFA(toPlan.id, targetCycle);
  const { gainedFeatures, lostFeatures } = computeFeatureDelta(fromPlan.id, toPlan.id);
  const resourceOverages = computeResourceOverages(toPlan.id, usageMeters);

  // Check if current paid subscription still has active remaining time
  const hasPeriodWindow = !!(subscription.currentPeriodStart && subscription.currentPeriodEnd);
  const periodStartMs = subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).getTime() : nowMs;
  const periodEndMs = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).getTime() : nowMs;
  const isCurrentlyActivePaid =
    !fromPlan.isFreeTrial &&
    (subscription.status === 'active' || subscription.status === 'past_due') &&
    hasPeriodWindow &&
    periodEndMs > nowMs;

  // Determine transition type
  let transitionType: TransitionType;

  if (toPlan.isFreeTrial) {
    if (fromPlan.isFreeTrial && !subscription.trialUsed && subscription.status !== 'expired') {
      transitionType = 'no_op';
    } else if (isCurrentlyActivePaid) {
      transitionType = 'downgrade';
    } else if (!subscription.trialUsed) {
      transitionType = 'trial_activation';
    } else {
      throw new Error("L'essai gratuit de 7 jours a déjà été utilisé pour cette entreprise.");
    }
  } else if (fromPlan.isFreeTrial || subscription.status === 'expired' || subscription.status === 'canceled') {
    transitionType = 'first_subscription';
  } else if (toPlan.rank > fromPlan.rank) {
    transitionType = 'upgrade';
  } else if (toPlan.rank < fromPlan.rank) {
    transitionType = isCurrentlyActivePaid ? 'downgrade' : 'first_subscription';
  } else {
    // Same plan rank
    if (fromCycle === 'monthly' && targetCycle === 'annual') {
      transitionType = 'upgrade';
    } else if (fromCycle === 'annual' && targetCycle === 'monthly') {
      transitionType = isCurrentlyActivePaid ? 'downgrade' : 'renewal';
    } else {
      // Same plan, same cycle
      const msUntilEnd = periodEndMs - nowMs;
      const renewalWindowMs = 7 * 24 * 60 * 60 * 1000;
      if (subscription.status === 'active' && msUntilEnd > renewalWindowMs) {
        transitionType = 'no_op';
      } else {
        transitionType = 'renewal';
      }
    }
  }

  // Case 1: Trial activation
  if (transitionType === 'trial_activation') {
    const trialEnd = addDaysUtc(nowIso, DEFAULT_TRIAL_DAYS);
    return {
      fromPlanId: fromPlan.id,
      fromCycle,
      toPlanId: toPlan.id,
      toCycle: 'monthly',
      transitionType,
      catalogVersion: CATALOG_VERSION,
      targetCyclePriceFCFA: 0,
      unusedCreditFCFA: 0,
      availableCreditAppliedFCFA: 0,
      totalCreditConsumedFCFA: 0,
      remainingCreditAfterFCFA: normalizedAvailableCredit,
      taxFCFA: 0,
      amountDueFCFA: 0,
      effectiveAt: nowIso,
      newPeriodStart: nowIso,
      newPeriodEnd: trialEnd,
      nextRenewalDate: trialEnd,
      nextRenewalAmountFCFA: 0,
      gainedFeatures,
      lostFeatures,
      resourceOverages,
      prorataFractionRemaining: 0,
      explanation: `Activation immédiate de l’essai gratuit de ${DEFAULT_TRIAL_DAYS} jours sans prélèvement.`,
    };
  }

  // Case 2: No-op (already active on exact plan and cycle outside renewal window)
  if (transitionType === 'no_op') {
    return {
      fromPlanId: fromPlan.id,
      fromCycle,
      toPlanId: toPlan.id,
      toCycle: targetCycle,
      transitionType,
      catalogVersion: CATALOG_VERSION,
      targetCyclePriceFCFA,
      unusedCreditFCFA: 0,
      availableCreditAppliedFCFA: 0,
      totalCreditConsumedFCFA: 0,
      remainingCreditAfterFCFA: normalizedAvailableCredit,
      taxFCFA: 0,
      amountDueFCFA: 0,
      effectiveAt: nowIso,
      newPeriodStart: subscription.currentPeriodStart || nowIso,
      newPeriodEnd: subscription.currentPeriodEnd || addBillingCycleUtc(nowIso, targetCycle),
      nextRenewalDate: subscription.currentPeriodEnd || addBillingCycleUtc(nowIso, targetCycle),
      nextRenewalAmountFCFA: targetCyclePriceFCFA,
      gainedFeatures: [],
      lostFeatures: [],
      resourceOverages: [],
      prorataFractionRemaining: 1,
      explanation: "Cette offre et cette périodicité sont déjà actives sur votre espace.",
    };
  }

  // Case 3: Downgrade (always scheduled at period end, zero immediate charge, zero data deletion)
  if (transitionType === 'downgrade') {
    const effectiveAt = subscription.currentPeriodEnd || nowIso;
    const nextPeriodEnd = addBillingCycleUtc(effectiveAt, targetCycle);
    return {
      fromPlanId: fromPlan.id,
      fromCycle,
      toPlanId: toPlan.id,
      toCycle: toPlan.isFreeTrial ? 'monthly' : targetCycle,
      transitionType,
      catalogVersion: CATALOG_VERSION,
      targetCyclePriceFCFA,
      unusedCreditFCFA: 0,
      availableCreditAppliedFCFA: 0,
      totalCreditConsumedFCFA: 0,
      remainingCreditAfterFCFA: normalizedAvailableCredit,
      taxFCFA: 0,
      amountDueFCFA: 0,
      effectiveAt,
      newPeriodStart: effectiveAt,
      newPeriodEnd: nextPeriodEnd,
      nextRenewalDate: effectiveAt,
      nextRenewalAmountFCFA: targetCyclePriceFCFA,
      gainedFeatures,
      lostFeatures,
      resourceOverages,
      prorataFractionRemaining: 0,
      explanation:
        `Rétrogradation programmée pour la fin de votre période en cours (${effectiveAt.slice(0, 10)}). ` +
        `Vos droits ${fromPlan.name} restent actifs jusqu’à cette date.`,
    };
  }

  // Case 4: Immediate paid transitions (first_subscription, upgrade, renewal)
  let prorataFractionRemaining = 0;
  let unusedCreditFCFA = 0;

  if (transitionType === 'upgrade' && isCurrentlyActivePaid) {
    const totalCycleMs = Math.max(1, periodEndMs - periodStartMs);
    const remainingMs = Math.max(0, Math.min(totalCycleMs, periodEndMs - nowMs));
    prorataFractionRemaining = remainingMs / totalCycleMs;
    const currentCyclePriceFCFA = calculateCyclePriceFCFA(fromPlan.id, fromCycle);
    unusedCreditFCFA = Math.min(
      currentCyclePriceFCFA,
      Math.max(0, Math.round((currentCyclePriceFCFA * remainingMs) / totalCycleMs))
    );
  }

  const grossPlusTaxBeforeCredits =
    targetCyclePriceFCFA + Math.round((targetCyclePriceFCFA * Math.max(0, taxRateBps)) / 10000);

  // Apply unused prorata credit first, then available account credit, never dropping below 0
  const unusedCreditUsed = Math.min(grossPlusTaxBeforeCredits, unusedCreditFCFA);
  const afterUnused = grossPlusTaxBeforeCredits - unusedCreditUsed;
  const availableCreditAppliedFCFA = Math.min(afterUnused, normalizedAvailableCredit);
  const surplusUnusedToWallet = Math.max(0, unusedCreditFCFA - unusedCreditUsed);
  const remainingCreditAfterFCFA = normalizedAvailableCredit - availableCreditAppliedFCFA + surplusUnusedToWallet;
  const amountDueFCFA = Math.max(0, afterUnused - availableCreditAppliedFCFA);
  const taxFCFA = Math.round((targetCyclePriceFCFA * Math.max(0, taxRateBps)) / 10000);

  const cycleAnchorIso =
    transitionType === 'renewal' && isCurrentlyActivePaid && subscription.currentPeriodEnd
      ? subscription.currentPeriodEnd
      : nowIso;
  const newPeriodStart = transitionType === 'renewal' && subscription.currentPeriodStart
    ? subscription.currentPeriodStart
    : nowIso;
  const newPeriodEnd = addBillingCycleUtc(cycleAnchorIso, targetCycle);

  const explanation =
    transitionType === 'upgrade'
      ? `Activation immédiate ${toPlan.name} (${targetCycle === 'annual' ? 'Annuel -20%' : 'Mensuel'}) : ` +
        `crédit prorata de ${unusedCreditFCFA.toLocaleString('fr-FR')} FCFA déduit de la période restante.`
      : transitionType === 'renewal'
      ? `Renouvellement de votre forfait ${toPlan.name} prolongé jusqu’au ${newPeriodEnd.slice(0, 10)}.`
      : `Souscription immédiate à l’offre ${toPlan.name} (${targetCycle === 'annual' ? 'Annuel -20%' : 'Mensuel'}).`;

  return {
    fromPlanId: fromPlan.id,
    fromCycle,
    toPlanId: toPlan.id,
    toCycle: targetCycle,
    transitionType,
    catalogVersion: CATALOG_VERSION,
    targetCyclePriceFCFA,
    unusedCreditFCFA: unusedCreditUsed,
    availableCreditAppliedFCFA,
    totalCreditConsumedFCFA: unusedCreditUsed + availableCreditAppliedFCFA,
    remainingCreditAfterFCFA,
    taxFCFA,
    amountDueFCFA,
    effectiveAt: nowIso,
    newPeriodStart,
    newPeriodEnd,
    nextRenewalDate: newPeriodEnd,
    nextRenewalAmountFCFA: targetCyclePriceFCFA,
    gainedFeatures,
    lostFeatures,
    resourceOverages,
    prorataFractionRemaining,
    explanation,
  };
}

export interface CompanyEntitlements {
  companyId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  maxWhatsappConnections: number;
  maxMonthlyConversations: number;
  maxLeads: number;
  maxAiAgents: number;
  maxCampaignsPerMonth: number;
  features: PlanFeatures;
  readOnlyHistoricalAccess: boolean;
  canCreateNewLeads: boolean;
  canSendAutoMessages: boolean;
  overageResources: ResourceOverage[];
  suspendedExceedingResources: string[];
  updatedAt: string;
}

export function resolvePlanEntitlements(params: {
  companyId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  usageMeters: UsageMetersSnapshot;
  suspendedExceedingResources?: string[];
  nowIso?: string;
}): CompanyEntitlements {
  const {
    companyId,
    planId,
    status,
    usageMeters,
    suspendedExceedingResources = [],
    nowIso = new Date().toISOString(),
  } = params;
  const plan = PLAN_CATALOG_BY_ID[normalizePlanId(planId)];
  const isAccessible = status === 'active' || status === 'trialing' || status === 'past_due';
  const overageResources = computeResourceOverages(plan.id, usageMeters);

  return {
    companyId,
    planId: plan.id,
    status,
    maxWhatsappConnections: plan.quotas.maxWhatsappConnections,
    maxMonthlyConversations: plan.quotas.maxMonthlyConversations,
    maxLeads: plan.quotas.maxLeads,
    maxAiAgents: plan.quotas.maxAiAgents,
    maxCampaignsPerMonth: plan.quotas.maxCampaignsPerMonth,
    features: plan.features,
    readOnlyHistoricalAccess: true, // Jamais de suppression automatique des données historiques
    canCreateNewLeads: isAccessible && usageMeters.leadsCount < plan.quotas.maxLeads,
    canSendAutoMessages:
      isAccessible && usageMeters.monthlyConversations < plan.quotas.maxMonthlyConversations,
    overageResources,
    suspendedExceedingResources,
    updatedAt: nowIso,
  };
}

export interface BillingInsight {
  id: string;
  severity: 'info' | 'warning' | 'opportunity';
  title: string;
  message: string;
  recommendedPlanId?: PlanId;
  advisoryOnly: true;
}

export function generateBillingInsights(
  subscription: SubscriptionSnapshot,
  usage: UsageMetersSnapshot,
  nowIso: string = new Date().toISOString()
): BillingInsight[] {
  const insights: BillingInsight[] = [];
  const currentPlan = PLAN_CATALOG_BY_ID[normalizePlanId(subscription.planId)];
  const nowMs = new Date(nowIso).getTime();

  // 1. Trial expiration alert
  if (currentPlan.isFreeTrial && subscription.trialEndsAt) {
    const msLeft = new Date(subscription.trialEndsAt).getTime() - nowMs;
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (daysLeft <= 0) {
      insights.push({
        id: 'trial_expired',
        severity: 'warning',
        title: 'Essai gratuit expiré',
        message:
          'Votre période d’essai de 7 jours est terminée. Choisissez Starter (19 000 FCFA/mois) pour réactiver vos réponses IA sans perdre vos leads.',
        recommendedPlanId: 'starter',
        advisoryOnly: true,
      });
    } else if (daysLeft <= 3) {
      insights.push({
        id: 'trial_ending_soon',
        severity: 'warning',
        title: `Fin d’essai dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`,
        message:
          'Sélectionnez un forfait payant avant l’échéance pour éviter toute interruption. Aucun prélèvement automatique ne sera effectué sans votre validation.',
        recommendedPlanId: 'starter',
        advisoryOnly: true,
      });
    }
  }

  // 2. High consumption warning (>= 80%)
  const convRatio = usage.monthlyConversations / Math.max(1, currentPlan.quotas.maxMonthlyConversations);
  const leadRatio = usage.leadsCount / Math.max(1, currentPlan.quotas.maxLeads);
  const waRatio = usage.whatsappConnections / Math.max(1, currentPlan.quotas.maxWhatsappConnections);

  const nextPlan = PLAN_CATALOG.find((p) => p.rank === currentPlan.rank + 1);
  if ((convRatio >= 0.8 || leadRatio >= 0.8 || waRatio >= 0.9) && nextPlan) {
    const diffFCFA = nextPlan.monthlyPriceFCFA - currentPlan.monthlyPriceFCFA;
    insights.push({
      id: 'quota_threshold_80',
      severity: 'warning',
      title: 'Plafond proche sur votre cycle',
      message:
        `Vous approchez des limites ${currentPlan.name} (` +
        `${usage.monthlyConversations}/${currentPlan.quotas.maxMonthlyConversations} conversations, ` +
        `${usage.leadsCount}/${currentPlan.quotas.maxLeads} leads). ` +
        `Le passage à ${nextPlan.name} coûte ${diffFCFA.toLocaleString('fr-FR')} FCFA/mois supplémentaires (avant prorata).`,
      recommendedPlanId: nextPlan.id,
      advisoryOnly: true,
    });
  }

  // 3. Renewal reminder within 5 days (especially for manual Mobile Money)
  if (!currentPlan.isFreeTrial && subscription.currentPeriodEnd && subscription.status === 'active') {
    const daysToRenew = Math.ceil(
      (new Date(subscription.currentPeriodEnd).getTime() - nowMs) / (24 * 60 * 60 * 1000)
    );
    if (daysToRenew >= 0 && daysToRenew <= 5) {
      insights.push({
        id: 'upcoming_renewal',
        severity: 'info',
        title: `Renouvellement dans ${daysToRenew} jour${daysToRenew > 1 ? 's' : ''}`,
        message:
          subscription.paymentMode === 'manual_renewal'
            ? 'Votre mode Mobile Money / paiement ponctuel nécessite un renouvellement manuel depuis l’onglet Mon abonnement.'
            : `Votre échéance ${currentPlan.name} approche.`,
        advisoryOnly: true,
      });
    }
  }

  // 4. Scheduled downgrade reminder
  if (subscription.scheduledChange) {
    const target = PLAN_CATALOG_BY_ID[subscription.scheduledChange.targetPlanId];
    insights.push({
      id: 'scheduled_downgrade_active',
      severity: 'info',
      title: `Changement programmé vers ${target.name}`,
      message: `Effectif le ${subscription.scheduledChange.effectiveAt.slice(0, 10)}. Vous pouvez l’annuler à tout moment avant cette date.`,
      advisoryOnly: true,
    });
  }

  // 5. Under-utilization optimization tip for Pro/Elite
  if (
    currentPlan.rank >= 3 &&
    convRatio < 0.2 &&
    leadRatio < 0.2 &&
    waRatio <= 0.3 &&
    !subscription.scheduledChange
  ) {
    const lowerPlan = PLAN_CATALOG.find((p) => p.rank === currentPlan.rank - 1);
    if (lowerPlan) {
      const savings = currentPlan.monthlyPriceFCFA - lowerPlan.monthlyPriceFCFA;
      insights.push({
        id: 'under_utilization_tip',
        severity: 'opportunity',
        title: `Optimisation possible (-${savings.toLocaleString('fr-FR')} FCFA/mois)`,
        message: `Votre consommation actuelle est inférieure à 20 % des quotas ${currentPlan.name}. Le palier ${lowerPlan.name} pourrait suffire à la prochaine échéance.`,
        recommendedPlanId: lowerPlan.id,
        advisoryOnly: true,
      });
    }
  }

  // 6. Annual savings hint if monthly paid
  if (!currentPlan.isFreeTrial && subscription.billingCycle === 'monthly') {
    const yearlySavings = currentPlan.monthlyPriceFCFA * 12 - currentPlan.annualTotalFCFA;
    insights.push({
      id: 'annual_discount_opportunity',
      severity: 'opportunity',
      title: `Économisez ${yearlySavings.toLocaleString('fr-FR')} FCFA/an`,
      message: `En passant au cycle annuel (-20 %) sur ${currentPlan.name}, votre tarif revient à ${currentPlan.annualMonthlyEquivalentFCFA.toLocaleString('fr-FR')} FCFA/mois.`,
      recommendedPlanId: currentPlan.id,
      advisoryOnly: true,
    });
  }

  return insights;
}
