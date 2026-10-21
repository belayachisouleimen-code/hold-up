// HOLD UP! en ligne. L'hôte fait autorité : il reçoit les actions des téléphones, applique le moteur
// de règles et publie une vue publique (sans les réponses) que tout le salon écoute en temps réel.
(() => {
  const H = window.HoldUp, net = window.HoldUpNet;
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const A = n => `assets/${n}.webp`;
  const chips = n => `<img class="coin" src="${A('coins')}" alt="">${n}`;
  const CAT = { 'Géographie': 'general', 'Histoire': 'histoire', 'Sciences': 'sciences', 'Tech': 'sciences', 'Cinéma': 'culture-pop', 'Culture pop': 'culture-pop', 'Musique': 'culture-pop',
    'Sport': 'sport', 'Art': 'arts', 'Littérature': 'arts', 'Nature': 'nature', 'Espace': 'insolite', 'Cuisine': 'insolite' };
  const catImg = (c, cls = 'catcard') => `<img class="${cls}" src="${A('cat-' + (CAT[c] || 'mystere'))}" alt="${esc(c)}">`;
  const qcard = (text, cls = '') => `<div class="qcard ${cls}"><p>${esc(text)}</p></div>`;
  const crown = `<img class="mini-ico" src="${A('coin-crown')}" alt="capitaine" title="Capitaine">`;
  const AVATARS = 6;
  const myAvatar = () => { let v = Number(ls.get('holdup-avatar')); if (!(v >= 1 && v <= AVATARS)){ v = 1 + Math.floor(Math.random() * AVATARS); ls.set('holdup-avatar', v); } return v; };
  const avatar = (n, cls = 'av') => `<img class="${cls}" src="${A('avatar-' + (n >= 1 && n <= AVATARS ? n : 1))}" alt="">`;
  const member = (m, captainId) => `<span class="member">${avatar(m.avatar)}${m.id === captainId ? crown : ''}${esc(m.pseudo)}</span>`;
  const RANKS = [[25, 'legende', 'Légende'], [15, 'diamant', 'Diamant'], [10, 'platine', 'Platine'], [5, 'or', 'Or'], [2, 'argent', 'Argent'], [0, 'bronze', 'Bronze']];
  const rankOf = wins => RANKS.find(([min]) => wins >= min);
  const imgBtn = (a, v, img, label, extra = '', amt = '') => `<button class="imgbtn" data-a="${a}" ${v !== null ? `data-v="${v}"` : ''} aria-label="${esc(label)}" ${extra}><img src="${A(img)}" alt="">${amt !== '' ? `<span class="amt">${amt}</span>` : ''}</button>`;
  const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const rule = m => { const e = new Error(m); e.rule = true; return e; };
  const ls = { get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  let me = null, room = null, isHost = false, priv = null;
  let ui = { view: 'boot', err: '', busy: false, tab: 'table', inputs: {} };
  let unsubs = [], hostChain = Promise.resolve(), clubsCache = null;

  // ---------- démarrage ----------
  async function boot(){
    try { me = await net.init(); }
    catch (e){ app.innerHTML = `<section class="panel"><h2>Connexion impossible</h2><p>${esc(e.message)}</p><button onclick="location.reload()">Réessayer</button></section>`; return; }
    const code = new URLSearchParams(location.search).get('room');
    if (!me.pseudo){ ui.view = 'pseudo'; ui.pendingRoom = code; render(); return; }
    if (code) await enterRoom(code); else { ui.view = 'home'; render(); }
  }

  function setUrl(code){ const u = new URL(location.href); if (code) u.searchParams.set('room', code); else u.searchParams.delete('room'); history.replaceState(null, '', u); }
  const joinUrl = code => { const u = new URL(location.href); u.search = ''; u.searchParams.set('room', code); if (net.demo && /demo=1/.test(location.search)) u.searchParams.set('demo', '1'); return u.toString(); };

  async function enterRoom(code){
    code = clean(code, 4).toUpperCase();
    ui.err = '';
    const r = await net.getRoom(code).catch(e => { ui.err = e.message; return null; });
    if (!r){ ui.err = ui.err || `Aucun salon « ${code} ». Vérifie le code.`; ui.view = 'home'; setUrl(null); render(); return; }
    leaveRoom(true);
    room = r; isHost = r.host_id === me.id; ui.view = 'room'; ui.tab = 'table'; setUrl(code);
    unsubs.push(net.subscribeRoom(code, row => onRoom(row)));
    if (isHost) await hostAttach();
    render();
  }
  function leaveRoom(silent){ unsubs.forEach(f => { try { f(); } catch (e) {} }); unsubs = []; room = null; isHost = false; priv = null; if (!silent){ setUrl(null); ui.view = 'home'; render(); } }

  function onRoom(row){
    if (!room || row.code !== room.code) return;
    if (isHost && priv && row.state && row.state.rev < priv.rev) return; // l'hôte a déjà plus récent
    const prevRev = room.state ? room.state.rev : -1;
    room = row;
    if (ui.busy && row.state.rev > ui.sentRev) ui.busy = false;
    if (row.state.rev !== prevRev || !isHost) render();
  }

  // ---------- hôte ----------
  async function hostAttach(){
    const local = ls.get('holdup-host-' + room.code);
    const remote = await net.loadPrivate(room.code).catch(() => null);
    const pick = [local, remote].filter(Boolean).sort((a, b) => b.rev - a.rev)[0];
    priv = pick || { rev: room.state.rev || 0, lobby: room.state.lobby, g: null, lastAction: 0, errors: {}, playedAt: null, recorded: false, clubErr: '' };
    unsubs.push(net.subscribeActions(room.code, row => hostQueue(() => handleAction(row)), () => hostQueue(async () => {
      const rows = await net.fetchActionsSince(room.code, priv.lastAction);
      for (const row of rows) await handleAction(row);
    })));
  }
  function hostQueue(fn){ hostChain = hostChain.then(fn).catch(e => { console.error(e); ui.err = e.message || String(e); render(); }); return hostChain; }
  function hostDo(fn){ return hostQueue(async () => { ui.err = ''; try { fn(); } catch (e){ if (e.rule) ui.err = e.message; else throw e; } await commit(); }); }

  function publicState(){
    const g = priv.g;
    return { v: 1, rev: priv.rev, status: g ? (g.phase === 'end' ? 'end' : 'game') : 'lobby', lobby: priv.lobby, game: g ? H.publicView(g) : null, errors: priv.errors, club: room.club_code || null, clubErr: priv.clubErr || '' };
  }
  async function commit(){
    if (priv.g && priv.g.phase === 'end') await recordClub();
    priv.rev++;
    const state = publicState();
    room = { ...room, state };
    if (ui.busy && state.rev > ui.sentRev) ui.busy = false;
    render();
    ls.set('holdup-host-' + room.code, priv);
    await net.publishState(room.code, state);
    net.savePrivate(room.code, priv).catch(() => {});
  }

  const teamIdxOf = id => priv.lobby.teams.findIndex(t => t.members.some(m => m.id === id));
  function removeMember(id){
    const L = priv.lobby, i = teamIdxOf(id); if (i < 0) return;
    const t = L.teams[i]; t.members = t.members.filter(m => m.id !== id);
    if (!t.members.length) L.teams.splice(i, 1); else if (t.captain === id) t.captain = t.members[0].id;
  }
  function captainSeat(id){
    const i = priv.lobby.teams.findIndex(t => t.captain === id);
    if (i < 0) throw rule(teamIdxOf(id) < 0 ? 'Tu n’es dans aucune équipe.' : 'Seul le capitaine de l’équipe peut jouer.');
    return i;
  }

  async function handleAction(row){
    if (row.id <= priv.lastAction) return;
    priv.lastAction = row.id;
    const id = row.user_id, p = row.payload || {}, L = priv.lobby, g = priv.g;
    try {
      if (p.type === 'join'){
        const pseudo = clean(p.pseudo, 24) || 'Invité', name = clean(p.team, 24), av = Number.isInteger(p.avatar) && p.avatar >= 1 && p.avatar <= 6 ? p.avatar : 1;
        if (!name) throw rule('Donne un nom d’équipe.');
        const findTeam = () => L.teams.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
        const cur = teamIdxOf(id);
        if (findTeam() < 0 && g) throw rule('La partie a commencé : rejoins une équipe existante.');
        if (cur >= 0 && cur !== findTeam()){ if (g) throw rule('Pas de changement d’équipe en cours de partie.'); removeMember(id); }
        const ti = findTeam();
        if (ti < 0){ if (L.teams.length >= 6) throw rule('6 équipes maximum.'); L.teams.push({ name, captain: id, members: [{ id, pseudo, avatar: av }] }); }
        else { const t = L.teams[ti], m = t.members.find(x => x.id === id); if (m){ m.pseudo = pseudo; m.avatar = av; } else t.members.push({ id, pseudo, avatar: av }); if (!t.captain) t.captain = id; }
      } else if (p.type === 'leave'){
        if (g) throw rule('Impossible de quitter son équipe en cours de partie.');
        removeMember(id);
      } else if (p.type === 'captain'){
        const i = teamIdxOf(id); if (i < 0) throw rule('Tu n’es dans aucune équipe.');
        L.teams[i].captain = id;
      } else if (p.type === 'bet'){
        const seat = captainSeat(id);
        if (!g || g.phase !== 'bet' || g.toAct !== seat) throw rule('Ce n’est pas ton tour de parler.');
        H.act(g, String(p.action), Number(p.to));
      } else if (p.type === 'answer'){
        const seat = captainSeat(id);
        if (!g) throw rule('La partie n’a pas commencé.');
        H.answerFor(g, seat, { answer: p.answer, greedy: !!p.greedy, bonusAnswer: p.bonusAnswer });
      } else throw rule('Action inconnue.');
      delete priv.errors[id];
    } catch (e){
      if (!e.rule) console.error(e);
      priv.errors[id] = { msg: e.rule ? e.message : 'Action refusée.', rev: priv.rev + 1 };
    }
    await commit();
  }

  function ranking(g){
    const order = g.teams.map((t, i) => i).sort((a, b) => g.teams[b].chips - g.teams[a].chips);
    let rank = 0, last = null;
    return order.map((i, k) => { const t = g.teams[i]; if (t.chips !== last){ rank = k + 1; last = t.chips; }
      return { team: t.name, chips: t.chips, rank, players: (priv.lobby.teams[i] || { members: [] }).members.map(m => ({ id: m.id, pseudo: m.pseudo, avatar: m.avatar })) }; });
  }
  async function recordClub(){
    if (!room.club_code || priv.recorded) return;
    priv.playedAt = priv.playedAt || new Date().toISOString();
    try { await net.addClubResult(room.club_code, room.code, ranking(priv.g), priv.playedAt); priv.recorded = true; priv.clubErr = ''; }
    catch (e){ priv.clubErr = e.message; }
  }

  const hostActions = {
    start(){
      const L = priv.lobby;
      if (L.teams.length < 2) throw rule('Il faut au moins 2 équipes.');
      priv.g = H.createGame({ names: L.teams.map(t => t.name), rounds: L.settings.rounds, startChips: L.settings.startChips, greed: L.settings.greed });
      priv.recorded = false; priv.playedAt = null; priv.clubErr = '';
      H.startRound(priv.g);
    },
    open(){ H.openStreet(priv.g); },
    next(){ H.startRound(priv.g); },
    abandon(seat){ H.abandon(priv.g, seat); },
    kick(i){ if (priv.g) throw rule('Partie en cours.'); priv.lobby.teams.splice(i, 1); },
    replay(){ priv.g = null; },
    setting(k, v){ if (priv.g) return; priv.lobby.settings[k] = v; }
  };

  // ---------- joueur ----------
  async function send(payload){
    if (ui.busy) return;
    ui.busy = true; ui.err = ''; ui.sentRev = room.state.rev; render();
    try { await net.sendAction(room.code, payload); }
    catch (e){ ui.busy = false; ui.err = e.message; render(); return; }
    setTimeout(() => { if (ui.busy){ ui.busy = false; ui.err = 'Pas de réponse de l’hôte. Son écran est-il toujours ouvert ?'; render(); } }, 8000);
  }
  const myTeam = () => room.state.lobby.teams.findIndex(t => t.members.some(m => m.id === me.id));
  const ansKey = () => `holdup-ans-${room.code}-${room.state.game ? room.state.game.round : 0}`;

  // ---------- rendu ----------
  const errBox = m => `<p class="err" role="alert">${esc(m || '')}</p>`;
  function render(){
    if (ui.view === 'boot') return;
    const focused = document.activeElement && document.activeElement.id;
    const caret = focused && document.activeElement.selectionStart;
    app.classList.toggle('wide', ui.view === 'room' && isHost && ui.tab === 'table');
    app.innerHTML = (net.demo ? `<p class="banner">Mode démo : Supabase n’est pas configuré. Chaque onglet de ce navigateur joue le rôle d’un téléphone.</p>` : '') +
      ({ pseudo: pseudoView, home: homeView, clubs: clubsView, room: roomView }[ui.view])();
    if (focused){ const el = document.getElementById(focused); if (el){ el.focus({ preventScroll: true }); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (e) {} } }
    const qr = document.getElementById('qr');
    if (qr && window.QRCode && !qr.childElementCount) try { new window.QRCode(qr, { text: joinUrl(room.code), width: 132, height: 132 }); } catch (e) {}
    if (ui.view === 'room') celebrate();
  }

  // Cartes plein écran sur le téléphone d'une équipe : à son tour de parler, et au verdict de sa réponse.
  function celebrate(){
    const s = room.state, g = s.game, mine = myTeam();
    if (!g || mine < 0 || (isHost && ui.tab === 'table')) return;
    if (g.phase === 'bet' && g.toAct === mine){
      const k = `tour-${g.round}-${g.street}-${g.log.length}`;
      if (ui.shown !== k){ ui.shown = k; overlay('card-tour', 'À vous de parler'); try { navigator.vibrate && navigator.vibrate(120); } catch (e) {} }
    } else if (g.phase === 'result' && g.result.type === 'showdown'){
      const t = g.teams[mine], k = `res-${g.round}`;
      if (!t.folded && t.answer !== null && ui.shown !== k){ ui.shown = k; const ok = H.isCorrect(g, t); overlay(ok ? 'card-bonne' : 'card-mauvaise', ok ? 'Bonne réponse' : 'Mauvaise réponse'); }
    }
  }
  function overlay(img, label){
    document.querySelectorAll('.overlay').forEach(o => o.remove());
    const o = document.createElement('div');
    o.className = 'overlay'; o.setAttribute('role', 'status'); o.setAttribute('aria-label', label);
    o.innerHTML = `<img src="${A(img)}" alt="${esc(label)}">`;
    o.addEventListener('click', () => o.remove());
    document.body.appendChild(o);
    setTimeout(() => o.remove(), 1800);
  }
  const val = (id, d = '') => esc(ui.inputs[id] ?? d);
  const header = (hero = false) => `<header class="brand"><img class="logo" src="${A('logo')}" alt="HOLD UP! Mise sur ton savoir">${hero ? `<img class="hero-mascots" src="${A('mascots')}" alt="">` : ''}</header>`;

  function pseudoView(){
    const cur = myAvatar();
    return header() + `<section class="panel"><h2>Ton profil</h2><p class="dim">Pas de compte : ton pseudo et ton avatar restent sur cet appareil.</p>
      <span class="label">Avatar</span><div class="avatars" role="radiogroup" aria-label="Avatar">${Array.from({ length: AVATARS }, (_, i) => `<button class="avpick" role="radio" aria-checked="${cur === i + 1}" aria-label="Avatar ${i + 1}" data-a="avatar" data-v="${i + 1}">${avatar(i + 1, 'av lg')}</button>`).join('')}</div>
      <label>Pseudo<input id="pseudo" maxlength="24" value="${val('pseudo', me.pseudo)}" autocomplete="nickname"></label>${errBox(ui.err)}
      <button data-a="savePseudo">Continuer</button></section>`;
  }

  function homeView(){
    const clubs = clubsCache || [];
    return header(true) + `<div class="hello">${avatar(myAvatar(), 'av md')}<p>Salut <b>${esc(me.pseudo)}</b></p><button class="ghost mini" data-a="editPseudo">Modifier mon profil</button></div>
      <section class="panel"><h2>Rejoindre une table</h2>
        <label>Code du salon<input id="joinCode" class="code" maxlength="4" value="${val('joinCode')}" autocomplete="off" autocapitalize="characters"></label>
        <button data-a="join">Rejoindre</button></section>
      ${errBox(ui.err)}
      <section class="panel"><h2>Créer une table</h2><p class="dim small">Ton appareil devient l’écran de la table (idéalement branché à une télé). Tu peux aussi y jouer avec ton équipe.</p>
        <label>Club (facultatif)<select id="roomClub"><option value="">Aucun</option>${clubs.map(c => `<option value="${esc(c.code)}" ${ui.inputs.roomClub === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <button data-a="create">Créer un salon</button></section>
      <section class="panel"><h2>Clubs</h2><p class="dim small">Un club garde le classement de vos soirées.</p><button class="ghost" data-a="clubs">Mes clubs</button></section>`;
  }

  function clubsView(){
    const list = clubsCache;
    const board = c => {
      const rows = (ui.results || {})[c.code];
      if (!rows) return '<p class="dim small">Chargement du classement…</p>';
      if (!rows.length) return '<p class="dim small">Aucune soirée jouée pour l’instant. Créez une table en choisissant ce club.</p>';
      const by = {};
      rows.slice().reverse().forEach(r => (r.ranking || []).forEach(t => (t.players || []).forEach(p => {
        const x = by[p.id] || (by[p.id] = { games: 0, wins: 0, podiums: 0, chips: 0 });
        x.pseudo = p.pseudo; x.avatar = p.avatar; // le plus récent
        x.games++; if (t.rank === 1) x.wins++; if (t.rank <= 3) x.podiums++; x.chips += t.chips;
      })));
      const lines = Object.values(by).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.chips - a.chips).slice(0, 30);
      const row = l => { const r = rankOf(l.wins); return `<tr><td><span class="member">${avatar(l.avatar)}${esc(l.pseudo)}</span></td><td><img class="rank-badge" src="${A('rank-' + r[1])}" alt="${r[2]}" title="${r[2]}"></td><td class="n">${l.wins}</td><td class="n">${l.podiums}</td><td class="n">${l.games}</td></tr>`; };
      return `<img class="classement-head" src="${A('classement-head')}" alt="Classement"><div class="scroll"><table class="lb"><thead><tr><th>Joueur</th><th>Rang</th><th>Victoires</th><th>Podiums</th><th>Soirées</th></tr></thead><tbody>${lines.map(row).join('')}</tbody></table></div><p class="dim small">${rows.length} soirée${rows.length > 1 ? 's' : ''} enregistrée${rows.length > 1 ? 's' : ''}. Rangs : Argent dès 2 victoires, Or 5, Platine 10, Diamant 15, Légende 25.</p>`;
    };
    return `<button class="ghost mini" data-a="home">← Retour</button><img class="club-banner" src="${A('club-banner')}" alt="Mon club">
      ${list === null ? '<p class="dim">Chargement…</p>' : list.length ? list.map(c => `<section class="panel"><span class="label">Code ${esc(c.code)}</span><h2>${esc(c.name)}</h2>${imgBtn('invite', c.code, 'btn-inviter', 'Inviter des amis', 'style="max-width:260px"')}${ui.invited === c.code ? `<p class="notice small">Code copié : <b>${esc(c.code)}</b>. Tes amis le saisissent dans « Rejoindre un club ».</p>` : ''}${board(c)}</section>`).join('') : '<p class="dim">Tu n’es dans aucun club.</p>'}
      ${errBox(ui.err)}
      <section class="panel"><h2>Rejoindre un club</h2><label>Code du club<input id="clubCode" class="code" maxlength="6" value="${val('clubCode')}" autocomplete="off"></label><button data-a="joinClub">Rejoindre</button></section>
      <section class="panel"><h2>Créer un club</h2><label>Nom<input id="clubName" maxlength="40" value="${val('clubName')}" placeholder="Les jeudis de la coloc"></label><button data-a="createClub">Créer</button></section>`;
  }

  function roomView(){
    const s = room.state;
    const tabs = isHost ? `<div class="tabs" role="tablist"><button role="tab" aria-selected="${ui.tab === 'table'}" data-a="tab" data-v="table">Écran de la table</button><button role="tab" aria-selected="${ui.tab === 'team'}" data-a="tab" data-v="team">Mon équipe</button></div>` : '';
    const body = isHost && ui.tab === 'table' ? hostView(s) : playerView(s);
    return `<div class="row topbar"><img class="fit logo-sm" src="${A('logo')}" alt="HOLD UP!"><span class="who-me">${avatar(myAvatar(), 'av sm')}<span class="dim small">Salon <b>${esc(room.code)}</b> · ${esc(me.pseudo)}</span></span>${imgBtn('leave', null, 'btn-quitter', 'Quitter le salon', 'style="width:92px;flex:0 0 auto"')}</div>` + tabs + body;
  }

  function statusBar(g, extra = ''){ return `<div class="status"><span class="tag gold">Manche ${g.round}/${g.rounds}</span>${extra}<span class="pot"><img src="${A('coins')}" alt="Pot">${H.totalPot(g)}</span></div>`; }

  function seatsHtml(s, opts = {}){
    const g = s.game, L = s.lobby, mine = myTeam();
    return `<div class="seats">${g.teams.map((t, i) => {
      const tags = [];
      if (i === g.dealer) tags.push('<span class="tag">Donneur</span>');
      if (i === g.sbSeat) tags.push('<span class="tag">P. blinde</span>');
      if (i === g.bbSeat) tags.push('<span class="tag">G. blinde</span>');
      if (t.out) tags.push('<span class="tag red">Éliminée</span>'); else if (t.folded) tags.push('<span class="tag red">Couchée</span>'); else if (t.allIn) tags.push('<span class="tag gold">Tapis</span>');
      if (g.phase === 'answers' && g.answerQueue.includes(i) && !t.folded) tags.push(t.answered ? '<span class="tag ok">A répondu</span>' : '<span class="tag">Réfléchit…</span>');
      const bet = !t.out && t.street > 0 && (g.phase === 'bet' || g.phase === 'answers') ? `<span class="bet">mise ${t.street}</span>` : '';
      const team = L.teams[i]; const who = team ? team.members.map(m => member(m, team.captain)).join('') : '';
      const ctl = opts.host && ((g.phase === 'bet' && g.toAct === i) || (g.phase === 'answers' && g.answerQueue.includes(i) && !t.answered && !t.folded))
        ? `<button class="warn mini" data-a="abandon" data-v="${i}">Coucher (absente)</button>` : '';
      return `<div class="seat ${i === g.toAct ? 'turn' : ''} ${t.out || t.folded ? 'out' : ''} ${i === mine ? 'me' : ''}"><span class="nm">${esc(t.name)}</span><span class="st">${chips(t.chips)}</span><div class="meta">${bet}${tags.join('')}${ctl}</div>${opts.members ? `<span class="who">${who}</span>` : ''}</div>`;
    }).join('')}</div>`;
  }

  function lobbyTeams(s, host){
    const L = s.lobby;
    if (!L.teams.length) return '<p class="dim">Aucune équipe pour l’instant.</p>';
    return `<div class="seats">${L.teams.map((t, i) => `<div class="seat"><span class="nm">${esc(t.name)}</span><span class="st small dim">${t.members.length} joueur${t.members.length > 1 ? 's' : ''}</span><span class="who">${t.members.map(m => member(m, t.captain)).join('')}</span>${host ? `<div class="meta"><button class="ghost mini" data-a="kick" data-v="${i}">Retirer l’équipe</button></div>` : ''}</div>`).join('')}</div>`;
  }

  function resultHtml(g){
    const r = g.result, q = g.question;
    if (r.type === 'hidden') return `<span class="label">Aucun aveu</span><img class="mystery" src="${A('card-mystere')}" alt="Réponse secrète"><h2>${esc(g.teams[r.winner].name)} rafle ${r.total} jetons</h2><p class="dim">${r.street === 'pre' ? 'Tout le monde s’est couché.' : 'Les autres se sont couchés : la réponse reste secrète.'}</p>`;
    const name = i => esc(g.teams[i].name);
    const pots = r.pots.map((p, k) => {
      const title = r.pots.length > 1 ? (k === 0 ? 'Pot principal' : `Pot annexe ${k}`) : 'Pot';
      const what = p.kind === 'rollover' ? '<span class="ko">Personne : jackpot reporté</span>' : p.kind === 'refund' ? `Rendu à ${name(p.eligible[0])} (mise non suivie)` : p.paid.map(x => `${name(x.seat)} +${x.amount}`).join(', ') + (p.kind === 'greed' ? ' · gourmandise' : '');
      return `<div class="potline"><span>${title}</span><b>${p.amount}</b><span class="small" style="grid-column:1/-1">${what}</span></div>`;
    }).join('');
    const mark = ok => `<span class="${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span>`;
    const answers = g.teams.filter(t => !t.folded && t.answer !== null).map(t => `<p class="small">${esc(t.name)} : ${esc(q.options[t.answer])} ${mark(t.answer === q.answer)}${t.greedy ? ` · liée : ${esc(q.bonusOptions[t.bonusAnswer])} ${mark(t.bonusAnswer === q.bonusAnswer)}` : ''}</p>`).join('');
    return `<span class="label">Abattage</span><p class="big">${esc(q.q)}</p><p>Réponse : <b>${esc(q.options[q.answer])}</b>${g.teams.some(t => t.greedy) ? ` · liée : <b>${esc(q.bonusOptions[q.bonusAnswer])}</b>` : ''}</p>${answers}<div>${pots}</div>`;
  }

  function endHtml(s){
    const g = s.game, ranked = g.teams.map((t, i) => ({ t, i })).sort((a, b) => b.t.chips - a.t.chips);
    const shared = g.final && g.final.jackpotShared.length ? `<p class="notice small">Jackpot non réclamé partagé : ${g.final.jackpotShared.map(x => `${esc(g.teams[x.seat].name)} +${x.amount}`).join(', ')}.</p>` : '';
    const club = s.club ? (s.clubErr ? `<p class="err">${esc(s.clubErr)}</p>` : '<p class="dim small">Résultat enregistré dans le club.</p>') : '';
    return `<img class="classement-head" src="${A('classement-head')}" alt="Classement"><h2 style="text-align:center">${esc(ranked[0].t.name)} gagne la table</h2><div>${ranked.map((x, k) => `<div class="rank"><span class="n">${k + 1}</span><span>${esc(x.t.name)}<span class="sub members">${(s.lobby.teams[x.i] || { members: [] }).members.map(m => member(m)).join('')}</span></span><span>${chips(x.t.chips)}</span></div>`).join('')}</div>${shared}${club}`;
  }

  function hostView(s){
    const g = priv && priv.g, L = priv ? priv.lobby : s.lobby;
    const err = errBox(ui.err);
    if (!g){
      const st = L.settings;
      return `<div class="host-grid">
        <section class="panel enter"><span class="label">Rejoignez la table</span>
          <div class="joinbox"><div class="stack"><span class="roomcode">${esc(room.code)}</span><span class="link">${esc(joinUrl(room.code))}</span></div><div id="qr" class="qr"></div></div>
          <p class="dim small">Chaque équipe rejoint avec son téléphone : le premier joueur de l’équipe en devient le capitaine.</p>
          ${lobbyTeams(s, true)}</section>
        <section class="panel"><h2>Réglages</h2>
          <div class="row"><label>Manches<select id="setRounds" data-setting="rounds">${[6, 8, 10, 12].map(n => `<option ${n === st.rounds ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Jetons<select id="setChips" data-setting="startChips">${[20, 30, 50].map(n => `<option ${n === st.startChips ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <label>Gourmandise<select id="setGreed" data-setting="greed"><option value="1" ${st.greed ? 'selected' : ''}>Activée</option><option value="0" ${st.greed ? '' : 'selected'}>Désactivée</option></select></label>
          ${room.club_code ? `<p class="dim small">Partie comptée dans le club ${esc(room.club_code)}.</p>` : ''}
          ${err}<button data-a="start" ${L.teams.length < 2 ? 'disabled' : ''}>Lancer la partie (${L.teams.length} équipe${L.teams.length > 1 ? 's' : ''})</button></section></div>`;
    }
    const pub = s.game, q = g.question;
    let main = '', controls = '';
    if (g.phase === 'tease'){
      main = `<span class="label">L’annonce · ${esc(q.category)}</span><div class="tease">${catImg(q.category, 'catcard big-cat')}<p class="big">${esc(q.tease)}</p></div><p class="dim">${esc(g.teams[g.sbSeat].name)} pose la petite blinde (${g.sb}), ${esc(g.teams[g.bbSeat].name)} la grosse (${g.bb}).${g.dead ? ` Jackpot en jeu : ${g.dead}.` : ''}</p>`;
      controls = `<button data-a="open">Ouvrir les enchères</button>`;
    } else if (g.phase === 'bet'){
      const L2 = H.legal(g);
      main = (g.street === 'pre' ? `<span class="label">Enchères avant la question · ${esc(q.category)}</span><div class="tease">${catImg(q.category)}<p class="big">${esc(q.tease)}</p></div>` : `<span class="label">Enchères après les réponses</span>${qcard(q.q, 'host')}`)
        + `<h2>À ${esc(g.teams[g.toAct].name)} de parler</h2><p class="dim">${L2.owe ? `Mise à suivre : ${L2.owe}` : 'Personne n’a misé sur ce tour'}</p>`;
    } else if (g.phase === 'answers'){
      const n = H.pendingAnswers(g).length;
      main = `<span class="label">Réponses secrètes · ${esc(q.category)}</span>${qcard(q.q, 'host')}<p class="dim" style="text-align:center">${n ? `En attente de ${n} équipe${n > 1 ? 's' : ''}…` : ''}</p>`;
    } else if (g.phase === 'result'){
      main = resultHtml(pub);
      const last = g.round >= g.rounds || g.teams.filter(t => t.chips > 0).length < 2;
      controls = `<button data-a="next">${last ? 'Classement final' : 'Manche suivante'}</button>`;
    } else if (g.phase === 'end'){
      main = endHtml(s); controls = `<button data-a="replay">Rejouer avec les mêmes équipes</button>`;
    }
    const log = g.log.slice(-6).map(l => `<span>${esc(l)}</span>`).join('');
    return statusBar(g, `<span class="tag">Salon ${esc(room.code)}</span>`) + `<div class="host-grid">
      <section class="panel enter">${main}${err}${controls}</section>
      <div class="stack">${seatsHtml(s, { host: true, members: true })}<div class="panel"><span class="label">Journal</span><div class="log">${log}</div></div></div></div>`;
  }

  function playerView(s){
    const mine = myTeam(), L = s.lobby, g = s.game;
    const myErr = s.errors && s.errors[me.id] && s.errors[me.id].rev === s.rev ? s.errors[me.id].msg : '';
    const err = errBox(ui.err || myErr);
    if (mine < 0 || s.status === 'lobby'){
      const team = mine >= 0 ? L.teams[mine] : null;
      return `<section class="panel enter">${team ? `<span class="label">Ton équipe</span><h2>${esc(team.name)}</h2><p class="dim">${team.captain === me.id ? 'Tu es capitaine : c’est toi qui mises et réponds pour l’équipe.' : 'Ton capitaine mise et répond pour l’équipe.'}</p><p class="dim small">En attente du lancement par l’hôte…</p>`
        : `<h2>Choisis ton équipe</h2>${g ? '<p class="dim small">La partie a commencé : rejoins une équipe existante.</p>' : ''}`}
        ${L.teams.length ? `<div class="stack">${L.teams.map(t => `<button class="${team && team.name === t.name ? '' : 'ghost'}" data-a="joinTeam" data-v="${esc(t.name)}" ${team && team.name === t.name ? 'disabled' : ''} ${ui.busy ? 'disabled' : ''}>${esc(t.name)} · ${t.members.length} joueur${t.members.length > 1 ? 's' : ''}</button>`).join('')}</div>` : ''}
        ${g ? '' : `<label>Nouvelle équipe<input id="teamName" maxlength="24" value="${val('teamName')}" placeholder="Les Renards" autocomplete="off"></label><button data-a="newTeam" ${ui.busy ? 'disabled' : ''}>Créer l’équipe</button>`}
        ${team && !g ? `<div class="row">${team.captain !== me.id ? `<button class="ghost mini" data-a="captain">Devenir capitaine</button>` : ''}<button class="ghost mini" data-a="leaveTeam">Quitter l’équipe</button></div>` : ''}
        ${err}</section>`;
    }
    const t = g.teams[mine], team = L.teams[mine], captain = team.captain === me.id, q = g.question;
    const capNote = captain ? '' : `<p class="dim small">C’est ${esc((team.members.find(m => m.id === team.captain) || {}).pseudo || 'ton capitaine')} qui joue pour l’équipe. <button class="ghost mini" data-a="captain">Prendre la main</button></p>`;
    let panel = '';
    if (g.phase === 'tease') panel = `<span class="label">L’annonce · ${esc(q.category)}</span><div class="tease">${catImg(q.category)}<p class="big">${esc(q.tease)}</p></div><p class="dim">Discutez, provoquez-vous. L’hôte va ouvrir les enchères.</p>`;
    else if (g.phase === 'bet'){
      const ctx = g.street === 'pre' ? `<span class="label">Avant la question · ${esc(q.category)}</span><div class="tease small-tease">${catImg(q.category, 'catcard sm')}<p>${esc(q.tease)}</p></div>` : `<span class="label">Après les réponses</span><p><b>${esc(q.q)}</b></p>${myAnswerNote()}`;
      if (g.toAct === mine && captain) panel = ctx + betPanel(g);
      else panel = ctx + `<h2>${g.toAct === mine ? 'À vous de parler' : `À ${esc(g.teams[g.toAct].name)} de parler`}</h2>${g.toAct === mine ? capNote : ''}`;
    } else if (g.phase === 'answers'){
      if (t.folded) panel = `<p class="big">${esc(q.q)}</p><p class="dim">Vous êtes couchés pour cette manche.</p>`;
      else if (t.answered) panel = `<span class="label">Réponse verrouillée</span>${qcard(q.q, 'sm')}${myAnswerNote()}<p class="dim small">En attente des autres équipes…</p>`;
      else if (captain) panel = answerPanel(g, mine);
      else panel = `<span class="label">Question</span>${qcard(q.q)}<p class="dim">Votre capitaine répond. Chuchotez-lui la réponse !</p>${capNote}`;
    } else if (g.phase === 'result') panel = resultHtml(g) + `<p class="dim small">L’hôte lance la suite.</p>`;
    else if (g.phase === 'end') panel = endHtml(s);
    return statusBar(g, `<span class="tag">${esc(team.name)} · ${chips(t.chips)}</span>`) + `<section class="panel ${g.toAct === mine ? 'hot' : ''} enter">${panel}${err}</section>` + seatsHtml(s);
  }

  function myAnswerNote(){
    const a = ls.get(ansKey()), q = room.state.game.question;
    if (!a || !q.options) return '';
    return `<p class="notice small">Votre réponse : <b>${esc(q.options[a.answer])}</b>${a.greedy ? ` · liée : <b>${esc(q.bonusOptions[a.bonusAnswer])}</b>` : ''}</p>`;
  }

  function betPanel(g){
    const t = g.teams[g.toAct], L = H.legal(g), key = `${g.round}-${g.street}-${g.toAct}-${g.currentBet}`;
    if (ui.raiseFor !== key){ ui.raiseFor = key; ui.raiseTo = L.minTo; }
    ui.raiseTo = Math.max(L.minTo, Math.min(L.maxTo, ui.raiseTo));
    const dis = ui.busy ? 'disabled' : '';
    const base = Math.max(g.currentBet, g.bb);
    const presets = [[2, 'chip-x2'], [5, 'chip-x5'], [10, 'chip-x10']].map(([k, img]) => [Math.min(L.maxTo, base * k), img, k]).filter(([v]) => v >= L.minTo && v < L.maxTo);
    const raise = L.canRaise ? `<div class="stack"><span class="label">${L.isBet ? 'Miser' : 'Relancer'} à</span>
      <div class="stepper"><button class="ghost" data-a="dec" aria-label="Moins">−</button><output>${ui.raiseTo}</output><button class="ghost" data-a="inc" aria-label="Plus">+</button></div>
      <div class="presets">${presets.map(([v, img, k]) => imgBtn('set', v, img, `Fois ${k} : ${v}`)).join('')}${imgBtn('set', L.maxTo, 'btn-allin', `Tapis : ${L.maxTo}`)}</div>
      ${imgBtn('bet', 'raise', L.isBet ? 'btn-miser' : 'btn-relancer', (ui.raiseTo === L.maxTo ? 'Tapis à ' : L.isBet ? 'Miser ' : 'Relancer à ') + ui.raiseTo, dis + ' style="max-width:220px;justify-self:center"', ui.raiseTo === L.maxTo ? 'Tapis ' + ui.raiseTo : ui.raiseTo)}</div>` : '';
    const call = L.canCheck ? imgBtn('bet', 'check', 'btn-passer', 'Parole', dis) : imgBtn('bet', 'call', 'btn-suivre', (L.callIsAllIn ? 'Suivre à tapis ' : 'Suivre ') + L.callAmt, dis, L.callIsAllIn ? 'Tapis ' + L.callAmt : L.callAmt);
    return `<h2>À vous de parler</h2><p class="dim small">${L.owe ? `Mise à suivre : ${L.owe}` : 'Personne n’a misé sur ce tour'} · il vous reste ${t.chips}</p>
      <div class="actions">${imgBtn('bet', 'fold', 'btn-coucher', 'Se coucher', dis)}${call}</div>${raise}`;
  }

  function answerPanel(g, mine){
    const q = g.question, t = g.teams[mine], key = `${room.code}-${g.round}`;
    if (ui.ansFor !== key){ ui.ansFor = key; ui.answer = null; ui.greedy = false; ui.bonus = null; }
    const canGreed = g.greedMode && t.chips >= H.GREED_COST;
    const opts = (list, sel, a) => `<div class="stack">${list.map((x, j) => `<button class="choice" aria-pressed="${sel === j}" data-a="${a}" data-v="${j}">${'ABCD'[j]}. ${esc(x)}</button>`).join('')}</div>`;
    const ready = ui.answer !== null && (!ui.greedy || ui.bonus !== null);
    return `<span class="label">Réponse secrète · ${esc(q.category)}</span>${qcard(q.q, 'sm')}${opts(q.options, ui.answer, 'pick')}
      ${canGreed ? `<label class="check greed"><input type="checkbox" id="greedy" ${ui.greedy ? 'checked' : ''}><img src="${A('bulb')}" alt=""> Gourmandise : +${H.GREED_COST} jetons pour une question liée</label>` : ''}
      ${ui.greedy ? `<div class="panel hot"><span class="label">Question liée</span><p><b>${esc(q.bonus)}</b></p>${opts(q.bonusOptions, ui.bonus, 'pickb')}<p class="dim small">Bonne réponse aux deux : priorité sur le pot. Erreur sur la liée : exclus du pot.</p></div>` : ''}
      ${imgBtn('lock', null, 'btn-valider', 'Verrouiller la réponse', (ready && !ui.busy ? '' : 'disabled') + ' style="max-width:260px;justify-self:center"')}`;
  }

  // ---------- événements ----------
  app.addEventListener('input', e => { if (e.target.id && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') ui.inputs[e.target.id] = e.target.value; });
  app.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'greedy'){ ui.greedy = el.checked; render(); return; }
    if (el.id === 'roomClub'){ ui.inputs.roomClub = el.value; return; }
    if (el.dataset.setting){ const k = el.dataset.setting; const v = k === 'greed' ? el.value === '1' : Number(el.value); hostDo(() => hostActions.setting(k, v)); }
  });
  app.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const map = { pseudo: 'savePseudo', joinCode: 'join', teamName: 'newTeam', clubCode: 'joinClub', clubName: 'createClub' };
    const a = map[e.target.id]; if (a){ e.preventDefault(); const b = app.querySelector(`button[data-a="${a}"]`); if (b && !b.disabled) b.click(); }
  });
  app.addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, v = b.dataset.v, inp = id => clean(ui.inputs[id] ?? (document.getElementById(id) || {}).value, 40);
    ui.err = '';
    try {
      switch (a){
        case 'savePseudo': {
          const p = clean(inp('pseudo'), 24); if (!p){ ui.err = 'Choisis un pseudo.'; break; }
          await net.setPseudo(p); me.pseudo = p;
          if (ui.pendingRoom){ const c = ui.pendingRoom; ui.pendingRoom = null; await enterRoom(c); return; }
          ui.view = room ? 'room' : 'home'; loadClubs(); break;
        }
        case 'editPseudo': ui.inputs.pseudo = me.pseudo; ui.view = 'pseudo'; break;
        case 'avatar': ls.set('holdup-avatar', Number(v)); break;
        case 'invite': {
          const text = `Rejoins mon club HOLD UP! avec le code ${v} : ${location.origin}${location.pathname}`;
          try { if (navigator.share){ await navigator.share({ title: 'HOLD UP!', text }); break; } } catch (e) { if (e && e.name === 'AbortError') break; }
          try { await navigator.clipboard.writeText(text); } catch (e) {}
          ui.invited = v; break;
        }
        case 'home': ui.view = 'home'; break;
        case 'join': { const c = inp('joinCode').toUpperCase(); if (!/^[A-Z]{4}$/.test(c)){ ui.err = 'Le code fait 4 lettres.'; break; } await enterRoom(c); return; }
        case 'create': {
          const club = ui.inputs.roomClub || '';
          const lobby = { teams: [], settings: { rounds: 8, startChips: 30, greed: true } };
          const code = await net.createRoom({ v: 1, rev: 0, status: 'lobby', lobby, game: null, errors: {}, club: club || null }, club);
          await enterRoom(code); return;
        }
        case 'leave': leaveRoom(false); loadClubs(); return;
        case 'clubs': ui.view = 'clubs'; render(); await loadClubs(true); return;
        case 'joinClub': { const c = inp('clubCode').toUpperCase(); await net.joinClub(c); ui.inputs.clubCode = ''; await loadClubs(true); return; }
        case 'createClub': { const n = clean(inp('clubName'), 40); if (!n){ ui.err = 'Donne un nom au club.'; break; } await net.createClub(n); ui.inputs.clubName = ''; await loadClubs(true); return; }
        case 'tab': ui.tab = v; break;
        // joueur
        case 'joinTeam': send({ type: 'join', team: v, pseudo: me.pseudo, avatar: myAvatar() }); return;
        case 'newTeam': { const n = clean(inp('teamName'), 24); if (!n){ ui.err = 'Donne un nom d’équipe.'; break; } ui.inputs.teamName = ''; send({ type: 'join', team: n, pseudo: me.pseudo, avatar: myAvatar() }); return; }
        case 'leaveTeam': send({ type: 'leave' }); return;
        case 'captain': send({ type: 'captain' }); return;
        case 'bet': send(v === 'raise' ? { type: 'bet', action: 'raise', to: ui.raiseTo } : { type: 'bet', action: v }); return;
        case 'inc': ui.raiseTo++; break;
        case 'dec': ui.raiseTo--; break;
        case 'set': ui.raiseTo = Number(v); break;
        case 'pick': ui.answer = Number(v); break;
        case 'pickb': ui.bonus = Number(v); break;
        case 'lock': {
          const a2 = { answer: ui.answer, greedy: !!ui.greedy, bonusAnswer: ui.greedy ? ui.bonus : null };
          ls.set(ansKey(), a2); send({ type: 'answer', ...a2 }); return;
        }
        // hôte
        case 'start': case 'open': case 'next': case 'replay': hostDo(() => hostActions[a]()); return;
        case 'abandon': hostDo(() => hostActions.abandon(Number(v))); return;
        case 'kick': hostDo(() => hostActions.kick(Number(v))); return;
      }
    } catch (err){ ui.err = err.message || String(err); }
    render();
  });

  async function loadClubs(withResults){
    try {
      clubsCache = await net.myClubs();
      if (withResults){ ui.results = {}; for (const c of clubsCache) ui.results[c.code] = await net.clubResults(c.code); }
    } catch (e){ ui.err = e.message; clubsCache = clubsCache || []; }
    if (ui.view === 'home' || ui.view === 'clubs') render();
  }

  boot().then(() => loadClubs());
})();
