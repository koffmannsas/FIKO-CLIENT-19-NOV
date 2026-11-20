# BILLING ENGINE CERTIFICATION — SMART UPGRADE & DOWNGRADE ENGINE™

**Moteur :** `src/lib/subscriptionCatalog.ts` + `server/subscriptions.ts`  
**Devise comptable :** `XOF` (Franc CFA, arithmétique entière stricte sans virgule flottante)

---

## 1. Règles Financières Certifiées

| Règle / Mécanisme | Statut | Comportement vérifié |
| :--- | :--- | :--- |
| Arithmétique entière FCFA | **Implémenté & Testé** | `calculateCyclePriceFCFA`, `unusedCreditFCFA`, `availableCreditAppliedFCFA` et `amountDueFCFA` garantis entiers (`Number.isInteger === true`). |
| Prorata UTC exact | **Implémenté & Testé** | Calcul proportionnel sur la durée réelle du cycle (`remainingMs / totalCycleMs`), borné entre `0` et le prix du cycle en cours. |
| Cycles calendaires 28 / 29 / 30 / 31 jours | **Implémenté & Testé** | `addBillingCycleUtc` gère les fins de mois (ex. 31 jan → 28 fév ou 29 fév bissextile 2028) et les années bissextiles. |
| Transitions Mensuel ↔ Annuel (-20%) | **Implémenté & Testé** | Mensuel → Annuel applique le crédit prorata restant immédiatement et fixe l’échéance à +1 an. Annuel → Mensuel est programmé sans perte des mois déjà réglés. |
| Downgrade programmé sans suppression | **Implémenté & Testé** | Prise d’effet à `currentPeriodEnd`, conservation des droits complets jusqu’à l’échéance, liste des sur-quotas (`computeResourceOverages`) sans suppression automatique des leads/agents/numéros. |
| Devis serveur horodatés & versionnés | **Implémenté & Testé** | `billing_quotes` expirent après 15 min (`isQuoteExpired`) et rejettent tout décalage de version catalogue (`isCatalogVersionCompatible`). |
| Récépissés & Mentions légales | **Implémenté** | Factures `invoices` émises uniquement après confirmation serveur ; identifiant fiscal affiché comme *« À configurer avant mise en production »* sans numéro fictif. |

---

## 2. Suite de Tests Automatisés

- **Testé & Vérifié :** 25 scénarios unitaires dans `Suite 17` de `test/fiko-flow.test.ts` (upgrade mi-cycle, dernier jour, crédit excédentaire, downgrade, annulation, cycles 28/29/30/31j, devis expiré, changement catalogue, arrondis).
- **Bloqué en Live sans clés :** Les tests financiers s’exécutent sur moteur pur et mocks locaux afin de ne jamais déclencher de transaction Paystack réelle.
