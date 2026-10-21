// Mode Banque en un seul téléphone, de la préparation au classement final.
// npm i playwright && node scripts/build.js && node tests/bank.e2e.js [dossier de captures]
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', 'dist'), shots = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const fontDir = process.env.FONTS;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let p = fontDir && u.startsWith('/f/') ? path.join(fontDir, u.slice(3)) : path.join(root, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 400, height: 860 } }), errors = [];
  await ctx.route(/cdnjs/, r => r.abort());
  const fontCss = fontDir ? `@font-face{font-family:"Lilita One";src:url(/f/lilita-one/files/lilita-one-latin-400-normal.woff2) format("woff2")}` + [400, 700, 800].map(w => `@font-face{font-family:"Nunito";font-weight:${w};src:url(/f/nunito/files/nunito-latin-${w}-normal.woff2) format("woff2")}`).join('') : '';
  await ctx.route(/fonts\.googleapis/, r => fontDir ? r.fulfill({ contentType: 'text/css', body: fontCss }) : r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  let n = 0; const ok = m => { n++; console.log('✓', m); };
  const shot = async name => { if (shots) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(shots, name + '.png') }); } };
  const save = () => p.evaluate(() => JSON.parse(localStorage.getItem('holdup-solo')));
  const noOverlay = () => p.waitForSelector('.overlay', { state: 'detached', timeout: 4000 }).catch(() => {});

  await p.goto(`http://localhost:${server.address().port}/?mode=solo&demo=1`);
  await p.waitForSelector('[data-a=soloKind][data-v=bank][aria-checked=true]'); ok('Banque proposée par défaut');
  assert.ok((await p.textContent('main')).includes('12 duels')); ok('durée annoncée (3 équipes, 2 tours = 12 duels)');
  await shot('b0_setup');
  await p.click('[data-a=soloStart]'); await p.waitForSelector('[data-a=bankBet]'); ok('premier duel : mise');
  await p.click('[data-a=bankSet][data-v="5"]'); await shot('b1_bet'); await p.click('[data-a=bankBet]');
  await p.waitForSelector('[data-a=bankDiff]'); assert.ok((await p.textContent('main')).includes('gain possible : 15')); ok('difficulté : gains affichés'); await shot('b2_diff');
  await p.click('[data-a=bankDiff][data-v="2"]'); await p.waitForSelector('[data-a=bankJudge]');
  assert.ok(!(await p.isVisible('.reveal .answer')), 'réponse cachée par défaut'); await p.click('.reveal summary'); assert.ok(await p.isVisible('.reveal .answer')); ok('question lue, réponse visible à la demande'); await shot('b3_question');
  await p.click('[data-a=bankJudge][data-v="1"]'); await p.waitForSelector('.overlay img[src*=card-bonne]', { state: 'attached' }); await noOverlay();
  await p.waitForSelector('[data-a=bankEncore]'); assert.ok((await p.textContent('main')).includes('10 jetons en jeu')); ok('bonne réponse : 10 jetons en jeu'); await shot('b4_encore');
  await p.click('[data-a=bankEncore][data-v="1"]'); await p.click('[data-a=bankDiff][data-v="3"]'); await p.click('[data-a=bankJudge][data-v="0"]'); await noOverlay();
  await p.waitForSelector('[data-a=bankSteal]'); ok('encore puis erreur : vol proposé'); await shot('b5_steal');
  const before = await save(); const thief = before.g.teams.map((t, i) => i).find(i => i !== before.g.duel.bank && i !== before.g.duel.player);
  await p.click(`[data-a=bankSteal][data-v="${thief}"]`); await p.waitForSelector('[data-a=bankNext]');
  let sv = await save(); assert.strictEqual(sv.g.teams[thief].chips, 35); assert.strictEqual(sv.g.teams[sv.g.duel.player].chips, 25); ok('la mise est volée par une autre équipe'); await shot('b6_result');
  await p.click('[data-a=soloUndo]'); await p.waitForSelector('[data-a=bankSteal]'); ok('annuler la dernière action');
  await p.click('[data-a=bankSteal][data-v=""]'); await p.waitForSelector('[data-a=bankNext]');
  await p.reload(); await p.waitForSelector('[data-a=bankNext]'); ok('rechargement : duel repris');
  // le reste de la partie au plus vite
  let guard = 0;
  while (guard++ < 200) {
    const s2 = await save(); if (s2.g.phase === 'end') break;
    const ph = s2.g.phase;
    if (ph === 'result') await p.click('[data-a=bankNext]');
    else if (ph === 'bet') await p.click('[data-a=bankBet]');
    else if (ph === 'difficulty') await p.click('[data-a=bankDiff][data-v="1"]');
    else if (ph === 'question') { await p.click(`[data-a=bankJudge][data-v="${guard % 3 ? 1 : 0}"]`); await noOverlay(); }
    else if (ph === 'encore') await p.click('[data-a=bankEncore][data-v="0"]');
    else if (ph === 'steal') await p.click('[data-a=bankSteal][data-v=""]');
  }
  await p.waitForSelector('text=fait sauter la banque'); sv = await save();
  assert.strictEqual(sv.g.teams.reduce((s, t) => s + t.chips, 0), 90); ok('classement final, 90 jetons conservés'); await shot('b7_end');
  assert.deepStrictEqual(errors, []); ok('aucune erreur JavaScript');
  console.log(`\n${n} vérifications réussies`);
  await browser.close(); server.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
