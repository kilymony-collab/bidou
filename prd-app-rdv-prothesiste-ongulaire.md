# PRD — Application de gestion de rendez-vous pour prothésiste ongulaire

## Vue d’ensemble
Cette application a pour objectif de permettre à une prothésiste ongulaire professionnelle de visualiser facilement tous ses rendez-vous et de gérer les fiches de ses clientes dans une interface simple, utilisable sans compétence informatique préalable [file:16].

La première version du produit est pensée comme un MVP centré sur la consultation du planning, l’accès aux informations client et la gestion manuelle des fiches clientes, sans création de compte ni automatisation avancée [file:16][file:17].

## Problème produit
Le besoin principal est de centraliser les rendez-vous avec les informations essentielles associées, notamment le nom, le prénom, le jour, l’heure et la prestation, afin d’éviter une gestion dispersée ou difficile à suivre au quotidien [file:16].

L’application doit donc offrir une vision claire des rendez-vous à venir et un accès rapide aux données de chaque cliente dans un seul outil [file:17].

## Utilisatrice cible
L’utilisatrice principale est une prothésiste ongulaire professionnelle [file:16].

Elle est décrite comme ayant peu ou pas de compétences informatiques, ce qui implique une expérience très simple, lisible et rassurante, avec peu d’actions complexes et une navigation évidente [file:16].

## Objectifs du MVP
Le MVP doit permettre à l’utilisatrice de gérer les usages quotidiens essentiels sans dépendre d’un système complexe [file:16].

Les objectifs principaux sont les suivants :
- Voir les rendez-vous dans un calendrier [file:16].
- Consulter la fiche d’une cliente [file:16].
- Créer une fiche cliente [file:16].
- Supprimer une fiche cliente si nécessaire [file:16].
- Recevoir une notification avant un rendez-vous [file:16].

## Cas d’usage
Les cas d’usage métier de la V1 sont directement issus du cadre fourni [file:16][file:17].

1. Visualiser les rendez-vous dans un calendrier pour connaître rapidement l’organisation de la journée ou des prochains jours [file:16].
2. Ouvrir une fiche cliente pour consulter ses informations [file:16].
3. Créer une nouvelle fiche cliente lorsqu’une nouvelle personne doit être ajoutée au suivi [file:16].
4. Supprimer une fiche cliente lorsqu’elle n’est plus utile ou qu’elle a été créée par erreur [file:16].

## Fonctionnalités fonctionnelles
### Fonctionnalités incluses
La V1 inclut les fonctionnalités suivantes [file:16]:

- Affichage des rendez-vous dans une vue calendrier [file:16].
- Consultation des fiches clientes [file:16].
- Création manuelle d’une fiche cliente [file:16].
- Suppression d’une fiche cliente [file:16].
- Notifications avant rendez-vous [file:16].
- Interface adaptée au mobile et au PC [file:16].

### Détail attendu par fonctionnalité
| Fonctionnalité | Description attendue |
|---|---|
| Calendrier | L’utilisatrice consulte ses rendez-vous avec les informations essentielles : nom, prénom, jour, heure, prestation [file:16] |
| Fiche cliente | L’utilisatrice ouvre une fiche pour consulter les informations d’une cliente [file:16] |
| Création de fiche | L’utilisatrice ajoute manuellement une nouvelle cliente dans l’application [file:16] |
| Suppression de fiche | L’utilisatrice peut supprimer une fiche existante [file:16] |
| Notification | L’application envoie un rappel avant un rendez-vous [file:16] |
| Responsive | L’application fonctionne sur mobile et sur ordinateur [file:16] |

## Exigences non fonctionnelles
L’interface doit être extrêmement simple à prendre en main, avec une priorité donnée à la lisibilité, à la clarté des actions et à la réduction du nombre d’étapes nécessaires pour accomplir une tâche, car l’utilisatrice cible ne possède pas de compétences informatiques avancées [file:16].

Le produit doit être utilisable sur mobile et sur PC, ce qui implique une interface responsive et une navigation cohérente sur les deux formats [file:16].

Le système doit également être capable de gérer des notifications avant rendez-vous, même si le mode exact de notification devra être précisé dans une étape ultérieure du cadrage produit [file:16].

## Hors périmètre
Les éléments explicitement exclus du MVP sont les suivants [file:16]:

- Pas de création de compte [file:16].
- Pas de création automatique de fiche client [file:16].

Cela signifie que la V1 doit rester simple, avec un usage direct, sans authentification complexe ni automatisation avancée des données clientes [file:16].

## Critères de succès
Le MVP sera considéré comme réussi lorsque tous les cas d’usage définis seront respectés et fonctionneront correctement dans l’application [file:16].

Concrètement, cela veut dire que l’utilisatrice devra pouvoir consulter ses rendez-vous, accéder aux fiches clientes, créer une fiche et en supprimer une sans blocage fonctionnel [file:16].

## Parcours utilisateur principal
Le parcours principal de la V1 peut être formulé ainsi à partir du besoin exprimé [file:16]:

1. L’utilisatrice ouvre l’application.
2. Elle visualise son calendrier de rendez-vous [file:16].
3. Elle sélectionne un rendez-vous ou une cliente.
4. Elle consulte la fiche cliente correspondante [file:16].
5. Si besoin, elle crée une nouvelle fiche ou supprime une fiche existante [file:16].
6. Elle reçoit un rappel avant le rendez-vous concerné [file:16].

## Données minimales à gérer
Pour couvrir le besoin formulé, l’application devra au minimum manipuler les données suivantes [file:16]:

- Nom de la cliente [file:16].
- Prénom de la cliente [file:16].
- Jour du rendez-vous [file:16].
- Heure du rendez-vous [file:16].
- Prestation prévue [file:16].

Ces données constituent le socle minimal pour faire fonctionner la vue calendrier et les fiches clientes dans la première version [file:16].

## Recommandations produit pour la suite
Compte tenu du profil utilisateur, il sera pertinent dans une phase suivante d’ajouter des éléments de confort comme une recherche client, un bouton d’ajout rapide, une confirmation avant suppression et des rappels plus configurables, mais ces points ne font pas partie du périmètre validé à ce stade [file:16].
