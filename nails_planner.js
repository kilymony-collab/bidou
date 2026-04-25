const DAYS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const HOURS  = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const PRESTS = ['Manucure', 'Pédicure', 'Dépose', 'Remplissage'];

let appointments       = [];
let view               = 'month';
let activeId           = null;
let deleteConfirmed    = false;
let selectedPrestations = [];
let cur                = new Date();
let selectedDate       = todayDateString();

// ── Utilities ──────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateString(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayDateString() {
  return toDateString(new Date());
}

function addDays(dateString, n) {
  const d = new Date(dateString + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatFullDate(dateString) {
  const d = new Date(dateString + 'T12:00:00');
  const dayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][d.getDay()];
  return dayName + ' ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

function formatPrestations(a) {
  const parts = [...(a.prestations || [])];
  if (a.bijoux) parts.push('💎 Bijoux');
  return parts.join(' · ') || '—';
}

function formatSidebarDate(dateString) {
  const d = new Date(dateString + 'T12:00:00');
  return '<span>' + pad2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + '</span> ' + d.getFullYear();
}

// ── Storage ────────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const result = await window.storage.get('nails_v5');
    if (result && result.value) {
      appointments = JSON.parse(result.value);
    } else {
      const today = todayDateString();
      appointments = [
        { id: generateId(), prenom: 'Marie',  nom: 'Dupont',   date: today,             heure: '09:30', prestations: ['Manucure'],             bijoux: false, remarque: 'Cliente fidèle depuis 2 ans' },
        { id: generateId(), prenom: 'Sophie', nom: 'Martin',   date: today,             heure: '14:00', prestations: ['Remplissage'],           bijoux: false, remarque: '' },
        { id: generateId(), prenom: 'Lucie',  nom: 'Bernard',  date: addDays(today, 1), heure: '11:00', prestations: ['Manucure', 'Pédicure'],  bijoux: true,  remarque: 'Motifs floraux' },
        { id: generateId(), prenom: 'Emma',   nom: 'Petit',    date: addDays(today, 2), heure: '10:30', prestations: ['Dépose'],                bijoux: false, remarque: '' },
        { id: generateId(), prenom: 'Chloé',  nom: 'Rousseau', date: addDays(today, 3), heure: '15:30', prestations: ['Manucure'],              bijoux: false, remarque: 'Vernis nude' },
      ];
      await saveData();
    }
  } catch (e) {
    appointments = [];
  }
  initPrestationGrid();
  render();
  renderSidebar();
}

async function saveData() {
  try { await window.storage.set('nails_v5', JSON.stringify(appointments)); } catch (e) {}
}

// ── Prestation grid ────────────────────────────────────────────────────────

function initPrestationGrid() {
  document.getElementById('pgrid').innerHTML = PRESTS.map(p =>
    `<div class="popt" data-p="${escHtml(p)}">${escHtml(p)}</div>`
  ).join('');
  document.querySelectorAll('.popt').forEach(el => {
    el.addEventListener('click', () => pickPrestation(el));
  });
}

function pickPrestation(el) {
  const p     = el.dataset.p;
  const index = selectedPrestations.indexOf(p);
  if (index >= 0) {
    selectedPrestations.splice(index, 1);
    el.classList.remove('on');
  } else {
    selectedPrestations.push(p);
    el.classList.add('on');
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

function setView(v) {
  view = v;
  document.getElementById('btnM').classList.toggle('on', v === 'month');
  document.getElementById('btnW').classList.toggle('on', v === 'week');
  render();
}

function selectDay(dateString) {
  selectedDate = dateString;
  renderSidebar();
  render();
}

function render() {
  if (view === 'month') renderMonth();
  else renderWeek();
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function renderSidebar() {
  document.getElementById('sbDate').innerHTML = formatSidebarDate(selectedDate);

  const dayAppointments = appointments
    .filter(a => a.date === selectedDate)
    .sort((a, b) => a.heure.localeCompare(b.heure));

  const listEl = document.getElementById('sbList');
  if (!dayAppointments.length) {
    listEl.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucun rendez-vous<br>ce jour-là.</div>';
    return;
  }

  listEl.innerHTML = dayAppointments.map(a =>
    `<div class="rdv-card" data-id="${escHtml(a.id)}">` +
      `<div class="rdv-badge">${escHtml(a.heure)}</div>` +
      `<div class="rdv-info">` +
        `<div class="rdv-nm">${escHtml(a.prenom)} ${escHtml(a.nom)}</div>` +
        `<div class="rdv-pr">${escHtml(formatPrestations(a))}</div>` +
      `</div>` +
      `<div class="rdv-ch">›</div>` +
    `</div>`
  ).join('');

  listEl.querySelectorAll('.rdv-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

// ── Month view ─────────────────────────────────────────────────────────────

function renderMonth() {
  const y = cur.getFullYear();
  const m = cur.getMonth();
  document.getElementById('period').textContent = MONTHS[m] + ' ' + y;

  const firstDay       = new Date(y, m, 1);
  const startOffset    = (firstDay.getDay() + 6) % 7;
  const daysInMonth    = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const today          = todayDateString();

  let html = '<div class="mgrid"><div class="mrow-h">' +
    DAYS.map(d => `<div class="mhc">${d}</div>`).join('') +
    '</div><div class="mbody">';

  for (let i = 0; i < startOffset; i++) {
    html += `<div class="mc out"><div class="dn">${daysInPrevMonth - startOffset + i + 1}</div></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = y + '-' + pad2(m + 1) + '-' + pad2(d);
    const cls = 'mc' + (ds === today ? ' tod' : '') + (ds === selectedDate ? ' sel' : '');
    const dayAppointments = appointments
      .filter(a => a.date === ds)
      .sort((a, b) => a.heure.localeCompare(b.heure));
    const visible = dayAppointments.slice(0, 2);
    const extra   = dayAppointments.length - 2;

    html += `<div class="${cls}" data-ds="${ds}"><div class="dn">${d}</div>`;
    visible.forEach(a => {
      html += `<div class="pill" data-id="${escHtml(a.id)}">` +
        `<span class="pt">${escHtml(a.heure)}</span>` +
        `<span class="pn">${escHtml(a.prenom)}</span>` +
        `</div>`;
    });
    if (extra > 0) html += `<div class="mmore">+${extra} autre${extra > 1 ? 's' : ''}</div>`;
    html += '</div>';
  }

  const trailing = (startOffset + daysInMonth) % 7 === 0 ? 0 : 7 - (startOffset + daysInMonth) % 7;
  for (let i = 1; i <= trailing; i++) {
    html += `<div class="mc out"><div class="dn">${i}</div></div>`;
  }

  html += '</div></div>';
  document.getElementById('cal').innerHTML = html;

  document.querySelectorAll('#cal .mc:not(.out)').forEach(cell => {
    cell.addEventListener('click', () => selectDay(cell.dataset.ds));
  });
  document.querySelectorAll('#cal .pill').forEach(pill => {
    pill.addEventListener('click', e => { e.stopPropagation(); openDetail(pill.dataset.id); });
  });
}

// ── Week view ──────────────────────────────────────────────────────────────

function renderWeek() {
  const start = new Date(cur);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return x;
  });

  const today = todayDateString();
  const first = weekDays[0];
  const last  = weekDays[6];

  document.getElementById('period').textContent =
    pad2(first.getDate()) + '/' + pad2(first.getMonth() + 1) +
    ' – ' +
    pad2(last.getDate()) + '/' + pad2(last.getMonth() + 1) + '/' + last.getFullYear();

  let html = '<div class="wc"><div class="whead"><div class="we"></div>';
  weekDays.forEach(x => {
    const ds         = toDateString(x);
    const isToday    = ds === today;
    const isSelected = ds === selectedDate;
    html +=
      `<div class="whd${isSelected ? ' wsel' : ''}" data-ds="${ds}">` +
        `<div class="wdn">${DAYS[(x.getDay() + 6) % 7]}</div>` +
        `<div class="wnum${isToday ? ' wt' : ''}">${x.getDate()}</div>` +
      `</div>`;
  });

  html += '</div><div class="wbody"><div class="wtc">';
  HOURS.forEach(hh => { html += `<div class="wts">${pad2(hh)}h</div>`; });
  html += '</div>';

  weekDays.forEach(x => {
    const ds = toDateString(x);
    const dayAppointments = appointments.filter(a => a.date === ds);
    html += '<div class="wdc">';
    HOURS.forEach(() => { html += '<div class="wsl"></div>'; });
    dayAppointments.forEach(a => {
      const [hh, mm]      = a.heure.split(':').map(Number);
      const minutesFrom8  = (hh - 8) * 60 + mm;
      if (minutesFrom8 < 0 || minutesFrom8 >= 13 * 60) return;
      html +=
        `<div class="wapt" style="top:${minutesFrom8 / 60 * 60}px" data-id="${escHtml(a.id)}">` +
          `<div class="wat">${escHtml(a.heure)}</div>` +
          `<div class="wan">${escHtml(a.prenom)}</div>` +
        `</div>`;
    });
    html += '</div>';
  });

  html += '</div></div>';
  document.getElementById('cal').innerHTML = html;

  document.querySelectorAll('#cal .whd').forEach(col => {
    col.addEventListener('click', () => selectDay(col.dataset.ds));
  });
  document.querySelectorAll('#cal .wapt').forEach(apt => {
    apt.addEventListener('click', () => openDetail(apt.dataset.id));
  });
}

// ── Detail modal ───────────────────────────────────────────────────────────

function openDetail(id) {
  const a = appointments.find(x => x.id === id);
  if (!a) return;
  activeId        = id;
  deleteConfirmed = false;
  resetDeleteButton();

  if (selectedDate !== a.date) { selectedDate = a.date; renderSidebar(); }

  document.getElementById('dtit').textContent = a.prenom + ' ' + a.nom;
  document.getElementById('dbdy').innerHTML =
    `<div class="dr"><span class="dic">👤</span><div><div class="dlb">Cliente</div><div class="dv">${escHtml(a.prenom)} ${escHtml(a.nom)}</div></div></div>` +
    `<div class="dr"><span class="dic">📅</span><div><div class="dlb">Date</div><div class="dv">${escHtml(formatFullDate(a.date))}</div></div></div>` +
    `<div class="dr"><span class="dic">🕐</span><div><div class="dlb">Heure</div><div class="dv">${escHtml(a.heure)}</div></div></div>` +
    `<div class="dr"><span class="dic">💅</span><div><div class="dlb">Prestation</div><div class="dv">${escHtml(formatPrestations(a))}</div></div></div>` +
    (a.remarque
      ? `<div class="dr"><span class="dic">📝</span><div><div class="dlb">Remarque</div><div class="dv">${escHtml(a.remarque)}</div></div></div>`
      : '');

  document.getElementById('dov').classList.remove('hidden');
}

function closeDetail() {
  activeId        = null;
  deleteConfirmed = false;
  resetDeleteButton();
  document.getElementById('dov').classList.add('hidden');
}

function resetDeleteButton() {
  const btn = document.getElementById('delBtn');
  btn.textContent = '🗑 Supprimer';
  btn.className   = 'btn bdd';
}

function askDelete() {
  if (!deleteConfirmed) {
    deleteConfirmed     = true;
    const btn           = document.getElementById('delBtn');
    btn.textContent     = '⚠️ Confirmer ?';
    btn.className       = 'btn bd2';
    return;
  }
  deleteAppointment();
}

async function deleteAppointment() {
  if (!activeId) return;
  appointments = appointments.filter(x => x.id !== activeId);
  await saveData();
  closeDetail();
  render();
  renderSidebar();
  toast('RDV supprimé', 'Le rendez-vous a été supprimé.');
}

function editAppointment() {
  const a = appointments.find(x => x.id === activeId);
  if (!a) return;
  closeDetail();
  openForm(a);
}

// ── Form modal ─────────────────────────────────────────────────────────────

function openForm(a) {
  document.getElementById('ftit').textContent   = a ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous';
  document.getElementById('fp').value           = a ? a.prenom   : '';
  document.getElementById('fn').value           = a ? a.nom      : '';
  document.getElementById('fd').value           = a ? a.date     : todayDateString();
  document.getElementById('fh').value           = a ? a.heure    : '09:00';
  document.getElementById('fr').value           = a ? a.remarque : '';
  document.getElementById('ferr').style.display = 'none';
  selectedPrestations = a ? [...(a.prestations || [])] : [];
  document.querySelectorAll('.popt').forEach(el => {
    el.classList.toggle('on', selectedPrestations.includes(el.dataset.p));
  });
  document.getElementById('fBijoux').checked = a ? !!a.bijoux : false;
  activeId = a ? a.id : null;
  document.getElementById('fov').classList.remove('hidden');
  setTimeout(() => document.getElementById('fp').focus(), 80);
}

function closeForm() {
  document.getElementById('fov').classList.add('hidden');
}

async function saveAppointment() {
  const prenom   = document.getElementById('fp').value.trim();
  const nom      = document.getElementById('fn').value.trim();
  const date     = document.getElementById('fd').value;
  const heure    = document.getElementById('fh').value;
  const remarque = document.getElementById('fr').value.trim();
  const errEl    = document.getElementById('ferr');

  const bijoux = document.getElementById('fBijoux').checked;

  if (!prenom || !nom || !date || !heure || selectedPrestations.length === 0) {
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  const isEdit = !!activeId;
  if (isEdit) {
    const index = appointments.findIndex(x => x.id === activeId);
    if (index >= 0) {
      appointments[index] = { id: activeId, prenom, nom, date, heure, prestations: [...selectedPrestations], bijoux, remarque };
    }
  } else {
    appointments.push({ id: generateId(), prenom, nom, date, heure, prestations: [...selectedPrestations], bijoux, remarque });
  }

  activeId = null;
  await saveData();
  closeForm();
  render();
  renderSidebar();
  toast(isEdit ? 'RDV modifié ✓' : 'RDV ajouté ✓', prenom + ' ' + nom + ' — ' + formatPrestations({ prestations: selectedPrestations, bijoux }));
}

// ── Toast ──────────────────────────────────────────────────────────────────

function toast(title, body) {
  const el     = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="tt">${title}</div><div class="tb">${body}</div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 3500);
  setTimeout(() => el.remove(), 4000);
}

// ── Static event listeners ─────────────────────────────────────────────────

document.getElementById('prev').addEventListener('click', () => {
  if (view === 'month') cur.setMonth(cur.getMonth() - 1);
  else cur.setDate(cur.getDate() - 7);
  render();
});

document.getElementById('next').addEventListener('click', () => {
  if (view === 'month') cur.setMonth(cur.getMonth() + 1);
  else cur.setDate(cur.getDate() + 7);
  render();
});

document.getElementById('btnM').addEventListener('click', () => setView('month'));
document.getElementById('btnW').addEventListener('click', () => setView('week'));
document.getElementById('sbAdd').addEventListener('click', () => openForm(null));

document.getElementById('delBtn').addEventListener('click', askDelete);
document.getElementById('closeDBtn').addEventListener('click', closeDetail);
document.getElementById('editBtn').addEventListener('click', editAppointment);
document.getElementById('closeDetail').addEventListener('click', closeDetail);

document.getElementById('cancelBtn').addEventListener('click', closeForm);
document.getElementById('saveBtn').addEventListener('click', saveAppointment);
document.getElementById('closeForm').addEventListener('click', closeForm);

document.getElementById('dov').addEventListener('click', e => { if (e.target.id === 'dov') closeDetail(); });
document.getElementById('fov').addEventListener('click', e => { if (e.target.id === 'fov') closeForm(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDetail(); closeForm(); } });

loadData();
