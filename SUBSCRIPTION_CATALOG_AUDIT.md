# SUBSCRIPTION CATALOG AUDIT — FIKO CONNECT™

**Version du catalogue unifié :** `2026.11-V1`  
**Date effective :** `2026-11-20T00:00:00.000Z`  
**Statut de gouvernance :** `pending_presidential_approval` (Validation présidentielle requise avant facturation Live)  

---

## 1. Résumé de l’Audit Phase 0 (Sources existantes vs Cible V1.0)

| Élément | Statut | Détails observés dans le dépôt |
| :--- | :--- | :--- |
| Audit de `OnboardingWizard.tsx` | **Vérifié** | Plans existants : `free` (0 FCFA / 7J), `starter` (19 900 FCFA), `business` (49 900 FCFA), `scale` (99 000 FCFA), `elite` (199 000 FCFA). |
| Audit de `QuantumGate.tsx` | **Vérifié** | Création initiale de `subscriptions/{companyId}` avec `plan: 'free'`, `status: 'active'`, `maxContacts: 5`. |
| Audit de `Dashboard.tsx` | **Vérifié** | Alerte trial 80% affichait `19 900 FCFA / mois` pour `Starter` et routait `onUpgrade` vers `QuantumGate`. |
| Audit de `firestore.rules` | **Vérifié** | Ancienne règle `allow read, write: if isSignedIn();` permettait l'écriture client directe sur `subscriptions/{subId}`. Durcie et déployée. |
| Source de vérité unifiée (`src/lib/subscriptionCatalog.ts`) | **Implémenté** | Catalogue centralisé versionné (`PLAN_CATALOG`), mappant les alias historiques sans casser les contrats existants. |

---

## 2. Comparatif des Offres & Écarts Détectés

| ID Canonique | Alias Historique | Ancien Libellé / Prix | Nouveau Libellé / Prix Mensuel | Annuel (-20%) | Quotas Cibles (`2026.11-V1`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `essai` | `free` | ESSAI GRATUIT — 0 FCFA (7J) | Essai Gratuit — **0 FCFA** (7J) | 0 FCFA | 1 WA · 50 conv/mois · 5 leads · 1 agent · 1 camp. |
| `starter` | `starter` | STARTER — 19 900 FCFA | Starter — **19 000 FCFA** *(écart -900 FCFA)* | 182 400 FCFA | 1 WA · 500 conv/mois · 300 leads · 1 agent · 5 camp. |
| `growth` | `business` | BUSINESS — 49 900 FCFA | Growth — **49 000 FCFA** *(écart -900 FCFA + renommage)* | 470 400 FCFA | 3 WA · 2 500 conv/mois · 2 000 leads · 3 agents · 25 camp. |
| `pro` | `scale` | SCALE — 99 000 FCFA | Pro — **99 000 FCFA** *(renommage)* | 950 400 FCFA | 10 WA · 10 000 conv/mois · 10 000 leads · 10 agents · 100 camp. |
| `elite` | `elite` | ELITE — 199 000 FCFA | Elite — **199 000 FCFA** *(aligné)* | 1 910 400 FCFA | 25 WA · 50 000 conv/mois · 50 000 leads · 25 agents · 500 camp. |

---

## 3. Plan de Migration sans Rupture

1. **Préservation des contrats existants :** `normalizePlanId()` convertit automatiquement `free` → `essai`, `business` → `growth` et `scale` → `pro` à la lecture serveur (`server/subscriptions.ts`).
2. **Rétrocompatibilité :** `toLegacyPlanId()` maintient le champ `plan` historique dans `subscriptions/{companyId}` et `companies/{companyId}` pour les composants existants.
3. **À configurer :** Validation formelle de la grille `19 000 / 49 000 / 99 000 / 199 000 FCFA` (`CATALOG_APPROVAL_STATUS = 'approved'`) et alignement optionnel de `OnboardingWizard.tsx` avant ouverture commerciale Live.
