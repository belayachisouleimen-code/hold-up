# HOLD UP! — v3 (en ligne)

Jeu de soirée compétitif : culture G, jetons fictifs et bluff. Aucun argent réel, aucun pari monétaire, aucun cash-out.

Deux façons de jouer :
- **Un seul téléphone** (`dist/solo/`) : le téléphone circule autour de la table. Aucun serveur.
- **En ligne** (racine de `dist/`) : un écran de table (télé, ordinateur ou téléphone de l'hôte) et un téléphone par équipe. Salons en temps réel par code à 4 lettres, pseudos invités sans compte, clubs avec classement.

## Mise en ligne (10 minutes, gratuit)
1. Crée un projet sur [supabase.com](https://supabase.com).
2. **SQL Editor** → New query → colle `supabase/schema.sql` → Run.
3. **Authentication → Sign In / Providers** → active **Allow anonymous sign-ins**.
4. **Project Settings → API** : copie l'URL du projet et la clé `publishable` dans `dist/config.js`.
5. Glisse le dossier `dist/` sur [app.netlify.com/drop](https://app.netlify.com/drop). Le jeu en ligne est à `https://<ton-site>/`, la version un téléphone à `/solo/`. Les anciens liens `/online/` redirigent vers la racine.

Sans configuration Supabase, la version en ligne tourne en **mode démo** : chaque onglet d'un même navigateur joue un téléphone (`?demo=1` force ce mode).

## Comment se joue une soirée en ligne
1. L'hôte ouvre le site, choisit un pseudo et **crée un salon** (éventuellement rattaché à un club). Son écran affiche le code et un QR code.
2. Chaque joueur ouvre le lien ou tape le code, crée ou rejoint une équipe. Le premier joueur d'une équipe en est le **capitaine** : c'est lui qui mise et répond. Un coéquipier peut « Prendre la main ».
3. L'hôte lance la partie et fait avancer les manches (ouvrir les enchères, manche suivante).
4. Enchères : chaque capitaine joue à son tour sur son téléphone. Réponses secrètes : **toutes les équipes répondent en même temps**, chacune sur son téléphone.
5. Une équipe absente ? L'hôte peut la **coucher d'office** sur son tour.
6. En fin de partie, le résultat est enregistré dans le club : classement par victoires, podiums, soirées jouées.

L'hôte peut aussi jouer depuis son appareil (onglet « Mon équipe »).

## Kit graphique (v1)
- `online/assets/` : 43 éléments découpés de la planche du kit (logo, cartes de catégories, jetons, boutons Suivre / Miser / Relancer / Se coucher / Passer / Valider / All in, jetons x2 / x5 / x10, cartes « Votre tour ! », « Bonne réponse ! », « Mauvaise réponse ! », carte question vierge, mascottes, icônes).
- `scripts/slice-kit.py <planche.png>` : refait le découpage si la planche change (mêmes positions).
- Utilisé dans la version en ligne : logo et mascottes à l'accueil, carte de catégorie à l'annonce, carte parchemin pour la question, boutons illustrés pour les enchères (x2 / x5 / x10 / All in = raccourcis de relance), Valider pour verrouiller la réponse, cartes plein écran sur le téléphone de l'équipe à son tour et au verdict, couronne pour le capitaine.
- La version un seul téléphone garde pour l'instant l'ancien style.

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
- `node tests/online.e2e.js` (après `npm i playwright` et `node scripts/build.js`) : une soirée complète à 4 onglets en mode démo. Club, lobby, capitaine et coéquipier, enchères, réponses secrètes, gourmandise, rechargement de l'hôte et d'un joueur, abandon forcé, fin de partie, classement.

`node scripts/build.js` reconstruit `dist/` (réinjecte `engine.js` dans la version un téléphone, numérote les fichiers pour éviter l'ancien cache, garde la configuration Supabase déjà saisie dans `dist/config.js`).

## Limites connues
- Le temps réel Supabase n'a pas encore tourné contre un vrai projet : le code suit l'API de supabase-js 2.117.2, et le mode démo emprunte exactement le même chemin applicatif. Premier test à faire dès le projet créé.
- L'hôte reçoit les réponses (il fait tourner le moteur). Si l'hôte joue aussi, il pourrait techniquement les lire dans les outils de développement du navigateur.
- Si l'écran de la table est fermé, la partie se fige jusqu'à sa réouverture.
- Pas de minuteur de tour pour l'instant (l'hôte couche les équipes absentes à la main).

## Suite possible
- Étape 4 du plan initial : PWA (icône sur l'écran d'accueil, plein écran) et minuteur de tour.
- Étape 5 : schéma de questions (annonce, principale, liée, réponses, explications), plus de questions vérifiées.
- Faire tourner le moteur dans une Edge Function Supabase pour que l'hôte n'ait plus accès aux réponses.
