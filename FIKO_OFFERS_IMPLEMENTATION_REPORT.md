# FIKO OFFERS IMPLEMENTATION REPORT — NOS OFFRES V1.0

## 1. Périmètre Implémenté

| Composant / Module | Statut | Description factuelle |
| :--- | :--- | :--- |
| Catalogue & Calculateur (`src/lib/subscriptionCatalog.ts`) | **Implémenté & Testé** | Définition versionnée des 5 offres (`essai`, `starter`, `growth`, `pro`, `elite`), calcul strict en entiers FCFA, prorata UTC, remise annuelle -20%, détection sur-quotas, Smart Billing Assistant™. |
| Backend Souscriptions (`server/subscriptions.ts`) | **Implémenté** | Endpoints protégés par `requireAuth` et isolés par `companyId` : `overview`, `quote`, `checkout`, `downgrade/cancel`, `cancel`, `reconcile/:reference`. |
| Intégration Paystack Abonnements (`server/paystack.ts`, `server.ts`) | **Implémenté** | Routage des paiements `purpose: 'subscription'`, validation HMAC SHA512 webhook, vérification API Paystack, réconciliation idempotente. |
| Sécurité & Modèle Firestore (`firestore.rules`, `firebase-blueprint.json`) | **Implémenté & Déployé** | Verrouillage des écritures client sur `subscriptions`, `billing_quotes`, `subscription_change_requests`, `invoices`, `billing_ledger`, `entitlements`, `usage_meters`, `billing_audit_events`. Déployé via `fax.DeployRules`. |
| Interface Client (`src/components/OffersModule.tsx`) | **Implémenté** | Onglets *Mon abonnement*, *Offres & Comparateur* (carrousel mobile + grille 5 colonnes + matrice), *Facturation & Historique* (reçus imprimables/HTML), modal *Confirmer mon changement d’offre*. |
| Navigation Cockpit (`src/App.tsx`, `src/components/MobileShell.tsx`) | **Implémenté** | Entrée **« Nos Offres »** ajoutée au menu latéral gauche (desktop) et au tiroir mobile « Plus » ; boutons *Changer de forfait* redirigés vers `Nos Offres` hors Mode Démo. |

---

## 2. Séparation Démo / Sandbox vs Production

- **Implémenté :** En Mode Démo (`isDemoMode === true`), `OffersModule.tsx` affiche le catalogue réel et exécute des simulations locales de devis clairement marquées **« Mode Bac à sable »**, tout en bloquant tout faux paiement.
- **À configurer :** Renseigner `PAYSTACK_SECRET_KEY` (clé Live `sk_live_...`) et `PAYSTACK_PUBLIC_KEY` (`pk_live_...`) dans les secrets d’environnement pour l’encaissement réel.
