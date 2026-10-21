// Test bout en bout du mode en ligne, en mode démo (onglets d'un même navigateur).
// npm i playwright && node scripts/build.js && node tests/online.e2e.js
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/index.html?demo=1`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  await ctx.route(/fonts\.googleapis|cdnjs/, r => r.abort());
  const errors = [];
  const open = async name => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); await p.goto(base); await p.fill('#pseudo', name); await p.click('[data-a=savePseudo]'); await p.waitForSelector('[data-a=join]'); return p; };
  const click = (p, sel) => p.click(sel);
  const text = p => p.textContent('main');
  const waitText = (p, s, ms = 5000) => p.waitForFunction(t => document.querySelector('main').textContent.includes(t), s, { timeout: ms });
  const db = p => p.evaluate(() => { const o = { rooms: {}, priv: {} }; for (const k of Object.keys(localStorage)) { const m = k.match(/^holdup-demo:(room|priv):(.+)$/); if (m) o[m[1] === 'room' ? 'rooms' : 'priv'][m[2]] = JSON.parse(localStorage.getItem(k)); } return o; });
  global.dump = async () => { for (const p of ctx.pages()) console.log('---', (await p.textContent('main')).slice(0, 400)); console.log('ERR', errors); };
  let n = 0; const ok = m => { n++; console.log('✓', m); };

  // Hôte : club + salon
  const host = await open('Soul');
  await click(host, '[data-a=clubs]'); await host.fill('#clubName', 'Les Jeudis'); await click(host, '[data-a=createClub]');
  await waitText(host, 'Les Jeudis'); const clubCode = (await text(host)).match(/Code ([A-Z0-9]{6})/)[1]; ok('club créé ' + clubCode);
  await click(host, '[data-a=home]'); await host.selectOption('#roomClub', clubCode); await click(host, '[data-a=create]');
  await host.waitForSelector('.roomcode'); const code = (await host.textContent('.roomcode')).trim(); ok('salon ' + code);

  // Joueurs
  const a1 = await open('Alice'), a2 = await open('Amine'), b1 = await open('Bruno');
  for (const p of [a1, a2, b1]) { await p.fill('#joinCode', code.toLowerCase()); await click(p, '[data-a=join]'); await p.waitForSelector('text=Choisis ton équipe'); }
  await a1.fill('#teamName', 'Les Renards'); await click(a1, '[data-a=newTeam]'); await waitText(a1, 'Tu es capitaine');
  await b1.fill('#teamName', 'Les Pirates'); await b1.press('#teamName', 'Enter'); await waitText(b1, 'Tu es capitaine');
  await waitText(a2, 'Les Renards'); await click(a2, '[data-a=joinTeam][data-v="Les Renards"]'); await waitText(a2, 'Ton capitaine mise');
  await waitText(host, 'AliceAmine'); ok('lobby : 2 équipes, capitaine + coéquipier');
  // Doublon de nom refusé côté hôte ? (même nom = rejoindre) — erreur : nom vide
  await host.selectOption('#setRounds', '6');
  await click(host, '[data-a=start]'); await waitText(host, 'Ouvrir les enchères'); await waitText(a1, 'L’annonce'); ok('partie lancée, annonce reçue');

  // Manche 1 : Renards (donneur, petite blinde) parlent en premier en tête-à-tête
  await click(host, '[data-a=open]'); await waitText(a1, 'À vous de parler'); await a1.waitForSelector('.overlay img[src*="card-tour"]', { state: 'attached', timeout: 3000 }); ok('carte « Votre tour ! » sur le téléphone du capitaine');
  assert.ok(!(await text(a2)).includes('Se coucher'), 'le coéquipier ne doit pas avoir les boutons');
  await click(b1, '[data-a=bet][data-v=call]').catch(() => {}); // pas son tour : bouton absent
  await click(a1, '[data-a=bet][data-v=call]'); await waitText(b1, 'À vous de parler'); await click(b1, '[data-a=bet][data-v=check]');
  await waitText(a1, 'Réponse secrète'); ok('enchères 1 → réponses');
  let s = (await db(host)).rooms[code].state.game; assert.strictEqual(s.question.answer, undefined); assert.strictEqual(s.question.bonusAnswer, undefined); ok('vue publique sans bonne réponse');
  await waitText(a2, 'Votre capitaine répond'); ok('le coéquipier voit la question sans pouvoir répondre');
  const priv = (await db(host)).priv[code].g; const q = priv.question;
  await click(a1, `[data-a=pick][data-v="${q.answer}"]`); await a1.check('#greedy'); await click(a1, `[data-a=pickb][data-v="${q.bonusAnswer}"]`); await click(a1, '[data-a=lock]');
  await waitText(a1, 'Réponse verrouillée'); await waitText(host, 'A répondu');
  s = (await db(host)).rooms[code].state.game; assert.strictEqual(s.teams[0].answer, null); assert.strictEqual(s.teams[0].greedy, false); ok('réponse et gourmandise des Renards invisibles aux autres');
  await click(b1, `[data-a=pick][data-v="${(q.answer + 1) % 4}"]`); await click(b1, '[data-a=lock]');
  await waitText(b1, 'Après les réponses'); ok('enchères 2');
  // Pirates parlent en premier après le donneur
  await waitText(b1, 'À vous de parler'); await click(b1, '[data-a=bet][data-v=check]');
  await waitText(a1, 'À vous de parler'); await click(a1, '[data-a=bet][data-v=raise]');
  await b1.waitForSelector('[data-a=bet][data-v=call][aria-label="Suivre 2"]'); await click(b1, '[data-a=bet][data-v=call]');
  await Promise.all([b1.waitForSelector('.overlay img[src*="card-mauvaise"]', { state: 'attached', timeout: 5000 }), a1.waitForSelector('.overlay img[src*="card-bonne"]', { state: 'attached', timeout: 5000 })]); ok('cartes Bonne / Mauvaise réponse');
  await waitText(host, 'Abattage'); await waitText(b1, 'Abattage'); const t = await text(b1);
  assert.ok(t.includes('gourmandise')); assert.ok(t.includes('Les Renards +')); ok('abattage : Renards gagnent avec la gourmandise');

  // Rechargement de l'hôte en pleine partie
  await click(host, '[data-a=next]'); await waitText(host, 'Ouvrir les enchères');
  await host.reload(); await waitText(host, 'Ouvrir les enchères'); await waitText(host, 'Manche 2/6'); ok('hôte rechargé : partie reprise');
  await click(host, '[data-a=open]');
  // Rechargement d'un joueur
  await b1.reload(); await waitText(b1, 'Les Pirates'); ok('joueur rechargé : retrouve son équipe');

  // Abandon forcé par l'hôte pour une équipe absente
  await host.waitForSelector('[data-a=abandon]'); await click(host, '[data-a=abandon]'); await waitText(host, 'rafle'); ok('hôte couche une équipe absente');

  // Manches restantes au plus vite
  for (let r = 3; r <= 6; r++) {
    await click(host, '[data-a=next]'); await waitText(host, `Manche ${r}/6`); await click(host, '[data-a=open]');
    await host.waitForSelector('[data-a=abandon]'); await click(host, '[data-a=abandon]'); await waitText(host, 'rafle');
  }
  await click(host, '[data-a=next]'); await waitText(host, 'gagne la table'); await waitText(host, 'Résultat enregistré dans le club');
  await waitText(a2, 'gagne la table'); ok('fin de partie vue par tous, résultat enregistré');

  // Classement du club
  await click(a2, '[data-a=leave]'); await click(a2, '[data-a=clubs]'); await a2.fill('#clubCode', clubCode); await click(a2, '[data-a=joinClub]');
  await waitText(a2, 'Victoires'); const lb = await a2.textContent('.lb'); assert.ok(lb.includes('Alice') && lb.includes('Bruno')); ok('classement du club');

  // Total des jetons
  const g = (await db(host)).priv[code].g; assert.strictEqual(g.teams.reduce((x, t) => x + t.chips, 0), 60); ok('jetons conservés (60)');
  if (process.env.SHOTS) await host.screenshot({ path: path.join(process.env.SHOTS, 'host.png') });
  assert.deepStrictEqual(errors, []); ok('aucune erreur JavaScript');
  console.log(`\n${n} vérifications réussies`);
  await browser.close(); server.close();
})().catch(async e => { console.error('✗', e.message); if (global.dump) await global.dump(); process.exit(1); });
