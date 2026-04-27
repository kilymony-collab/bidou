const DAYS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const HOURS  = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

let appointments    = [];
let view            = 'month';
let activeId        = null;
let deleteConfirmed = false;
let cur             = new Date();
let selectedDate    = todayDateString();

// ── Utilities ──────────────────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateString(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayDateString() {
  return toDateString(new Date());
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

// ── Data layer ─────────────────────────────────────────────────────────────

function mapRecord(record) {
  const f          = record.fields;
  const nomComplet = (f.nom_client || '').trim();
  const spaceIdx   = nomComplet.indexOf(' ');
  const prenom     = spaceIdx >= 0 ? nomComplet.slice(0, spaceIdx) : nomComplet;
  const nom        = spaceIdx >= 0 ? nomComplet.slice(spaceIdx + 1) : '';
  return {
    id:                 record.id,
    prenom,
    nom,
    date:               f.date_rdv            || '',
    heure:              f.heure_rdv            || '',
    prestations:        f.prestation           ? [f.prestation] : [],
    bijoux:             !!f.bijoux,
    remarque:           f.notes_client         || '',
    airtable_record_id: record.id,
    booking_uid_calcom: f.booking_uid_calcom   || '',
    email_client:       f.email_client         || '',
    statut_interne:     f.statut_interne        || '',
    taille_ongles:      f.taille_ongles         || '',
    photo_modele_url:   f.photo_modele_url      || '',
    photo_ongles_url:   f.photo_ongles_url      || '',
    age_client:         f.age_client            || '',
  };
}

async function loadData() {
  try {
    const res = await fetch('/api/rdv');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    appointments = (data.records || []).map(mapRecord);
  } catch (e) {
    appointments = [];
    console.error('loadData:', e);
    toast('Erreur de chargement', e.message);
  }
  render();
  renderSidebar();
}

// ── Accept / Refuse ────────────────────────────────────────────────────────

async function acceptRdv() {
  const a = appointments.find(x => x.id === activeId);
  if (!a) return;
  const btn     = document.getElementById('editBtn');
  btn.disabled  = true;
  btn.textContent = '⏳ En cours…';
  try {
    const res = await fetch('/api/rdv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:             'accept',
        booking_uid:        a.booking_uid_calcom,
        airtable_record_id: a.airtable_record_id,
        email_client:       a.email_client,
        nom_client:         a.prenom + ' ' + a.nom,
        date_rdv:           a.date,
        heure_rdv:          a.heure,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    closeDetail();
    toast('✅ RDV accepté', a.prenom + ' ' + a.nom + ' — confirmation envoyée.');
    await loadData();
  } catch (e) {
    toast('Erreur', 'Action échouée : ' + e.message);
    btn.disabled    = false;
    btn.textContent = '✅ Accepter';
  }
}

async function refuseRdv() {
  const a = appointments.find(x => x.id === activeId);
  if (!a) return;
  const btn     = document.getElementById('delBtn');
  btn.disabled  = true;
  btn.textContent = '⏳ En cours…';
  try {
    const res = await fetch('/api/rdv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:             'refuse',
        booking_uid:        a.booking_uid_calcom,
        airtable_record_id: a.airtable_record_id,
        email_client:       a.email_client,
        nom_client:         a.prenom + ' ' + a.nom,
        date_rdv:           a.date,
        heure_rdv:          a.heure,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    closeDetail();
    toast('❌ RDV refusé', a.prenom + ' ' + a.nom + ' — refus envoyé.');
    await loadData();
  } catch (e) {
    toast('Erreur', 'Action échouée : ' + e.message);
    btn.disabled      = false;
    btn.textContent   = '❌ Refuser';
    deleteConfirmed   = false;
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

  // Pending — shown regardless of selected date
  const pending = appointments
    .filter(a => a.statut_interne === 'en_attente_validation')
    .sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure));

  // Confirmed for the selected day
  const dayAccepted = appointments
    .filter(a => a.date === selectedDate && a.statut_interne === 'accepte')
    .sort((a, b) => a.heure.localeCompare(b.heure));

  const listEl = document.getElementById('sbList');
  let html = '';

  if (pending.length > 0) {
    html += `<div class="sb-sec-lbl">⏳ En attente (${pending.length})</div>`;
    html += pending.map(a =>
      `<div class="rdv-card rdv-pending" data-id="${escHtml(a.id)}">` +
        `<div class="rdv-badge rdv-badge-wait">${escHtml(a.heure)}</div>` +
        `<div class="rdv-info">` +
          `<div class="rdv-nm">${escHtml(a.prenom)} ${escHtml(a.nom)}</div>` +
          `<div class="rdv-pr">${escHtml(formatPrestations(a))}</div>` +
          `<div class="rdv-dt">${escHtml(formatFullDate(a.date))}</div>` +
        `</div>` +
        `<div class="rdv-ch">›</div>` +
      `</div>`
    ).join('');
    if (dayAccepted.length > 0) html += '<div class="sb-sep"></div>';
  }

  if (dayAccepted.length > 0) {
    html += dayAccepted.map(a =>
      `<div class="rdv-card" data-id="${escHtml(a.id)}">` +
        `<div class="rdv-badge">${escHtml(a.heure)}</div>` +
        `<div class="rdv-info">` +
          `<div class="rdv-nm">${escHtml(a.prenom)} ${escHtml(a.nom)}</div>` +
          `<div class="rdv-pr">${escHtml(formatPrestations(a))}</div>` +
        `</div>` +
        `<div class="rdv-ch">›</div>` +
      `</div>`
    ).join('');
  } else if (pending.length === 0) {
    html = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucun rendez-vous<br>ce jour-là.</div>';
  }

  listEl.innerHTML = html;
  listEl.querySelectorAll('.rdv-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

// ── Month view ─────────────────────────────────────────────────────────────

function renderMonth() {
  const y = cur.getFullYear();
  const m = cur.getMonth();
  document.getElementById('period').textContent = MONTHS[m] + ' ' + y;

  const firstDay        = new Date(y, m, 1);
  const startOffset     = (firstDay.getDay() + 6) % 7;
  const daysInMonth     = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const today           = todayDateString();
  const accepted        = appointments.filter(a => a.statut_interne === 'accepte');

  let html = '<div class="mgrid"><div class="mrow-h">' +
    DAYS.map(d => `<div class="mhc">${d}</div>`).join('') +
    '</div><div class="mbody">';

  for (let i = 0; i < startOffset; i++) {
    html += `<div class="mc out"><div class="dn">${daysInPrevMonth - startOffset + i + 1}</div></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = y + '-' + pad2(m + 1) + '-' + pad2(d);
    const cls = 'mc' + (ds === today ? ' tod' : '') + (ds === selectedDate ? ' sel' : '');
    const dayRdv  = accepted.filter(a => a.date === ds).sort((a, b) => a.heure.localeCompare(b.heure));
    const visible = dayRdv.slice(0, 2);
    const extra   = dayRdv.length - 2;

    html += `<div class="${cls}" data-ds="${ds}"><div class="dn">${d}</div>`;
    visible.forEach(a => {
      html += `<div class="pill" data-id="${escHtml(a.id)}">` +
        `<span class="pt">${escHtml(a.heure)}</span>` +
        `<span class="pn">${escHtml(a.prenom)}</span></div>`;
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

  const today   = todayDateString();
  const first   = weekDays[0];
  const last    = weekDays[6];
  const accepted = appointments.filter(a => a.statut_interne === 'accepte');

  document.getElementById('period').textContent =
    pad2(first.getDate()) + '/' + pad2(first.getMonth() + 1) +
    ' – ' +
    pad2(last.getDate()) + '/' + pad2(last.getMonth() + 1) + '/' + last.getFullYear();

  let html = '<div class="wc"><div class="whead"><div class="we"></div>';
  weekDays.forEach(x => {
    const ds  = toDateString(x);
    const sel = ds === selectedDate;
    html += `<div class="whd${sel ? ' wsel' : ''}" data-ds="${ds}">` +
      `<div class="wdn">${DAYS[(x.getDay() + 6) % 7]}</div>` +
      `<div class="wnum${ds === today ? ' wt' : ''}">${x.getDate()}</div>` +
      `</div>`;
  });

  html += '</div><div class="wbody"><div class="wtc">';
  HOURS.forEach(hh => { html += `<div class="wts">${pad2(hh)}h</div>`; });
  html += '</div>';

  weekDays.forEach(x => {
    const ds     = toDateString(x);
    const dayRdv = accepted.filter(a => a.date === ds);
    html += '<div class="wdc">';
    HOURS.forEach(() => { html += '<div class="wsl"></div>'; });
    dayRdv.forEach(a => {
      const [hh, mm]     = a.heure.split(':').map(Number);
      const minutesFrom8 = (hh - 8) * 60 + mm;
      if (minutesFrom8 < 0 || minutesFrom8 >= 13 * 60) return;
      html += `<div class="wapt" style="top:${minutesFrom8 / 60 * 60}px" data-id="${escHtml(a.id)}">` +
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

  if (selectedDate !== a.date) { selectedDate = a.date; renderSidebar(); }

  document.getElementById('dtit').textContent = a.prenom + ' ' + a.nom;

  let body =
    `<div class="dr"><span class="dic">👤</span><div><div class="dlb">Cliente</div>` +
    `<div class="dv">${escHtml(a.prenom)} ${escHtml(a.nom)}</div></div></div>`;

  if (a.email_client) {
    body += `<div class="dr"><span class="dic">📧</span><div><div class="dlb">Email</div>` +
      `<div class="dv">${escHtml(a.email_client)}</div></div></div>`;
  }
  if (a.age_client) {
    body += `<div class="dr"><span class="dic">🎂</span><div><div class="dlb">Âge</div>` +
      `<div class="dv">${escHtml(a.age_client)} ans</div></div></div>`;
  }
  body +=
    `<div class="dr"><span class="dic">📅</span><div><div class="dlb">Date</div>` +
    `<div class="dv">${escHtml(formatFullDate(a.date))}</div></div></div>` +
    `<div class="dr"><span class="dic">🕐</span><div><div class="dlb">Heure</div>` +
    `<div class="dv">${escHtml(a.heure)}</div></div></div>` +
    `<div class="dr"><span class="dic">💅</span><div><div class="dlb">Prestation</div>` +
    `<div class="dv">${escHtml(formatPrestations(a))}</div></div></div>`;

  if (a.taille_ongles) {
    body += `<div class="dr"><span class="dic">📏</span><div><div class="dlb">Taille des ongles</div>` +
      `<div class="dv">${escHtml(a.taille_ongles)}</div></div></div>`;
  }
  if (a.photo_modele_url) {
    body += `<div class="dr"><span class="dic">🖼️</span><div><div class="dlb">Photo modèle</div>` +
      `<div class="dv"><a href="${escHtml(a.photo_modele_url)}" target="_blank" rel="noopener" style="color:var(--pk2)">Voir le fichier ↗</a></div></div></div>`;
  }
  if (a.photo_ongles_url) {
    body += `<div class="dr"><span class="dic">📸</span><div><div class="dlb">Photo ongles naturels</div>` +
      `<div class="dv"><a href="${escHtml(a.photo_ongles_url)}" target="_blank" rel="noopener" style="color:var(--pk2)">Voir le fichier ↗</a></div></div></div>`;
  }
  if (a.remarque) {
    body += `<div class="dr"><span class="dic">📝</span><div><div class="dlb">Remarque</div>` +
      `<div class="dv">${escHtml(a.remarque)}</div></div></div>`;
  }

  document.getElementById('dbdy').innerHTML = body;

  // Configure footer buttons based on status
  const delBtn  = document.getElementById('delBtn');
  const editBtn = document.getElementById('editBtn');

  if (a.statut_interne === 'en_attente_validation') {
    delBtn.textContent    = '❌ Refuser';
    delBtn.className      = 'btn bdd';
    delBtn.disabled       = false;
    delBtn.style.display  = '';
    editBtn.textContent   = '✅ Accepter';
    editBtn.className     = 'btn bp';
    editBtn.disabled      = false;
    editBtn.style.display = '';
  } else if (a.statut_interne === 'accepte') {
    delBtn.textContent    = '❌ Refuser';
    delBtn.className      = 'btn bdd';
    delBtn.disabled       = false;
    delBtn.style.display  = '';
    editBtn.style.display = 'none';
  } else {
    // en_attente_formulaire or other — read-only
    delBtn.style.display  = 'none';
    editBtn.style.display = 'none';
  }

  document.getElementById('dov').classList.remove('hidden');
}

function closeDetail() {
  activeId        = null;
  deleteConfirmed = false;
  // Reset buttons to defaults
  const delBtn  = document.getElementById('delBtn');
  delBtn.textContent    = '❌ Refuser';
  delBtn.className      = 'btn bdd';
  delBtn.disabled       = false;
  delBtn.style.display  = '';
  const editBtn = document.getElementById('editBtn');
  editBtn.textContent   = '✅ Accepter';
  editBtn.className     = 'btn bp';
  editBtn.disabled      = false;
  editBtn.style.display = '';
  document.getElementById('dov').classList.add('hidden');
}

// Two-click confirmation before refusing
function askDelete() {
  if (!deleteConfirmed) {
    deleteConfirmed           = true;
    const btn                 = document.getElementById('delBtn');
    btn.textContent           = '⚠️ Confirmer ?';
    btn.className             = 'btn bd2';
    return;
  }
  refuseRdv();
}

function handleEditBtn() {
  const a = appointments.find(x => x.id === activeId);
  if (!a) return;
  if (a.statut_interne === 'en_attente_validation') acceptRdv();
}

// ── Form modal stubs (form hidden — appointments come from Cal.com) ─────────

function closeForm() {
  document.getElementById('fov').classList.add('hidden');
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

// Hide manual-add button — appointments come from Cal.com
document.getElementById('sbAdd').style.display = 'none';

document.getElementById('delBtn').addEventListener('click', askDelete);
document.getElementById('closeDBtn').addEventListener('click', closeDetail);
document.getElementById('editBtn').addEventListener('click', handleEditBtn);
document.getElementById('closeDetail').addEventListener('click', closeDetail);

document.getElementById('cancelBtn').addEventListener('click', closeForm);
document.getElementById('saveBtn').addEventListener('click', closeForm);
document.getElementById('closeForm').addEventListener('click', closeForm);

document.getElementById('dov').addEventListener('click', e => { if (e.target.id === 'dov') closeDetail(); });
document.getElementById('fov').addEventListener('click', e => { if (e.target.id === 'fov') closeForm(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDetail(); closeForm(); } });

loadData();
