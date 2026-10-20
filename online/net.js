// Couche réseau HOLD UP! en ligne. Deux implémentations de la même interface :
//  - Supabase (production) : invités anonymes, salons en temps réel, clubs.
//  - Démo locale : localStorage + BroadcastChannel, chaque onglet du navigateur = un joueur. Sert aux tests.
(() => {
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ', CLUBCHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n, set) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
  const fail = (msg, cause) => { const detail = cause && (cause.message || cause.msg || cause.error_description); const e = new Error(detail ? `${msg} (${detail})` : msg); e.user = true; e.cause = cause; return e; };

  function supabaseNet(url, key){
    url = String(url).trim().replace(/\/(rest|auth|realtime)\/v1\/?.*$/, '').replace(/\/+$/, ''); // tolère une adresse copiée avec /rest/v1/
    const sb = window.supabase.createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } });
    let uid = null;
    const ok = ({ data, error }, msg) => { if (error) throw fail(msg || 'Erreur réseau, réessaie.', error); return data; };
    const api = {
      kind: 'supabase',
      async init(){
        let { data: { session } } = await sb.auth.getSession();
        if (!session){
          const r = await sb.auth.signInAnonymously();
          if (r.error) throw fail('Connexion invitée impossible. Vérifie que les connexions anonymes sont activées dans Supabase.', r.error);
          session = r.data.session;
        }
        uid = session.user.id;
        const p = ok(await sb.from('profiles').select('pseudo').eq('id', uid).maybeSingle());
        return { id: uid, pseudo: p ? p.pseudo : '' };
      },
      async setPseudo(pseudo){ ok(await sb.from('profiles').upsert({ id: uid, pseudo, updated_at: new Date().toISOString() }), 'Pseudo non enregistré.'); },
      async createRoom(state, clubCode){
        for (let k = 0; k < 8; k++){
          const code = rand(4, LETTERS);
          const { error } = await sb.from('rooms').insert({ code, state, club_code: clubCode || null });
          if (!error) return code;
          if (error.code !== '23505') throw fail('Création du salon impossible.', error);
        }
        throw fail('Création du salon impossible, réessaie.');
      },
      async getRoom(code){ return ok(await sb.from('rooms').select('code,host_id,club_code,state').eq('code', code).maybeSingle()); },
      subscribeRoom(code, cb){
        const ch = sb.channel('room-' + code)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'code=eq.' + code }, p => cb(p.new))
          .subscribe(status => { if (status === 'SUBSCRIBED') api.getRoom(code).then(r => r && cb(r)).catch(() => {}); });
        return () => sb.removeChannel(ch);
      },
      async publishState(code, state){ ok(await sb.from('rooms').update({ state, updated_at: new Date().toISOString() }).eq('code', code), 'Mise à jour du salon impossible.'); },
      async savePrivate(code, data){ ok(await sb.from('room_private').upsert({ code, data, updated_at: new Date().toISOString() })); },
      async loadPrivate(code){ const r = ok(await sb.from('room_private').select('data').eq('code', code).maybeSingle()); return r ? r.data : null; },
      async sendAction(code, payload){ ok(await sb.from('actions').insert({ room_code: code, payload }), 'Action non envoyée, réessaie.'); },
      async fetchActionsSince(code, id){ return ok(await sb.from('actions').select('id,user_id,payload').eq('room_code', code).gt('id', id).order('id').limit(500)); },
      subscribeActions(code, cb, onReady){
        const ch = sb.channel('actions-' + code)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actions', filter: 'room_code=eq.' + code }, p => cb(p.new))
          .subscribe(status => { if (status === 'SUBSCRIBED' && onReady) onReady(); });
        return () => sb.removeChannel(ch);
      },
      async createClub(name){
        for (let k = 0; k < 8; k++){
          const code = rand(6, CLUBCHARS);
          const { error } = await sb.from('clubs').insert({ code, name });
          if (!error){ await api.joinClub(code); return code; }
          if (error.code !== '23505') throw fail('Création du club impossible.', error);
        }
        throw fail('Création du club impossible, réessaie.');
      },
      async joinClub(code){
        const club = ok(await sb.from('clubs').select('code').eq('code', code).maybeSingle());
        if (!club) throw fail('Aucun club avec ce code.');
        const { error } = await sb.from('club_members').insert({ club_code: code });
        if (error && error.code !== '23505') throw fail('Impossible de rejoindre ce club.', error);
      },
      async myClubs(){
        const rows = ok(await sb.from('club_members').select('club_code, clubs(name)').eq('user_id', uid));
        return rows.map(r => ({ code: r.club_code, name: r.clubs ? r.clubs.name : r.club_code }));
      },
      async clubResults(code){ return ok(await sb.from('club_results').select('room_code,ranking,played_at').eq('club_code', code).order('played_at', { ascending: false }).limit(300)); },
      async addClubResult(code, roomCode, ranking, playedAt){
        const { error } = await sb.from('club_results').insert({ club_code: code, room_code: roomCode, ranking, played_at: playedAt });
        if (error && error.code !== '23505') throw fail('Résultat non enregistré dans le club.', error);
      }
    };
    return api;
  }

  function localNet(){
    const bc = new BroadcastChannel('holdup-demo');
    // Une clé par donnée : plusieurs onglets écrivent en même temps sans s'écraser.
    const P = 'holdup-demo:';
    const get = k => { try { return JSON.parse(localStorage.getItem(P + k)); } catch (e) { return null; } };
    const put = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
    const keys = prefix => Object.keys(localStorage).filter(k => k.startsWith(P + prefix)).map(k => k.slice(P.length));
    let uid = null; try { uid = sessionStorage.getItem('holdup-demo-uid'); } catch (e) {}
    if (!uid){ uid = 'u-' + rand(10, CLUBCHARS.toLowerCase()); try { sessionStorage.setItem('holdup-demo-uid', uid); } catch (e) {} }
    const listeners = new Set();
    bc.onmessage = e => listeners.forEach(fn => fn(e.data));
    const notify = m => { bc.postMessage(m); setTimeout(() => listeners.forEach(fn => fn(m)), 0); };
    const tick = () => new Promise(r => setTimeout(r, 15));
    let lastId = 0;
    const nextId = () => { lastId = Math.max(lastId + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000)); return lastId; };
    const api = {
      kind: 'local',
      async init(){ await tick(); return { id: uid, pseudo: get('prof:' + uid) || '' }; },
      async setPseudo(p){ put('prof:' + uid, p); },
      async createRoom(state, clubCode){ let code; do code = rand(4, LETTERS); while (get('room:' + code)); put('room:' + code, { code, host_id: uid, club_code: clubCode || null, state }); return code; },
      async getRoom(code){ await tick(); return get('room:' + code); },
      subscribeRoom(code, cb){
        const fn = m => { if (m.t === 'room' && m.code === code) cb(m.row); };
        listeners.add(fn); api.getRoom(code).then(r => r && cb(r));
        return () => listeners.delete(fn);
      },
      async publishState(code, state){ const r = get('room:' + code); if (!r || r.host_id !== uid) throw fail('Seul l’hôte modifie le salon.'); r.state = state; put('room:' + code, r); notify({ t: 'room', code, row: r }); },
      async savePrivate(code, data){ put('priv:' + code, data); },
      async loadPrivate(code){ return get('priv:' + code); },
      async sendAction(code, payload){
        await tick(); if (!get('room:' + code)) throw fail('Salon introuvable.');
        const row = { id: nextId(), room_code: code, user_id: uid, payload }; put(`act:${code}:${row.id}`, row); notify({ t: 'action', code, row });
      },
      async fetchActionsSince(code, id){ return keys(`act:${code}:`).map(get).filter(a => a && a.id > id).sort((a, b) => a.id - b.id); },
      subscribeActions(code, cb, onReady){
        const fn = m => { if (m.t === 'action' && m.code === code) cb(m.row); };
        listeners.add(fn); setTimeout(() => onReady && onReady(), 0);
        return () => listeners.delete(fn);
      },
      async createClub(name){ let code; do code = rand(6, CLUBCHARS); while (get('club:' + code)); put('club:' + code, { code, name }); await api.joinClub(code); return code; },
      async joinClub(code){ if (!get('club:' + code)) throw fail('Aucun club avec ce code.'); put(`mem:${code}:${uid}`, { club_code: code, user_id: uid }); },
      async myClubs(){ return keys('mem:').map(get).filter(m => m && m.user_id === uid).map(m => ({ code: m.club_code, name: (get('club:' + m.club_code) || {}).name || m.club_code })); },
      async clubResults(code){ return keys(`res:${code}:`).map(get).filter(Boolean).sort((a, b) => b.played_at.localeCompare(a.played_at)); },
      async addClubResult(code, roomCode, ranking, playedAt){ put(`res:${code}:${roomCode}:${playedAt}`, { club_code: code, room_code: roomCode, ranking, played_at: playedAt }); }
    };
    return api;
  }

  const cfg = window.HOLDUP_CONFIG || {};
  const demo = /[?&]demo=1/.test(location.search) || !cfg.supabaseUrl || !cfg.supabaseAnonKey;
  window.HoldUpNet = demo || !window.supabase ? localNet() : supabaseNet(cfg.supabaseUrl, cfg.supabaseAnonKey);
  window.HoldUpNet.demo = demo || !window.supabase;
})();
