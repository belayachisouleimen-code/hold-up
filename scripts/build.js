// Construit dist/, le dossier à déposer sur Netlify :
//   /            → jeu en ligne (nouvelle DA)
//   /solo/       → redirige vers le mode un seul téléphone (/?mode=solo)
//   /online/     → redirige vers / (anciens liens)
// node scripts/build.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist');
const engine = fs.readFileSync(path.join(root, 'engine.js'), 'utf8').trim();
const version = Date.now().toString(36);

// Garde la configuration Supabase déjà saisie dans dist/ (si elle existe)
const cfgPaths = [path.join(dist, 'config.js'), path.join(dist, 'online', 'config.js')];
const keptCfg = cfgPaths.filter(p => fs.existsSync(p)).map(p => fs.readFileSync(p, 'utf8')).find(c => /supabaseUrl:\s*'https:/.test(c));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// 1. Moteur injecté dans la version un téléphone (source de vérité : engine.js)
const offPath = path.join(root, 'index.html');
let off = fs.readFileSync(offPath, 'utf8');
off = off.replace(/\/\*ENGINE-START\*\/[\s\S]*?\/\*ENGINE-END\*\//, () => `/*ENGINE-START*/\n${engine}\n/*ENGINE-END*/`);
fs.writeFileSync(offPath, off);
fs.mkdirSync(path.join(dist, 'solo'));
fs.writeFileSync(path.join(dist, 'solo', 'index.html'), `<!doctype html><meta charset="utf-8"><title>HOLD UP!</title><script>location.replace('../?mode=solo')</script><a href="../?mode=solo">HOLD UP!</a>\n`);

// 2. Jeu en ligne à la racine, avec numéro de version sur les fichiers (évite l'ancien cache)
fs.cpSync(path.join(root, 'online'), dist, { recursive: true });
for (const f of ['engine.js', 'bank.js', 'questions-open.js']) fs.copyFileSync(path.join(root, f), path.join(dist, f));
if (keptCfg) fs.writeFileSync(path.join(dist, 'config.js'), keptCfg);
const idx = path.join(dist, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/(href|src)="((?:style\.css|app\.js|net\.js|engine\.js|bank\.js|questions-open\.js|config\.js))"/g, `$1="$2?v=${version}"`));

// 3. Anciens liens /online/ → /
fs.mkdirSync(path.join(dist, 'online'));
fs.writeFileSync(path.join(dist, 'online', 'index.html'), `<!doctype html><meta charset="utf-8"><title>HOLD UP!</title><script>location.replace('../' + location.search)</script><a href="../">HOLD UP!</a>\n`);

// 4. Netlify : toujours revalider le HTML et le code
fs.writeFileSync(path.join(dist, '_headers'), `/*\n  Cache-Control: no-cache\n/assets/*\n  Cache-Control: public, max-age=86400\n`);
console.log(`dist/ prêt (version ${version}${keptCfg ? ', configuration Supabase conservée' : ''})`);
