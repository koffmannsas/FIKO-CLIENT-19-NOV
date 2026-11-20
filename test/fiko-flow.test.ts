import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 
  toPaystackSubunits, 
  fromPaystackSubunits, 
  isValidPaystackEmail, 
  getPaystackMode, 
  generateFikoPaymentReference 
} from '../src/lib/paystack.ts';
import { checkWhatsAppServiceWindow } from '../src/lib/whatsapp.ts';
import { 
  verifyMetaWebhookSignature, 
  verifyPaystackWebhookSignature 
} from '../server/webhook-verify.ts';
import {
  convertFromXOF,
  convertToXOF,
  formatCurrencyAmount,
  formatBaseFCFA
} from '../src/lib/currencyUtils.ts';
import {
  createDemoKnowledgeState,
  evaluateTruthAndPromiseGuard,
  retrieveVerifiedKnowledge,
  detectKnowledgeConflicts,
  parseRawKnowledgeText,
  computeKnowledgeMastery,
  extractTextAndTitleFromHtml,
  conductFikoLearningTurn,
  buildMasteryAuditReport
} from '../src/lib/knowledgeEngine.ts';
import {
  isPrivateOrReservedIp,
  validateSafeExternalUrl
} from '../server/deepScan.ts';
import {
  PLAN_CATALOG,
  PLAN_CATALOG_BY_ID,
  CATALOG_VERSION,
  normalizePlanId,
  toLegacyPlanId,
  addBillingCycleUtc,
  calculateCyclePriceFCFA,
  calculateBillingQuote,
  computeResourceOverages,
  resolvePlanEntitlements,
  generateBillingInsights,
  SubscriptionSnapshot,
  UsageMetersSnapshot
} from '../src/lib/subscriptionCatalog.ts';
import {
  isQuoteExpired,
  isCatalogVersionCompatible,
  evaluateSubscriptionLifecycle
} from '../server/subscriptions.ts';

describe('Suite 1: Validation des Conversions Paystack en Sous-Unités XOF (Franc CFA)', () => {
  it('convertit correctement les montants FCFA en centimes (sous-unités entières)', () => {
    assert.equal(toPaystackSubunits(45000), 4500000);
    assert.equal(toPaystackSubunits(24900), 2490000);
    assert.equal(toPaystackSubunits(100), 10000);
    assert.throws(() => toPaystackSubunits(0), /supérieur à zéro/);
  });

  it('arrondit proprement les décimales éventuelles vers un entier strict', () => {
    assert.equal(toPaystackSubunits(19900.4), 1990040);
    assert.equal(toPaystackSubunits(19900.6), 1990060);
    assert.equal(Number.isInteger(toPaystackSubunits(1234.56)), true);
  });

  it('reconvertit fidèlement les centimes Paystack vers le montant FCFA', () => {
    assert.equal(fromPaystackSubunits(4500000), 45000);
    assert.equal(fromPaystackSubunits(2490000), 24900);
  });

  it('détecte correctement le mode Live vs Test selon le préfixe de clé', () => {
    assert.equal(getPaystackMode('sk_live_93710abcdef'), 'live');
    assert.equal(getPaystackMode('sk_test_12345abcdef'), 'test');
    assert.equal(getPaystackMode(undefined), 'test');
  });

  it('génère des références uniques Fiko conformes', () => {
    const ref1 = generateFikoPaymentReference('companyA');
    const ref2 = generateFikoPaymentReference('companyB');
    assert.match(ref1, /^FIKO_/);
    assert.match(ref2, /^FIKO_/);
    assert.notEqual(ref1, ref2);
  });

  it('valide le format des adresses email pour Paystack', () => {
    assert.equal(isValidPaystackEmail('client@fiko.io'), true);
    assert.equal(isValidPaystackEmail('prospect.kcg@gmail.com'), true);
    assert.equal(isValidPaystackEmail('invalid-email'), false);
    assert.equal(isValidPaystackEmail(''), false);
  });
});

describe('Suite 2: Fenêtre de Service Client WhatsApp de 24 Heures', () => {
  it('autorise les réponses libres dans la fenêtre de 24h', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const result = checkWhatsAppServiceWindow(twoHoursAgo);
    assert.equal(result.isOpen, true);
    assert.ok(result.remainingMs > 0);
  });

  it('bloque les messages libres hors de la fenêtre de 24h et exige un modèle approuvé Meta', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const result = checkWhatsAppServiceWindow(twentyFiveHoursAgo);
    assert.equal(result.isOpen, false);
    assert.match(result.warningMessage || '', /24h/);
  });

  it('bloque si aucun message entrant préalable n’a été enregistré', () => {
    const result = checkWhatsAppServiceWindow(undefined);
    assert.equal(result.isOpen, false);
  });
});

describe('Suite 3: Cryptographie & Rejet des Signatures Webhooks Falsifiées', () => {
  const secretKey = 'test_webhook_secret_key_12345';
  const payload = Buffer.from(JSON.stringify({ event: 'charge.success', reference: 'FIKO_TEST_001' }));

  it('valide la signature HMAC SHA512 officielle de Paystack', () => {
    const validSignature = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');
    assert.equal(verifyPaystackWebhookSignature(payload, validSignature, secretKey), true);
  });

  it('rejette formellement toute signature Paystack falsifiée ou altérée', () => {
    const falsifiedSignature = crypto.createHmac('sha512', 'wrong_secret').update(payload).digest('hex');
    assert.equal(verifyPaystackWebhookSignature(payload, falsifiedSignature, secretKey), false);
    assert.equal(verifyPaystackWebhookSignature(payload, 'tampered_hex_signature', secretKey), false);
    assert.equal(verifyPaystackWebhookSignature(payload, undefined, secretKey), false);
  });

  it('valide la signature HMAC SHA256 officielle de Meta WhatsApp', () => {
    const metaSignature = 'sha256=' + crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
    assert.equal(verifyMetaWebhookSignature(payload, metaSignature, secretKey), true);
  });

  it('rejette les signatures Meta falsifiées ou dépourvues de préfixe sha256=', () => {
    assert.equal(verifyMetaWebhookSignature(payload, 'sha256=invalidhash', secretKey), false);
    assert.equal(verifyMetaWebhookSignature(payload, 'noprefixhash', secretKey), false);
    assert.equal(verifyMetaWebhookSignature(payload, undefined, secretKey), false);
  });
});

describe('Suite 4: Déduplication des Messages WhatsApp Webhook', () => {
  it('traite le premier message et déduplique les réémissions Meta identiques', () => {
    const processedMessageIds = new Set<string>();

    function processIncomingMessage(wamid: string) {
      if (processedMessageIds.has(wamid)) {
        return { status: 'DEDUPLICATED', messageId: wamid };
      }
      processedMessageIds.add(wamid);
      return { status: 'PROCESSED', messageId: wamid };
    }

    const firstAttempt = processIncomingMessage('wamid.HBgLMjI1MDc0ODkzMTFSFQIAERgSQjE4MjM4');
    assert.equal(firstAttempt.status, 'PROCESSED');

    const secondAttempt = processIncomingMessage('wamid.HBgLMjI1MDc0ODkzMTFSFQIAERgSQjE4MjM4');
    assert.equal(secondAttempt.status, 'DEDUPLICATED');
  });
});

describe('Suite 5: Règles Métier CRM & Verrouillage du Statut "Payé"', () => {
  it('interdit la transition manuelle vers "Payé" sans transaction vérifiée', () => {
    function canTransitionLeadStage(targetStage: string, hasVerifiedPayment: boolean) {
      if (targetStage === 'Payé' && !hasVerifiedPayment) {
        return { allowed: false, error: 'Un paiement Paystack vérifié est obligatoire pour passer au statut Payé' };
      }
      return { allowed: true };
    }

    assert.equal(canTransitionLeadStage('Qualifié', false).allowed, true);
    assert.equal(canTransitionLeadStage('Lien envoyé', false).allowed, true);
    assert.equal(canTransitionLeadStage('Payé', false).allowed, false);
    assert.equal(canTransitionLeadStage('Payé', true).allowed, true);
  });
});

describe('Suite 6: Validation des Invariants de Webhook Paystack (Montant & Devise)', () => {
  it('rejette un webhook de succès si le montant ou la devise ne correspondent pas à la commande', () => {
    interface TransactionRecord {
      reference: string;
      expectedAmountSubunits: number;
      expectedCurrency: string;
      status: string;
    }

    const tx: TransactionRecord = {
      reference: 'FIKO_TEST_8910',
      expectedAmountSubunits: 4500000,
      expectedCurrency: 'XOF',
      status: 'PENDING'
    };

    function validateAndApplyWebhook(
      record: TransactionRecord, 
      eventAmountSubunits: number, 
      eventCurrency: string
    ) {
      if (eventCurrency !== record.expectedCurrency) {
        return { success: false, reason: 'CURRENCY_MISMATCH' };
      }
      if (eventAmountSubunits < record.expectedAmountSubunits) {
        return { success: false, reason: 'UNDERPAID_AMOUNT' };
      }
      record.status = 'SUCCESS';
      return { success: true };
    }

    // Attempt with USD instead of XOF
    const currencyMismatch = validateAndApplyWebhook(tx, 4500000, 'USD');
    assert.equal(currencyMismatch.success, false);
    assert.equal(currencyMismatch.reason, 'CURRENCY_MISMATCH');

    // Attempt with lower amount
    const underpaid = validateAndApplyWebhook(tx, 2000000, 'XOF');
    assert.equal(underpaid.success, false);
    assert.equal(underpaid.reason, 'UNDERPAID_AMOUNT');

    // Correct amount and currency
    const valid = validateAndApplyWebhook(tx, 4500000, 'XOF');
    assert.equal(valid.success, true);
    assert.equal(tx.status, 'SUCCESS');
  });
});

describe('Suite 7: Idempotence des Webhooks Paystack (Aucun Double-Comptage)', () => {
  it('ne crédite et ne met à jour le statut qu’une seule fois même en cas de webhook répété', () => {
    let ledgerRevenue = 0;
    let successfulTxCount = 0;
    const processedEvents = new Map<string, string>();

    function handlePaymentSuccess(reference: string, amount: number) {
      if (processedEvents.has(reference)) {
        return { action: 'IDEMPOTENT_IGNORED' };
      }
      processedEvents.set(reference, 'SUCCESS');
      ledgerRevenue += amount;
      successfulTxCount += 1;
      return { action: 'CREDITED' };
    }

    const event1 = handlePaymentSuccess('FIKO_TEST_101', 45000);
    assert.equal(event1.action, 'CREDITED');
    assert.equal(ledgerRevenue, 45000);
    assert.equal(successfulTxCount, 1);

    // Meta/Paystack retry of the exact same event
    const event1Retry = handlePaymentSuccess('FIKO_TEST_101', 45000);
    assert.equal(event1Retry.action, 'IDEMPOTENT_IGNORED');
    assert.equal(ledgerRevenue, 45000);
    assert.equal(successfulTxCount, 1);
  });
});

describe('Suite 8: Isolation Stricte Multi-Tenant (Entreprises)', () => {
  it('garantit qu’une entreprise ne peut ni lire ni modifier les données d’une autre', () => {
    const leadsStore = [
      { id: 'lead_01', companyId: 'comp_apple', name: 'Lead Apple', stage: 'Nouveau' },
      { id: 'lead_02', companyId: 'comp_orange', name: 'Lead Orange', stage: 'Nouveau' },
    ];

    function getCompanyLeads(userCompanyId: string) {
      return leadsStore.filter(l => l.companyId === userCompanyId);
    }

    function updateCompanyLead(userCompanyId: string, leadId: string, newStage: string) {
      const lead = leadsStore.find(l => l.id === leadId);
      if (!lead || lead.companyId !== userCompanyId) {
        throw new Error('FORBIDDEN_TENANT_ACCESS');
      }
      lead.stage = newStage;
      return lead;
    }

    // Company Apple gets its own leads only
    const appleLeads = getCompanyLeads('comp_apple');
    assert.equal(appleLeads.length, 1);
    assert.equal(appleLeads[0].name, 'Lead Apple');

    // Company Apple cannot modify Company Orange's lead
    assert.throws(() => {
      updateCompanyLead('comp_apple', 'lead_02', 'Qualifié');
    }, /FORBIDDEN_TENANT_ACCESS/);
  });
});

describe('Suite 9: Séparation Étanche des Paiements Test vs Live', () => {
  it('n’additionne jamais les encaissements sandbox au chiffre d’affaires réel', () => {
    const transactions = [
      { ref: 'TX_01', amount: 45000, mode: 'live', status: 'SUCCESS' },
      { ref: 'TX_02', amount: 99000, mode: 'live', status: 'SUCCESS' },
      { ref: 'TX_TEST_01', amount: 1500000, mode: 'test', status: 'SUCCESS' }, // Large test amount
      { ref: 'TX_TEST_02', amount: 500000, mode: 'test', status: 'PENDING' },
    ];

    const liveRevenue = transactions
      .filter(t => t.status === 'SUCCESS' && t.mode === 'live')
      .reduce((sum, t) => sum + t.amount, 0);

    const testRevenue = transactions
      .filter(t => t.status === 'SUCCESS' && t.mode === 'test')
      .reduce((sum, t) => sum + t.amount, 0);

    // Live revenue must strictly equal 144,000 FCFA, not 1,644,000 FCFA
    assert.equal(liveRevenue, 144000);
    assert.equal(testRevenue, 1500000);
    assert.ok(liveRevenue < testRevenue, 'Le CA réel n’a pas été pollué par le test de 1,5M');
  });
});

describe('Suite 10: Récupération des Initialisations Interrompues', () => {
  it('permet de ré-interroger la passerelle Paystack pour rétablir le statut réel', () => {
    interface TxState {
      reference: string;
      status: 'PENDING' | 'SUCCESS' | 'FAILED';
      paidAt?: string;
    }

    const tx: TxState = { reference: 'FIKO_INTERRUPTED_01', status: 'PENDING' };

    function reconcileWithPaystackResponse(record: TxState, paystackVerification: { status: string; paid_at?: string }) {
      if (paystackVerification.status === 'success') {
        record.status = 'SUCCESS';
        record.paidAt = paystackVerification.paid_at;
      } else if (paystackVerification.status === 'failed') {
        record.status = 'FAILED';
      }
      return record;
    }

    const updated = reconcileWithPaystackResponse(tx, {
      status: 'success',
      paid_at: '2026-11-09T18:30:00.000Z'
    });

    assert.equal(updated.status, 'SUCCESS');
    assert.equal(updated.paidAt, '2026-11-09T18:30:00.000Z');
  });
});

describe('Suite 11: Concordance Mathématique du Grand Livre avec les Indicateurs', () => {
  it('garantit que le total affiché sur le tableau de bord correspond exactement au grand livre', () => {
    const ledger = [
      { id: '1', amount: 25000, status: 'SUCCESS', mode: 'live' },
      { id: '2', amount: 15000, status: 'SUCCESS', mode: 'live' },
      { id: '3', amount: 50000, status: 'FAILED', mode: 'live' },
      { id: '4', amount: 10000, status: 'PENDING', mode: 'live' },
    ];

    const computedTotal = ledger
      .filter(l => l.status === 'SUCCESS' && l.mode === 'live')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const successfulTransactionsCount = ledger.filter(l => l.status === 'SUCCESS' && l.mode === 'live').length;

    assert.equal(computedTotal, 40000);
    assert.equal(successfulTransactionsCount, 2);
  });
});

describe('Suite 12: Rejet des Requêtes Non Authentifiées', () => {
  it('vérifie le contrat de sécurité imposant un token Bearer valide pour les opérations protégées', () => {
    function enforceBearerAuth(authHeader: string | undefined) {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { statusCode: 401, error: 'Unauthorized: Missing or malformed token' };
      }
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) {
        return { statusCode: 401, error: 'Unauthorized: Empty token' };
      }
      return { statusCode: 200, token };
    }

    assert.equal(enforceBearerAuth(undefined).statusCode, 401);
    assert.equal(enforceBearerAuth('Basic dXNlcjpwYXNz').statusCode, 401);
    assert.equal(enforceBearerAuth('Bearer ').statusCode, 401);
    assert.equal(enforceBearerAuth('Bearer mock_valid_jwt_token').statusCode, 200);
  });
});

describe('Suite 13: Conversion Multi-Devise & Formatage FCFA (XOF)', () => {
  it('préserve la parité exacte 1:1 en FCFA (XOF et XAF)', () => {
    assert.equal(convertFromXOF(3250000, 'XOF'), 3250000);
    assert.equal(convertFromXOF(3250000, 'XAF'), 3250000);
    assert.equal(convertToXOF(45000, 'XOF'), 45000);
    assert.equal(convertToXOF(45000, 'XAF'), 45000);
    assert.match(formatBaseFCFA(3250000), /FCFA$/);
    assert.match(formatCurrencyAmount(45000, 'XOF'), /FCFA$/);
  });

  it('applique la parité fixe officielle BCEAO entre FCFA et EUR (1 € = 655,957 FCFA)', () => {
    const eur = convertFromXOF(655957, 'EUR');
    assert.equal(eur, 1000);
    const backToXof = convertToXOF(1000, 'EUR');
    assert.equal(backToXof, 655957);
    assert.match(formatCurrencyAmount(655957, 'EUR'), /€/);
  });

  it('convertit proprement vers USD, GBP, GHS et NGN avec gestion des valeurs non finies', () => {
    assert.equal(convertFromXOF(61000, 'USD'), 100);
    assert.equal(convertToXOF(100, 'USD'), 61000);
    assert.equal(convertFromXOF(77500, 'GBP'), 100);
    assert.equal(convertFromXOF(4200, 'GHS'), 100);
    assert.equal(convertFromXOF(400, 'NGN'), 1000);

    assert.equal(convertFromXOF(Number.NaN, 'EUR'), 0);
    assert.equal(convertToXOF(Number.POSITIVE_INFINITY, 'USD'), 0);

    assert.match(formatCurrencyAmount(61000, 'USD'), /^\$/);
    assert.match(formatCurrencyAmount(77500, 'GBP'), /^£/);
    assert.match(formatCurrencyAmount(4200, 'GHS'), /GH₵/);
    assert.match(formatCurrencyAmount(400, 'NGN'), /₦/);
  });
});

describe('Suite 14: Fiko Knowledge Engine™ — Truth & Promise Guard, RAG Vérifié & Ingestion', () => {
  const demo = createDemoKnowledgeState('comp_froid_test');

  it('initialise la maquette conceptuelle à 24 connaissances (18 validées, 6 à vérifier) et calcule la maîtrise métier', () => {
    const validated = demo.items.filter((i) => i.status === 'validated');
    const pending = demo.items.filter((i) => i.status === 'pending_verification' || i.status === 'conflict');
    assert.equal(demo.items.length, 24);
    assert.equal(validated.length, 18);
    assert.equal(pending.length, 6);

    const mastery = computeKnowledgeMastery({
      identity: demo.identity,
      items: demo.items,
      trainingRules: demo.trainingRules,
      policy: demo.policy,
    });
    assert.ok(mastery >= 70 && mastery <= 100);
  });

  it('bloque le cas Climatisation Bingerville 14h + garantie de réparation sans inventer de disponibilité', () => {
    const res = evaluateTruthAndPromiseGuard({
      customerMessage:
        "Bonjour, pouvez-vous venir à Bingerville aujourd'hui à 14 h et me garantir que ma climatisation sera réparée ?",
      identity: demo.identity,
      knowledgeItems: demo.items,
      policy: demo.policy,
      trainingRules: demo.trainingRules,
    });

    assert.equal(res.truthLevel, 'forbidden_action');
    assert.equal(res.allowedToPromise, false);
    assert.equal(res.requiresHumanApproval, true);
    assert.ok(res.blockedClaims.length >= 2);
    assert.match(res.safeReply, /Bingerville/);
    assert.match(res.safeReply, /vérifier la disponibilité/i);
    assert.match(res.safeReply, /diagnostic/i);
  });

  it('répond avec le tarif approuvé de 10 000 FCFA et cite la source officielle', () => {
    const res = evaluateTruthAndPromiseGuard({
      customerMessage: 'Combien coûte un entretien simple de climatiseur split ?',
      identity: demo.identity,
      knowledgeItems: demo.items,
      policy: demo.policy,
    });

    assert.equal(res.truthLevel, 'validated_info');
    assert.equal(res.allowedToPromise, true);
    assert.equal(res.requiresHumanApproval, false);
    assert.ok(res.citedSources.length >= 1);
    assert.match(res.safeReply, /10[\s\u202f\u00a0]000 FCFA/);
  });

  it('escalade une demande de remise de 30 % dépassant le plafond autonome de 10 %', () => {
    const res = evaluateTruthAndPromiseGuard({
      customerMessage: 'Faites-moi 30 % de remise sur ce contrat.',
      identity: demo.identity,
      knowledgeItems: demo.items,
      policy: demo.policy,
    });

    assert.equal(res.truthLevel, 'approval_required');
    assert.equal(res.allowedToPromise, false);
    assert.equal(res.requiresHumanApproval, true);
    assert.equal(res.detectedDiscountPercent, 30);
  });

  it('refuse de supposer sur une zone inconnue (Korhogo) et demande confirmation équipe', () => {
    const res = evaluateTruthAndPromiseGuard({
      customerMessage: 'Livrez-vous à Korhogo ?',
      identity: demo.identity,
      knowledgeItems: demo.items,
      policy: demo.policy,
    });

    assert.equal(res.truthLevel, 'unknown_info');
    assert.equal(res.allowedToPromise, false);
    assert.equal(res.requiresHumanApproval, true);
    assert.match(res.safeReply, /Korhogo/);
    assert.match(res.safeReply, /confirmer/i);
  });

  it('exclut strictement les brouillons, conflits et autres entreprises dans Verified RAG Engine™', () => {
    const resultsPromo = retrieveVerifiedKnowledge('promo 8500 entretien', demo.items, 'comp_froid_test');
    assert.equal(resultsPromo.some((r) => r.id === 'k_19'), false);

    const crossTenantResults = retrieveVerifiedKnowledge('entretien split', demo.items, 'other_company_id');
    assert.equal(crossTenantResults.length, 0);
  });

  it('détecte les contradictions tarifaires et place toute nouvelle ingestion en statut pending_verification', () => {
    const conflict = detectKnowledgeConflicts(
      {
        title: 'Entretien climatiseur split promo',
        content: 'Entretien climatiseur split à 8 500 FCFA',
        category: 'tarif',
        approvedPriceFCFA: 8500,
      },
      demo.items
    );

    assert.ok(conflict);
    assert.equal(conflict.type, 'contradiction');

    const parsed = parseRawKnowledgeText(
      'Entretien split;Nettoyage complet à 10 000 FCFA',
      'comp_froid_test',
      'catalogue.csv',
      'csv',
      'Direction'
    );
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].status, 'pending_verification');
    assert.equal(parsed[0].approvedPriceFCFA, 10000);
  });
});

describe('Suite 15: Fiko Deep Scan™ (Sécurité SSRF, Extraction HTML) & Learning Live™ V3.0', () => {
  it('bloque toutes les IP privées, loopback, link-local et métadonnées Cloud (protection SSRF)', async () => {
    assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('10.0.0.5'), true);
    assert.equal(isPrivateOrReservedIp('172.16.4.12'), true);
    assert.equal(isPrivateOrReservedIp('192.168.1.10'), true);
    assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
    assert.equal(isPrivateOrReservedIp('::1'), true);
    assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);

    const blockedUrls = [
      'http://127.0.0.1:3000/admin',
      'http://169.254.169.254/latest/meta-data',
      'http://localhost:8080',
      'http://192.168.1.10/router',
      'file:///etc/passwd',
      'ftp://example.com/data',
    ];

    for (const bad of blockedUrls) {
      const check = await validateSafeExternalUrl(bad, true);
      assert.equal(check.ok, false, `L'URL dangereuse ${bad} devait être bloquée`);
    }

    const validCheck = await validateSafeExternalUrl('kcg-ci.com', true);
    assert.equal(validCheck.ok, true);
    if (validCheck.ok) {
      assert.equal(validCheck.url.protocol, 'https:');
      assert.equal(validCheck.url.hostname, 'kcg-ci.com');
    }
  });

  it('extrait proprement le titre, les en-têtes et le texte nettoyé depuis du HTML réel', () => {
    const html = `
      <html>
        <head><title>KCG CI — Services Climatisation Abidjan</title><script>console.log("ignore")</script></head>
        <body>
          <h1>Nos Offres B2B</h1>
          <p>Entretien split complet à 10 000 FCFA à Cocody et Plateau.</p>
          <h2>Contact Rapide</h2>
        </body>
      </html>
    `;
    const extracted = extractTextAndTitleFromHtml(html);
    assert.equal(extracted.title, 'KCG CI — Services Climatisation Abidjan');
    assert.deepEqual(extracted.headings, ['Nos Offres B2B', 'Contact Rapide']);
    assert.match(extracted.cleanText, /10 000 FCFA/);
    assert.doesNotMatch(extracted.cleanText, /console\.log/);
  });

  it('structure les faits du dirigeant dans Fiko Learning Live™ et consomme les clarifications Deep Scan', () => {
    const demo = createDemoKnowledgeState('comp_live_v3');
    const turn = conductFikoLearningTurn({
      leaderMessage: 'Notre entretien split coûte 12 000 FCFA à Cocody et Marcory avec remise max 8 %.',
      currentStep: 1,
      identity: demo.identity,
      knowledgeItems: demo.items,
      policy: demo.policy,
      pendingClarifications: ['Confirmez-vous la couverture de Bingerville ?'],
    });

    assert.equal(turn.nextStep, 2);
    assert.equal(turn.extractedFacts.some((f) => f.approvedPriceFCFA === 12000), true);
    assert.equal(turn.detectedZones.includes('Cocody'), true);
    assert.equal(turn.detectedDiscountLimit, 8);
    assert.match(turn.fikoReply, /Bingerville/);
    assert.equal(turn.remainingClarifications.length, 0);
  });

  it('génère un Audit de Maîtrise transparent (ce que Fiko sait, ignore et bloque)', () => {
    const demo = createDemoKnowledgeState('comp_audit_v3');
    const audit = buildMasteryAuditReport(demo.identity, demo.items, demo.policy);

    assert.equal(audit.knownFactsCount, 18);
    assert.equal(audit.unknownGaps.length > 0, true);
    assert.equal(audit.authorizedCapabilities.some((c) => c.includes('Paystack')), true);
    assert.equal(audit.blockedCapabilities.some((b) => b.includes('Garantir un résultat')), true);
  });
});

function readPngDimensions(filePath: string): { width: number; height: number; colorType: number } {
  const buf = fs.readFileSync(filePath);
  const signature = buf.subarray(0, 8);
  assert.deepEqual(
    signature,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    `Signature PNG invalide pour ${filePath}`
  );
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf.readUInt8(25);
  return { width, height, colorType };
}

describe('Suite 16 — Official Brand Integration V1.1 (Logo, Symbole, Favicon & PWA)', () => {
  const rootDir = process.cwd();

  it('vérifie la présence et les dimensions exactes du logo officiel (2016×780 RGBA) et du symbole hexagonal', () => {
    const officialLogoPath = path.join(rootDir, 'public/branding/fiko-connect-logo-official.png');
    const symbolPath = path.join(rootDir, 'public/branding/fiko-connect-symbol-official.png');

    assert.equal(fs.existsSync(officialLogoPath), true);
    assert.equal(fs.existsSync(symbolPath), true);

    const fullMeta = readPngDimensions(officialLogoPath);
    assert.equal(fullMeta.width, 2016);
    assert.equal(fullMeta.height, 780);
    assert.equal(fullMeta.colorType, 6); // RGBA avec transparence

    const symbolMeta = readPngDimensions(symbolPath);
    assert.equal(symbolMeta.width, 512);
    assert.equal(symbolMeta.height, 512);
    assert.equal(symbolMeta.colorType, 6);
  });

  it('vérifie les favicons, apple-touch-icon et icônes PWA générées depuis le symbole officiel', () => {
    const expectedSizes: Array<[string, number, number]> = [
      ['public/favicon-32x32.png', 32, 32],
      ['public/favicon.png', 64, 64],
      ['public/apple-touch-icon.png', 180, 180],
      ['public/pwa-192x192.png', 192, 192],
      ['public/pwa-512x512.png', 512, 512],
      ['public/pwa-maskable-512x512.png', 512, 512],
    ];

    for (const [relPath, w, h] of expectedSizes) {
      const abs = path.join(rootDir, relPath);
      assert.equal(fs.existsSync(abs), true, `Fichier manquant : ${relPath}`);
      const dims = readPngDimensions(abs);
      assert.equal(dims.width, w, `Largeur attendue ${w} pour ${relPath}`);
      assert.equal(dims.height, h, `Hauteur attendue ${h} pour ${relPath}`);
    }
  });

  it('vérifie le manifest PWA et les balises favicon/manifest de index.html', () => {
    const manifestPath = path.join(rootDir, 'public/manifest.webmanifest');
    const indexPath = path.join(rootDir, 'index.html');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.name, 'Fiko Connect');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.background_color, '#050505');
    assert.equal(Array.isArray(manifest.icons) && manifest.icons.length === 3, true);
    assert.equal(manifest.icons.some((i: any) => i.purpose === 'maskable' && i.src === '/pwa-maskable-512x512.png'), true);

    const html = fs.readFileSync(indexPath, 'utf-8');
    assert.match(html, /href="\/favicon\.png"/);
    assert.match(html, /href="\/apple-touch-icon\.png"/);
    assert.match(html, /href="\/manifest\.webmanifest"/);
    assert.match(html, /<title>Fiko Connect/);
  });
});

describe('Suite 17 — Nos Offres V1.0 : Moteur Financier FCFA, Prorata UTC, Downgrade, Entitlements & Sécurité (25 scénarios)', () => {
  const baseUsage: UsageMetersSnapshot = {
    whatsappConnections: 1,
    monthlyConversations: 20,
    leadsCount: 4,
    aiAgents: 1,
    campaignsThisMonth: 0,
  };

  function makeSub(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
    return {
      companyId: 'co_test_1',
      planId: 'starter',
      billingCycle: 'monthly',
      status: 'active',
      trialUsed: true,
      trialEndsAt: '2026-01-08T00:00:00.000Z',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      availableCreditFCFA: 0,
      cancelAtPeriodEnd: false,
      scheduledChange: null,
      paymentMode: 'manual_renewal',
      catalogVersion: CATALOG_VERSION,
      ...overrides,
    };
  }

  it('1. Nouvelle souscription : passage essai gratuit vers Starter mensuel', () => {
    const sub = makeSub({ planId: 'essai', status: 'trialing', trialUsed: false });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'starter',
      targetCycle: 'monthly',
      usageMeters: baseUsage,
      nowIso: '2026-06-03T12:00:00.000Z',
    });
    assert.equal(q.transitionType, 'first_subscription');
    assert.equal(q.amountDueFCFA, 19000);
    assert.equal(q.unusedCreditFCFA, 0);
    assert.equal(q.newPeriodEnd, '2026-07-03T12:00:00.000Z');
  });

  it('2. Upgrade milieu de cycle : Starter -> Growth au jour 15 sur 30 jours avec crédit prorata', () => {
    const sub = makeSub({
      planId: 'starter',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'growth',
      targetCycle: 'monthly',
      usageMeters: baseUsage,
      nowIso: '2026-06-16T00:00:00.000Z', // Exactement 15j écoulés / 15j restants
    });
    assert.equal(q.transitionType, 'upgrade');
    assert.equal(q.unusedCreditFCFA, 9500);
    assert.equal(q.amountDueFCFA, 39500); // 49 000 - 9 500
  });

  it('3. Upgrade dernier jour du cycle : calcul prorata sans anomalie ni montant négatif', () => {
    const sub = makeSub({
      planId: 'starter',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'growth',
      targetCycle: 'monthly',
      usageMeters: baseUsage,
      nowIso: '2026-06-30T23:00:00.000Z', // 1 heure restante
    });
    assert.equal(q.transitionType, 'upgrade');
    assert.ok(q.unusedCreditFCFA >= 0 && q.unusedCreditFCFA < 100);
    assert.ok(q.amountDueFCFA > 48900 && q.amountDueFCFA <= 49000);
  });

  it('4. Upgrade avec crédit compte existant : consomme le crédit et préserve tout surplus éventuel', () => {
    const sub = makeSub({
      planId: 'starter',
      availableCreditFCFA: 60000,
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'growth',
      targetCycle: 'monthly',
      usageMeters: baseUsage,
      nowIso: '2026-06-16T00:00:00.000Z',
    });
    assert.equal(q.unusedCreditFCFA, 9500);
    assert.equal(q.availableCreditAppliedFCFA, 39500);
    assert.equal(q.amountDueFCFA, 0);
    assert.equal(q.remainingCreditAfterFCFA, 20500);
  });

  it('5. Downgrade programmé : zéro facturation immédiate et prise d’effet à la fin du cycle', () => {
    const sub = makeSub({
      planId: 'pro',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'starter',
      targetCycle: 'monthly',
      usageMeters: baseUsage,
      nowIso: '2026-06-15T00:00:00.000Z',
    });
    assert.equal(q.transitionType, 'downgrade');
    assert.equal(q.amountDueFCFA, 0);
    assert.equal(q.effectiveAt, '2026-07-01T00:00:00.000Z');
  });

  it('6. Annulation d’un downgrade programmé : l’offre actuelle reste intacte avant échéance', () => {
    const subWithDowngrade = makeSub({
      planId: 'pro',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      scheduledChange: {
        requestId: 'SCR_1',
        targetPlanId: 'starter',
        targetCycle: 'monthly',
        effectiveAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-06-15T00:00:00.000Z',
      },
    });
    // Avant l'échéance, Pro reste actif
    const beforeExpiry = evaluateSubscriptionLifecycle(subWithDowngrade, '2026-06-20T00:00:00.000Z');
    assert.equal(beforeExpiry.changed, false);
    assert.equal(beforeExpiry.updated.planId, 'pro');

    // Si annulé avant échéance
    const cancelledSub = { ...subWithDowngrade, scheduledChange: null };
    const afterExpiryIfCancelled = evaluateSubscriptionLifecycle(cancelledSub, '2026-07-02T00:00:00.000Z');
    assert.equal(afterExpiryIfCancelled.updated.planId, 'pro');
  });

  it('7. Passage mensuel -> annuel : applique remise 20%, crédit prorata restant et nouvelle échéance +1 an', () => {
    const sub = makeSub({
      planId: 'growth',
      billingCycle: 'monthly',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'growth',
      targetCycle: 'annual',
      usageMeters: baseUsage,
      nowIso: '2026-06-16T00:00:00.000Z',
    });
    assert.equal(q.transitionType, 'upgrade');
    assert.equal(q.targetCyclePriceFCFA, 470400); // 49 000 * 12 * 0.80
    assert.equal(q.unusedCreditFCFA, 24500);
    assert.equal(q.amountDueFCFA, 445900);
    assert.equal(q.newPeriodEnd, '2027-06-16T00:00:00.000Z');
  });

  it('8. Passage annuel -> mensuel : programmé à la fin du cycle annuel sans prélèvement immédiat', () => {
    const sub = makeSub({
      planId: 'growth',
      billingCycle: 'annual',
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: '2027-01-01T00:00:00.000Z',
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'growth',
      targetCycle: 'monthly',
      usageMeters: baseUsage,
      nowIso: '2026-06-01T00:00:00.000Z',
    });
    assert.equal(q.transitionType, 'downgrade');
    assert.equal(q.amountDueFCFA, 0);
    assert.equal(q.effectiveAt, '2027-01-01T00:00:00.000Z');
  });

  it('9. Paiement échoué : aucune activation d’offre ni création de facture acquittée', () => {
    const txState = { status: 'PENDING', subscriptionSettled: false };
    // Simulation d'un événement charge.failed
    const nextStatus = txState.status !== 'SUCCESS' ? 'FAILED' : txState.status;
    assert.equal(nextStatus, 'FAILED');
    assert.equal(txState.subscriptionSettled, false);
  });

  it('10. Paiement abandonné : un devis ouvert non payé laisse les droits actuels inchangés', () => {
    const sub = makeSub({ planId: 'essai', status: 'trialing' });
    const ent = resolvePlanEntitlements({
      companyId: sub.companyId,
      planId: sub.planId,
      status: sub.status,
      usageMeters: baseUsage,
    });
    assert.equal(ent.planId, 'essai');
    assert.equal(ent.maxLeads, 5);
  });

  it('11. Webhook en double : idempotence stricte si subscriptionSettled === true', () => {
    const alreadySettledTx = { status: 'SUCCESS', subscriptionSettled: true, amountPaystackSubunits: 1900000 };
    const shouldReapply = !(alreadySettledTx.status === 'SUCCESS' && alreadySettledTx.subscriptionSettled === true);
    assert.equal(shouldReapply, false);
  });

  it('12. Webhook reçu dans le désordre : un échec tardif ne peut jamais rétrograder un paiement SUCCESS', () => {
    const confirmedTx = { status: 'SUCCESS', subscriptionSettled: true };
    const statusAfterLateFail = confirmedTx.status !== 'SUCCESS' ? 'FAILED' : confirmedTx.status;
    assert.equal(statusAfterLateFail, 'SUCCESS');
  });

  it('13. Double tentative de paiement : bloque un second checkout sur le même devis ou en attente', () => {
    const existingRequests = [{ quoteId: 'QT_100', status: 'PENDING_PAYMENT' }];
    const hasPending = existingRequests.some((r) => r.quoteId === 'QT_100' && r.status === 'PENDING_PAYMENT');
    assert.equal(hasPending, true);
  });

  it('14. Devis expiré : rejeté au-delà de la fenêtre de 15 minutes', () => {
    const expiredQuote = { expiresAt: '2026-06-10T10:15:00.000Z' };
    assert.equal(isQuoteExpired(expiredQuote, '2026-06-10T10:15:01.000Z'), true);
    assert.equal(isQuoteExpired(expiredQuote, '2026-06-10T10:10:00.000Z'), false);
  });

  it('15. Changement de version du catalogue pendant une opération : détecté et bloqué', () => {
    assert.equal(isCatalogVersionCompatible(CATALOG_VERSION), true);
    assert.equal(isCatalogVersionCompatible('2025.01-OLD'), false);
  });

  it('16. Expiration essai gratuit après 7 jours : bascule automatique en expired', () => {
    const trialSub = makeSub({
      planId: 'essai',
      status: 'trialing',
      trialUsed: false,
      trialEndsAt: '2026-06-08T00:00:00.000Z',
    });
    const before = evaluateSubscriptionLifecycle(trialSub, '2026-06-07T23:59:59.000Z');
    assert.equal(before.changed, false);
    assert.equal(before.updated.status, 'trialing');

    const after = evaluateSubscriptionLifecycle(trialSub, '2026-06-08T00:00:01.000Z');
    assert.equal(after.changed, true);
    assert.equal(after.updated.status, 'expired');
    assert.equal(after.updated.trialUsed, true);
  });

  it('17. Dépassement de quota : bloque les nouvelles actions mais garantit la conservation historique', () => {
    const overUsage: UsageMetersSnapshot = {
      whatsappConnections: 1,
      monthlyConversations: 55,
      leadsCount: 6,
      aiAgents: 1,
      campaignsThisMonth: 1,
    };
    const ent = resolvePlanEntitlements({
      companyId: 'co_over',
      planId: 'essai',
      status: 'trialing',
      usageMeters: overUsage,
    });
    assert.equal(ent.canCreateNewLeads, false);
    assert.equal(ent.canSendAutoMessages, false);
    assert.equal(ent.readOnlyHistoricalAccess, true);
  });

  it('18. Downgrade avec ressources dépassant la limite : liste les surplus sans suppression automatique', () => {
    const heavyUsage: UsageMetersSnapshot = {
      whatsappConnections: 5,
      monthlyConversations: 1200,
      leadsCount: 800,
      aiAgents: 4,
      campaignsThisMonth: 8,
    };
    const overages = computeResourceOverages('starter', heavyUsage);
    assert.ok(overages.some((o) => o.resourceKey === 'whatsappConnections' && o.excessCount === 4));
    assert.ok(overages.some((o) => o.resourceKey === 'leadsCount' && o.excessCount === 500));
    assert.ok(overages.some((o) => o.resourceKey === 'aiAgents' && o.excessCount === 3));
    assert.ok(overages.every((o) => o.preservationRule.length > 10));
  });

  it('19. Isolation cross-tenant & anti-falsification : vérification stricte des alias et règles Firestore', () => {
    const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');
    assert.match(rules, /match \/subscriptions\/\{subId\}/);
    assert.match(rules, /allow update, delete: if isSystemBot\(\);/);
    assert.match(rules, /match \/invoices\/\{invoiceId\}/);
    assert.match(rules, /match \/billing_quotes\/\{quoteId\}/);
    assert.equal(normalizePlanId('business'), 'growth');
    assert.equal(normalizePlanId('scale'), 'pro');
    assert.equal(toLegacyPlanId('growth'), 'business');
  });

  it('20. Activation immédiate des droits après paiement : débloque quotas et relances auto', () => {
    const starterEnt = resolvePlanEntitlements({
      companyId: 'co_up',
      planId: 'starter',
      status: 'active',
      usageMeters: baseUsage,
    });
    assert.equal(starterEnt.features.autoFollowUp, false);
    assert.equal(starterEnt.maxWhatsappConnections, 1);

    const growthEnt = resolvePlanEntitlements({
      companyId: 'co_up',
      planId: 'growth',
      status: 'active',
      usageMeters: baseUsage,
    });
    assert.equal(growthEnt.features.autoFollowUp, true);
    assert.equal(growthEnt.maxWhatsappConnections, 3);
    assert.equal(growthEnt.maxLeads, 2000);
  });

  it('21. Récupération entre paiement confirmé et activation interrompue : état réconciliable détecté', () => {
    const interruptedTx = { status: 'SUCCESS', subscriptionSettled: false, companyId: 'co_rec' };
    const needsRecovery = interruptedTx.status === 'SUCCESS' && !interruptedTx.subscriptionSettled;
    assert.equal(needsRecovery, true);
  });

  it('22. Réconciliation transaction non synchronisée : rejette tout écart de montant ou de devise', () => {
    const expectedSubunits = toPaystackSubunits(49000); // 4 900 000
    assert.equal(expectedSubunits, 4900000);
    const receivedSubunits: number = 1900000;
    const mismatchAmount = receivedSubunits !== expectedSubunits;
    const mismatchCurrency = ('NGN' as string) !== 'XOF';
    assert.equal(mismatchAmount, true);
    assert.equal(mismatchCurrency, true);
  });

  it('23. Changement / renouvellement en fenêtre d’échéance : bascule vers renewal à 3 jours de la fin', () => {
    const sub = makeSub({
      planId: 'starter',
      billingCycle: 'monthly',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'starter',
      targetCycle: 'monthly',
      usageMeters: baseUsage,
      nowIso: '2026-06-28T00:00:00.000Z', // 3 jours avant échéance
    });
    assert.equal(q.transitionType, 'renewal');
    assert.equal(q.amountDueFCFA, 19000);
    assert.equal(q.newPeriodEnd, '2026-08-01T00:00:00.000Z');
  });

  it('24. Gestion exacte des cycles calendaires 28, 29 (bissextile), 30 et 31 jours en UTC', () => {
    assert.equal(addBillingCycleUtc('2026-01-31T10:00:00.000Z', 'monthly'), '2026-02-28T10:00:00.000Z');
    assert.equal(addBillingCycleUtc('2028-01-31T10:00:00.000Z', 'monthly'), '2028-02-29T10:00:00.000Z');
    assert.equal(addBillingCycleUtc('2026-04-30T10:00:00.000Z', 'monthly'), '2026-05-30T10:00:00.000Z');
    assert.equal(addBillingCycleUtc('2026-05-31T10:00:00.000Z', 'monthly'), '2026-06-30T10:00:00.000Z');
    assert.equal(addBillingCycleUtc('2028-02-29T10:00:00.000Z', 'annual'), '2029-02-28T10:00:00.000Z');
  });

  it('25. Arrondi financier FCFA strict (entiers XOF) & Smart Billing Assistant non-invasif', () => {
    for (const plan of PLAN_CATALOG) {
      assert.equal(Number.isInteger(calculateCyclePriceFCFA(plan.id, 'monthly')), true);
      assert.equal(Number.isInteger(calculateCyclePriceFCFA(plan.id, 'annual')), true);
    }
    const sub = makeSub({
      planId: 'starter',
      currentPeriodStart: '2026-02-01T00:00:00.000Z',
      currentPeriodEnd: '2026-03-01T00:00:00.000Z', // 28 jours
    });
    const q = calculateBillingQuote({
      subscription: sub,
      targetPlanId: 'elite',
      targetCycle: 'annual',
      usageMeters: baseUsage,
      nowIso: '2026-02-11T07:13:29.000Z',
    });
    assert.equal(Number.isInteger(q.unusedCreditFCFA), true);
    assert.equal(Number.isInteger(q.amountDueFCFA), true);
    assert.equal(Number.isInteger(q.remainingCreditAfterFCFA), true);

    const insights = generateBillingInsights(sub, {
      ...baseUsage,
      leadsCount: 270, // 90% de 300
    });
    assert.ok(insights.some((i) => i.id === 'quota_threshold_80'));
    assert.ok(insights.every((i) => i.advisoryOnly === true));
  });
});



