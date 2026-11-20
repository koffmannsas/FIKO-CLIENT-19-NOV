# ENTITLEMENTS VALIDATION REPORT — DROITS & QUOTAS FIKO CONNECT™

## 1. Résolution & Application des Droits (`Entitlements Engine`)

| Capacité / Garde-fou | Statut | Détail technique |
| :--- | :--- | :--- |
| Résolution centralisée des droits | **Implémenté & Testé** | `resolvePlanEntitlements` calcule `maxWhatsappConnections`, `maxMonthlyConversations`, `maxLeads`, `maxAiAgents`, `maxCampaignsPerMonth` et les drapeaux (`autoFollowUp`, `integrations`, `analyticsLevel`, `supportLevel`). |
| Compteurs d’usage réels | **Implémenté** | `computeLiveUsageMeters` interroge Firestore (`leads`, `messages`, `agents`, `campaigns`, `companies`) pour refléter la consommation réelle par `companyId`. |
| Conservation des compteurs à l’upgrade | **Implémenté** | Un passage à une offre supérieure met à jour `entitlements/{companyId}` immédiatement sans remettre à zéro les compteurs déjà consommés du cycle. |
| Garde-fou envoi WhatsApp serveur | **Implémenté** | `sendWhatsAppMessage` (`server/whatsapp.ts`) appelle `checkCompanyQuota(companyId, 'send_message')` et bloque en HTTP `402 QUOTA_EXCEEDED` si l’abonnement est expiré ou le plafond mensuel atteint. |
| Règles Firestore anti-élévation de privilèges | **Implémenté & Déployé** | `firestore.rules` bloque toute modification client de `subscriptions`, `entitlements`, `usage_meters`, `invoices` et `billing_ledger` (écriture réservée au service serveur). |
| Non-suppression sur downgrade / expiration | **Implémenté & Testé** | `readOnlyHistoricalAccess: true` et `computeResourceOverages` listent les ressources excédentaires sans jamais supprimer de données CRM ou WhatsApp. |

---

## 2. Points Restants

- **À configurer / étendre :** Le garde-fou `checkCompanyQuota(companyId, 'create_lead')` est disponible dans `server/subscriptions.ts` ; la création directe de leads depuis le frontend ou le webhook WhatsApp entrant peut y être branchée selon la politique d’acceptation des leads entrants hors quota (recommandation : ne pas bloquer la réception webhook WhatsApp entrante pour éviter la perte de prospects).
