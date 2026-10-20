// Moteur de règles pur (sans DOM). Toutes les fonctions modifient l'objet partie `g`, sérialisable en JSON.
const HoldUp = (() => {
  const BANK = [
    {category:'Géographie',tease:'Une histoire de frontières et de territoires lointains.',q:'Quel pays possède le plus de fuseaux horaires, territoires d’outre-mer compris ?',options:['Russie','France','États-Unis','Chine'],answer:1,bonus:'Combien de fuseaux horaires ce pays couvre-t-il, outre-mer compris (hors Antarctique) ?',bonusOptions:['9','11','12','15'],bonusAnswer:2},
    {category:'Sciences',tease:'Un animal bien plus étonnant qu’il n’en a l’air.',q:'Quel animal possède trois cœurs ?',options:['Le dauphin','La pieuvre','Le requin','La tortue'],answer:1,bonus:'De quelle couleur est le sang d’une pieuvre ?',bonusOptions:['Rouge','Vert','Bleu','Jaune'],bonusAnswer:2},
    {category:'Cinéma',tease:'Un film qui a marqué l’histoire des récompenses.',q:'Lequel de ces films a remporté 11 Oscars ?',options:['Titanic','Avatar','Inception','Gladiator'],answer:0,bonus:'En quelle année Titanic est-il sorti aux États-Unis ?',bonusOptions:['1994','1997','2000','2002'],bonusAnswer:1},
    {category:'Histoire',tease:'Une célèbre bataille et une date qu’on croit connaître.',q:'En quelle année a eu lieu la bataille de Waterloo ?',options:['1789','1804','1815','1848'],answer:2,bonus:'Dans quel pays actuel se trouve Waterloo ?',bonusOptions:['France','Belgique','Pays-Bas','Allemagne'],bonusAnswer:1},
    {category:'Sport',tease:'Des chiffres que tout le monde croit connaître sur le ballon rond.',q:'Combien de joueurs une équipe de football aligne-t-elle au coup d’envoi ?',options:['9','10','11','12'],answer:2,bonus:'Combien de minutes dure le temps réglementaire d’un match senior ?',bonusOptions:['80','90','100','120'],bonusAnswer:1},
    {category:'Culture pop',tease:'Un groupe mythique et une ville devenue célèbre.',q:'De quelle ville viennent les Beatles ?',options:['Londres','Manchester','Liverpool','Birmingham'],answer:2,bonus:'Lequel des Beatles était le batteur ?',bonusOptions:['John Lennon','Paul McCartney','George Harrison','Ringo Starr'],bonusAnswer:3},
    {category:'Nature',tease:'Un géant des mers et un record de taille.',q:'Quel est le plus grand animal vivant ?',options:['Éléphant d’Afrique','Baleine bleue','Requin-baleine','Girafe'],answer:1,bonus:'La baleine bleue est-elle un mammifère ?',bonusOptions:['Oui','Non','Seulement à la naissance','On ne sait pas'],bonusAnswer:0},
    {category:'Art',tease:'Un tableau célébrissime et son musée.',q:'Dans quel musée peut-on voir La Joconde ?',options:['Prado','Louvre','Orsay','Metropolitan Museum'],answer:1,bonus:'Qui a peint La Joconde ?',bonusOptions:['Michel-Ange','Raphaël','Léonard de Vinci','Botticelli'],bonusAnswer:2},
    {category:'Sciences',tease:'Un métal précieux et son petit nom au tableau périodique.',q:'Quel est le symbole chimique de l’or ?',options:['Or','Au','Ag','Go'],answer:1,bonus:'Quel est le numéro atomique de l’or ?',bonusOptions:['47','26','79','82'],bonusAnswer:2},
    {category:'Géographie',tease:'Une capitale que beaucoup confondent avec sa grande voisine.',q:'Quelle est la capitale de l’Australie ?',options:['Sydney','Melbourne','Canberra','Perth'],answer:2,bonus:'Quelle est la ville la plus peuplée d’Australie ?',bonusOptions:['Sydney','Melbourne','Brisbane','Canberra'],bonusAnswer:0},
    {category:'Musique',tease:'Un instrument noir et blanc, et un compte de touches.',q:'Combien de touches compte un piano standard ?',options:['76','85','88','96'],answer:2,bonus:'Combien de ces touches sont noires ?',bonusOptions:['32','36','40','52'],bonusAnswer:1},
    {category:'Histoire',tease:'Un petit pas, un grand bond.',q:'Qui a été le premier homme à marcher sur la Lune ?',options:['Buzz Aldrin','Youri Gagarine','Neil Armstrong','Michael Collins'],answer:2,bonus:'En quelle année ?',bonusOptions:['1965','1969','1972','1975'],bonusAnswer:1},
    {category:'Littérature',tease:'Un roman fleuve et un forçat au grand cœur.',q:'Qui a écrit Les Misérables ?',options:['Émile Zola','Victor Hugo','Honoré de Balzac','Alexandre Dumas'],answer:1,bonus:'Comment s’appelle la petite fille recueillie par Jean Valjean ?',bonusOptions:['Éponine','Fantine','Cosette','Azelma'],bonusAnswer:2},
    {category:'Espace',tease:'Une planète qui a très chaud.',q:'Quelle planète est la plus proche du Soleil ?',options:['Vénus','Mercure','Mars','Terre'],answer:1,bonus:'Quelle est la plus grande planète du système solaire ?',bonusOptions:['Saturne','Neptune','Jupiter','Uranus'],bonusAnswer:2},
    {category:'Géographie',tease:'Un long ruban d’eau qui traverse la France.',q:'Quel est le plus long fleuve de France ?',options:['La Seine','Le Rhône','La Garonne','La Loire'],answer:3,bonus:'Où se jette-t-il ?',bonusOptions:['La Manche','L’océan Atlantique','La Méditerranée','La mer du Nord'],bonusAnswer:1},
    {category:'Sport',tease:'Des anneaux et une flamme.',q:'Combien d’anneaux figurent sur le drapeau olympique ?',options:['4','5','6','7'],answer:1,bonus:'Quelle ville a accueilli les Jeux olympiques d’été 2024 ?',bonusOptions:['Tokyo','Los Angeles','Paris','Londres'],bonusAnswer:2},
    {category:'Cuisine',tease:'Un plat de riz qui sent bon le safran.',q:'De quel pays vient la paella ?',options:['Italie','Portugal','Mexique','Espagne'],answer:3,bonus:'De quelle région en est-elle originaire ?',bonusOptions:['Andalousie','Valence','Catalogne','Galice'],bonusAnswer:1},
    {category:'Tech',tease:'Trois lettres que vous tapez sans y penser.',q:'Que signifie « www » ?',options:['World Wide Web','Wide World Wireless','Web World Wide','World Web Window'],answer:0,bonus:'Qui a inventé le Web ?',bonusOptions:['Bill Gates','Tim Berners-Lee','Steve Jobs','Alan Turing'],bonusAnswer:1},
    {category:'Art',tease:'Un ciel tourbillonnant au-dessus d’un village.',q:'Qui a peint La Nuit étoilée ?',options:['Claude Monet','Vincent van Gogh','Paul Cézanne','Edvard Munch'],answer:1,bonus:'De quelle nationalité était ce peintre ?',bonusOptions:['Français','Belge','Néerlandais','Allemand'],bonusAnswer:2},
    {category:'Nature',tease:'Un petit animal qui en fait frissonner plus d’un.',q:'Combien de pattes a une araignée ?',options:['6','8','10','12'],answer:1,bonus:'Et combien de pattes a un insecte ?',bonusOptions:['4','6','8','10'],bonusAnswer:1}
  ];
  const GREED_COST = 3;

  function shuffle(a, rng){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function err(msg){ const e = new Error(msg); e.rule = true; return e; }

  function createGame(o){
    const names = (o.names || []).map(s => String(s).trim()).filter(Boolean);
    if (names.length < 2 || names.length > 6) throw err('Il faut entre 2 et 6 équipes.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw err('Deux équipes portent le même nom.');
    const rng = o.rng || Math.random;
    const start = o.startChips ?? 30;
    return {
      v: 2, phase: 'setup',
      teams: names.map(name => ({ name, chips: start, out: false, folded: false, allIn: false, committed: 0, street: 0, acted: false, ver: -1, answer: null, greedy: false, bonusAnswer: null, greedPaid: 0 })),
      startChips: start, rounds: o.rounds ?? 8, round: 0, greedMode: o.greed !== false,
      sb: o.sb ?? 1, bb: o.bb ?? 2, dealer: -1, sbSeat: -1, bbSeat: -1,
      deck: shuffle(o.questions || BANK, rng), question: null,
      dead: 0, jackpot: 0, street: null, currentBet: 0, minRaise: 0, raiseVer: 0, toAct: -1,
      answerQueue: [], answerIdx: 0, result: null, final: null, log: []
    };
  }

  const inHand = t => !t.out;
  function seatsAfter(g, from){ const n = g.teams.length, r = []; for (let k = 1; k <= n; k++) r.push((from + k + n) % n); return r; }
  function nextSeat(g, from, pred){ for (const i of seatsAfter(g, from)) if (pred(g.teams[i], i)) return i; return -1; }
  function totalPot(g){ return g.teams.reduce((s, t) => s + t.committed, 0) + g.dead; }
  function bank(g){ return g.teams.reduce((s, t) => s + t.chips, 0) + totalPot(g) + g.jackpot; }

  function pay(t, v){ v = Math.max(0, Math.min(v, t.chips)); t.chips -= v; t.street += v; t.committed += v; if (t.chips === 0) t.allIn = true; return v; }

  function resetStreet(g, name){
    g.street = name; g.currentBet = 0; g.minRaise = g.bb; g.raiseVer = 0;
    g.teams.forEach(t => { t.street = 0; t.acted = false; t.ver = -1; });
  }

  function startRound(g){
    g.teams.forEach(t => { if (!t.out && t.chips <= 0) t.out = true; });
    const alive = g.teams.filter(inHand);
    if (g.round >= g.rounds || alive.length < 2){ finishGame(g); return; }
    g.round++;
    g.teams.forEach(t => Object.assign(t, { folded: t.out, allIn: false, committed: 0, street: 0, acted: false, ver: -1, answer: null, answered: false, greedy: false, bonusAnswer: null, greedPaid: 0 }));
    g.dealer = nextSeat(g, g.dealer < 0 ? g.teams.length - 1 : g.dealer, inHand);
    if (alive.length === 2){ g.sbSeat = g.dealer; g.bbSeat = nextSeat(g, g.dealer, inHand); }
    else { g.sbSeat = nextSeat(g, g.dealer, inHand); g.bbSeat = nextSeat(g, g.sbSeat, inHand); }
    g.dead = g.jackpot; g.jackpot = 0;
    g.question = g.deck[(g.round - 1) % g.deck.length];
    g.result = null; g.answerQueue = []; g.answerIdx = 0;
    resetStreet(g, 'pre');
    pay(g.teams[g.sbSeat], g.sb);
    pay(g.teams[g.bbSeat], g.bb);
    g.currentBet = g.bb; g.minRaise = g.bb;
    g.phase = 'tease';
    g.log.push(`Manche ${g.round} : blindes ${g.teams[g.sbSeat].name} (${g.sb}) et ${g.teams[g.bbSeat].name} (${g.bb}).`);
  }

  function needsAct(g, t){ return !t.folded && !t.allIn && (!t.acted || t.street < g.currentBet); }
  function streetDone(g){
    const free = g.teams.filter(t => !t.folded && !t.allIn);
    if (free.length === 0) return true;
    if (free.length === 1 && free[0].street >= g.currentBet) return true;
    return !g.teams.some(t => needsAct(g, t));
  }

  // Ouvre un tour d'enchères : 'pre' juste après l'annonce, 'post' après les réponses secrètes.
  function openStreet(g){
    g.phase = 'bet';
    if (streetDone(g)){ closeStreet(g); return; }
    const after = g.street === 'pre' ? g.bbSeat : g.dealer;
    g.toAct = nextSeat(g, after, t => needsAct(g, t));
  }

  function legal(g){
    const t = g.teams[g.toAct];
    const owe = Math.max(0, g.currentBet - t.street);
    const maxTo = t.street + t.chips;
    const canRaise = t.chips > owe && (!t.acted || t.ver < g.raiseVer);
    return { owe, callAmt: Math.min(owe, t.chips), canCheck: owe === 0, canRaise,
      minTo: Math.min(maxTo, g.currentBet + g.minRaise), maxTo, isBet: g.currentBet === 0, callIsAllIn: owe >= t.chips && owe > 0 };
  }

  function act(g, type, to){
    if (g.phase !== 'bet') throw err('Ce n’est pas le moment de miser.');
    const i = g.toAct, t = g.teams[i], L = legal(g);
    if (type === 'allin'){
      if (L.callIsAllIn || !L.canRaise) { if (t.chips <= L.owe) type = 'call'; else throw err('Relance impossible : tu peux seulement suivre ou te coucher.'); }
      else { type = 'raise'; to = L.maxTo; }
    }
    if (type === 'fold'){ t.folded = true; g.log.push(`${t.name} se couche.`); }
    else if (type === 'check'){ if (!L.canCheck) throw err(`Il faut au moins suivre ${L.owe}.`); g.log.push(`${t.name} check.`); }
    else if (type === 'call'){ if (L.canCheck) { g.log.push(`${t.name} check.`); } else { pay(t, L.callAmt); g.log.push(`${t.name} suit${t.allIn ? ' (tapis)' : ''}.`); } }
    else if (type === 'raise'){
      to = Math.floor(Number(to));
      if (!L.canRaise) throw err('Relance impossible : tu peux seulement suivre ou te coucher.');
      if (!(to > g.currentBet)) throw err('La relance doit dépasser la mise en cours.');
      if (to > L.maxTo) throw err('Pas assez de jetons.');
      if (to < L.minTo) throw err(`Relance minimum : ${L.minTo}.`);
      const inc = to - g.currentBet;
      pay(t, to - t.street);
      if (inc >= g.minRaise){ g.minRaise = inc; g.raiseVer++; }
      g.currentBet = to;
      g.log.push(`${t.name} ${L.isBet ? 'mise' : 'relance à'} ${to}${t.allIn ? ' (tapis)' : ''}.`);
    }
    else throw err('Action inconnue.');
    t.acted = true; t.ver = g.raiseVer;
    const left = g.teams.filter(x => !x.folded);
    if (left.length === 1){ awardUncontested(g, left[0]); return; }
    if (streetDone(g)){ closeStreet(g); return; }
    g.toAct = nextSeat(g, i, x => needsAct(g, x));
  }

  function closeStreet(g){
    g.toAct = -1;
    if (g.street === 'pre'){
      g.answerQueue = seatsAfter(g, g.dealer).filter(i => !g.teams[i].folded);
      g.answerIdx = 0; g.phase = 'answers';
    } else showdown(g);
  }

  function canGreed(g, i){ const t = g.teams[i]; return g.greedMode && !t.folded && t.chips >= GREED_COST; }

  // Réponse d'une équipe donnée (ordre libre : en ligne, chaque équipe répond sur son téléphone).
  function answerFor(g, i, a){
    if (g.phase !== 'answers') throw err('Ce n’est pas le moment de répondre.');
    const t = g.teams[i], q = g.question;
    if (!t || !g.answerQueue.includes(i) || t.folded) throw err('Cette équipe ne joue pas cette manche.');
    if (t.answered) throw err('Réponse déjà verrouillée.');
    if (!(Number.isInteger(a.answer) && a.answer >= 0 && a.answer < q.options.length)) throw err('Choisis une réponse.');
    if (a.greedy){
      if (!canGreed(g, i)) throw err(`La gourmandise coûte ${GREED_COST} jetons.`);
      if (!(Number.isInteger(a.bonusAnswer) && a.bonusAnswer >= 0 && a.bonusAnswer < q.bonusOptions.length)) throw err('Choisis une réponse à la question liée.');
    }
    t.answer = a.answer; t.answered = true;
    if (a.greedy){
      t.chips -= GREED_COST; t.greedPaid = GREED_COST; g.dead += GREED_COST; t.greedy = true; t.bonusAnswer = a.bonusAnswer;
      if (t.chips === 0) t.allIn = true;
    }
    afterAnswer(g);
  }
  function pendingAnswers(g){ return g.answerQueue.filter(i => !g.teams[i].folded && !g.teams[i].answered); }
  function afterAnswer(g){
    g.answerIdx = g.answerQueue.filter(i => g.teams[i].answered || g.teams[i].folded).length;
    const left = g.teams.filter(x => !x.folded);
    if (left.length === 1){ awardUncontested(g, left[0]); return; }
    if (!pendingAnswers(g).length){ resetStreet(g, 'post'); openStreet(g); }
  }
  // Version « un seul téléphone » : la prochaine équipe dans l'ordre.
  function submitAnswer(g, a){
    if (g.phase !== 'answers') throw err('Ce n’est pas le moment de répondre.');
    answerFor(g, pendingAnswers(g)[0], a);
  }

  // L'hôte couche d'office une équipe absente (à son tour d'enchère, ou tant qu'elle n'a pas répondu).
  function abandon(g, i){
    const t = g.teams[i];
    if (g.phase === 'bet'){ if (g.toAct !== i) throw err('Ce n’est pas le tour de cette équipe.'); act(g, 'fold'); return; }
    if (g.phase === 'answers'){
      if (t.folded || t.answered || !g.answerQueue.includes(i)) throw err('Cette équipe a déjà répondu.');
      t.folded = true; g.log.push(`${t.name} abandonne la manche.`); afterAnswer(g); return;
    }
    throw err('Rien à abandonner maintenant.');
  }

  // Ce que tout le monde peut voir : pas de réponses (ni bonnes, ni données) avant l'abattage, pas de paquet de questions.
  function publicView(g){
    const v = JSON.parse(JSON.stringify(g));
    delete v.deck; v.log = v.log.slice(-8);
    const reveal = g.phase === 'end' || (g.phase === 'result' && g.result && g.result.type === 'showdown');
    if (v.question){
      const q = v.question;
      if (g.phase === 'tease' || (g.phase === 'bet' && g.street === 'pre') || (g.phase === 'result' && g.result && g.result.type === 'hidden' && g.result.street === 'pre'))
        v.question = { category: q.category, tease: q.tease };
      else if (!reveal){ delete q.answer; delete q.bonusAnswer; }
    }
    if (!reveal) v.teams.forEach(t => { t.answer = null; t.bonusAnswer = null; t.greedy = false; t.greedPaid = 0; });
    return v;
  }

  function isCorrect(g, t){ const q = g.question; return t.answer === q.answer && (!t.greedy || t.bonusAnswer === q.bonusAnswer); }

  function distribute(g, winners, amount){
    if (!winners.length || amount <= 0) return [];
    const order = seatsAfter(g, g.dealer).filter(i => winners.includes(i));
    const share = Math.floor(amount / order.length), rem = amount % order.length;
    return order.map((i, k) => { const v = share + (k < rem ? 1 : 0); g.teams[i].chips += v; return { seat: i, amount: v }; });
  }

  function awardUncontested(g, w){
    const total = totalPot(g), seat = g.teams.indexOf(w);
    w.chips += total;
    g.teams.forEach(t => { t.committed = 0; }); g.dead = 0;
    g.result = { type: 'hidden', street: g.street, winner: seat, total, pots: [] };
    g.phase = 'result'; g.toAct = -1;
    g.log.push(`${w.name} remporte ${total} sans montrer sa réponse.`);
  }

  // Pots principaux et annexes à partir des contributions totales de la manche.
  function buildPots(g){
    const contenders = g.teams.map((t, i) => i).filter(i => !g.teams[i].folded);
    const levels = [...new Set(contenders.map(i => g.teams[i].committed))].filter(v => v > 0).sort((a, b) => a - b);
    const pots = []; let prev = 0;
    levels.forEach((L, k) => {
      let amount = 0; const from = new Set();
      g.teams.forEach((t, i) => { const c = Math.min(t.committed, L) - Math.min(t.committed, prev); if (c > 0){ amount += c; from.add(i); } });
      if (k === levels.length - 1) g.teams.forEach((t, i) => { const extra = t.committed - L; if (extra > 0){ amount += extra; from.add(i); } });
      pots.push({ amount, eligible: contenders.filter(i => g.teams[i].committed >= L), from: [...from], dead: 0 });
      prev = L;
    });
    if (g.dead > 0){
      if (!pots.length) pots.push({ amount: 0, eligible: contenders, from: [], dead: 0 });
      pots[0].amount += g.dead; pots[0].dead = g.dead;
    }
    return pots;
  }

  function showdown(g){
    const pots = buildPots(g);
    const out = pots.map((p, k) => {
      const solo = p.eligible.length === 1 && p.dead === 0 && p.from.every(i => i === p.eligible[0]);
      if (solo) return { k, amount: p.amount, eligible: p.eligible, kind: 'refund', paid: distribute(g, p.eligible, p.amount) };
      const right = p.eligible.filter(i => isCorrect(g, g.teams[i]));
      const greedyRight = right.filter(i => g.teams[i].greedy);
      const winners = greedyRight.length ? greedyRight : right;
      if (!winners.length){ g.jackpot += p.amount; return { k, amount: p.amount, eligible: p.eligible, kind: 'rollover', paid: [] }; }
      return { k, amount: p.amount, eligible: p.eligible, kind: greedyRight.length ? 'greed' : 'win', paid: distribute(g, winners, p.amount) };
    });
    g.teams.forEach(t => { t.committed = 0; }); g.dead = 0;
    g.result = { type: 'showdown', pots: out };
    g.phase = 'result'; g.toAct = -1;
  }

  function finishGame(g){
    let shared = [];
    if (g.jackpot > 0){
      const withChips = g.teams.map((t, i) => i).filter(i => g.teams[i].chips > 0);
      const to = withChips.length ? withChips : g.teams.map((t, i) => i);
      const amt = g.jackpot; g.jackpot = 0;
      shared = distribute(g, to, amt);
    }
    g.final = { jackpotShared: shared };
    g.phase = 'end'; g.toAct = -1;
  }

  return { BANK, GREED_COST, createGame, startRound, openStreet, legal, act, submitAnswer, answerFor, pendingAnswers, abandon, publicView, canGreed, isCorrect, totalPot, bank, buildPots };
})();
if (typeof module !== 'undefined') module.exports = HoldUp;
if (typeof window !== 'undefined') window.HoldUp = HoldUp;
