// Mode Banque (inspiré du blackjack) : moteur de règles pur, sans DOM. L'état `g` est sérialisable en JSON.
// Chaque duel oppose la banque (qui tient le téléphone et lit la question) à une équipe joueuse :
//   1. le thème est annoncé, l'équipe mise ;
//   2. la banque choisit la difficulté (facile ×1, moyen ×2, dur ×3) ;
//   3. l'équipe répond à l'oral, la banque juge ✓ / ✗ ;
//   4. bonne réponse : l'équipe encaisse (mise × multiplicateur payés par la banque) ou tente « encore »
//      (la difficulté suivante s'ajoute au multiplicateur, 3 questions maximum) ;
//   5. mauvaise réponse : la mise est perdue, au profit de la banque… ou d'une autre équipe qui la « vole »
//      en criant la bonne réponse la première.
const HoldUpBank = (() => {
  const DIFF = { 1: 'Facile', 2: 'Moyen', 3: 'Dur' };
  const MAX_QUESTIONS = 3;
  const err = m => { const e = new Error(m); e.rule = true; return e; };
  const shuffle = (a, rng) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function createGame(o){
    const names = (o.names || []).map(s => String(s).trim()).filter(Boolean);
    if (names.length < 2 || names.length > 6) throw err('Il faut entre 2 et 6 équipes.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw err('Deux équipes portent le même nom.');
    const rng = o.rng || Math.random, tours = Math.max(1, Math.min(3, o.tours || 1));
    const questions = shuffle(o.questions || [], rng).map(([c, d, q, a]) => ({ c, d, q, a }));
    if (!questions.length) throw err('Aucune question disponible.');
    const schedule = [];
    for (let t = 0; t < tours; t++) for (let b = 0; b < names.length; b++) for (let k = 1; k < names.length; k++) schedule.push({ bank: b, player: (b + k) % names.length });
    const g = { kind: 'bank', v: 1, teams: names.map(name => ({ name, chips: o.startChips ?? 30 })), startChips: o.startChips ?? 30, maxBet: o.maxBet ?? 10,
      tours, schedule, duelIdx: 0, questions, used: [], phase: 'bet', duel: null, log: [], seed: Math.floor(rng() * 1e9) };
    startDuel(g);
    return g;
  }

  const rand = g => { g.seed = (g.seed * 16807 + 12345) % 2147483647; return g.seed / 2147483647; };
  const total = g => g.teams.reduce((s, t) => s + t.chips, 0);

  function startDuel(g){
    while (g.duelIdx < g.schedule.length && g.teams[g.schedule[g.duelIdx].player].chips <= 0){
      g.log.push(`${g.teams[g.schedule[g.duelIdx].player].name} n’a plus de jetons : son duel est passé.`); g.duelIdx++;
    }
    if (g.duelIdx >= g.schedule.length){ g.phase = 'end'; g.duel = null; return; }
    const { bank, player } = g.schedule[g.duelIdx];
    const free = g.questions.filter((q, i) => !g.used.includes(i));
    const cats = [...new Set((free.length ? free : g.questions).map(q => q.c))];
    g.duel = { bank, player, category: cats[Math.floor(rand(g) * cats.length)], stake: 0, mult: 0, asked: [], current: null, outcome: null };
    g.phase = 'bet';
  }

  function maxStake(g){ const p = g.teams[g.duel.player]; return Math.max(1, Math.min(g.maxBet, p.chips)); }

  function bet(g, amount){
    if (g.phase !== 'bet') throw err('Ce n’est pas le moment de miser.');
    amount = Math.floor(Number(amount));
    if (!(amount >= 1 && amount <= maxStake(g))) throw err(`Mise entre 1 et ${maxStake(g)}.`);
    g.duel.stake = amount; g.phase = 'difficulty';
  }

  function pickQuestion(g, d){
    const cat = g.duel.category;
    const free = i => !g.used.includes(i);
    let pool = g.questions.map((q, i) => i).filter(i => free(i) && g.questions[i].c === cat && g.questions[i].d === d);
    if (!pool.length) pool = g.questions.map((q, i) => i).filter(i => free(i) && g.questions[i].d === d);
    if (!pool.length) pool = g.questions.map((q, i) => i).filter(free);
    if (!pool.length){ g.used = []; pool = g.questions.map((q, i) => i).filter(i => g.questions[i].d === d); if (!pool.length) pool = g.questions.map((q, i) => i); }
    const i = pool[Math.floor(rand(g) * pool.length)];
    g.used.push(i);
    return i;
  }

  function chooseDifficulty(g, d){
    if (g.phase !== 'difficulty') throw err('Ce n’est pas le moment de choisir la difficulté.');
    d = Number(d); if (![1, 2, 3].includes(d)) throw err('Difficulté inconnue.');
    g.duel.current = { i: pickQuestion(g, d), d };
    g.phase = 'question';
  }

  function question(g){ const c = g.duel && g.duel.current; return c ? g.questions[c.i] : null; }

  function judge(g, correct){
    if (g.phase !== 'question') throw err('Aucune question en cours.');
    const du = g.duel, c = du.current;
    du.asked.push({ i: c.i, d: c.d, ok: !!correct });
    if (correct){
      du.mult += c.d;
      if (du.asked.length >= MAX_QUESTIONS) cash(g); else g.phase = 'encore';
    } else g.phase = 'steal';
  }

  function encore(g, more){
    if (g.phase !== 'encore') throw err('Ce n’est pas le moment.');
    if (more){ g.duel.current = null; g.phase = 'difficulty'; } else cash(g);
  }

  function cash(g){
    const du = g.duel, bank = g.teams[du.bank], player = g.teams[du.player];
    const wanted = du.stake * du.mult, paid = Math.min(wanted, bank.chips);
    bank.chips -= paid; player.chips += paid;
    du.outcome = { type: 'win', amount: paid, wanted };
    g.log.push(`${player.name} encaisse ${paid}${paid < wanted ? ` (banque à sec, ${wanted} dus)` : ''} face à ${bank.name}.`);
    g.phase = 'result';
  }

  function steal(g, by){
    if (g.phase !== 'steal') throw err('Ce n’est pas le moment.');
    const du = g.duel, player = g.teams[du.player];
    let to = du.bank, type = 'lost';
    if (by !== null && by !== undefined && by !== ''){
      by = Number(by);
      if (!(by >= 0 && by < g.teams.length) || by === du.bank || by === du.player) throw err('Seule une autre équipe peut voler la mise.');
      to = by; type = 'stolen';
    }
    const loss = Math.min(du.stake, player.chips);
    player.chips -= loss; g.teams[to].chips += loss;
    du.outcome = { type, amount: loss, to };
    g.log.push(type === 'stolen' ? `${g.teams[to].name} vole ${loss} jetons à ${player.name} !` : `${player.name} perd ${loss} jetons face à ${g.teams[to].name}.`);
    g.phase = 'result';
  }

  function next(g){
    if (g.phase !== 'result') throw err('Le duel n’est pas terminé.');
    g.duelIdx++; startDuel(g);
  }

  function nextMultiplier(g, d){ return g.duel.mult + d; }
  function ranking(g){ return g.teams.map((t, i) => ({ ...t, i })).sort((a, b) => b.chips - a.chips); }

  return { DIFF, MAX_QUESTIONS, createGame, maxStake, bet, chooseDifficulty, question, judge, encore, steal, next, nextMultiplier, ranking, total };
})();
if (typeof module !== 'undefined') module.exports = HoldUpBank;
if (typeof window !== 'undefined') window.HoldUpBank = HoldUpBank;
