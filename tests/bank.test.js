// Tests du mode Banque — node tests/bank.test.js
const assert = require('assert');
const B = require('../bank.js'), Q = require('../questions-open.js');
let passed = 0; const test = (t, fn) => { try { fn(); passed++; console.log('✓', t); } catch (e) { console.error('✗', t, '\n ', e.message); process.exitCode = 1; } };
let s = 1; const rng = () => (s = (s * 48271) % 2147483647) / 2147483647;
const mk = (n = 3, o = {}) => B.createGame({ names: Array.from({ length: n }, (_, i) => 'T' + i), questions: Q, rng, ...o });

test('calendrier : chaque équipe tient la banque face à chacune des autres', () => {
  const g = mk(4); assert.strictEqual(g.schedule.length, 12);
  for (let b = 0; b < 4; b++) assert.strictEqual(g.schedule.filter(x => x.bank === b).length, 3);
  assert.ok(g.schedule.every(x => x.bank !== x.player));
  assert.strictEqual(mk(3, { tours: 2 }).schedule.length, 12);
});
test('mise bornée par le plafond et le stock', () => {
  const g = mk(); assert.throws(() => B.bet(g, 0), /entre 1 et 10/); assert.throws(() => B.bet(g, 11), /entre 1 et 10/);
  g.teams[g.duel.player].chips = 4; assert.strictEqual(B.maxStake(g), 4); B.bet(g, 4); assert.strictEqual(g.phase, 'difficulty');
});
test('bonne réponse puis encaisse : la banque paie mise × difficulté', () => {
  const g = mk(); const { bank, player } = g.duel; B.bet(g, 5); B.chooseDifficulty(g, 3);
  assert.strictEqual(B.question(g).d, 3); assert.strictEqual(B.question(g).c, g.duel.category);
  B.judge(g, true); assert.strictEqual(g.phase, 'encore'); B.encore(g, false);
  assert.strictEqual(g.teams[player].chips, 45); assert.strictEqual(g.teams[bank].chips, 15); assert.strictEqual(B.total(g), 90);
});
test('encore : les difficultés s’additionnent, 3 questions maximum puis encaissement automatique', () => {
  const g = mk(); const { player } = g.duel; B.bet(g, 2);
  B.chooseDifficulty(g, 1); B.judge(g, true); B.encore(g, true); B.chooseDifficulty(g, 2); B.judge(g, true);
  assert.strictEqual(g.duel.mult, 3); B.encore(g, true); B.chooseDifficulty(g, 3); B.judge(g, true);
  assert.strictEqual(g.phase, 'result'); assert.strictEqual(g.duel.outcome.amount, 12); assert.strictEqual(g.teams[player].chips, 42);
});
test('gourmand puis erreur : tout est perdu (la mise va à la banque)', () => {
  const g = mk(); const { bank, player } = g.duel; B.bet(g, 6);
  B.chooseDifficulty(g, 2); B.judge(g, true); B.encore(g, true); B.chooseDifficulty(g, 2); B.judge(g, false);
  assert.strictEqual(g.phase, 'steal'); B.steal(g, null);
  assert.strictEqual(g.teams[player].chips, 24); assert.strictEqual(g.teams[bank].chips, 36); assert.strictEqual(B.total(g), 90);
});
test('vol : la mise perdue va à l’équipe qui a crié la bonne réponse', () => {
  const g = mk(); const { bank, player } = g.duel; const thief = [0, 1, 2].find(i => i !== bank && i !== player);
  B.bet(g, 7); B.chooseDifficulty(g, 1); B.judge(g, false);
  assert.throws(() => B.steal(g, bank), /autre équipe/); assert.throws(() => B.steal(g, player), /autre équipe/);
  B.steal(g, thief); assert.strictEqual(g.teams[thief].chips, 37); assert.strictEqual(g.teams[bank].chips, 30); assert.strictEqual(g.duel.outcome.type, 'stolen');
});
test('banque à sec : elle paie ce qu’elle a, jamais de jetons négatifs', () => {
  const g = mk(); const { bank, player } = g.duel; g.teams[bank].chips = 3; g.teams[player].chips = 57;
  B.bet(g, 10); B.chooseDifficulty(g, 3); B.judge(g, true); B.encore(g, false);
  assert.strictEqual(g.teams[bank].chips, 0); assert.strictEqual(g.duel.outcome.amount, 3); assert.strictEqual(g.duel.outcome.wanted, 30);
});
test('une équipe sans jetons ne joue plus (ses duels sont passés) mais peut encore voler', () => {
  const g = mk(3); g.teams[1].chips = 0; g.teams[0].chips = 60; g.phase = 'result'; g.duelIdx = -1; B.next(g); let prompted = 0;
  while (g.phase !== 'end'){
    if (g.phase === 'bet'){ assert.ok(g.teams[g.duel.player].chips > 0, 'une équipe à 0 ne mise pas'); if (g.duel.player === 1) prompted++; B.bet(g, 1); }
    else if (g.phase === 'difficulty') B.chooseDifficulty(g, 1);
    else if (g.phase === 'question') B.judge(g, false);
    else if (g.phase === 'steal'){ const o = [0, 1, 2].find(i => i !== g.duel.bank && i !== g.duel.player); B.steal(g, o); }
    else B.next(g);
  }
  assert.ok(g.log.some(l => /T1 n’a plus de jetons/.test(l)), 'duel passé'); assert.ok(g.log.some(l => /T1 vole/.test(l)), 'a volé');
});
test('les questions ne se répètent pas tant qu’il en reste', () => {
  const g = mk(6, { tours: 3 }); const seen = new Set(); let n = 0;
  while (g.phase !== 'end' && n < 150){ B.bet(g, 1); B.chooseDifficulty(g, 1 + (n % 3)); const q = B.question(g); assert.ok(!seen.has(q.q), 'répétée : ' + q.q); seen.add(q.q); B.judge(g, true); B.encore(g, false); B.next(g); n++; }
  assert.ok(n > 80);
});
test('ordre des phases respecté', () => {
  const g = mk(); assert.throws(() => B.chooseDifficulty(g, 1), /pas le moment/); assert.throws(() => B.judge(g, true), /Aucune question/);
  B.bet(g, 1); assert.throws(() => B.bet(g, 1), /pas le moment/); assert.throws(() => B.chooseDifficulty(g, 4), /inconnue/);
});
test('parties aléatoires : jetons conservés, jamais négatifs, toujours une fin', () => {
  for (let k = 0; k < 500; k++){
    const n = 2 + Math.floor(rng() * 5), g = mk(n, { tours: 1 + Math.floor(rng() * 3) }), tot = B.total(g); let guard = 0;
    while (g.phase !== 'end' && guard++ < 2000){
      if (g.phase === 'bet') B.bet(g, 1 + Math.floor(rng() * B.maxStake(g)));
      else if (g.phase === 'difficulty') B.chooseDifficulty(g, 1 + Math.floor(rng() * 3));
      else if (g.phase === 'question') B.judge(g, rng() < 0.6);
      else if (g.phase === 'encore') B.encore(g, rng() < 0.5);
      else if (g.phase === 'steal'){ const o = g.teams.map((t, i) => i).filter(i => i !== g.duel.bank && i !== g.duel.player); B.steal(g, o.length && rng() < 0.3 ? o[0] : null); }
      else if (g.phase === 'result') B.next(g);
      assert.strictEqual(B.total(g), tot); g.teams.forEach(t => assert.ok(t.chips >= 0));
    }
    assert.strictEqual(g.phase, 'end');
    JSON.parse(JSON.stringify(g));
  }
});
console.log(`\n${passed} tests réussis`);
