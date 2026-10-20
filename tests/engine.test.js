// Tests du moteur de règles HOLD UP! — lancer avec : node tests/engine.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(src, sandbox);
const H = sandbox.module.exports;

const Q = { category: 'T', tease: 't', q: 'q', options: ['A', 'B', 'C', 'D'], answer: 1, bonus: 'b', bonusOptions: ['A', 'B', 'C', 'D'], bonusAnswer: 2 };
const mk = (names = ['A', 'B', 'C'], o = {}) => { const g = H.createGame({ names, questions: [Q], rng: () => 0.5, ...o }); H.startRound(g); return g; };
const name = g => g.teams[g.toAct].name;
const conserve = (g, total) => assert.strictEqual(H.bank(g), total, 'jetons conservés');
let passed = 0; const test = (t, fn) => { try { fn(); passed++; console.log('✓', t); } catch (e) { console.error('✗', t, '\n ', e.message); process.exitCode = 1; } };
const answerAll = (g, map) => { while (g.phase === 'answers'){ const t = g.teams[g.answerQueue[g.answerIdx]]; H.submitAnswer(g, map[t.name] || { answer: 0 }); } };
const checkAround = g => { while (g.phase === 'bet') H.act(g, H.legal(g).canCheck ? 'check' : 'call'); };

test('blindes et ordre de parole à 3', () => {
  const g = mk(); assert.strictEqual(g.dealer, 0); assert.strictEqual(g.teams[1].committed, 1); assert.strictEqual(g.teams[2].committed, 2);
  H.openStreet(g); assert.strictEqual(name(g), 'A');
});
test('tête-à-tête : le donneur paie la petite blinde et parle en premier', () => {
  const g = mk(['A', 'B']); assert.strictEqual(g.sbSeat, 0); assert.strictEqual(g.bbSeat, 1); H.openStreet(g); assert.strictEqual(name(g), 'A');
});
test('la grosse blinde garde la parole quand tout le monde suit', () => {
  const g = mk(); H.openStreet(g); H.act(g, 'call'); H.act(g, 'call'); assert.strictEqual(name(g), 'C'); assert.ok(H.legal(g).canCheck); assert.ok(H.legal(g).canRaise);
  H.act(g, 'check'); assert.strictEqual(g.phase, 'answers');
});
test('relance minimum et relance de relance', () => {
  const g = mk(); H.openStreet(g);
  assert.throws(() => H.act(g, 'raise', 3), /minimum : 4/);
  H.act(g, 'raise', 6); assert.strictEqual(g.minRaise, 4);
  assert.throws(() => H.act(g, 'raise', 9), /minimum : 10/);
  H.act(g, 'raise', 10); H.act(g, 'fold'); assert.strictEqual(name(g), 'A'); assert.strictEqual(H.legal(g).owe, 4);
  H.act(g, 'call'); assert.strictEqual(g.phase, 'answers');
});
test('tout le monde se couche : victoire sans révéler, avant la question', () => {
  const g = mk(); const total = H.bank(g); H.openStreet(g); H.act(g, 'fold'); H.act(g, 'fold');
  assert.strictEqual(g.phase, 'result'); assert.strictEqual(g.result.type, 'hidden'); assert.strictEqual(g.teams[2].chips, 31); conserve(g, total);
});
test('tapis court qui ne rouvre pas les relances', () => {
  const g = H.createGame({ names: ['A', 'B', 'C'], questions: [Q] }); g.teams[1].chips = 5; H.startRound(g); H.openStreet(g);
  // A relance à 4, B (5 jetons, 1 posé) part à tapis à 5 : relance incomplète
  H.act(g, 'raise', 4); H.act(g, 'allin'); assert.strictEqual(g.currentBet, 5); assert.strictEqual(g.raiseVer, 1);
  H.act(g, 'call'); // C suit 5
  assert.strictEqual(name(g), 'A'); const L = H.legal(g); assert.strictEqual(L.owe, 1); assert.strictEqual(L.canRaise, false);
  assert.throws(() => H.act(g, 'raise', 20), /seulement suivre/);
  H.act(g, 'call'); assert.strictEqual(g.phase, 'answers');
});
test('pots annexes : un tapis ne gagne que ce qu’il a couvert', () => {
  const g = H.createGame({ names: ['A', 'B', 'C'], questions: [Q], greed: false }); g.teams[0].chips = 10; const total = H.bank(g); H.startRound(g); H.openStreet(g);
  H.act(g, 'allin'); H.act(g, 'raise', 20); H.act(g, 'call');
  answerAll(g, { A: { answer: 1 }, B: { answer: 0 }, C: { answer: 0 } });
  checkAround(g);
  assert.strictEqual(g.phase, 'result');
  const [main, side] = g.result.pots; assert.strictEqual(main.amount, 30); assert.strictEqual(main.kind, 'win'); assert.strictEqual(side.amount, 20); assert.strictEqual(side.kind, 'rollover');
  assert.strictEqual(g.teams[0].chips, 30); assert.strictEqual(g.jackpot, 20); conserve(g, total);
});
test('mise non suivie rendue à son auteur', () => {
  const g = H.createGame({ names: ['A', 'B'], questions: [Q], greed: false }); g.teams[1].chips = 6; const total = H.bank(g); H.startRound(g); H.openStreet(g);
  H.act(g, 'raise', 20); H.act(g, 'call'); // B tapis à 6
  answerAll(g, { A: { answer: 0 }, B: { answer: 0 } });
  assert.strictEqual(g.phase, 'result'); // plus personne ne peut miser
  const refund = g.result.pots.find(p => p.kind === 'refund'); assert.ok(refund); assert.strictEqual(refund.amount, 14);
  assert.strictEqual(g.teams[0].chips, 30 - 20 + 14); conserve(g, total);
});
test('gourmandise réussie prioritaire, ratée exclue', () => {
  const g = mk(); const total = H.bank(g); H.openStreet(g); checkAround(g);
  answerAll(g, { A: { answer: 1, greedy: true, bonusAnswer: 2 }, B: { answer: 1 }, C: { answer: 1, greedy: true, bonusAnswer: 0 } });
  checkAround(g);
  assert.strictEqual(g.result.pots[0].kind, 'greed'); assert.strictEqual(JSON.stringify(g.result.pots[0].paid.map(x => x.seat)), '[0]');
  assert.strictEqual(g.result.pots[0].amount, 6 + 6); assert.strictEqual(g.teams[0].chips, 28 - 3 + 12); conserve(g, total);
});
test('gourmandise impossible sans 3 jetons', () => {
  const g = H.createGame({ names: ['A', 'B'], questions: [Q] }); g.teams[0].chips = 4; H.startRound(g); H.openStreet(g); H.act(g, 'call'); H.act(g, 'check');
  const i = g.answerQueue[g.answerIdx]; assert.strictEqual(g.teams[i].name, 'B'); H.submitAnswer(g, { answer: 0 });
  assert.strictEqual(H.canGreed(g, 0), false); assert.throws(() => H.submitAnswer(g, { answer: 1, greedy: true, bonusAnswer: 2 }), /coûte 3/);
});
test('jackpot reporté puis gagné à la manche suivante', () => {
  const g = mk(['A', 'B'], { greed: false }); const total = H.bank(g); H.openStreet(g); checkAround(g); answerAll(g, {}); checkAround(g);
  assert.strictEqual(g.result.pots[0].kind, 'rollover'); assert.strictEqual(g.jackpot, 4); conserve(g, total);
  H.startRound(g); assert.strictEqual(H.totalPot(g), 4 + 3); H.openStreet(g); checkAround(g);
  answerAll(g, { A: { answer: 1 } }); checkAround(g); assert.strictEqual(g.result.pots[0].amount, 8); conserve(g, total);
});
test('jackpot non réclamé à la fin partagé, aucune perte de jetons', () => {
  const g = mk(['A', 'B', 'C'], { rounds: 1, greed: false }); const total = H.bank(g); H.openStreet(g); checkAround(g); answerAll(g, {}); checkAround(g);
  assert.strictEqual(g.jackpot, 6); H.startRound(g); assert.strictEqual(g.phase, 'end'); assert.strictEqual(g.jackpot, 0); conserve(g, total);
});
test('équipe éliminée sautée, partie finie quand il reste une équipe', () => {
  const g = H.createGame({ names: ['A', 'B', 'C'], questions: [Q], greed: false }); g.teams[0].chips = 0; H.startRound(g);
  assert.ok(g.teams[0].out); assert.notStrictEqual(g.dealer, 0); assert.notStrictEqual(g.sbSeat, 0);
  const g2 = H.createGame({ names: ['A', 'B'], questions: [Q] }); g2.teams[0].chips = 0; H.startRound(g2); assert.strictEqual(g2.phase, 'end');
});
test('blinde à tapis', () => {
  const g = H.createGame({ names: ['A', 'B', 'C'], questions: [Q], greed: false }); g.teams[2].chips = 1; H.startRound(g);
  assert.ok(g.teams[2].allIn); assert.strictEqual(g.currentBet, 2); H.openStreet(g); H.act(g, 'call'); H.act(g, 'call');
  assert.strictEqual(g.phase, 'answers');
});
test('donneur tournant et questions sans répétition', () => {
  const g = H.createGame({ names: ['A', 'B', 'C'], rng: () => 0.3 }); const seen = new Set(); const dealers = [];
  for (let r = 0; r < 8; r++){ H.startRound(g); dealers.push(g.dealer); seen.add(g.question.q); H.openStreet(g); H.act(g, 'fold'); H.act(g, 'fold'); }
  assert.strictEqual(dealers.slice(0, 4).join(), '0,1,2,0'); assert.strictEqual(seen.size, 8);
});
test('noms invalides refusés', () => {
  assert.throws(() => H.createGame({ names: ['A'] }), /entre 2 et 6/);
  assert.throws(() => H.createGame({ names: ['A', 'a'] }), /même nom/);
});
test('banque de questions : réponses valides', () => {
  H.BANK.forEach(q => { assert.ok(q.options[q.answer] !== undefined, q.q); assert.ok(q.bonusOptions[q.bonusAnswer] !== undefined, q.bonus); assert.strictEqual(q.options.length, 4); });
});
test('parties aléatoires : jetons toujours conservés', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 400; n++){
    const k = 2 + Math.floor(rnd() * 5);
    const g = H.createGame({ names: Array.from({ length: k }, (_, i) => 'T' + i), rounds: 10, rng: rnd }); const total = H.bank(g);
    let guard = 0;
    H.startRound(g);
    while (g.phase !== 'end' && guard++ < 5000){
      if (g.phase === 'tease') H.openStreet(g);
      else if (g.phase === 'bet'){ const L = H.legal(g), x = rnd();
        if (x < 0.15) H.act(g, 'fold'); else if (x < 0.55) H.act(g, L.canCheck ? 'check' : 'call');
        else if (x < 0.65 && (L.canRaise || L.callIsAllIn)) H.act(g, 'allin');
        else if (L.canRaise) H.act(g, 'raise', L.minTo + Math.floor(rnd() * (L.maxTo - L.minTo + 1))); else H.act(g, 'call'); }
      else if (g.phase === 'answers'){ const i = g.answerQueue[g.answerIdx]; const gr = H.canGreed(g, i) && rnd() < 0.3; H.submitAnswer(g, { answer: Math.floor(rnd() * 4), greedy: gr, bonusAnswer: Math.floor(rnd() * 4) }); }
      else if (g.phase === 'result') H.startRound(g);
      conserve(g, total);
      g.teams.forEach(t => assert.ok(t.chips >= 0));
    }
    assert.strictEqual(g.phase, 'end', 'partie terminée');
  }
});

test('réponses dans n’importe quel ordre (mode en ligne)', () => {
  const g = mk(); H.openStreet(g); checkAround(g);
  H.answerFor(g, 2, { answer: 1 }); assert.throws(() => H.answerFor(g, 2, { answer: 0 }), /déjà/);
  H.answerFor(g, 0, { answer: 1, greedy: true, bonusAnswer: 2 }); assert.strictEqual(g.phase, 'answers');
  assert.strictEqual(H.pendingAnswers(g).join(), '1');
  H.answerFor(g, 1, { answer: 0 }); assert.strictEqual(g.phase, 'bet'); assert.strictEqual(g.street, 'post');
});
test('réponse invalide : rien n’est modifié', () => {
  const g = mk(); H.openStreet(g); checkAround(g); const before = JSON.stringify(g);
  assert.throws(() => H.answerFor(g, 0, { answer: 1, greedy: true, bonusAnswer: 9 }), /question liée/);
  assert.strictEqual(JSON.stringify(g), before);
});
test('abandon forcé par l’hôte', () => {
  const g = mk(); const total = H.bank(g); H.openStreet(g);
  assert.throws(() => H.abandon(g, 1), /pas le tour/); H.abandon(g, 0); assert.ok(g.teams[0].folded);
  H.act(g, 'call'); H.act(g, 'check');
  H.answerFor(g, 1, { answer: 1 }); H.abandon(g, 2);
  assert.strictEqual(g.phase, 'result'); assert.strictEqual(g.result.type, 'hidden'); conserve(g, total);
});
test('vue publique : aucune réponse avant l’abattage', () => {
  const g = mk(); H.openStreet(g);
  let v = H.publicView(g); assert.strictEqual(v.question.q, undefined); assert.strictEqual(v.deck, undefined);
  checkAround(g); H.answerFor(g, 0, { answer: 1, greedy: true, bonusAnswer: 2 });
  v = H.publicView(g); assert.ok(v.question.q); assert.strictEqual(v.question.answer, undefined); assert.strictEqual(v.question.bonusAnswer, undefined);
  assert.strictEqual(v.teams[0].answer, null); assert.strictEqual(v.teams[0].greedy, false); assert.strictEqual(v.teams[0].answered, true);
  H.answerFor(g, 1, { answer: 0 }); H.answerFor(g, 2, { answer: 1 }); checkAround(g);
  v = H.publicView(g); assert.strictEqual(v.question.answer, 1); assert.strictEqual(v.teams[0].answer, 1); assert.strictEqual(v.teams[0].greedy, true);
});
test('vue publique : victoire sans abattage, réponse jamais révélée', () => {
  const g = mk(); H.openStreet(g); checkAround(g); H.answerFor(g, 0, { answer: 1 }); H.answerFor(g, 1, { answer: 1 }); H.answerFor(g, 2, { answer: 1 });
  H.act(g, 'raise', 2); H.act(g, 'fold'); H.act(g, 'fold');
  const v = H.publicView(g); assert.strictEqual(v.result.type, 'hidden'); assert.strictEqual(v.question.answer, undefined); assert.strictEqual(v.teams.every(t => t.answer === null), true);
});
console.log(`\n${passed} tests réussis`);
