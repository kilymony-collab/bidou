# Prompt pour Claude Code — automatisation RDV avec Cal.com, Tally, Make et interface locale

Tu es mon assistant technique.
Tu dois m'aider à **réaliser l'automatisation complète** de mon système de prise de rendez-vous, en partant du principe que **je n'ai aucune compétence technique** et que le projet doit être fait avec **Claude Code + outils no-code**. Le besoin métier concerne une **prothésiste ongulaire** qui veut gérer ses demandes de rendez-vous et son planning dans une interface simple.[cite:35][cite:36]

## Objectif

Je veux mettre en place un système où :

1. Le client choisit une **date et une heure dans Cal.com**.[cite:103]
2. Le client remplit ensuite un **formulaire Tally** avec les informations indispensables.[cite:4]
3. **Make** récupère les informations de Cal.com et de Tally.[cite:103][cite:4][cite:11]
4. Les données sont ajoutées dans une base de données simple qui alimente mon interface actuelle.[cite:78]
5. **J'accepte ou je refuse la demande depuis mon interface**.[cite:36]
6. Si j'accepte, la réservation est **confirmée dans Cal.com** via l'API.[cite:46]
7. Si je refuse, la réservation est **annulée dans Cal.com** via l'API.[cite:99]
8. Le client reçoit ensuite un message ou un email selon le statut final.

## Contraintes importantes

- Je veux utiliser **Cal.com** comme calendrier principal, pas Google Calendar.[cite:103]
- Je veux rester, si possible, sur la **version gratuite de Cal.com**.[cite:107]
- La fonction de **redirection personnalisée après booking dans Cal.com** semble liée à un réglage avancé et peut ne pas être disponible dans le plan gratuit, donc il ne faut pas dépendre de cette fonction pour le workflow.[cite:12][cite:104]
- La transition entre Cal.com et Tally doit donc être gérée **sans dépendre obligatoirement de la redirection native de Cal.com**.[cite:12][cite:106]
- Le lien entre une réservation Cal.com et un formulaire Tally doit se faire avec :
  - le **nom du client**,
  - le **numéro de téléphone**,
  - idéalement aussi la **date/heure du créneau** pour sécuriser la correspondance.[cite:104][cite:103]
- Mon interface actuelle est **en local sur mon PC** (`nails_planner.html`), donc il ne faut pas essayer de la modifier directement depuis Internet ; il faut passer par une **base de données en ligne** puis faire lire cette base par l'interface.[cite:78][cite:82][cite:85]
- Mon objectif est de garder une solution **simple, robuste, no-code autant que possible**, et compréhensible pour une personne non technique.[cite:35][cite:37]

## Choix techniques à respecter

Je veux que tu travailles avec cette architecture cible :

| Élément | Rôle |
|---|---|
| Cal.com | Le client choisit un créneau et une demande de réservation est créée.[cite:103] |
| Tally | Le client remplit les informations complémentaires indispensables.[cite:4] |
| Make | Fait les automatisations, relie les données et appelle l'API Cal.com si besoin.[cite:11][cite:103] |
| Base de données simple | Stocke les demandes et alimente l'interface, par exemple Airtable pour la V1.[cite:78] |
| Mon interface | Affiche les demandes et me permet d'accepter/refuser.[cite:36] |

## Workflow métier exact

Je veux que tu construises la logique suivante :

### Étape 1 — Réservation du créneau

- Le client réserve un créneau dans **Cal.com**.[cite:103]
- Cal.com doit envoyer les informations de réservation à **Make** via webhook.[cite:103][cite:106]
- Les informations minimales à récupérer depuis Cal.com sont :
  - identifiant de réservation / booking UID,
  - nom du client,
  - téléphone,
  - date,
  - heure,
  - statut de réservation si disponible.[cite:103][cite:46]

### Étape 2 — Envoi vers Tally sans redirection payante Cal.com

Comme je veux éviter de dépendre d'une redirection potentiellement payante dans Cal.com :

- après la création de la réservation, **Make doit envoyer automatiquement un email ou message contenant le lien Tally** au client.[cite:106][cite:11]
- ce message doit expliquer que le formulaire Tally est **obligatoire pour finaliser la demande**.
- si tu vois une meilleure solution gratuite, propose-la, mais sans dépendre d'une fonctionnalité premium Cal.com.[cite:12][cite:107]

### Étape 3 — Soumission Tally

- Le client remplit le formulaire **Tally**.[cite:4]
- Tally envoie les réponses à **Make** via webhook.[cite:4]
- Les données minimales du formulaire doivent inclure :
  - nom,
  - téléphone,
  - prestation demandée,
  - notes ou informations utiles,
  - tout autre champ nécessaire au métier.

### Étape 4 — Rapprochement des données

- Make doit retrouver la bonne réservation Cal.com à partir du formulaire Tally.
- La logique de rapprochement à utiliser doit être, dans cet ordre :
  1. numéro de téléphone,
  2. nom,
  3. date/heure si nécessaire.[cite:104][cite:103]
- Si aucune réservation correspondante n'est trouvée, il faut créer un statut du type : `formulaire_sans_booking` ou `a_verifier_manuellement`.
- Si plusieurs correspondances existent, il faut créer un statut du type : `doublon_a_verifier`.

### Étape 5 — Stockage dans la base

Je veux que les données soient stockées dans une base simple qui alimentera mon interface. Pour la V1, privilégie **Airtable** si c'est le plus simple.[cite:78]

Crée une structure de données claire avec au minimum ces champs :

- `booking_uid_calcom`
- `nom_client`
- `telephone_client`
- `date_rdv`
- `heure_rdv`
- `statut_booking_calcom`
- `statut_formulaire_tally`
- `statut_interne`
- `prestation`
- `notes_client`
- `date_creation_demande`
- `source`

Je veux aussi un statut interne simple du type :
- `en_attente_formulaire`
- `en_attente_validation`
- `accepte`
- `refuse`
- `a_verifier`

### Étape 6 — Affichage dans mon interface

Mon interface actuelle est locale. Je veux que tu m'expliques comment la transformer pour qu'elle :

- lise les données depuis Airtable ou la base choisie,[cite:78]
- affiche les demandes en attente,
- affiche les rendez-vous acceptés,
- affiche les informations importantes,
- me propose deux actions : **Accepter** et **Refuser**.

Je veux une explication très simple de ce qu'il faut modifier dans le fichier HTML / JavaScript existant, sans jargon inutile.[cite:35][cite:37]

### Étape 7 — Action depuis l'interface

Quand je clique sur **Accepter** ou **Refuser** dans mon interface :

- l'action doit partir vers **Make** ou une passerelle simple,
- Make doit ensuite appeler l'API Cal.com :
  - **Confirm booking** si j'accepte,[cite:46]
  - **Cancel booking** si je refuse.[cite:99]
- la base doit être mise à jour avec le nouveau statut,
- le client doit recevoir un message final correspondant.

## Ce que j'attends de toi

Je veux que tu me proposes une **mise en oeuvre concrète**, étape par étape, avec un niveau très simple.

Je veux que tu m'aides à produire les éléments suivants :

1. Le **schéma complet du workflow**.
2. La **structure Airtable** exacte.
3. Les **scénarios Make** exacts à créer, module par module.
4. Les **webhooks** à prévoir.
5. La logique d'**acceptation / refus depuis mon interface**.
6. Les **modifications à faire dans mon interface locale** pour qu'elle lise la base et envoie les actions.
7. Une proposition de **méthode simple et sécurisée** pour connecter l'interface locale à Make sans backend complexe.
8. Une **V1 la plus simple possible**, puis une **V2 plus propre** si besoin.

## Livrables attendus

Je veux que tu me répondes avec cette structure :

### 1. Architecture générale
Explique très simplement chaque brique et son rôle.

### 2. Base de données
Donne-moi les tables / champs exacts à créer.

### 3. Scénarios Make
Décris chaque scénario un par un, avec le nom des modules et l'ordre logique.

### 4. Interface locale
Explique ce qu'il faut changer dans `nails_planner.html` pour connecter l'interface à la base et aux actions.

### 5. Parcours utilisateur complet
Décris le parcours complet du client et le mien, du début à la fin.

### 6. Plan d'exécution
Donne-moi un ordre de réalisation ultra simple, étape par étape, en commençant par la V1 la plus faisable.

## Règles de réponse

- Parle-moi comme à quelqu'un qui **n'a aucune compétence technique**.[cite:35][cite:37]
- Si tu proposes plusieurs options, **recommande toujours celle qui est la plus simple**.
- Évite les solutions complexes si une solution plus simple marche.
- Si une contrainte rend une idée fragile, dis-le clairement.
- Si une partie nécessite du code, donne-moi soit le code prêt à copier, soit une explication ultra simple de ce qu'il faut mettre.
- Ne suppose pas que mon interface locale peut être modifiée directement par Internet.
- Ne base pas le système sur une fonctionnalité payante de Cal.com tant que ce n'est pas confirmé comme disponible en gratuit.[cite:12][cite:104][cite:107]

## Résumé ultra court du besoin

Je veux un système où **Cal.com gère le créneau**, **Tally récupère les informations client**, **Make relie et automatise**, **Airtable stocke**, et **mon interface locale me permet d'accepter ou refuser les demandes**, puis déclenche la confirmation ou l'annulation dans Cal.com.
