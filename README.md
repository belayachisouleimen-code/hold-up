# HOLD UP! — jeu de soirée

Culture G, jetons fictifs et bluff, entre potes. Tout se passe sur téléphone : rien à imprimer, rien à installer (le site s'ajoute à l'écran d'accueil comme une app). Aucun argent réel, aucun pari monétaire, aucun cash-out.

## Deux façons de jouer (accueil du site)
- **Un seul téléphone** : on se le passe autour de la table. Écran « Passe le téléphone à l'équipe… » pour les réponses secrètes, annuler la dernière action, reprise automatique si l'appli se ferme. Fonctionne même sans connexion au serveur.
- **Chacun son téléphone** : ton écran devient la table (QR code, lien à partager), chaque équipe joue sur son téléphone. Nom d'équipe proposé d'office, pseudo + avatar demandés seulement à ce moment-là.

## Soirée sans prise de tête (mode en ligne)
- **Rythme Auto** (par défaut) : l'annonce s'ouvre seule après 8 s, chaque équipe a 40 s pour miser (sinon elle passe si c'est gratuit, ou se couche) et 45 s pour répondre (sinon elle se couche), la manche suivante démarre 15 s après l'abattage. Chrono visible (barre du kit). Bouton **Pause** pour l'hôte.
- **Rythme Libre** : l'hôte fait avancer à la main, pas de chrono.
- L'écran reste allumé pendant la partie. « Revenir au salon » sur l'accueil si un téléphone se recharge.
- « Comment jouer ? » : les règles en 4 cartes.
- 63 questions avec question liée, tirées au hasard sans répétition dans une partie.

## Mise en ligne (10 minutes, gratuit)
1. Crée un projet sur [supabase.com](https://supabase.com).
2. **SQL Editor** → New query → colle `supabase/schema.sql` → Run.
3. **Authentication → Sign In / Providers** → active **Allow anonymous sign-ins**.
4. **Project Settings → API** : copie l'URL du projet et la clé `publishable` dans `dist/config.js`.
5. Glisse le dossier `dist/` sur [app.netlify.com/drop](https://app.netlify.com/drop). Le jeu est à `https://<ton-site>/`. `/solo/` ouvre directement le mode un seul téléphone, les anciens liens `/online/` redirigent vers la racine.

Sans configuration Supabase, la version en ligne tourne en **mode démo** : chaque onglet d'un même navigateur joue un téléphone (`?demo=1` force ce mode).

## Comment se joue une soirée en ligne
1. L'hôte ouvre le site, choisit un pseudo et **crée un salon** (éventuellement rattaché à un club). Son écran affiche le code et un QR code.
2. Chaque joueur ouvre le lien ou tape le code, crée ou rejoint une équipe. Le premier joueur d'une équipe en est le **capitaine** : c'est lui qui mise et répond. Un coéquipier peut « Prendre la main ».
3. L'hôte lance la partie et fait avancer les manches (ouvrir les enchères, manche suivante).
4. Enchères : chaque capitaine joue à son tour sur son téléphone. Réponses secrètes : **toutes les équipes répondent en même temps**, chacune sur son téléphone.
5. Une équipe absente ? L'hôte peut la **coucher d'office** sur son tour.
6. En fin de partie, le résultat est enregistré dans le club : classement par victoires, podiums, soirées jouées.

L'hôte peut aussi jouer depuis son appareil (onglet « Mon équipe »).

## Kit graphique (v2)
- `online/assets/` : éléments découpés de la planche du kit 2 (logo, 8 cartes de catégories, jetons 1 à 500, boutons Miser / Suivre / Relancer / Se coucher / Valider / Passer / All in / Quitter / Inviter des amis, jetons x2 / x5 / x10, carte question en paysage, carte mystère, badges de rang Bronze à Légende, cartes Bonne / Mauvaise réponse, bandeaux Classement et Mon club, icônes).
- Repris du kit 1 : la carte « Votre tour ! » et les mascottes de l'accueil (absentes du kit 2).
- `scripts/slice-kit.py <planche.png> <dossier>` : refait le découpage (positions du kit 2).
- Avatars : chaque joueur met **sa photo** (appareil photo ou galerie, recadrée et compressée sur le téléphone) **ou un perso animal** (chat, chien, raton laveur, tortue, girafe, renard, panda, grenouille, singe, lion, pieuvre, flamant rose) dans un médaillon doré. Affiché dans les équipes, le classement et le club.
- Dans le jeu : carte mystère quand une équipe gagne sans révéler, badges de rang dans le classement du club (Argent dès 2 victoires, Or 5, Platine 10, Diamant 15, Légende 25), bouton Inviter des amis (partage ou copie du code du club), bouton Quitter.
- Non utilisés pour l'instant : « La réponse était… » (illustration propre à une question), pastille d'équipe. Le sablier sert au chrono, sa barre est redessinée en CSS.

## Architecture
- `engine.js` : moteur de règles pur (source de vérité, partagé par les deux versions).
- L'**hôte fait autorité** : les téléphones envoient des actions (`actions`), l'hôte les valide avec le moteur et publie une **vue publique** (`rooms.state`) que tout le salon écoute en temps réel.
- La vue publique ne contient **jamais** les bonnes réponses ni les réponses des équipes avant l'abattage. Elle ne les contient jamais du tout si l'équipe gagne parce que les autres se sont couchées.
- Les règles RLS de Supabase empêchent un joueur de lire les actions des autres (donc leurs réponses), de modifier le salon ou d'écrire au nom de quelqu'un d'autre.
- L'état complet de l'hôte est sauvegardé (`room_private`, lisible par l'hôte seul) : si l'écran de la table se recharge, la partie reprend où elle en était.
- `online/net.js` : couche réseau avec deux implémentations de la même interface (Supabase, démo locale).
- `online/vendor/supabase.js` : supabase-js 2.117.2 embarqué (pas de dépendance à un CDN).

## Règles (inchangées depuis la v2)
- 2 à 6 équipes, blindes 1/2, donneur tournant. En tête-à-tête, le donneur paie la petite blinde.
- Deux tours d'enchères : avant la question, puis après les réponses secrètes. Se coucher, parole, suivre, relancer, tapis.
- Relance minimum = dernière relance complète. Un tapis trop court ne rouvre pas les relances.
- Pots annexes : une équipe à tapis ne gagne que ce qu'elle a couvert. Mise non suivie rendue.
- Gourmandise : 3 jetons, question liée. Réussie = prioritaire sur le pot. Ratée = exclue du pot.
- Tout le monde se couche : la dernière équipe gagne sans révéler sa réponse.
- Personne n'a trouvé : jackpot reporté. Jackpot non réclamé en fin de partie : partagé.

## Tests
- `node tests/engine.test.js` : 23 tests du moteur, dont 400 parties aléatoires (total des jetons vérifié après chaque action).
- `node tests/rls.test.mjs` (après `npm i @electric-sql/pglite`) : le schéma et toutes les règles d'accès dans un vrai Postgres embarqué.
- `node tests/solo-timers.e2e.js` : mode un seul téléphone (préparation, annuler, réponses secrètes, reprise, conservation des jetons, même sans serveur) et chronos automatiques (ouverture, temps écoulé, manche suivante, pause).
- `node tests/online.e2e.js` (après `npm i playwright` et `node scripts/build.js`) : une soirée complète à 4 onglets en mode démo. Club, lobby, capitaine et coéquipier, enchères, réponses secrètes, gourmandise, rechargement de l'hôte et d'un joueur, abandon forcé, fin de partie, classement.

`node scripts/build.js` reconstruit `dist/` (réinjecte `engine.js` dans la version un téléphone, numérote les fichiers pour éviter l'ancien cache, garde la configuration Supabase déjà saisie dans `dist/config.js`).

## Limites connues
- Le temps réel Supabase n'a pas encore tourné contre un vrai projet : le code suit l'API de supabase-js 2.117.2, et le mode démo emprunte exactement le même chemin applicatif. Premier test à faire dès le projet créé.
- L'hôte reçoit les réponses (il fait tourner le moteur). Si l'hôte joue aussi, il pourrait techniquement les lire dans les outils de développement du navigateur.
- Si l'écran de la table est fermé, la partie se fige jusqu'à sa réouverture.


## Suite possible
- Mode hors ligne complet (service worker) pour le mode un seul téléphone.
- Étape 5 : schéma de questions (annonce, principale, liée, réponses, explications), plus de questions vérifiées.
- Faire tourner le moteur dans une Edge Function Supabase pour que l'hôte n'ait plus accès aux réponses.
