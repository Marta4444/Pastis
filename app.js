(() => {
'use strict';

/* =====================  utilidades  ===================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const hm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = (s, o) => new Intl.DateTimeFormat('es-ES', o).format(parse(s));
const uid = () => 'm' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const keyTime = t => t.replace(':', '');
const unkeyTime = k => `${k.slice(0, 2)}:${k.slice(2)}`;
const humanMin = n => { n = Math.abs(n); return n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ' ' + (n % 60) + ' min' : ''}` : `${n} min`; };

/* =====================  datos  ===================== */
const LS = 'tomas.v1', LSMETA = 'tomas.meta';
const empty = () => ({ meds: {}, logs: {}, notes: {}, settings: {} });
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS));
    if (s && typeof s === 'object') return { meds: s.meds || {}, logs: s.logs || {}, notes: s.notes || {}, settings: s.settings || {} };
  } catch (e) {}
  return empty();
}
function save() { localStorage.setItem(LS, JSON.stringify(state)); }
function meta() { try { return JSON.parse(localStorage.getItem(LSMETA)) || {}; } catch (e) { return {}; } }
function setMeta(m) { localStorage.setItem(LSMETA, JSON.stringify(m)); }

/* Cada cambio se guarda en local y, si hay sincronización, también en la nube */
function putMed(m) { state.meds[m.id] = m; save(); cloudSet(['meds', m.id], m); }
function removeMed(id) {
  delete state.meds[id]; cloudDel(['meds', id]);
  for (const k of Object.keys(state.logs)) if (k.split('_')[1] === id) { delete state.logs[k]; cloudDel(['logs', k]); }
  save();
}
function putLog(k, v) { state.logs[k] = v; save(); cloudSet(['logs', k], v); }
function removeLog(k) { delete state.logs[k]; save(); cloudDel(['logs', k]); }
function putNote(d, t) {
  if (t) { state.notes[d] = t; cloudSet(['notes', d], t); } else { delete state.notes[d]; cloudDel(['notes', d]); }
  save();
}
function putSetting(k, v) {
  if (v) { state.settings[k] = v; cloudSet(['settings', k], v); } else { delete state.settings[k]; cloudDel(['settings', k]); }
  save();
}

/* Tomas programadas para un día */
function dosesFor(d) {
  const out = [];
  for (const m of Object.values(state.meds)) {
    if (m.start > d || (m.end && d > m.end)) continue;
    for (const t of m.times) {
      const key = `${d}_${m.id}_${keyTime(t)}`;
      out.push({ m, t, key, log: state.logs[key] });
    }
  }
  out.sort((a, b) => a.t.localeCompare(b.t) || a.m.name.localeCompare(b.m.name));
  return out;
}
function statusOf(x, d) {
  if (x.log) return 'taken';
  const t = today();
  if (d < t) return 'missed';
  if (d > t) return 'future';
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), tm = mins(x.t);
  if (nm < tm) return 'upcoming';
  return nm <= tm + 30 ? 'due' : 'late';
}
function dayState(d) {
  const ds = dosesFor(d);
  if (!ds.length) return 'none';
  const n = ds.filter(x => x.log).length, t = today();
  if (n === ds.length) return 'done';
  if (d > t) return 'future';
  if (d === t) return n ? 'partial' : 'open';
  return n ? 'partial' : 'missed';
}

/* =====================  estado de la interfaz  ===================== */
let view = 'day', sel = today(), mcur = today().slice(0, 7), form = null, undoFn = null, lastToday = today();

const IC = {
  chk: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
};

/* =====================  vistas  ===================== */
function render() {
  if (document.activeElement && document.activeElement.id === 'note') return;
  const y = window.scrollY;
  $('#app').innerHTML = ({ day: vDay, month: vMonth, meds: vMeds, settings: vSettings })[view]();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  window.scrollTo(0, y);
}

function rel(d) {
  const t = today();
  if (d === t) return 'Hoy';
  if (d === addDays(t, -1)) return 'Ayer';
  if (d === addDays(t, 1)) return 'Mañana';
  return '';
}

function doseRow(x, d) {
  const st = statusOf(x, d);
  let line;
  if (st === 'taken') {
    const taken = hm(x.log.t), diff = mins(taken) - mins(x.t);
    let extra = '';
    if (diff > 30) extra = ` · ${humanMin(diff)} tarde`;
    else if (diff < -30) extra = ` · ${humanMin(diff)} antes`;
    line = `Tomada a las ${taken}${extra}<button class="linkbtn" data-act="edittime" data-key="${x.key}">Cambiar hora</button>`;
  } else if (st === 'due') line = 'Toca ahora';
  else if (st === 'late') line = `Pendiente desde las ${x.t}`;
  else if (st === 'missed') line = 'Sin marcar';
  else if (st === 'upcoming') line = 'Más tarde';
  else line = 'Aún no toca';
  return `<div class="dose ${st}">
    <button class="chk" data-act="toggle" data-key="${x.key}" aria-pressed="${st === 'taken'}" aria-label="Marcar ${esc(x.m.name)} de las ${x.t}">${IC.chk}</button>
    <div><div class="nm">${esc(x.m.name)}</div>${x.m.dose ? `<div class="ds">${esc(x.m.dose)}</div>` : ''}<div class="st">${line}</div></div>
    <div class="tm">${x.t}</div></div>`;
}

function vDay() {
  const t = today(), ds = dosesFor(sel), n = ds.filter(x => x.log).length;
  const dow = (parse(sel).getDay() + 6) % 7, ws = addDays(sel, -dow);
  let week = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    week += `<button class="wd ${d === sel ? 'sel' : ''} ${d === t ? 'today' : ''}" data-act="goto" data-day="${d}" aria-label="${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}">
      <span>${fmt(d, { weekday: 'narrow' })}</span><b>${parse(d).getDate()}</b><i class="dot ${dayState(d)}"></i></button>`;
  }
  let transfer = '';
  if (state.settings.transfer) {
    const diff = Math.round((parse(state.settings.transfer) - parse(t)) / 864e5);
    const txt = diff > 1 ? `Faltan ${diff} días para la transferencia`
      : diff === 1 ? 'Mañana es la transferencia'
      : diff === 0 ? 'Hoy es la transferencia'
      : `Han pasado ${-diff} ${-diff === 1 ? 'día' : 'días'} desde la transferencia`;
    transfer = `<div class="transfer">${txt}</div>`;
  }
  const r = rel(sel);
  return `
    <div class="head">
      <h1>${fmt(sel, { weekday: 'long' })}<span>${fmt(sel, { day: 'numeric', month: 'long' })}${r ? `<button class="chip-today" ${sel === t ? 'disabled' : ''} data-act="today">${r}</button>` : ''}${!r ? `<button class="chip-today" data-act="today">Ir a hoy</button>` : ''}</span></h1>
      <div class="arrows">
        <button class="icon-btn" data-act="prevday" aria-label="Día anterior">${IC.prev}</button>
        <button class="icon-btn" data-act="nextday" aria-label="Día siguiente">${IC.next}</button>
      </div>
    </div>
    <div class="week">${week}</div>
    ${transfer}
    ${ds.length ? `<div class="prog"><span style="width:${Math.round(n / ds.length * 100)}%"></span></div>
      <div class="count">${n} de ${ds.length} ${ds.length === 1 ? 'toma' : 'tomas'}</div>
      ${ds.map(x => doseRow(x, sel)).join('')}`
    : `<div class="empty"><p>No hay tomas para este día.</p>${Object.keys(state.meds).length ? '' : '<button class="btn" data-act="nav" data-view="meds">Añadir medicación</button>'}</div>`}
    <label class="notes">Notas del día<textarea id="note" placeholder="Síntomas, dudas para la clínica…">${esc(state.notes[sel] || '')}</textarea></label>`;
}

function vMonth() {
  const [Y, M] = mcur.split('-').map(Number);
  const first = new Date(Y, M - 1, 1), offset = (first.getDay() + 6) % 7, days = new Date(Y, M, 0).getDate(), t = today();
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cell blank"></div>';
  for (let i = 1; i <= days; i++) {
    const d = `${Y}-${pad(M)}-${pad(i)}`;
    cells += `<button class="cell ${d === t ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-act="goto" data-day="${d}">${i}<i class="dot ${dayState(d)}"></i></button>`;
  }
  const wl = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(l => `<div class="wl">${l}</div>`).join('');
  return `
    <div class="mhead">
      <h1>${fmt(`${mcur}-01`, { month: 'long', year: 'numeric' })}</h1>
      <div class="arrows">
        <button class="icon-btn" data-act="prevmonth" aria-label="Mes anterior">${IC.prev}</button>
        <button class="icon-btn" data-act="nextmonth" aria-label="Mes siguiente">${IC.next}</button>
      </div>
    </div>
    <div class="grid">${wl}${cells}</div>
    <div class="legend">
      <span><i class="dot done"></i>Todo tomado</span>
      <span><i class="dot partial"></i>Faltan tomas</span>
      <span><i class="dot missed"></i>Sin marcar</span>
    </div>`;
}

function vMeds() {
  const t = today();
  const list = Object.values(state.meds).sort((a, b) => {
    const ea = a.end && a.end < t ? 1 : 0, eb = b.end && b.end < t ? 1 : 0;
    return ea - eb || a.name.localeCompare(b.name);
  });
  const cards = list.map(m => {
    const ended = m.end && m.end < t;
    const when = `Desde el ${fmt(m.start, { day: 'numeric', month: 'short' })}` + (m.end ? ` hasta el ${fmt(m.end, { day: 'numeric', month: 'short' })}` : ' · sin fecha de fin') + (ended ? ' · terminada' : '');
    return `<button class="med ${ended ? 'ended' : ''}" data-act="editmed" data-id="${m.id}">
      <div class="nm">${esc(m.name)}</div>${m.dose ? `<div class="ds">${esc(m.dose)}</div>` : ''}
      <div class="chips">${m.times.map(x => `<span class="chip">${x}</span>`).join('')}</div>
      <div class="when">${when}</div></button>`;
  }).join('');
  return `
    <div class="row-top"><h1 style="font-size:30px">Medicación</h1><button class="btn small" data-act="addmed">Añadir</button></div>
    ${list.length ? cards : '<div class="empty"><p>Todavía no hay medicación. Añade estradiol, progesterona o lo que le toque.</p></div>'}`;
}

function vSettings() {
  const m = meta(), hasCfg = !!window.FIREBASE_CONFIG, perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  let share;
  if (!hasCfg) {
    share = `<p>Para ver los mismos datos desde dos móviles hay que conectar una base de datos gratuita (Firebase). Los pasos están en el archivo LEEME, apartado 3.</p>`;
  } else if (m.code) {
    share = `<p>Los dos móviles tienen que usar este código:</p>
      <div class="code">${fmtCode(m.code)}</div>
      <p class="${cloud && cloud.synced ? 'ok' : 'warn'}">${cloud ? (cloud.synced ? 'Sincronizado' : 'Guardando cambios… (se envían cuando haya conexión)') : 'Sin conexión con la nube. Se reintentará sola.'}</p>
      <div class="stack"><button class="btn ghost" data-act="copycode">Copiar código</button>
      <button class="btn danger" data-act="leave">Dejar de compartir en este móvil</button></div>`;
  } else {
    share = `<p>En el primer móvil crea un código y pásaselo al otro.</p>
      <div class="stack"><button class="btn" data-act="sharecreate">Crear código nuevo</button>
      <label>Ya tengo un código<input id="joincode" type="text" autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXX-XXXX"></label>
      <button class="btn ghost" data-act="sharejoin">Unirme con este código</button></div>`;
  }
  const notif = perm === 'unsupported' ? '<p>Este navegador no admite avisos.</p>' : `
    <label class="toggle">Avisar cuando toque una dosis<input type="checkbox" id="notifchk" data-act="notif" ${m.notif && perm === 'granted' ? 'checked' : ''}></label>
    ${perm === 'denied' ? '<p class="warn">Los avisos están bloqueados en los ajustes del móvil.</p>' : ''}
    <p>Estos avisos solo saltan si la app está abierta o en segundo plano. Para avisos que suenen siempre, usa el calendario del móvil:</p>`;
  return `
    <h1 style="font-size:30px;margin-bottom:6px">Ajustes</h1>
    <section class="sec"><h2>Transferencia</h2>
      <p>Si pones la fecha, en la pantalla de hoy aparece la cuenta atrás.</p>
      <input type="date" id="transferdate" value="${esc(state.settings.transfer || '')}" data-act="transfer"></section>
    <section class="sec"><h2>Compartir con tu pareja</h2>${share}</section>
    <section class="sec"><h2>Avisos</h2>${notif}
      <div class="stack"><button class="btn ghost" data-act="ics">Crear avisos en el calendario del móvil</button></div></section>
    <section class="sec"><h2>Copia de seguridad</h2>
      <p>Guarda un archivo con todos los datos o recupéralo.</p>
      <div class="stack"><button class="btn ghost" data-act="export">Descargar copia</button>
      <button class="btn ghost" data-act="import">Restaurar desde copia</button></div></section>`;
}

/* =====================  hojas, avisos emergentes  ===================== */
function sheet(html) { $('#sheet').innerHTML = `<div class="scrim" data-act="closesheet"></div><div class="panel" role="dialog" aria-modal="true">${html}</div>`; $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; form = null; }
let tt;
function toast(msg, undo) {
  const el = $('#toast');
  undoFn = undo || null;
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Deshacer</button>' : ''}`;
  el.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2800);
}
function confirmSheet(title, text, buttons) {
  sheet(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}<div class="stack">${buttons}</div>`);
}

/* =====================  marcar tomas  ===================== */
function splitKey(key) { const [d, id, tk] = key.split('_'); return { d, id, sched: unkeyTime(tk) }; }
function toggle(key) {
  const { d, sched } = splitKey(key);
  if (state.logs[key]) {
    confirmSheet('¿Quitar la marca?', 'La toma volverá a aparecer como pendiente.',
      `<button class="btn" data-act="unmark" data-key="${key}">Quitar marca</button><button class="btn ghost" data-act="closesheet">Cancelar</button>`);
    return;
  }
  if (d > today()) { toast('Todavía no es ese día'); return; }
  if (d < today()) { timeSheet(key, sched, '¿A qué hora se la tomó?'); return; }
  putLog(key, { t: new Date().toISOString() });
  if (navigator.vibrate) navigator.vibrate(25);
  render();
  toast('Marcada como tomada', () => { removeLog(key); render(); });
}
function timeSheet(key, value, title) {
  sheet(`<h2>${esc(title)}</h2><input type="time" id="t-val" value="${value}">
    <div class="actions"><button class="btn" data-act="savetime" data-key="${key}">Guardar</button><button class="btn ghost" data-act="closesheet">Cancelar</button></div>`);
}
function saveTime(key) {
  const v = $('#t-val').value;
  if (!v) return;
  const { d } = splitKey(key), dt = parse(d);
  dt.setHours(...v.split(':').map(Number), 0, 0);
  putLog(key, { t: dt.toISOString() });
  closeSheet(); render();
}

/* =====================  formulario de medicación  ===================== */
function renderTimes() {
  form.times.sort();
  $('#f-times').innerHTML = form.times.map(t => `<span class="chip">${t}<button data-act="rmtime" data-t="${t}" aria-label="Quitar ${t}">×</button></span>`).join('') || '<small>Añade al menos una hora</small>';
}
function openMedForm(id) {
  const m = id ? state.meds[id] : null;
  form = { id: id || null, times: m ? [...m.times] : ['08:00'], orig: m ? { ...m, times: [...m.times] } : null };
  sheet(`<h2>${m ? 'Editar medicación' : 'Añadir medicación'}</h2>
    <label>Nombre<input id="f-name" type="text" list="sugg" autocomplete="off" value="${esc(m ? m.name : '')}" placeholder="Estradiol"></label>
    <datalist id="sugg"><option value="Estradiol"><option value="Progesterona"><option value="Ácido fólico"><option value="Aspirina"><option value="Heparina"></datalist>
    <label>Dosis o cómo se toma <small>(opcional)</small><input id="f-dose" type="text" autocomplete="off" value="${esc(m ? m.dose : '')}" placeholder="2 mg, por vía oral"></label>
    <div class="field"><span>Horas de toma</span><div id="f-times" class="chips"></div>
      <div class="addtime"><input type="time" id="f-newtime" value="20:00"><button class="btn ghost" data-act="addtime">Añadir hora</button></div></div>
    <div class="two"><label>Empieza<input type="date" id="f-start" value="${m ? m.start : today()}"></label>
      <label>Termina <small>(opcional)</small><input type="date" id="f-end" value="${m && m.end ? m.end : ''}"></label></div>
    <div class="actions"><button class="btn" data-act="savemed">Guardar</button><button class="btn ghost" data-act="closesheet">Cancelar</button></div>
    ${m ? '<div class="stack"><button class="btn danger" data-act="delmed">Eliminar medicación</button></div>' : ''}`);
  renderTimes();
}
function saveMed() {
  const name = $('#f-name').value.trim(), dose = $('#f-dose').value.trim(), start = $('#f-start').value, end = $('#f-end').value || null;
  if (!name) { toast('Escribe el nombre'); return; }
  if (!form.times.length) { toast('Añade al menos una hora'); return; }
  if (!start) { toast('Pon la fecha de inicio'); return; }
  if (end && end < start) { toast('La fecha de fin es anterior a la de inicio'); return; }
  const t = today(), o = form.orig, times = [...form.times];
  if (o) {
    const timesChanged = o.times.join() !== times.join();
    const stillRunning = !o.end || o.end >= t;
    if (timesChanged && stillRunning && o.start < t) {
      // Se conserva el historial: la versión antigua termina ayer y empieza una nueva hoy
      putMed({ ...o, end: addDays(t, -1) });
      putMed({ id: uid(), name, dose, times, start: start > t ? start : t, end });
    } else {
      putMed({ ...o, name, dose, times, start, end });
    }
  } else {
    putMed({ id: uid(), name, dose, times, start, end });
  }
  closeSheet(); render(); toast('Guardado');
}
function askDelete() {
  const o = form.orig;
  confirmSheet(`Eliminar ${o.name}`, 'Elige qué quieres hacer con ella.',
    `<button class="btn" data-act="stopmed" data-id="${o.id}">Dejar de tomarla desde hoy</button>
     <small>Se conserva el historial de los días anteriores.</small>
     <button class="btn danger" data-act="killmed" data-id="${o.id}">Borrar todo, también el historial</button>
     <button class="btn ghost" data-act="closesheet">Cancelar</button>`);
}
function stopMed(id) {
  const m = state.meds[id], t = today();
  const loggedToday = Object.keys(state.logs).some(k => k.startsWith(t + '_' + id));
  const end = loggedToday ? t : addDays(t, -1);
  if (end < m.start) removeMed(id); else putMed({ ...m, end });
  closeSheet(); render(); toast('Medicación terminada');
}

/* =====================  avisos en la app  ===================== */
async function checkNotifs() {
  const m = meta();
  if (!m.notif || !('Notification' in window) || Notification.permission !== 'granted') return;
  const t = today(), now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('tomas.seen')) || {}; } catch (e) {}
  for (const k of Object.keys(seen)) if (!k.startsWith(t)) delete seen[k];
  for (const x of dosesFor(t)) {
    const tm = mins(x.t);
    if (x.log || nm < tm || nm > tm + 180 || seen[x.key]) continue;
    seen[x.key] = 1;
    const title = `${x.m.name} · ${x.t}`, opts = { body: x.m.dose || 'Toca ahora', tag: x.key, icon: 'icon-192.png' };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.ready;
      if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
    } catch (e) {}
  }
  localStorage.setItem('tomas.seen', JSON.stringify(seen));
}
async function toggleNotif(on) {
  const m = meta();
  if (on) {
    const p = await Notification.requestPermission();
    m.notif = p === 'granted';
    if (p !== 'granted') toast('No se han dado permisos para avisar');
  } else m.notif = false;
  setMeta(m); render();
}

/* =====================  calendario del móvil (.ics)  ===================== */
function buildICS() {
  const t = today(), stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', L = [];
  L.push('BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tomas//ES', 'CALSCALE:GREGORIAN');
  let n = 0;
  const e = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, ' ');
  for (const m of Object.values(state.meds)) {
    if (m.end && m.end < t) continue;
    const start = m.start > t ? m.start : t;
    for (const tm of m.times) {
      const rr = m.end ? `UNTIL=${m.end.replace(/-/g, '')}T235959` : 'COUNT=60';
      const title = `Tomar ${m.name}${m.dose ? ' (' + m.dose + ')' : ''}`;
      L.push('BEGIN:VEVENT', `UID:${m.id}-${keyTime(tm)}@tomas`, `DTSTAMP:${stamp}`,
        `DTSTART:${start.replace(/-/g, '')}T${keyTime(tm)}00`, 'DURATION:PT10M', `RRULE:FREQ=DAILY;${rr}`,
        `SUMMARY:${e(title)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
      n++;
    }
  }
  L.push('END:VCALENDAR');
  return n ? L.join('\r\n') : null;
}
async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
}
function makeICS() {
  const ics = buildICS();
  if (!ics) { toast('Primero añade medicación'); return; }
  confirmSheet('Avisos en el calendario', 'Se crea un evento diario con alarma para cada toma (60 días, o hasta la fecha de fin). Al abrir el archivo, el móvil te pregunta si quieres añadirlos al calendario.',
    `<button class="btn" data-act="icsgo">Continuar</button><button class="btn ghost" data-act="closesheet">Cancelar</button>`);
}

/* =====================  compartir (Firebase)  ===================== */
const FB = '10.12.2';
let fb = null, cloud = null;
const fmtCode = c => c.match(/.{1,4}/g).join('-');
const newCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(12))].map(x => A[x % A.length]).join(''); };

async function loadFb() {
  if (fb) return fb;
  const [app, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-firestore.js`)
  ]);
  const a = app.initializeApp(window.FIREBASE_CONFIG);
  let db;
  try { db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch (e) { db = fs.getFirestore(a); }
  fb = { fs, db };
  return fb;
}
async function connect(code, mode) {
  if (!window.FIREBASE_CONFIG) throw new Error('nocfg');
  const { fs, db } = await loadFb();
  const ref = fs.doc(db, 'shared', code);
  if (mode === 'join') { const s = await fs.getDoc(ref); if (!s.exists()) throw new Error('notfound'); }
  if (mode === 'create') fs.setDoc(ref, { ...state, created: Date.now() }).catch(console.error);
  if (cloud && cloud.unsub) cloud.unsub();
  cloud = { fs, ref, synced: false };
  cloud.unsub = fs.onSnapshot(ref, snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    state = { meds: d.meds || {}, logs: d.logs || {}, notes: d.notes || {}, settings: d.settings || {} };
    save();
    cloud.synced = !snap.metadata.hasPendingWrites && !snap.metadata.fromCache;
    render();
  }, err => { console.error(err); if (cloud) cloud.synced = false; render(); });
}
function cloudSet(path, value) {
  if (!cloud) return;
  cloud.fs.updateDoc(cloud.ref, new cloud.fs.FieldPath(...path), value).catch(console.error);
}
function cloudDel(path) {
  if (!cloud) return;
  cloud.fs.updateDoc(cloud.ref, new cloud.fs.FieldPath(...path), cloud.fs.deleteField()).catch(console.error);
}
async function startShare(mode, code) {
  try {
    toast('Conectando…');
    await connect(code, mode);
    const m = meta(); m.code = code; setMeta(m);
    toast('Compartido');
  } catch (e) {
    console.error(e);
    toast(e.message === 'notfound' ? 'No existe ese código' : 'No se pudo conectar. Revisa la conexión y la configuración de Firebase.');
  }
  render();
}

/* =====================  copia de seguridad  ===================== */
function exportData() {
  const f = new File([JSON.stringify(state, null, 1)], `tomas-copia-${today()}.json`, { type: 'application/json' });
  shareFile(f);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || typeof d.meds !== 'object') throw new Error();
      state = { meds: d.meds || {}, logs: d.logs || {}, notes: d.notes || {}, settings: d.settings || {} };
      save();
      if (cloud) cloud.fs.setDoc(cloud.ref, { ...state, created: Date.now() }).catch(console.error);
      render(); toast('Copia restaurada');
    } catch (e) { toast('El archivo no es una copia válida'); }
  };
  r.readAsText(file);
}

/* =====================  eventos  ===================== */
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act;
  switch (a) {
    case 'nav': view = el.dataset.view; if (view === 'month') mcur = sel.slice(0, 7); closeSheet(); render(); window.scrollTo(0, 0); break;
    case 'goto': sel = el.dataset.day; view = 'day'; render(); window.scrollTo(0, 0); break;
    case 'prevday': sel = addDays(sel, -1); render(); break;
    case 'nextday': sel = addDays(sel, 1); render(); break;
    case 'today': sel = today(); render(); break;
    case 'prevmonth': { const [y, m] = mcur.split('-').map(Number); const d = new Date(y, m - 2, 1); mcur = ymd(d).slice(0, 7); render(); break; }
    case 'nextmonth': { const [y, m] = mcur.split('-').map(Number); const d = new Date(y, m, 1); mcur = ymd(d).slice(0, 7); render(); break; }
    case 'toggle': toggle(el.dataset.key); break;
    case 'unmark': removeLog(el.dataset.key); closeSheet(); render(); break;
    case 'edittime': { const k = el.dataset.key; timeSheet(k, hm(state.logs[k].t), '¿A qué hora se la tomó?'); break; }
    case 'savetime': saveTime(el.dataset.key); break;
    case 'undo': if (undoFn) undoFn(); undoFn = null; $('#toast').classList.remove('show'); break;
    case 'closesheet': closeSheet(); break;
    case 'addmed': openMedForm(null); break;
    case 'editmed': openMedForm(el.dataset.id); break;
    case 'addtime': { const v = $('#f-newtime').value; if (v && !form.times.includes(v)) { form.times.push(v); renderTimes(); } break; }
    case 'rmtime': form.times = form.times.filter(t => t !== el.dataset.t); renderTimes(); break;
    case 'savemed': saveMed(); break;
    case 'delmed': askDelete(); break;
    case 'stopmed': stopMed(el.dataset.id); break;
    case 'killmed': removeMed(el.dataset.id); closeSheet(); render(); toast('Medicación borrada'); break;
    case 'sharecreate': startShare('create', newCode()); break;
    case 'sharejoin': {
      const code = ($('#joincode').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 12) { toast('El código tiene 12 letras y números'); break; }
      if (Object.keys(state.meds).length) {
        confirmSheet('Unirte al código compartido', 'Los datos que hay ahora en este móvil se sustituirán por los compartidos.',
          `<button class="btn" data-act="sharejoinok" data-code="${code}">Unirme</button><button class="btn ghost" data-act="closesheet">Cancelar</button>`);
      } else startShare('join', code);
      break;
    }
    case 'sharejoinok': closeSheet(); startShare('join', el.dataset.code); break;
    case 'copycode': try { await navigator.clipboard.writeText(fmtCode(meta().code)); toast('Código copiado'); } catch (e) { toast('No se pudo copiar'); } break;
    case 'leave':
      confirmSheet('¿Dejar de compartir?', 'Los datos se quedan en este móvil, pero ya no se actualizarán con los del otro.',
        `<button class="btn danger" data-act="leaveok">Dejar de compartir</button><button class="btn ghost" data-act="closesheet">Cancelar</button>`);
      break;
    case 'leaveok': if (cloud && cloud.unsub) cloud.unsub(); cloud = null; { const m = meta(); delete m.code; setMeta(m); } closeSheet(); render(); break;
    case 'ics': makeICS(); break;
    case 'icsgo': { const ics = buildICS(); closeSheet(); if (ics) shareFile(new File([ics], 'tomas-avisos.ics', { type: 'text/calendar' })); break; }
    case 'export': exportData(); break;
    case 'import': $('#importfile').click(); break;
  }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'note') { putNote(sel, el.value.trim()); el.blur(); }
  else if (el.id === 'transferdate') { putSetting('transfer', el.value); render(); }
  else if (el.id === 'notifchk') toggleNotif(el.checked);
  else if (el.id === 'importfile' && el.files[0]) { importData(el.files[0]); el.value = ''; }
});

/* =====================  arranque  ===================== */
function tick() {
  if (lastToday !== today()) { if (sel === lastToday) sel = today(); lastToday = today(); render(); }
  checkNotifs();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); render(); } });
window.addEventListener('online', () => {
  const m = meta();
  if (m.code && !cloud && window.FIREBASE_CONFIG) connect(m.code, 'resume').then(render).catch(console.error);
});
setInterval(tick, 30000);

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
{
  const m = meta();
  if (m.code && window.FIREBASE_CONFIG) connect(m.code, 'resume').then(render).catch(console.error);
}
checkNotifs();
})();
