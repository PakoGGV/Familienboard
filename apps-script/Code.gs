/**
 * Familien-Board – Kalender-Brücke
 * Liefert die Termine aus deinen Google-Kalendern als JSON an die WebApp.
 * Geschützt durch ein geheimes Kennwort (TOKEN), das nur in deiner Firebase-Datenbank steht.
 *
 * Einrichtung: siehe Anleitung. Kurz:
 *  1. Dieses Skript in script.google.com einfügen.
 *  2. Unten bei TOKEN ein langes, zufälliges Kennwort eintragen.
 *  3. Bereitstellen → Neue Bereitstellung → Web-App, „Ausführen als: Ich“, „Zugriff: Jeder“.
 */
const TOKEN = 'HIER-EIN-LANGES-GEHEIMES-KENNWORT-EINTRAGEN';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!TOKEN || TOKEN.indexOf('HIER-') === 0 || p.token !== TOKEN) return json({error: 'token'});
  try {
    if (p.action === 'calendars') return json({calendars: listCalendars()});
    if (p.action === 'events') return json({events: listEvents(String(p.ids || '').split(',').filter(String), p.start, p.end)});
    if (p.action === 'ping') return json({ok: true});
    return json({error: 'unknown action'});
  } catch (err) {
    return json({error: String(err && err.message || err)});
  }
}

function listCalendars() {
  return CalendarApp.getAllCalendars().map(function (c) {
    return {id: c.getId(), summary: c.getName()};
  });
}

function listEvents(ids, start, end) {
  const from = start ? new Date(start) : new Date();
  const to = end ? new Date(end) : new Date(from.getTime() + 15 * 864e5);
  const tz = Session.getScriptTimeZone();
  const out = {};
  ids.forEach(function (id) {
    const cal = CalendarApp.getCalendarById(id);
    if (!cal) return;
    out[id] = cal.getEvents(from, to).map(function (ev) {
      const allDay = ev.isAllDayEvent();
      return {
        summary: ev.getTitle(),
        location: ev.getLocation() || '',
        status: 'confirmed',
        start: allDay ? {date: Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd')} : {dateTime: ev.getStartTime().toISOString()},
        end: allDay ? {date: Utilities.formatDate(ev.getAllDayEndDate(), tz, 'yyyy-MM-dd')} : {dateTime: ev.getEndTime().toISOString()}
      };
    });
  });
  return out;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Zum Testen im Skript-Editor: „testKalender“ auswählen und ausführen. */
function testKalender() {
  Logger.log(JSON.stringify(listCalendars(), null, 2));
}
