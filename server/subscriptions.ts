import { Response } from "express";
import { AuthenticatedRequest } from "./auth";
import { getServerDb } from "./db";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  PLAN_CATALOG,
  PLAN_CATALOG_BY_ID,
  CATALOG_VERSION,
  CATALOG_EFFECTIVE_DATE,
  CATALOG_APPROVAL_STATUS,
  LEGACY_PLAN_AUDIT_DIFFS,
  QUOTE_TTL_MINUTES,
  DEFAULT_TRIAL_DAYS,
  PlanId,
  BillingCycle,
  SubscriptionSnapshot,
  UsageMetersSnapshot,
  normalizePlanId,
  toLegacyPlanId,
  calculateBillingQuote,
  resolvePlanEntitlements,
  generateBillingInsights,
  addDaysUtc,
} from "../src/lib/subscriptionCatalog";
import {
  toPaystackSubunits,
  fromPaystackSubunits,
  getPaystackMode,
  isValidPaystackEmail,
  generateFikoPaymentReference,
} from "../src/lib/paystack";

export interface StoredBillingQuote {
  quoteId: string;
  companyId: string;
  ownerUid: string;
  fromPlanId: PlanId;
  fromCycle: BillingCycle;
  toPlanId: PlanId;
  toCycle: BillingCycle;
  transitionType: string;
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
  resourceOverages: any[];
  explanation: string;
  status: "OPEN" | "CONSUMED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
}

export function isQuoteExpired(quote: { expiresAt: string }, nowIso: string = new Date().toISOString()): boolean {
  const expMs = new Date(quote.expiresAt).getTime();
  const nowMs = new Date(nowIso).getTime();
  return Number.isNaN(expMs) || expMs <= nowMs;
}

export function isCatalogVersionCompatible(quoteCatalogVersion: string): boolean {
  return quoteCatalogVersion === CATALOG_VERSION;
}

/**
 * Pure state machine check: applies trial expiry or due scheduled downgrade
 * at a given timestamp without modifying unrelated fields.
 */
export function evaluateSubscriptionLifecycle(
  sub: SubscriptionSnapshot,
  nowIso: string = new Date().toISOString()
): { updated: SubscriptionSnapshot; changed: boolean; reason?: string } {
  const nowMs = new Date(nowIso).getTime();
  let next: SubscriptionSnapshot = { ...sub };
  let changed = false;
  let reason: string | undefined;

  // 1. Scheduled downgrade reached effectiveAt
  if (next.scheduledChange && new Date(next.scheduledChange.effectiveAt).getTime() <= nowMs) {
    const targetPlan = PLAN_CATALOG_BY_ID[normalizePlanId(next.scheduledChange.targetPlanId)];
    const targetCycle = next.scheduledChange.targetCycle;
    const periodEnd = next.scheduledChange.effectiveAt;
    next = {
      ...next,
      planId: targetPlan.id,
      billingCycle: targetCycle,
      status: targetPlan.isFreeTrial ? "expired" : "active",
      currentPeriodStart: periodEnd,
      currentPeriodEnd: targetPlan.isFreeTrial ? periodEnd : next.currentPeriodEnd,
      scheduledChange: null,
    };
    changed = true;
    reason = `scheduled_downgrade_applied:${targetPlan.id}`;
  }

  // 2. Trial expiration check
  if (next.planId === "essai" && next.status === "trialing" && next.trialEndsAt) {
    if (new Date(next.trialEndsAt).getTime() <= nowMs) {
      next = { ...next, status: "expired", trialUsed: true };
      changed = true;
      reason = "trial_expired";
    }
  }

  // 3. Cancel at period end reached
  if (
    next.cancelAtPeriodEnd &&
    next.status === "active" &&
    next.currentPeriodEnd &&
    new Date(next.currentPeriodEnd).getTime() <= nowMs
  ) {
    next = {
      ...next,
      status: "canceled",
      cancelAtPeriodEnd: false,
    };
    changed = true;
    reason = "canceled_at_period_end";
  }

  return { updated: next, changed, reason };
}

function getCurrentPeriodKey(nowIso: string = new Date().toISOString()): string {
  return nowIso.slice(0, 7); // YYYY-MM
}

async function resolveCompanyOwnerUid(db: any, companyId: string, fallbackUid: string): Promise<string> {
  try {
    const cSnap = await getDoc(doc(db, "companies", companyId));
    if (cSnap.exists() && cSnap.data()?.ownerId) {
      return String(cSnap.data().ownerId);
    }
  } catch {
    // ignore
  }
  return fallbackUid;
}

export async function loadOrInitializeCompanySubscription(
  db: any,
  companyId: string,
  ownerUid: string,
  nowIso: string = new Date().toISOString()
): Promise<SubscriptionSnapshot> {
  const subRef = doc(db, "subscriptions", companyId);
  const subSnap = await getDoc(subRef);

  if (!subSnap.exists()) {
    const trialEndsAt = addDaysUtc(nowIso, DEFAULT_TRIAL_DAYS);
    const initial: SubscriptionSnapshot = {
      companyId,
      planId: "essai",
      billingCycle: "monthly",
      status: "trialing",
      trialUsed: false,
      trialEndsAt,
      currentPeriodStart: nowIso,
      currentPeriodEnd: trialEndsAt,
      availableCreditFCFA: 0,
      cancelAtPeriodEnd: false,
      scheduledChange: null,
      paymentMode: "none",
      catalogVersion: CATALOG_VERSION,
    };
    await setDoc(subRef, {
      ...initial,
      ownerUid,
      plan: toLegacyPlanId("essai"),
      maxContacts: PLAN_CATALOG_BY_ID.essai.quotas.maxLeads,
      messagesSent: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return initial;
  }

  const raw = subSnap.data();
  const planId = normalizePlanId(raw.planId || raw.plan);
  const rawStatus = String(raw.status || (planId === "essai" ? "trialing" : "active"));
  const normalizedStatus = (
    rawStatus === "active" && planId === "essai"
      ? "trialing"
      : ["trialing", "active", "pending_payment", "past_due", "canceled", "expired"].includes(rawStatus)
      ? rawStatus
      : "active"
  ) as SubscriptionSnapshot["status"];

  const createdAtIso =
    typeof raw.createdAt === "string" ? raw.createdAt : nowIso;
  const trialEndsAt =
    raw.trialEndsAt || (planId === "essai" ? addDaysUtc(createdAtIso, DEFAULT_TRIAL_DAYS) : null);

  const hydrated: SubscriptionSnapshot = {
    companyId,
    planId,
    billingCycle: raw.billingCycle === "annual" ? "annual" : "monthly",
    status: normalizedStatus,
    trialUsed: typeof raw.trialUsed === "boolean" ? raw.trialUsed : planId !== "essai",
    trialEndsAt,
    currentPeriodStart: raw.currentPeriodStart || createdAtIso,
    currentPeriodEnd: raw.currentPeriodEnd || trialEndsAt || addDaysUtc(createdAtIso, 30),
    availableCreditFCFA: Number(raw.availableCreditFCFA || 0),
    cancelAtPeriodEnd: Boolean(raw.cancelAtPeriodEnd),
    scheduledChange: raw.scheduledChange || null,
    paymentMode: raw.paymentMode || (planId === "essai" ? "none" : "manual_renewal"),
    catalogVersion: raw.catalogVersion || CATALOG_VERSION,
  };

  const lifecycle = evaluateSubscriptionLifecycle(hydrated, nowIso);
  if (lifecycle.changed) {
    await updateDoc(subRef, {
      ...lifecycle.updated,
      plan: toLegacyPlanId(lifecycle.updated.planId),
      updatedAt: nowIso,
    });
    await recordBillingAuditEvent(db, {
      companyId,
      ownerUid,
      actorUid: "system",
      action: lifecycle.reason || "lifecycle_transition",
      details: {
        fromPlan: hydrated.planId,
        toPlan: lifecycle.updated.planId,
        status: lifecycle.updated.status,
      },
      timestamp: nowIso,
    });
  }

  return lifecycle.updated;
}

export async function computeLiveUsageMeters(
  db: any,
  companyId: string,
  ownerUid: string,
  nowIso: string = new Date().toISOString()
): Promise<UsageMetersSnapshot> {
  const periodKey = getCurrentPeriodKey(nowIso);

  let leadsCount = 0;
  let monthlyConversations = 0;
  let aiAgents = 1;
  let campaignsThisMonth = 0;
  let whatsappConnections = 0;

  try {
    const [leadsSnap, msgsSnap, agentsSnap, campaignsSnap, companySnap] = await Promise.all([
      getDocs(query(collection(db, "leads"), where("companyId", "==", companyId))),
      getDocs(query(collection(db, "messages"), where("companyId", "==", companyId))),
      getDocs(query(collection(db, "agents"), where("companyId", "==", companyId))),
      getDocs(query(collection(db, "campaigns"), where("companyId", "==", companyId))),
      getDoc(doc(db, "companies", companyId)),
    ]);

    leadsCount = leadsSnap.size;
    aiAgents = Math.max(agentsSnap.size, 1);

    const uniqueConversations = new Set<string>();
    msgsSnap.forEach((d: any) => {
      const m = d.data();
      if (m.conversationId) uniqueConversations.add(String(m.conversationId));
    });
    monthlyConversations = Math.max(uniqueConversations.size, msgsSnap.size);

    campaignsSnap.forEach((d: any) => {
      const c = d.data();
      const created = typeof c.createdAt === "string" ? c.createdAt : nowIso;
      if (created.startsWith(periodKey)) campaignsThisMonth += 1;
    });

    if (companySnap.exists()) {
      const cData = companySnap.data();
      if (Array.isArray(cData.whatsappNumbers)) {
        whatsappConnections = cData.whatsappNumbers.length;
      } else if (cData.whatsappNumber) {
        whatsappConnections = 1;
      }
    }
  } catch (err: any) {
    console.warn("[Subscriptions UsageMeters] Fallback partial read:", err.message);
  }

  const snapshot: UsageMetersSnapshot = {
    whatsappConnections,
    monthlyConversations,
    leadsCount,
    aiAgents,
    campaignsThisMonth,
    periodKey,
    updatedAt: nowIso,
  };

  try {
    await setDoc(doc(db, "usage_meters", companyId), {
      companyId,
      ownerUid,
      ...snapshot,
    });
  } catch {
    // Non-blocking meter cache write
  }

  return snapshot;
}

export async function syncCompanyEntitlements(
  db: any,
  subscription: SubscriptionSnapshot,
  usageMeters: UsageMetersSnapshot,
  ownerUid: string,
  suspendedExceedingResources: string[] = [],
  nowIso: string = new Date().toISOString()
) {
  const entitlements = resolvePlanEntitlements({
    companyId: subscription.companyId,
    planId: subscription.planId,
    status: subscription.status,
    usageMeters,
    suspendedExceedingResources,
    nowIso,
  });

  await setDoc(doc(db, "entitlements", subscription.companyId), {
    ...entitlements,
    ownerUid,
  });

  return entitlements;
}

async function recordBillingAuditEvent(
  db: any,
  event: {
    companyId: string;
    ownerUid: string;
    actorUid: string;
    action: string;
    details: Record<string, any>;
    timestamp: string;
  }
) {
  const id = `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  try {
    await setDoc(doc(db, "billing_audit_events", id), {
      id,
      ...event,
    });
  } catch (err: any) {
    console.warn("[Billing Audit] Write warning:", err.message);
  }
}

/**
 * Reusable server entitlement guard for CRM / WhatsApp endpoints.
 */
export async function checkCompanyQuota(
  companyId: string,
  capability: "create_lead" | "send_message"
): Promise<{ allowed: boolean; reason?: string }> {
  if (!companyId || companyId === "default-company") {
    return { allowed: true };
  }

  try {
    const db = await getServerDb();
    const entSnap = await getDoc(doc(db, "entitlements", companyId));
    if (!entSnap.exists()) return { allowed: true };

    const ent = entSnap.data();
    if (ent.status === "expired" || ent.status === "canceled") {
      return {
        allowed: false,
        reason: "Votre abonnement Fiko Connect est expiré ou résilié. Renouvelez votre offre dans « Nos Offres ».",
      };
    }
    if (capability === "create_lead" && ent.canCreateNewLeads === false) {
      return {
        allowed: false,
        reason: `Plafond de leads (${ent.maxLeads}) atteint sur votre forfait ${ent.planId}. Passez à une offre supérieure.`,
      };
    }
    if (capability === "send_message" && ent.canSendAutoMessages === false) {
      return {
        allowed: false,
        reason: `Plafond mensuel de conversations (${ent.maxMonthlyConversations}) atteint sur votre forfait ${ent.planId}.`,
      };
    }
  } catch {
    // Fail open only on transient DB read error so primary CRM never crashes
  }

  return { allowed: true };
}

/**
 * Idempotent settlement engine for confirmed subscription payments (from Paystack webhook or /verify or /reconcile).
 */
export async function applyPaidSubscriptionSettlement(params: {
  reference: string;
  paidAmountSubunits: number;
  currency: string;
  paystackId?: number | string;
  channel?: string;
  paidAt?: string;
  gatewayResponse?: string;
}): Promise<{
  settled: boolean;
  alreadySettled: boolean;
  error?: string;
  companyId?: string;
  planId?: PlanId;
  invoiceId?: string;
}> {
  const { reference, paidAmountSubunits, currency, paystackId, channel, paidAt, gatewayResponse } = params;
  const db = await getServerDb();
  const txRef = doc(db, "transactions", reference);
  const txSnap = await getDoc(txRef);

  if (!txSnap.exists()) {
    return { settled: false, alreadySettled: false, error: "TRANSACTION_NOT_FOUND" };
  }

  const tx = txSnap.data() as any;

  // Idempotency guard: never double-apply credits or extend period twice
  if (tx.status === "SUCCESS" && tx.subscriptionSettled === true) {
    return {
      settled: true,
      alreadySettled: true,
      companyId: tx.companyId,
      planId: tx.targetPlanId,
      invoiceId: tx.invoiceId,
    };
  }

  // Strict amount & currency validation
  if (currency !== "XOF" || paidAmountSubunits !== tx.amountPaystackSubunits) {
    await updateDoc(txRef, {
      status: "FAILED",
      failureReason: `Incohérence paiement abonnement : reçu ${paidAmountSubunits} ${currency} vs attendu ${tx.amountPaystackSubunits} XOF`,
    });
    return { settled: false, alreadySettled: false, error: "AMOUNT_OR_CURRENCY_MISMATCH" };
  }

  const nowIso = new Date().toISOString();
  const companyId = String(tx.companyId);
  const ownerUid = String(tx.ownerUid || (await resolveCompanyOwnerUid(db, companyId, "system")));
  const quoteId = String(tx.quoteId || "");
  const changeRequestId = String(tx.changeRequestId || "");

  const quoteSnap = quoteId ? await getDoc(doc(db, "billing_quotes", quoteId)) : null;
  const quoteData = quoteSnap && quoteSnap.exists() ? (quoteSnap.data() as StoredBillingQuote) : null;

  const targetPlanId = normalizePlanId(quoteData?.toPlanId || tx.targetPlanId);
  const targetCycle: BillingCycle = quoteData?.toCycle || tx.targetCycle || "monthly";
  const targetPlan = PLAN_CATALOG_BY_ID[targetPlanId];

  const currentSub = await loadOrInitializeCompanySubscription(db, companyId, ownerUid, nowIso);
  const usageMeters = await computeLiveUsageMeters(db, companyId, ownerUid, nowIso);

  // Re-verify period anchors cleanly
  const newPeriodStart = quoteData?.newPeriodStart || nowIso;
  const newPeriodEnd = quoteData?.newPeriodEnd || addDaysUtc(nowIso, targetCycle === "annual" ? 365 : 30);
  const remainingCreditAfterFCFA =
    typeof quoteData?.remainingCreditAfterFCFA === "number"
      ? quoteData.remainingCreditAfterFCFA
      : currentSub.availableCreditFCFA;

  const isRecurring = channel === "card" ? "manual_renewal" : "manual_renewal";
  const nextSub: SubscriptionSnapshot = {
    companyId,
    planId: targetPlan.id,
    billingCycle: targetCycle,
    status: "active",
    trialUsed: true,
    trialEndsAt: currentSub.trialEndsAt || null,
    currentPeriodStart: newPeriodStart,
    currentPeriodEnd: newPeriodEnd,
    availableCreditFCFA: remainingCreditAfterFCFA,
    cancelAtPeriodEnd: false,
    scheduledChange: null,
    paymentMode: isRecurring,
    catalogVersion: CATALOG_VERSION,
  };

  // 1. Update Subscription + Legacy Company document
  await setDoc(doc(db, "subscriptions", companyId), {
    ...nextSub,
    ownerUid,
    plan: toLegacyPlanId(targetPlan.id),
    maxContacts: targetPlan.quotas.maxLeads,
    lastTransactionRef: reference,
    updatedAt: nowIso,
  });

  try {
    await updateDoc(doc(db, "companies", companyId), {
      plan: toLegacyPlanId(targetPlan.id),
      updatedAt: nowIso,
    });
  } catch {
    // Company doc optional update
  }

  // 2. Sync Entitlements immediately
  await syncCompanyEntitlements(db, nextSub, usageMeters, ownerUid, [], nowIso);

  // 3. Issue verified Invoice + Ledger entries
  const invoiceId = `INV_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const paidCommercial = fromPaystackSubunits(paidAmountSubunits);
  const mode = tx.mode || getPaystackMode(process.env.PAYSTACK_SECRET_KEY);

  await setDoc(doc(db, "invoices", invoiceId), {
    id: invoiceId,
    invoiceNumber: `FIKO-${new Date().getUTCFullYear()}-${invoiceId.slice(-6)}`,
    companyId,
    ownerUid,
    planId: targetPlan.id,
    planName: targetPlan.name,
    billingCycle: targetCycle,
    description: `${targetPlan.name} (${targetCycle === "annual" ? "Annuel -20%" : "Mensuel"}) — Catalogue ${CATALOG_VERSION}`,
    subtotalFCFA: quoteData?.targetCyclePriceFCFA ?? paidCommercial,
    unusedCreditAppliedFCFA: quoteData?.unusedCreditFCFA ?? 0,
    availableCreditAppliedFCFA: quoteData?.availableCreditAppliedFCFA ?? 0,
    taxFCFA: quoteData?.taxFCFA ?? 0,
    totalPaidFCFA: paidCommercial,
    currency: "XOF",
    status: "PAID",
    transactionReference: reference,
    paymentChannel: channel || "Paystack",
    mode,
    legalEntity: {
      issuer: "Fiko Connect / Koffmann Capital Group",
      taxId: "À configurer avant mise en production",
    },
    issuedAt: nowIso,
    paidAt: paidAt || nowIso,
  });

  const ledgerChargeId = `LDG_${Date.now()}_CHG`;
  await setDoc(doc(db, "billing_ledger", ledgerChargeId), {
    id: ledgerChargeId,
    companyId,
    ownerUid,
    entryType: "CHARGE",
    amountFCFA: paidCommercial,
    currency: "XOF",
    reference,
    invoiceId,
    description: `Paiement Paystack confirmé — ${targetPlan.name} (${targetCycle})`,
    createdAt: nowIso,
  });

  if (quoteData && quoteData.totalCreditConsumedFCFA > 0) {
    const ledgerCreditId = `LDG_${Date.now()}_CRD`;
    await setDoc(doc(db, "billing_ledger", ledgerCreditId), {
      id: ledgerCreditId,
      companyId,
      ownerUid,
      entryType: "CREDIT_APPLIED",
      amountFCFA: -quoteData.totalCreditConsumedFCFA,
      currency: "XOF",
      reference,
      invoiceId,
      description: `Crédit prorata/solde appliqué sur upgrade vers ${targetPlan.name}`,
      createdAt: nowIso,
    });
  }

  // 4. Mark quote & change request completed
  if (quoteId) {
    try {
      await updateDoc(doc(db, "billing_quotes", quoteId), { status: "CONSUMED" });
    } catch {
      // ignore
    }
  }
  if (changeRequestId) {
    try {
      await updateDoc(doc(db, "subscription_change_requests", changeRequestId), {
        status: "COMPLETED",
        invoiceId,
        completedAt: nowIso,
        updatedAt: nowIso,
      });
    } catch {
      // ignore
    }
  }

  // 5. Mark transaction settled
  await updateDoc(txRef, {
    status: "SUCCESS",
    paystackId: paystackId || null,
    paidAt: paidAt || nowIso,
    paymentMethod: channel || "paystack",
    gatewayResponse: gatewayResponse || "Successful",
    verifiedAt: nowIso,
    subscriptionSettled: true,
    invoiceId,
  });

  await recordBillingAuditEvent(db, {
    companyId,
    ownerUid,
    actorUid: tx.actorUid || ownerUid,
    action: "SUBSCRIPTION_SETTLED",
    details: {
      reference,
      targetPlanId: targetPlan.id,
      targetCycle,
      amountPaidFCFA: paidCommercial,
      invoiceId,
    },
    timestamp: nowIso,
  });

  return {
    settled: true,
    alreadySettled: false,
    companyId,
    planId: targetPlan.id,
    invoiceId,
  };
}

/**
 * GET /api/subscriptions/overview
 */
export async function getSubscriptionOverview(req: AuthenticatedRequest, res: Response) {
  const companyId = req.user?.companyId;
  const uid = req.user?.uid;
  if (!companyId || !uid) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
  }

  try {
    const db = await getServerDb();
    const nowIso = new Date().toISOString();
    const ownerUid = await resolveCompanyOwnerUid(db, companyId, uid);

    const subscription = await loadOrInitializeCompanySubscription(db, companyId, ownerUid, nowIso);
    const usageMeters = await computeLiveUsageMeters(db, companyId, ownerUid, nowIso);
    const entitlements = await syncCompanyEntitlements(db, subscription, usageMeters, ownerUid, [], nowIso);
    const insights = generateBillingInsights(subscription, usageMeters, nowIso);

    const [invSnap, ledgerSnap, reqSnap] = await Promise.all([
      getDocs(query(collection(db, "invoices"), where("companyId", "==", companyId))),
      getDocs(query(collection(db, "billing_ledger"), where("companyId", "==", companyId))),
      getDocs(query(collection(db, "subscription_change_requests"), where("companyId", "==", companyId))),
    ]);

    const invoices = invSnap.docs
      .map((d) => d.data())
      .sort((a: any, b: any) => String(b.issuedAt || "").localeCompare(String(a.issuedAt || "")));
    const ledger = ledgerSnap.docs
      .map((d) => d.data())
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const changeHistory = reqSnap.docs
      .map((d) => d.data())
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const paystackConfigured = !!(secretKey && secretKey.trim().length > 0);

    return res.json({
      catalogVersion: CATALOG_VERSION,
      catalogEffectiveDate: CATALOG_EFFECTIVE_DATE,
      catalogApprovalStatus: CATALOG_APPROVAL_STATUS,
      legacyAuditDiffs: LEGACY_PLAN_AUDIT_DIFFS,
      catalog: PLAN_CATALOG,
      paystack: {
        configured: paystackConfigured,
        mode: getPaystackMode(secretKey),
        currency: "XOF",
        supportsMobileMoneyRecurring: false,
      },
      subscription,
      entitlements,
      usageMeters,
      insights,
      invoices,
      ledger,
      changeHistory,
    });
  } catch (err: any) {
    console.error("[Subscriptions Overview Error]", err);
    return res.status(500).json({
      error: "OVERVIEW_ERROR",
      message: "Impossible de charger l'espace Nos Offres : " + err.message,
    });
  }
}

/**
 * POST /api/subscriptions/quote
 */
export async function createSubscriptionQuote(req: AuthenticatedRequest, res: Response) {
  const companyId = req.user?.companyId;
  const uid = req.user?.uid;
  if (!companyId || !uid) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
  }

  const { targetPlanId, targetCycle = "monthly", companyId: bodyCompanyId } = req.body || {};

  // Cross-tenant spoofing guard
  if (bodyCompanyId && bodyCompanyId !== companyId) {
    return res.status(403).json({
      error: "CROSS_TENANT_FORBIDDEN",
      message: "Accès refusé : impossible de générer un devis pour une autre entreprise.",
    });
  }

  if (!targetPlanId || !["essai", "starter", "growth", "pro", "elite", "free", "business", "scale"].includes(String(targetPlanId).toLowerCase())) {
    return res.status(400).json({ error: "INVALID_PLAN", message: "Offre cible invalide." });
  }
  if (targetCycle !== "monthly" && targetCycle !== "annual") {
    return res.status(400).json({ error: "INVALID_CYCLE", message: "Périodicité invalide (monthly | annual)." });
  }

  try {
    const db = await getServerDb();
    const nowIso = new Date().toISOString();
    const ownerUid = await resolveCompanyOwnerUid(db, companyId, uid);
    const subscription = await loadOrInitializeCompanySubscription(db, companyId, ownerUid, nowIso);
    const usageMeters = await computeLiveUsageMeters(db, companyId, ownerUid, nowIso);

    const canonicalTarget = normalizePlanId(targetPlanId);
    const quote = calculateBillingQuote({
      subscription,
      targetPlanId: canonicalTarget,
      targetCycle,
      usageMeters,
      nowIso,
    });

    const quoteId = `QT_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString();

    const stored: StoredBillingQuote = {
      quoteId,
      companyId,
      ownerUid,
      fromPlanId: quote.fromPlanId,
      fromCycle: quote.fromCycle,
      toPlanId: quote.toPlanId,
      toCycle: quote.toCycle,
      transitionType: quote.transitionType,
      catalogVersion: CATALOG_VERSION,
      targetCyclePriceFCFA: quote.targetCyclePriceFCFA,
      unusedCreditFCFA: quote.unusedCreditFCFA,
      availableCreditAppliedFCFA: quote.availableCreditAppliedFCFA,
      totalCreditConsumedFCFA: quote.totalCreditConsumedFCFA,
      remainingCreditAfterFCFA: quote.remainingCreditAfterFCFA,
      taxFCFA: quote.taxFCFA,
      amountDueFCFA: quote.amountDueFCFA,
      effectiveAt: quote.effectiveAt,
      newPeriodStart: quote.newPeriodStart,
      newPeriodEnd: quote.newPeriodEnd,
      nextRenewalDate: quote.nextRenewalDate,
      nextRenewalAmountFCFA: quote.nextRenewalAmountFCFA,
      gainedFeatures: quote.gainedFeatures,
      lostFeatures: quote.lostFeatures,
      resourceOverages: quote.resourceOverages,
      explanation: quote.explanation,
      status: "OPEN",
      expiresAt,
      createdAt: nowIso,
    };

    await setDoc(doc(db, "billing_quotes", quoteId), stored);

    return res.json({
      status: "success",
      quoteId,
      expiresAt,
      quote: stored,
    });
  } catch (err: any) {
    return res.status(400).json({
      error: "QUOTE_FAILED",
      message: err.message || "Impossible de calculer le devis.",
    });
  }
}

/**
 * POST /api/subscriptions/checkout
 */
export async function checkoutSubscriptionChange(req: AuthenticatedRequest, res: Response) {
  const companyId = req.user?.companyId;
  const uid = req.user?.uid;
  const userEmail = req.user?.email || req.body?.billingEmail;
  if (!companyId || !uid) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
  }

  const { quoteId, selectedKeepResources = [] } = req.body || {};
  if (!quoteId) {
    return res.status(400).json({ error: "MISSING_QUOTE_ID", message: "Identifiant quoteId requis." });
  }

  try {
    const db = await getServerDb();
    const nowIso = new Date().toISOString();
    const quoteRef = doc(db, "billing_quotes", String(quoteId));
    const quoteSnap = await getDoc(quoteRef);

    if (!quoteSnap.exists()) {
      return res.status(404).json({ error: "QUOTE_NOT_FOUND", message: "Devis introuvable." });
    }

    const quote = quoteSnap.data() as StoredBillingQuote;
    if (quote.companyId !== companyId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Ce devis appartient à une autre entreprise." });
    }
    if (quote.status !== "OPEN") {
      return res.status(409).json({
        error: "QUOTE_ALREADY_USED",
        message: "Ce devis a déjà été consommé ou annulé. Veuillez générer un nouveau devis.",
      });
    }
    if (isQuoteExpired(quote, nowIso)) {
      await updateDoc(quoteRef, { status: "EXPIRED" });
      return res.status(410).json({
        error: "QUOTE_EXPIRED",
        message: "Le devis a expiré (validité 15 minutes). Recalculez votre changement d’offre.",
      });
    }
    if (!isCatalogVersionCompatible(quote.catalogVersion)) {
      return res.status(409).json({
        error: "CATALOG_VERSION_CHANGED",
        message: "Le catalogue tarifaire a changé depuis la génération de ce devis. Actualisez votre devis.",
      });
    }
    if (quote.transitionType === "no_op") {
      return res.status(400).json({
        error: "ALREADY_ON_PLAN",
        message: "Cette offre est déjà active sur votre espace.",
      });
    }

    // Check duplicate active checkout on same quote
    const existingReqSnap = await getDocs(
      query(
        collection(db, "subscription_change_requests"),
        where("companyId", "==", companyId),
        where("quoteId", "==", String(quoteId))
      )
    );
    const hasPending = existingReqSnap.docs.some((d) => d.data().status === "PENDING_PAYMENT");
    if (hasPending) {
      return res.status(409).json({
        error: "DUPLICATE_CHECKOUT",
        message: "Une tentative de paiement pour ce devis est déjà en attente de confirmation.",
      });
    }

    const ownerUid = await resolveCompanyOwnerUid(db, companyId, uid);
    const currentSub = await loadOrInitializeCompanySubscription(db, companyId, ownerUid, nowIso);
    const usageMeters = await computeLiveUsageMeters(db, companyId, ownerUid, nowIso);
    const changeRequestId = `SCR_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    // PATH A: Scheduled Downgrade (always effective at period end, zero charge)
    if (quote.transitionType === "downgrade") {
      const scheduledChange = {
        requestId: changeRequestId,
        targetPlanId: quote.toPlanId,
        targetCycle: quote.toCycle,
        effectiveAt: quote.effectiveAt,
        createdAt: nowIso,
      };

      await updateDoc(doc(db, "subscriptions", companyId), {
        scheduledChange,
        updatedAt: nowIso,
      });

      await setDoc(doc(db, "subscription_change_requests", changeRequestId), {
        id: changeRequestId,
        companyId,
        ownerUid,
        quoteId: quote.quoteId,
        type: "downgrade",
        fromPlanId: quote.fromPlanId,
        toPlanId: quote.toPlanId,
        fromCycle: quote.fromCycle,
        toCycle: quote.toCycle,
        amountDueFCFA: 0,
        status: "SCHEDULED",
        effectiveAt: quote.effectiveAt,
        resourceOverages: quote.resourceOverages,
        selectedKeepResources,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      await updateDoc(quoteRef, { status: "CONSUMED" });

      await recordBillingAuditEvent(db, {
        companyId,
        ownerUid,
        actorUid: uid,
        action: "DOWNGRADE_SCHEDULED",
        details: { changeRequestId, toPlanId: quote.toPlanId, effectiveAt: quote.effectiveAt },
        timestamp: nowIso,
      });

      return res.json({
        status: "scheduled",
        changeRequestId,
        effectiveAt: quote.effectiveAt,
        message: quote.explanation,
      });
    }

    // PATH B: Immediate zero-FCFA settlement (Trial or 100% credit covered)
    if (quote.amountDueFCFA === 0) {
      const targetPlan = PLAN_CATALOG_BY_ID[quote.toPlanId];
      const nextSub: SubscriptionSnapshot = {
        companyId,
        planId: targetPlan.id,
        billingCycle: quote.toCycle,
        status: targetPlan.isFreeTrial ? "trialing" : "active",
        trialUsed: true,
        trialEndsAt: targetPlan.isFreeTrial ? quote.newPeriodEnd : currentSub.trialEndsAt || null,
        currentPeriodStart: quote.newPeriodStart,
        currentPeriodEnd: quote.newPeriodEnd,
        availableCreditFCFA: quote.remainingCreditAfterFCFA,
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        paymentMode: targetPlan.isFreeTrial ? "none" : "manual_renewal",
        catalogVersion: CATALOG_VERSION,
      };

      await setDoc(doc(db, "subscriptions", companyId), {
        ...nextSub,
        ownerUid,
        plan: toLegacyPlanId(targetPlan.id),
        maxContacts: targetPlan.quotas.maxLeads,
        updatedAt: nowIso,
      });

      await syncCompanyEntitlements(db, nextSub, usageMeters, ownerUid, [], nowIso);

      const invoiceId = `INV_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await setDoc(doc(db, "invoices", invoiceId), {
        id: invoiceId,
        invoiceNumber: `FIKO-${new Date().getUTCFullYear()}-${invoiceId.slice(-6)}`,
        companyId,
        ownerUid,
        planId: targetPlan.id,
        planName: targetPlan.name,
        billingCycle: quote.toCycle,
        description: `${targetPlan.name} réglé intégralement par crédit / essai`,
        subtotalFCFA: quote.targetCyclePriceFCFA,
        unusedCreditAppliedFCFA: quote.unusedCreditFCFA,
        availableCreditAppliedFCFA: quote.availableCreditAppliedFCFA,
        taxFCFA: 0,
        totalPaidFCFA: 0,
        currency: "XOF",
        status: "PAID",
        transactionReference: `CREDIT_${changeRequestId}`,
        paymentChannel: targetPlan.isFreeTrial ? "Essai 7J" : "Crédit Compte",
        mode: "live",
        legalEntity: {
          issuer: "Fiko Connect / Koffmann Capital Group",
          taxId: "À configurer avant mise en production",
        },
        issuedAt: nowIso,
        paidAt: nowIso,
      });

      await setDoc(doc(db, "subscription_change_requests", changeRequestId), {
        id: changeRequestId,
        companyId,
        ownerUid,
        quoteId: quote.quoteId,
        type: quote.transitionType,
        fromPlanId: quote.fromPlanId,
        toPlanId: quote.toPlanId,
        fromCycle: quote.fromCycle,
        toCycle: quote.toCycle,
        amountDueFCFA: 0,
        status: "COMPLETED",
        invoiceId,
        effectiveAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      await updateDoc(quoteRef, { status: "CONSUMED" });

      return res.json({
        status: "activated",
        changeRequestId,
        invoiceId,
        planId: targetPlan.id,
        message: `${targetPlan.name} activé immédiatement.`,
      });
    }

    // PATH C: Paid Checkout via Paystack
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey || !secretKey.trim()) {
      return res.status(503).json({
        error: "GATEWAY_UNCONFIGURED",
        message:
          "La passerelle Paystack n'est pas configurée côté serveur (PAYSTACK_SECRET_KEY absente). Aucun paiement ne peut être simulé.",
      });
    }

    const emailToCharge = (userEmail && isValidPaystackEmail(userEmail))
      ? userEmail.trim().toLowerCase()
      : `${companyId}@clients.fiko-connect.com`;

    const mode = getPaystackMode(secretKey);
    const amountSubunits = toPaystackSubunits(quote.amountDueFCFA);
    const reference = generateFikoPaymentReference(`SUB_${companyId}`);
    const appUrl = process.env.APP_URL || "http://localhost:3000";

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: emailToCharge,
        amount: amountSubunits,
        currency: "XOF",
        reference,
        callback_url: `${appUrl}/?paystack_ref=${reference}&module=nos_offres`,
        metadata: {
          purpose: "subscription",
          companyId,
          ownerUid,
          quoteId: quote.quoteId,
          changeRequestId,
          targetPlanId: quote.toPlanId,
          targetCycle: quote.toCycle,
          catalogVersion: CATALOG_VERSION,
          amountCommercial: quote.amountDueFCFA,
        },
      }),
    });

    const paystackData: any = await paystackRes.json();
    if (!paystackRes.ok || !paystackData.status) {
      return res.status(502).json({
        error: "PAYSTACK_INITIALIZATION_FAILED",
        message: paystackData.message || "Échec de l’initialisation Paystack.",
      });
    }

    await setDoc(doc(db, "transactions", reference), {
      reference,
      purpose: "subscription",
      companyId,
      ownerUid,
      actorUid: uid,
      quoteId: quote.quoteId,
      changeRequestId,
      targetPlanId: quote.toPlanId,
      targetCycle: quote.toCycle,
      customerEmail: emailToCharge,
      amount: quote.amountDueFCFA,
      amountCommercial: quote.amountDueFCFA,
      amountPaystackSubunits: amountSubunits,
      currency: "XOF",
      mode,
      status: "PENDING",
      subscriptionSettled: false,
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code,
      createdAt: nowIso,
    });

    await setDoc(doc(db, "subscription_change_requests", changeRequestId), {
      id: changeRequestId,
      companyId,
      ownerUid,
      quoteId: quote.quoteId,
      type: quote.transitionType,
      fromPlanId: quote.fromPlanId,
      toPlanId: quote.toPlanId,
      fromCycle: quote.fromCycle,
      toCycle: quote.toCycle,
      amountDueFCFA: quote.amountDueFCFA,
      status: "PENDING_PAYMENT",
      transactionReference: reference,
      effectiveAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    await recordBillingAuditEvent(db, {
      companyId,
      ownerUid,
      actorUid: uid,
      action: "SUBSCRIPTION_CHECKOUT_INITIATED",
      details: { reference, quoteId: quote.quoteId, amountDueFCFA: quote.amountDueFCFA, mode },
      timestamp: nowIso,
    });

    return res.json({
      status: "payment_required",
      reference,
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code,
      amountDueFCFA: quote.amountDueFCFA,
      currency: "XOF",
      mode,
      changeRequestId,
    });
  } catch (err: any) {
    console.error("[Subscription Checkout Error]", err);
    return res.status(500).json({
      error: "CHECKOUT_ERROR",
      message: "Erreur lors de la validation du changement d’offre : " + err.message,
    });
  }
}

/**
 * POST /api/subscriptions/downgrade/cancel
 */
export async function cancelScheduledChange(req: AuthenticatedRequest, res: Response) {
  const companyId = req.user?.companyId;
  const uid = req.user?.uid;
  if (!companyId || !uid) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
  }

  try {
    const db = await getServerDb();
    const nowIso = new Date().toISOString();
    const ownerUid = await resolveCompanyOwnerUid(db, companyId, uid);
    const sub = await loadOrInitializeCompanySubscription(db, companyId, ownerUid, nowIso);

    if (!sub.scheduledChange) {
      return res.status(404).json({
        error: "NO_SCHEDULED_CHANGE",
        message: "Aucun changement programmé à annuler.",
      });
    }

    const requestId = sub.scheduledChange.requestId;
    await updateDoc(doc(db, "subscriptions", companyId), {
      scheduledChange: null,
      updatedAt: nowIso,
    });

    if (requestId) {
      try {
        await updateDoc(doc(db, "subscription_change_requests", requestId), {
          status: "CANCELLED",
          updatedAt: nowIso,
        });
      } catch {
        // ignore
      }
    }

    await recordBillingAuditEvent(db, {
      companyId,
      ownerUid,
      actorUid: uid,
      action: "SCHEDULED_DOWNGRADE_CANCELLED",
      details: { requestId },
      timestamp: nowIso,
    });

    return res.json({
      status: "success",
      message: "Le changement programmé a été annulé. Votre offre actuelle reste active.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: "CANCEL_FAILED", message: err.message });
  }
}

/**
 * POST /api/subscriptions/cancel
 */
export async function cancelSubscriptionAtPeriodEnd(req: AuthenticatedRequest, res: Response) {
  const companyId = req.user?.companyId;
  const uid = req.user?.uid;
  if (!companyId || !uid) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
  }

  try {
    const db = await getServerDb();
    const nowIso = new Date().toISOString();
    const ownerUid = await resolveCompanyOwnerUid(db, companyId, uid);
    const sub = await loadOrInitializeCompanySubscription(db, companyId, ownerUid, nowIso);

    if (sub.planId === "essai" || sub.status === "expired" || sub.status === "canceled") {
      return res.status(400).json({
        error: "NOTHING_TO_CANCEL",
        message: "Aucun abonnement payant actif à résilier.",
      });
    }

    await updateDoc(doc(db, "subscriptions", companyId), {
      cancelAtPeriodEnd: true,
      scheduledChange: null,
      updatedAt: nowIso,
    });

    await recordBillingAuditEvent(db, {
      companyId,
      ownerUid,
      actorUid: uid,
      action: "CANCEL_AT_PERIOD_END_REQUESTED",
      details: { effectiveAt: sub.currentPeriodEnd },
      timestamp: nowIso,
    });

    return res.json({
      status: "success",
      effectiveAt: sub.currentPeriodEnd,
      message: `Résiliation enregistrée. Vos accès ${PLAN_CATALOG_BY_ID[sub.planId].name} restent actifs jusqu’au ${String(sub.currentPeriodEnd || "").slice(0, 10)}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "CANCEL_FAILED", message: err.message });
  }
}

/**
 * POST /api/subscriptions/reconcile/:reference
 */
export async function reconcileSubscriptionPayment(req: AuthenticatedRequest, res: Response) {
  const companyId = req.user?.companyId;
  const uid = req.user?.uid;
  const { reference } = req.params;

  if (!companyId || !uid) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
  }
  if (!reference) {
    return res.status(400).json({ error: "MISSING_REFERENCE", message: "Référence requise." });
  }

  try {
    const db = await getServerDb();
    const txSnap = await getDoc(doc(db, "transactions", reference));
    if (!txSnap.exists()) {
      return res.status(404).json({ error: "TRANSACTION_NOT_FOUND", message: "Transaction introuvable." });
    }
    const tx = txSnap.data() as any;
    if (tx.companyId !== companyId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé à cette transaction." });
    }

    if (tx.status === "SUCCESS" && !tx.subscriptionSettled) {
      const settlement = await applyPaidSubscriptionSettlement({
        reference,
        paidAmountSubunits: tx.amountPaystackSubunits,
        currency: tx.currency || "XOF",
        paystackId: tx.paystackId,
        channel: tx.paymentMethod,
        paidAt: tx.paidAt,
      });
      return res.json({ status: "reconciled", ...settlement });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return res.status(503).json({
        error: "GATEWAY_UNCONFIGURED",
        message: "Clé PAYSTACK_SECRET_KEY absente pour vérifier auprès de Paystack.",
      });
    }

    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const result: any = await paystackRes.json();
    if (!paystackRes.ok || !result.status) {
      return res.status(404).json({
        error: "PAYSTACK_NOT_FOUND",
        message: result.message || "Transaction introuvable sur Paystack.",
      });
    }

    const data = result.data;
    if (data.status === "success") {
      const settlement = await applyPaidSubscriptionSettlement({
        reference,
        paidAmountSubunits: data.amount,
        currency: data.currency,
        paystackId: data.id,
        channel: data.channel,
        paidAt: data.paid_at,
        gatewayResponse: data.gateway_response,
      });
      return res.json({ status: "settled", gatewayStatus: data.status, ...settlement });
    }

    return res.json({
      status: "pending_or_failed",
      gatewayStatus: data.status,
      settled: false,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "RECONCILE_ERROR", message: err.message });
  }
}
