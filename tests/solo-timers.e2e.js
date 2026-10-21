// Mode un seul téléphone + chronos automatiques (accélérés avec ?fast=1), en mode démo.
// npm i playwright && node scripts/build.js && node tests/solo-timers.e2e.js
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}/`;
  const browser = await chromium.launch(), errors = [];
  let n = 0; const ok = m => { n++; console.log('✓', m); };
  const waitText = (p, s, ms = 6000) => p.waitForFunction(t => document.querySelector('main').textContent.includes(t), s, { timeout: ms });

  // ---- Un seul téléphone ----
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  await ctx.route(/fonts\.googleapis|cdnjs/, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push('solo: ' + e.message));
  await p.goto(base + 'solo/?demo=1'); await p.waitForSelector('[data-a=soloStart]'); ok('/solo/ ouvre la préparation');
  assert.strictEqual(await p.locator('input[id^=soloTeam]').count(), 3); await p.click('[data-a=soloAdd]'); assert.strictEqual(await p.locator('input[id^=soloTeam]').count(), 4);
  await p.click('[data-a=soloDel][data-v="3"]'); await p.fill('#soloTeam0', 'Les Champions'); await p.click('[data-a=soloStart]');
  await waitText(p, 'Ouvrir les enchères'); ok('partie lancée avec 3 équipes nommées');
  await p.click('[data-a=soloOpen]'); await waitText(p, 'Au tour de');
  const before = await p.textContent('main'); await p.click('[data-a=bet][data-v=call]'); await p.click('[data-a=soloUndo]');
  assert.strictEqual((await p.textContent('main')).match(/Au tour de (.+?)Mise/)[1], before.match(/Au tour de (.+?)Mise/)[1]); ok('annuler la dernière action');
  const act = async () => { const c = await p.locator('[data-a=bet][data-v=check]').count(); await p.click(c ? '[data-a=bet][data-v=check]' : '[data-a=bet][data-v=call]'); };
  for (let i = 0; i < 3 && await p.locator('[data-a=bet]').count(); i++) await act();
  for (let i = 0; i < 3; i++) {
    await p.waitForSelector('[data-a=soloReady]'); assert.ok(!(await p.textContent('main')).includes('A. '), 'question cachée avant que l’équipe soit prête');
    await p.click('[data-a=soloReady]'); await p.click('[data-a=pick][data-v="0"]'); await p.click('[data-a=lock]');
  }
  ok('3 réponses secrètes, téléphone passé de main en main');
  while (await p.locator('[data-a=bet]').count()) await act();
  await waitText(p, 'Abattage'); ok('abattage');
  await p.reload(); await waitText(p, 'Abattage'); ok('rechargement : partie reprise');
  const save = await p.evaluate(() => JSON.parse(localStorage.getItem('holdup-solo')));
  assert.strictEqual(save.g.teams.reduce((s, t) => s + t.chips, 0) + save.g.jackpot, 90); ok('jetons conservés');
  await p.click('[data-a=soloNext]'); await waitText(p, 'Manche 2/8'); ok('manche suivante');
  await p.click('[data-a=soloQuit]'); await p.waitForSelector('[data-a=soloResume]'); ok('accueil propose de reprendre');

  // ---- Chronos en ligne (rythme auto, accéléré) ----
  const c2 = await browser.newContext({ viewport: { width: 400, height: 860 } }); await c2.route(/fonts\.googleapis|cdnjs/, r => r.abort());
  const open = async (name, q) => { const pg = await c2.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); await pg.goto(base + '?demo=1' + q); await pg.click('[data-a=editPseudo]'); await pg.fill('#pseudo', name); await pg.click('[data-a=savePseudo]'); await pg.waitForSelector('[data-a=join]'); return pg; };
  const host = await open('Hôte', '&fast=1');
  await host.click('[data-a=create]'); await host.waitForSelector('.roomcode'); const code = (await host.textContent('.roomcode')).trim();
  assert.strictEqual(await host.inputValue('#setPace'), 'auto'); ok('rythme auto par défaut');
  const pl = [];
  for (const nm of ['Alice', 'Bruno']) { const pg = await open(nm, ''); await pg.fill('#joinCode', code); await pg.click('[data-a=join]'); await pg.waitForSelector('#teamName');
    assert.ok((await pg.inputValue('#teamName')).length > 0, 'nom d’équipe proposé'); await pg.click('[data-a=newTeam]'); await waitText(pg, 'Tu es capitaine'); pl.push(pg); }
  ok('équipes créées en un geste avec un nom proposé');
  await host.click('[data-a=start]');
  await waitText(pl[0], 'Au tour de', 4000).catch(() => waitText(pl[0], 'À vous de parler', 4000)); ok('les enchères s’ouvrent toutes seules');
  await host.waitForSelector('.chrono'); ok('chrono affiché');
  await waitText(host, 'Temps écoulé', 6000); ok('une équipe qui traîne passe ou se couche toute seule');
  await waitText(host, 'Manche 2/8', 15000); ok('la manche suivante démarre toute seule');
  await host.click('[data-a=pause]'); await waitText(host, 'Reprendre le chrono'); const r = (await host.textContent('main')).match(/Manche (\d+)/)[1];
  await host.waitForTimeout(3000); assert.strictEqual((await host.textContent('main')).match(/Manche (\d+)/)[1], r); ok('pause : plus rien ne bouge');
  assert.deepStrictEqual(errors, []); ok('aucune erreur JavaScript');
  console.log(`\n${n} vérifications réussies`);
  await browser.close(); server.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
