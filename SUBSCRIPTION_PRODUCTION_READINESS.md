# SUBSCRIPTION PRODUCTION READINESS — FIKO CONNECT™ NOS OFFRES V1.0

**Date d’évaluation :** 2026-11-20  
**Verdict :** **PRÊT POUR SANDBOX / RECETTE INTERNE — EN ATTENTE DE VALIDATION PRÉSIDENTIELLE & CLÉS LIVE POUR PRODUCTION**

---

## 1. Synthèse de Statut (Strictement Factuelle)

### Implémenté & Vérifié
- Catalogue versionné `2026.11-V1` avec gestion des alias historiques (`free` → `essai`, `business` → `growth`, `scale` → `pro`).
- Moteur financier FCFA entier, calcul prorata UTC, cycles calendaires 28/29/30/31j, transitions mensuel ↔ annuel (-20%), downgrades programmés et conservation des données.
- Routes Express protégées (`/api/subscriptions/*`) isolées par `companyId` résolu depuis le jeton Firebase vérifié.
- Règles Firestore durcies et déployées (`fax.DeployRules`), incluant l’isolation `ownerUid` / `companyId` et le blocage d’écriture client sur les collections de facturation.
- Module UI **« Nos Offres »** intégré dans le menu latéral gauche (desktop), le tiroir mobile et les CTA d’upgrade authentifiés.

### Testé
- **64 tests unitaires** passés (`0` échec sur 17 suites via `npm test`), incluant les **25 scénarios** financiers, Paystack, cycle de vie et sécurité de la `Suite 17`.
- Compilation Vite (`compile_applet`) réussie.

### À configurer avant ouverture Production Live
1. **Validation tarifaire présidentielle :** Approuver officiellement les tarifs `19 000 / 49 000 / 99 000 / 199 000 FCFA` vs anciens tarifs `OnboardingWizard.tsx` (`19 900 / 49 900`), puis passer `CATALOG_APPROVAL_STATUS` à `'approved'` et aligner `OnboardingWizard.tsx`.
2. **Clés Paystack Live & Webhook :** Renseigner `PAYSTACK_SECRET_KEY` (`sk_live_...`), `PAYSTACK_PUBLIC_KEY` (`pk_live_...`), `APP_URL` et enregistrer `/api/paystack/webhook` sur le compte marchand Paystack.
3. **Mentions légales de facturation :** Compléter l’identifiant fiscal officiel (RCCM / NCC) dans la configuration de génération des factures `invoices` (`server/subscriptions.ts`).
4. **Tests E2E Sandbox Paystack :** Effectuer un test bout-en-bout réel avec une clé `sk_test_...` sur un compte entreprise de recette avant bascule `sk_live_...`.
