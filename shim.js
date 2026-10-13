/* Familien-Board als WebApp
   Ersetzt die Claude-Schnittstellen (window.claude.use) durch:
   - Firebase Firestore (Daten) + Firebase Auth (Anmeldung)
   - Google Apps Script (Kalender)
   - Open-Meteo (Wetter)
   Das eigentliche Board (index.html) bleibt unverändert lauffähig. */
(() => {
  'use strict';
  const CFG = window.FB_CONFIG || {};
  const LOC_DEFAULT = {lat: 51.993, lon: 6.918, name: 'Stadtlohn'};

  /* ---------- Firebase ---------- */
  let fdb = null, fauth = null, user = null;
  const ready = {};
  const once = name => ready[name] || (ready[name] = (() => { let r; const p = new Promise(res => { r = res; }); p.resolve = r; return p; })());

  function initFirebase(){
    if (!window.firebase || !CFG.apiKey) { showLogin('Die WebApp ist noch nicht eingerichtet: In der Datei config.js fehlen die Firebase-Zugangsdaten.'); return; }
    firebase.initializeApp(CFG);
    fauth = firebase.auth();
    fdb = firebase.firestore();
    try { fdb.enablePersistence({synchronizeTabs: true}).catch(() => {}); } catch (e) {}
    fauth.onAuthStateChanged(async u => {
      if (!u) { user = null; showLogin(); return; }
      user = u; hideLogin();
      await bootstrapRole();
      watchPrivate();
      once('db').resolve(dbApi());
      once('user').resolve(userApi());
      once('mcp').resolve(mcpApi());
    });
  }

  /* Erstes Konto überhaupt wird automatisch „ganzes Board“ (Einrichtung). Alle weiteren sehen zuerst die Oma-Ansicht,
     bis jemand im Board die Eltern-PIN eingibt. */
  async function bootstrapRole(){
    try {
      const v = await fdb.collection('viewers').limit(1).get();
      if (v.empty) await fdb.collection('viewers').doc(user.uid).set({role: 'full', at: Date.now(), first: true});
    } catch (e) {}
  }

  /* Der Board-Code nutzt dieselbe Form wie die Firestore-Compat-API (collection/doc/onSnapshot/set/update/delete). */
  function dbApi(){
    return {
      collection: name => fdb.collection(name),
      doc: path => fdb.doc(path),
    };
  }
  function userApi(){
    return {
      isOwner: async () => false,
      canEdit: async () => true,
      can: async () => true,
      id: async () => user ? user.uid : null,
      me: async () => ({id: user.uid, name: user.displayName || (user.email || '').split('@')[0], email: user.email, isOwner: false, canEdit: true}),
      profiles: async () => ({}),
      signOut: () => fauth.signOut().then(() => location.reload()),
      email: () => user && user.email,
    };
  }

  /* ---------- privater Teil: Adresse des Kalender-Skripts ---------- */
  const PRIV = {scriptUrl: '', token: '', loaded: false};
  let privUnsub = null;
  function watchPrivate(){
    if (privUnsub) return;
    privUnsub = fdb.doc('private/config').onSnapshot(s => {
      const d = s.exists ? s.data() : {};
      const changed = d.scriptUrl !== PRIV.scriptUrl || d.token !== PRIV.token;
      PRIV.scriptUrl = String(d.scriptUrl || ''); PRIV.token = String(d.token || ''); PRIV.loaded = true;
      if (changed) refreshAllCal();
    }, () => { PRIV.loaded = true; refreshAllCal(); });
  }

  /* ---------- „mcp“: Kalender + Wetter ---------- */
  const GCAL = 'Google Calendar', WXS = 'AccuWeather';
  const watchers = new Set();
  function mkErr(code, message){ const e = new Error(message || code); e.code = code; return e; }

  async function scriptCall(params){
    if (!PRIV.loaded) await new Promise(r => setTimeout(r, 800));
    if (!PRIV.scriptUrl) throw mkErr('server_not_connected', 'Kalender-Verbindung fehlt');
    const q = new URLSearchParams({...params, token: PRIV.token});
    const res = await fetch(PRIV.scriptUrl + (PRIV.scriptUrl.includes('?') ? '&' : '?') + q.toString(), {redirect: 'follow'});
    if (!res.ok) throw mkErr('upstream_error', 'HTTP ' + res.status);
    const j = await res.json();
    if (j && j.error) throw mkErr(j.error === 'token' ? 'needs_reauth' : 'upstream_error', j.error);
    return j;
  }

  /* Alle Kalender-Abfragen eines Zeitfensters werden zu einer Anfrage gebündelt. */
  const calReg = new Map(); // key -> {input, handlers:Set}
  let calTimer = null;
  function calKey(input){ return [input.calendarId, input.startTime, input.endTime].join('|'); }
  function scheduleCal(delay){ clearTimeout(calTimer); calTimer = setTimeout(fetchCal, delay == null ? 250 : delay); }
  async function fetchCal(){
    if (!calReg.size) return;
    const groups = new Map();
    for (const [k, r] of calReg) { const g = r.input.startTime + '|' + r.input.endTime; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
    for (const [g, keys] of groups) {
      const [start, end] = g.split('|');
      const ids = keys.map(k => calReg.get(k).input.calendarId);
      try {
        const j = await scriptCall({action: 'events', ids: ids.join(','), start, end});
        for (const k of keys) { const r = calReg.get(k); if (!r) continue; const evs = (j.events || {})[r.input.calendarId];
          r.handlers.forEach(h => h(evs ? {type: 'data', result: {payload: {events: evs}}} : {type: 'error', error: {code: 'upstream_error', message: 'Kalender nicht gefunden'}})); }
      } catch (e) {
        for (const k of keys) { const r = calReg.get(k); if (r) r.handlers.forEach(h => h({type: 'error', error: {code: e.code || 'upstream_error', message: e.message}})); }
      }
    }
    scheduleCal(15 * 60 * 1000);
  }
  function refreshAllCal(){ if (calReg.size) scheduleCal(100); }

  /* ---- Wetter über Open-Meteo, umgeformt in die Form, die das Board erwartet ---- */
  const WMO = {0:[1,'Sonnig',33,'Klar'],1:[2,'Überwiegend sonnig',34,'Überwiegend klar'],2:[4,'Teils sonnig',35,'Teilweise bewölkt'],3:[7,'Bewölkt',38,'Bewölkt'],
    45:[11,'Nebel'],48:[11,'Nebel mit Reif'],51:[12,'Leichter Nieselregen'],53:[12,'Nieselregen'],55:[12,'Starker Nieselregen'],56:[26,'Gefrierender Nieselregen'],57:[26,'Gefrierender Nieselregen'],
    61:[12,'Leichter Regen'],63:[18,'Regen'],65:[18,'Starker Regen'],66:[26,'Gefrierender Regen'],67:[26,'Gefrierender Regen'],
    71:[19,'Leichter Schneefall'],73:[22,'Schneefall'],75:[22,'Starker Schneefall'],77:[19,'Schneegriesel'],
    80:[14,'Leichte Regenschauer'],81:[14,'Regenschauer'],82:[18,'Starke Regenschauer'],85:[20,'Schneeschauer'],86:[20,'Starke Schneeschauer'],
    95:[15,'Gewitter'],96:[15,'Gewitter mit Hagel'],99:[15,'Gewitter mit Hagel']};
  const wmo = (code, isDay = true) => { const w = WMO[code] || [7, 'Bewölkt']; return isDay || !w[2] ? {icon: w[0], phrase: w[1]} : {icon: w[2], phrase: w[3]}; };
  const DIRS = ['N','NNO','NO','ONO','O','OSO','SO','SSO','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const deg = v => `${Math.round(v)}°`;
  const uvCat = v => v < 3 ? 'Niedrig' : v < 6 ? 'Mäßig' : v < 8 ? 'Hoch' : v < 11 ? 'Sehr hoch' : 'Extrem';
  function locFromKey(key){
    const m = String(key || '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    return m ? {lat: +m[1], lon: +m[2]} : LOC_DEFAULT;
  }
  const wxCache = new Map();
  async function wxData(key){
    const c = wxCache.get(key);
    if (c && Date.now() - c.at < 10 * 60 * 1000) return c.data;
    const {lat, lon} = locFromKey(key);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=Europe%2FBerlin&forecast_days=8`
      + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day'
      + '&hourly=temperature_2m,precipitation_probability,precipitation,snowfall,weather_code,wind_gusts_10m,is_day,uv_index'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max';
    const res = await fetch(url);
    if (!res.ok) throw mkErr('upstream_error', 'Wetter HTTP ' + res.status);
    const data = await res.json();
    wxCache.set(key, {at: Date.now(), data});
    return data;
  }
  function wxPayload(tool, d){
    const now = new Date();
    const hIdx = Math.max(0, (d.hourly.time || []).findIndex(t => new Date(t) >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())));
    if (tool === 'widgets-current-claude') {
      const c = d.current, w = wmo(c.weather_code, !!c.is_day), uv = (d.hourly.uv_index || [])[hIdx] || 0;
      return {currentConditions: {iconCode: w.icon, phrase: w.phrase, temperature: deg(c.temperature_2m), temperatureValue: c.temperature_2m,
        realFeel: deg(c.apparent_temperature), realFeelValue: c.apparent_temperature,
        extended: {wind: `${DIRS[Math.round(c.wind_direction_10m / 22.5) % 16]} ${Math.round(c.wind_speed_10m)} km/h`, humidity: `${Math.round(c.relative_humidity_2m)} %`, uv: {category: uvCat(uv), value: uv}}}};
    }
    if (tool === 'widgets-hourly-claude') {
      const H = d.hourly, out = [];
      for (let i = hIdx; i < Math.min(hIdx + 24, H.time.length); i++) {
        const w = wmo(H.weather_code[i], !!H.is_day[i]), p = Math.round(H.precipitation_probability[i] || 0);
        out.push({date: H.time[i], dateTime: H.time[i].slice(11, 13) + ' Uhr', icon: w.icon, phrase: w.phrase, temperature: deg(H.temperature_2m[i]), temperatureValue: H.temperature_2m[i],
          precip: `${p} %`, hasPrecip: (H.precipitation[i] || 0) > 0.1,
          extended: {rainProbability: `${p} %`, snowProbability: (H.snowfall[i] || 0) > 0 ? '100 %' : '0 %', iceProbability: '0 %', gustsValue: Math.round(H.wind_gusts_10m[i] || 0)}});
      }
      return {hourlyForecast: out};
    }
    if (tool === 'widgets-daily-claude') {
      const D = d.daily;
      return {dailyForecast: D.time.map((t, i) => { const w = wmo(D.weather_code[i], true), p = Math.round(D.precipitation_probability_max[i] || 0), dt = new Date(t + 'T12:00:00');
        return {day: {icon: w.icon, phrase: w.phrase, displayTemperature: deg(D.temperature_2m_max[i]), rainProbability: `${p} %`, rainProbabilityValue: p},
          night: {displayTemperature: deg(D.temperature_2m_min[i])}, longDisplayDate: dt.toLocaleDateString('de-DE', {weekday: 'short', day: 'numeric', month: 'short'})}; })};
    }
    return {};
  }
  async function wxSearch(q){
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=de&name=${encodeURIComponent(q)}`);
    const j = await res.json();
    return {results: (j.results || []).map(r => ({locationKey: `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`, name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', ')}))};
  }

  function mcpApi(){
    return {
      listTools: async () => ({servers: [{server: GCAL}, {server: WXS}]}),
      invalidate: async () => { wxCache.clear(); refreshAllCal(); },
      describeTool: async () => { throw mkErr('unavailable'); },
      watchTool(server, tool, input, handler, opts = {}){
        if (server === GCAL && tool === 'list_events') {
          const k = calKey(input);
          if (!calReg.has(k)) calReg.set(k, {input, handlers: new Set()});
          calReg.get(k).handlers.add(handler);
          scheduleCal();
          return () => { const r = calReg.get(k); if (r) { r.handlers.delete(handler); if (!r.handlers.size) calReg.delete(k); } };
        }
        if (server === WXS) {
          let stop = false;
          const key = input && input.queryParams && input.queryParams.locationKey;
          const run = async () => {
            if (stop) return;
            try { const d = await wxData(key); if (!stop) handler({type: 'data', result: {payload: wxPayload(tool, d)}}); }
            catch (e) { if (!stop) handler({type: 'error', error: {code: e.code || 'upstream_error', message: e.message}}); }
          };
          run();
          const iv = setInterval(run, Math.max(5 * 60 * 1000, opts.refetchInterval || 30 * 60 * 1000));
          return () => { stop = true; clearInterval(iv); };
        }
        setTimeout(() => handler({type: 'error', error: {code: 'not_in_manifest'}}), 0);
        return () => {};
      },
      async callTool(server, tool, input){
        if (server === GCAL && tool === 'list_calendars') { const j = await scriptCall({action: 'calendars'}); return {payload: {calendars: j.calendars || []}}; }
        if (server === GCAL && tool === 'list_events') { const j = await scriptCall({action: 'events', ids: input.calendarId, start: input.startTime, end: input.endTime}); return {payload: {events: (j.events || {})[input.calendarId] || []}}; }
        if (server === WXS && tool === 'widgets-search-claude') return {payload: await wxSearch(input.queryParams.query)};
        if (server === WXS) { const d = await wxData(input.queryParams.locationKey); return {payload: wxPayload(tool, d)}; }
        throw mkErr('not_in_manifest');
      },
    };
  }

  /* ---------- Anmeldung ---------- */
  function loginBox(){ return document.getElementById('login'); }
  function showLogin(msg){
    let box = loginBox();
    if (!box) { box = document.createElement('div'); box.id = 'login'; document.body.appendChild(box); }
    box.innerHTML = `<form class="login-card" autocomplete="on">
      <h1>Familien-Board</h1>
      ${msg ? `<p class="login-msg">${msg}</p>` : '<p class="login-hint">Bitte mit dem Familien-Konto anmelden.</p>'}
      ${CFG.apiKey ? `<label>E-Mail<input type="email" name="email" autocomplete="username" required></label>
      <label>Passwort<input type="password" name="pw" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">anmelden</button>
      <button class="btn small" type="button" id="pwreset">Passwort vergessen?</button>
      <p class="login-err" role="alert"></p>` : ''}
    </form>`;
    box.hidden = false;
    const f = box.querySelector('form'), err = box.querySelector('.login-err');
    if (!f || !fauth) return;
    f.addEventListener('submit', async ev => {
      ev.preventDefault(); err.textContent = '';
      try { await fauth.signInWithEmailAndPassword(f.email.value.trim(), f.pw.value); }
      catch (e) { err.textContent = e.code === 'auth/too-many-requests' ? 'Zu viele Versuche. Bitte kurz warten.' : 'Anmeldung fehlgeschlagen. E-Mail oder Passwort stimmt nicht.'; }
    });
    box.querySelector('#pwreset').addEventListener('click', async () => {
      const m = f.email.value.trim(); if (!m) { err.textContent = 'Bitte erst die E-Mail-Adresse eingeben.'; return; }
      try { await fauth.sendPasswordResetEmail(m); err.textContent = 'Eine E-Mail zum Zurücksetzen ist unterwegs.'; } catch (e) { err.textContent = 'Das hat nicht geklappt.'; }
    });
  }
  function hideLogin(){ const b = loginBox(); if (b) b.hidden = true; }

  /* ---------- window.claude.use() wie im Artefakt ---------- */
  window.claude = {
    use: name => {
      if (['db', 'user', 'mcp'].includes(name)) return once(name);
      return Promise.resolve(null);
    },
  };
  window.FB = {signOut: () => fauth && fauth.signOut().then(() => location.reload()), email: () => user && user.email,
    priv: () => ({...PRIV}),
    exportAll: async names => { const out = {}; for (const n of names) { const s = await fdb.collection(n).get(); out[n] = {}; s.forEach(d => { out[n][d.id] = d.data(); }); } return out; },
    importAll: async data => { let n = 0; for (const [c, docs] of Object.entries(data || {})) { for (const [id, d] of Object.entries(docs || {})) { await fdb.collection(c).doc(id).set(d); n++; } } return n; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFirebase); else initFirebase();
})();
