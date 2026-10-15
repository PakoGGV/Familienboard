/**
 * Familien-Board – PV-Daten aus dem Sunny Portal (powered by ennexOS)
 *
 * Inoffiziell: nutzt dieselbe Datenquelle wie die Portal-Seite. Wenn SMA das Portal umbaut,
 * kann die Anzeige ausfallen, bis das Skript angepasst ist.
 * Der Anmelde-Schlüssel liegt nur hier in den Skript-Eigenschaften und wird bei jeder Nutzung erneuert.
 * Das Skript ruft bei SMA nur Lese-Abfragen auf.
 *
 * Einrichtung: siehe Anleitung, Abschnitt 8. Kurz:
 *  1. Diese Datei als neue Datei „Sma“ ins Projekt einfügen.
 *  2. In Code.gs in doGet eine Zeile ergänzen (siehe Anleitung).
 *  3. Einmal „smaEinrichten“ ausführen und zulassen.
 *  4. Bereitstellung aktualisieren (neue Version, gleiche Adresse).
 */
const SMA_AUTH = 'https://login.sma.energy/auth/realms/SMA/protocol/openid-connect/token';
const SMA_API = 'https://uiapi.sunnyportal.com/api/v1/';
const SMA_CLIENT = 'SPpbeOS';

/* Einrichten aus dem Board: Schlüssel kommt per POST, nicht in der Adresse */
function doPost(e) {
  const p = (e && e.parameter) || {};
  if (!TOKEN || TOKEN.indexOf('HIER-') === 0 || p.token !== TOKEN) return json({error: 'token'});
  try {
    if (p.action === 'smaSetup') {
      const b = JSON.parse((e.postData && e.postData.contents) || '{}');
      return json(smaSetup(String(b.refresh || '').trim(), String(b.plant || '').trim()));
    }
    return json({error: 'unknown action'});
  } catch (err) {
    return json({error: String(err && err.message || err)});
  }
}

/* wird aus doGet aufgerufen */
function smaAction(p) {
  if (p.action === 'sma') return smaLive(false);
  if (p.action === 'smaStatus') return smaStatus();
  return {error: 'unknown action'};
}

function smaSetup(refresh, plant) {
  if (!refresh) return {error: 'Kein Anmelde-Schlüssel übergeben.'};
  if (!/^\d+$/.test(plant)) return {error: 'Die Anlagen-Nummer fehlt (die Zahl aus der Portal-Adresse).'};
  const props = PropertiesService.getScriptProperties();
  props.setProperties({SMA_REFRESH: refresh, SMA_PLANT: plant});
  CacheService.getScriptCache().removeAll(['SMA_ACCESS', 'SMA_LIVE']);
  const live = smaLive(true);
  return live.error ? live : {ok: true, live: live};
}

function smaStatus() {
  const p = PropertiesService.getScriptProperties();
  return {connected: !!p.getProperty('SMA_REFRESH'), plant: p.getProperty('SMA_PLANT') || '', refreshUntil: Number(p.getProperty('SMA_REFRESH_EXP') || 0)};
}

/* Zugangs-Token holen (5 Minuten gültig), Anmelde-Schlüssel dabei erneuern */
function smaAccess(force) {
  const cache = CacheService.getScriptCache();
  if (!force) { const a = cache.get('SMA_ACCESS'); if (a) return a; }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!force) { const a = cache.get('SMA_ACCESS'); if (a) return a; }
    const props = PropertiesService.getScriptProperties(), rt = props.getProperty('SMA_REFRESH');
    if (!rt) throw new Error('sma_setup');
    const res = UrlFetchApp.fetch(SMA_AUTH, {method: 'post', muteHttpExceptions: true,
      payload: {grant_type: 'refresh_token', client_id: SMA_CLIENT, refresh_token: rt}});
    const code = res.getResponseCode();
    let j = {};
    try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
    if (code === 400 || code === 401) throw new Error('sma_relogin');
    if (code !== 200 || !j.access_token) throw new Error('sma_auth_' + code);
    if (j.refresh_token) props.setProperty('SMA_REFRESH', j.refresh_token);
    if (j.refresh_expires_in) props.setProperty('SMA_REFRESH_EXP', String(Date.now() + 1000 * j.refresh_expires_in));
    cache.put('SMA_ACCESS', j.access_token, Math.max(30, Math.min(3600, (j.expires_in || 300) - 45)));
    return j.access_token;
  } finally {
    lock.releaseLock();
  }
}

function smaLive(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) { const c = cache.get('SMA_LIVE'); if (c) return JSON.parse(c); }
  const plant = PropertiesService.getScriptProperties().getProperty('SMA_PLANT');
  if (!plant) return {error: 'sma_setup'};
  const get = tok => UrlFetchApp.fetch(SMA_API + 'widgets/energybalance?componentId=' + encodeURIComponent(plant),
    {headers: {Authorization: 'Bearer ' + tok, Accept: 'application/json'}, muteHttpExceptions: true});
  let res;
  try {
    res = get(smaAccess(false));
    if (res.getResponseCode() === 401) res = get(smaAccess(true));
  } catch (e) {
    return {error: String(e.message || e)};
  }
  if (res.getResponseCode() !== 200) return {error: 'sma_http_' + res.getResponseCode()};
  const b = JSON.parse(res.getContentText() || '{}');
  const out = {time: b.time || '', pv: b.pvGeneration, use: b.totalConsumption, grid: b.externalConsumption, feed: b.feedIn,
    self: b.directConsumption, autarky: b.autarkyRate, peak: b.pvPeakPower, battery: b.batteryStateOfCharge, at: Date.now()};
  cache.put('SMA_LIVE', JSON.stringify(out), 20);
  return out;
}

/* Hält die Verbindung auch dann frisch, wenn das Board länger aus ist. */
function smaWachHalten() {
  try { smaAccess(true); } catch (e) { Logger.log('SMA: ' + e.message); }
}

/** Einmal im Editor ausführen: „smaEinrichten“ auswählen → Ausführen → zulassen. */
function smaEinrichten() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'smaWachHalten'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('smaWachHalten').timeBased().everyHours(6).create();
  Logger.log('Fertig. Stand der SMA-Verbindung: ' + JSON.stringify(smaStatus()));
}
