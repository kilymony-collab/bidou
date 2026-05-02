const DAYS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const HOURS  = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

let appointments    = [];   // statut_interne === 'accepte'
let pendingRequests = [];   // en_attente_validation ou en_attente_formulaire
let slots           = [];   // Créneaux disponibles (objets Airtable bruts)
let view            = 'month';
let sidebarTab      = 'demandes';
let activeId        = null;
let refuseConfirmId = null;
let pendingSlotId   = null; // créneau à pré-sélectionner dans le formulaire manuel
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
  if (!dateString) return '—';
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

// ── Airtable mapping ───────────────────────────────────────────────────────

function mapRecord(record) {
  const f = record.fields;

  let submittedAt = '—';
  if (f.date_creation_demande) {
    const d = new Date(f.date_creation_demande);
    submittedAt = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' à ' + pad2(d.getHours()) + 'h' + pad2(d.getMinutes());
  }

  return {
    id:               record.id,
    prenom:           f.prenom_client       || '',
    nom:              f.nom_client          || '',
    date:             f.date_rdv            || '',
    heure:            f.heure_rdv           || '',
    prestations:      f.prestation          ? [f.prestation] : [],
    bijoux:           !!f.bijoux,
    remarque:         f.notes_client        || '',
    telephone_client: f.telephone_client    || '',
    statut_interne:   f.statut_interne      || '',
    taille_ongles:    f.taille_ongles       || '',
    photo_modele_url: f.photo_modele?.[0]?.url || '',
    photo_ongles_url: f.photo_ongles?.[0]?.url || '',
    age_client:       f.age_client          || '',
    creneau_id:       f.creneau_id          || '',
    submittedAt,
  };
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadData() {
  try {
    const res = await fetch('/api/rdv');
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
      throw new Error(err.error || 'HTTP ' + res.status);
    }
    const data    = await res.json();
    const records = (data.records || []).map(mapRecord);

    slots           = data.slots || [];
    appointments    = records.filter(r => r.statut_interne === 'accepte');
    pendingRequests = records.filter(r =>
      r.statut_interne === 'en_attente_validation' ||
      r.statut_interne === 'en_attente_formulaire'
    );
  } catch (e) {
    appointments    = [];
    pendingRequests = [];
    slots           = [];
    toast('Erreur de chargement', e.message);
  }

  updateDemBadge();
  render();
  renderSidebar();
}

function updateDemBadge() {
  const toValidate = pendingRequests.filter(r => r.statut_interne === 'en_attente_validation').length;
  const total      = pendingRequests.length;

  const headerBadge = document.getElementById('demBadge');
  headerBadge.textContent = toValidate;
  headerBadge.classList.toggle('hidden', toValidate === 0);

  const tabBadge = document.getElementById('sbTabBadge');
  tabBadge.textContent = total;
  tabBadge.classList.toggle('hidden', total === 0);
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
  setSidebarTab('rdv');
  renderSidebar();
  render();
}

function render() {
  if (view === 'month') renderMonth();
  else renderWeek();
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function setSidebarTab(tab) {
  sidebarTab = tab;
  document.getElementById('tabDem').classList.toggle('on', tab === 'demandes');
  document.getElementById('tabRdv').classList.toggle('on', tab === 'rdv');
}

function renderSidebar() {
  if (sidebarTab === 'demandes') renderSidebarDemandes();
  else                           renderSidebarRdv();
}

function renderSidebarDemandes() {
  document.getElementById('sbHead').classList.add('hidden');
  const listEl = document.getElementById('sbList');

  if (!pendingRequests.length) {
    listEl.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucune demande<br>en attente.</div>';
    return;
  }

  listEl.innerHTML = pendingRequests.map(r => {
    const prests  = [...(r.prestations || [])];
    if (r.bijoux) prests.push('💎 Bijoux');
    const canAct  = r.statut_interne === 'en_attente_validation';
    const waiting = r.statut_interne === 'en_attente_formulaire'
      ? '<div class="sb-dem-waiting">⏳ En attente du formulaire</div>'
      : '';

    return `
      <div class="sb-dem-card">
        <div class="sb-dem-name">${escHtml(r.prenom)} ${escHtml(r.nom)}</div>
        <div class="sb-dem-meta">📅 ${escHtml(formatFullDate(r.date))} · ${escHtml(r.heure)}</div>
        <div class="sb-dem-prests">
          ${prests.map(p => `<span class="sb-dem-prest">${escHtml(p)}</span>`).join('')}
        </div>
        ${r.remarque ? `<div class="sb-dem-rem">📝 ${escHtml(r.remarque)}</div>` : ''}
        ${waiting}
        ${canAct ? `
          <div class="sb-dem-actions">
            <button class="btn bdd sb-dem-refuse" data-id="${escHtml(r.id)}">✕</button>
            <button class="btn bp  sb-dem-accept" data-id="${escHtml(r.id)}">✓ Valider</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.sb-dem-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptRequest(btn.dataset.id))
  );
  listEl.querySelectorAll('.sb-dem-refuse').forEach(btn =>
    btn.addEventListener('click', () => refuseRequest(btn.dataset.id))
  );
}

function renderSidebarRdv() {
  const head = document.getElementById('sbHead');
  head.classList.remove('hidden');
  document.getElementById('sbDate').innerHTML = formatSidebarDate(selectedDate);

  const dayAppointments = appointments
    .filter(a => a.date === selectedDate)
    .sort((a, b) => a.heure.localeCompare(b.heure));

  const daySlots = slots
    .filter(s => s.fields.date === selectedDate)
    .sort((a, b) => (a.fields.heure || '').localeCompare(b.fields.heure || ''));

  const listEl = document.getElementById('sbList');

  if (!dayAppointments.length && !daySlots.length) {
    listEl.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucun rendez-vous<br>ni créneau ce jour-là.</div>';
    return;
  }

  let html = '';

  if (dayAppointments.length) {
    html += dayAppointments.map(a =>
      `<div class="rdv-card" data-id="${escHtml(a.id)}">` +
        `<div class="rdv-badge">${escHtml(a.heure)}</div>` +
        `<div class="rdv-info">` +
          `<div class="rdv-nm">${escHtml(a.prenom)} ${escHtml(a.nom)}</div>` +
          `<div class="rdv-pr">${escHtml(formatPrestations(a))}</div>` +
        `</div>` +
        `<div class="rdv-ch">›</div>` +
      `</div>`
    ).join('');
  }

  if (daySlots.length) {
    html += '<div class="sb-slots-hdr">Créneaux libres</div>';
    html += daySlots.map(s =>
      `<div class="rdv-card rdv-card-slot" data-slot-id="${escHtml(s.id)}">` +
        `<div class="rdv-badge rdv-badge-slot">${escHtml(s.fields.heure || '')}</div>` +
        `<div class="rdv-info"><div class="rdv-nm">Disponible</div></div>` +
      `</div>`
    ).join('');
  }

  listEl.innerHTML = html;

  listEl.querySelectorAll('.rdv-card:not(.rdv-card-slot)').forEach(card =>
    card.addEventListener('click', () => openDetail(card.dataset.id))
  );
  listEl.querySelectorAll('.rdv-card-slot').forEach(card =>
    card.addEventListener('click', () => openSlotDetail(card.dataset.slotId))
  );
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

  let html = '<div class="mgrid"><div class="mrow-h">' +
    DAYS.map(d => `<div class="mhc">${d}</div>`).join('') +
    '</div><div class="mbody">';

  for (let i = 0; i < startOffset; i++) {
    html += `<div class="mc out"><div class="dn">${daysInPrevMonth - startOffset + i + 1}</div></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds       = y + '-' + pad2(m + 1) + '-' + pad2(d);
    const cls      = 'mc' + (ds === today ? ' tod' : '') + (ds === selectedDate ? ' sel' : '');
    const dayAppts = appointments.filter(a => a.date === ds).sort((a, b) => a.heure.localeCompare(b.heure));
    const visible  = dayAppts.slice(0, 2);
    const extra    = dayAppts.length - 2;

    html += `<div class="${cls}" data-ds="${ds}"><div class="dn">${d}</div>`;

    visible.forEach(a => {
      html += `<div class="pill" data-id="${escHtml(a.id)}">` +
        `<span class="pt">${escHtml(a.heure)}</span>` +
        `<span class="pn">${escHtml(a.prenom)}</span>` +
        `</div>`;
    });
    if (extra > 0) html += `<div class="mmore">+${extra} autre${extra > 1 ? 's' : ''}</div>`;

    const daySlots = slots.filter(s => s.fields.date === ds);
    daySlots.slice(0, 1).forEach(s => {
      html += `<div class="pill pill-slot" data-slot-id="${escHtml(s.id)}">` +
        `<span class="pt">${escHtml(s.fields.heure || '')}</span>` +
        `<span class="pn">libre</span>` +
        `</div>`;
    });
    const slotExtra = daySlots.length - 1;
    if (slotExtra > 0) html += `<div class="mmore">+${slotExtra} créneau${slotExtra > 1 ? 'x' : ''}</div>`;

    html += '</div>';
  }

  const trailing = (startOffset + daysInMonth) % 7 === 0 ? 0 : 7 - (startOffset + daysInMonth) % 7;
  for (let i = 1; i <= trailing; i++) {
    html += `<div class="mc out"><div class="dn">${i}</div></div>`;
  }

  html += '</div></div>';
  document.getElementById('cal').innerHTML = html;

  document.querySelectorAll('#cal .mc:not(.out)').forEach(cell =>
    cell.addEventListener('click', () => selectDay(cell.dataset.ds))
  );
  document.querySelectorAll('#cal .pill:not(.pill-slot)').forEach(pill =>
    pill.addEventListener('click', e => { e.stopPropagation(); openDetail(pill.dataset.id); })
  );
  document.querySelectorAll('#cal .pill-slot').forEach(pill =>
    pill.addEventListener('click', e => { e.stopPropagation(); openSlotDetail(pill.dataset.slotId); })
  );
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
    const ds       = toDateString(x);
    const dayAppts = appointments.filter(a => a.date === ds);
    const daySlots = slots.filter(s => s.fields.date === ds);

    html += '<div class="wdc">';
    HOURS.forEach(() => { html += '<div class="wsl"></div>'; });

    dayAppts.forEach(a => {
      const [hh, mm]     = a.heure.split(':').map(Number);
      const minutesFrom8 = (hh - 8) * 60 + mm;
      if (minutesFrom8 < 0 || minutesFrom8 >= 13 * 60) return;
      html +=
        `<div class="wapt" style="top:${minutesFrom8 / 60 * 60}px" data-id="${escHtml(a.id)}">` +
          `<div class="wat">${escHtml(a.heure)}</div>` +
          `<div class="wan">${escHtml(a.prenom)}</div>` +
        `</div>`;
    });

    daySlots.forEach(s => {
      const heure = s.fields.heure || '';
      const [hh, mm]     = heure.split(':').map(Number);
      const minutesFrom8 = (hh - 8) * 60 + mm;
      if (minutesFrom8 < 0 || minutesFrom8 >= 13 * 60) return;
      html +=
        `<div class="wapt wapt-slot" style="top:${minutesFrom8 / 60 * 60}px" data-slot-id="${escHtml(s.id)}">` +
          `<div class="wat">${escHtml(heure)}</div>` +
          `<div class="wan">Libre</div>` +
        `</div>`;
    });

    html += '</div>';
  });

  html += '</div></div>';
  document.getElementById('cal').innerHTML = html;

  document.querySelectorAll('#cal .whd').forEach(col =>
    col.addEventListener('click', () => selectDay(col.dataset.ds))
  );
  document.querySelectorAll('#cal .wapt:not(.wapt-slot)').forEach(apt =>
    apt.addEventListener('click', () => openDetail(apt.dataset.id))
  );
  document.querySelectorAll('#cal .wapt-slot').forEach(apt =>
    apt.addEventListener('click', () => openSlotDetail(apt.dataset.slotId))
  );
}

// ── Detail modal ───────────────────────────────────────────────────────────

function openDetail(id) {
  const a = [...appointments, ...pendingRequests].find(x => x.id === id);
  if (!a) return;
  activeId = id;

  document.getElementById('dtit').textContent = a.prenom + ' ' + a.nom;

  let body =
    `<div class="dr"><span class="dic">👤</span><div><div class="dlb">Cliente</div><div class="dv">${escHtml(a.prenom)} ${escHtml(a.nom)}</div></div></div>` +
    `<div class="dr"><span class="dic">📅</span><div><div class="dlb">Date</div><div class="dv">${escHtml(formatFullDate(a.date))}</div></div></div>` +
    `<div class="dr"><span class="dic">🕐</span><div><div class="dlb">Heure</div><div class="dv">${escHtml(a.heure)}</div></div></div>` +
    `<div class="dr"><span class="dic">💅</span><div><div class="dlb">Prestation</div><div class="dv">${escHtml(formatPrestations(a))}</div></div></div>`;

  if (a.taille_ongles)
    body += `<div class="dr"><span class="dic">📏</span><div><div class="dlb">Taille des ongles</div><div class="dv">${escHtml(a.taille_ongles)}</div></div></div>`;
  if (a.age_client)
    body += `<div class="dr"><span class="dic">🎂</span><div><div class="dlb">Âge</div><div class="dv">${escHtml(a.age_client)} ans</div></div></div>`;
  if (a.telephone_client)
    body += `<div class="dr"><span class="dic">📱</span><div><div class="dlb">Téléphone</div><div class="dv">${escHtml(a.telephone_client)}</div></div></div>`;
  if (a.remarque)
    body += `<div class="dr"><span class="dic">📝</span><div><div class="dlb">Remarque</div><div class="dv">${escHtml(a.remarque)}</div></div></div>`;
  if (a.photo_modele_url)
    body += `<div class="dr"><span class="dic">🖼️</span><div><div class="dlb">Modèle souhaité</div><div class="dv"><img class="detail-img" src="${escHtml(a.photo_modele_url)}" alt="Modèle"></div></div></div>`;
  if (a.photo_ongles_url)
    body += `<div class="dr"><span class="dic">💅</span><div><div class="dlb">Ongle naturel</div><div class="dv"><img class="detail-img" src="${escHtml(a.photo_ongles_url)}" alt="Ongle naturel"></div></div></div>`;

  document.getElementById('dbdy').innerHTML = body;
  document.getElementById('dov').classList.remove('hidden');
}

function closeDetail() {
  activeId = null;
  document.getElementById('dov').classList.add('hidden');
}

// ── Slot detail — ouvre le formulaire manuel pré-rempli ────────────────────

function openSlotDetail(id) {
  const s = slots.find(x => x.id === id);
  if (!s) return;
  openManualForm();
  pendingSlotId = id;
  const dateInput = document.getElementById('mDate');
  dateInput.value = s.fields.date || '';
  dateInput.dispatchEvent(new Event('change'));
}

// ── Demandes modal ─────────────────────────────────────────────────────────

function openDemandes() {
  renderDemandes();
  document.getElementById('demOv').classList.remove('hidden');
}

function closeDemandes() {
  document.getElementById('demOv').classList.add('hidden');
}

function renderDemandes() {
  const list = document.getElementById('demList');

  if (!pendingRequests.length) {
    list.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucune demande en attente.<br>Tout est à jour !</div>';
    return;
  }

  list.innerHTML = pendingRequests.map(r => {
    const prests  = [...(r.prestations || [])];
    if (r.bijoux) prests.push('💎 Bijoux');
    const canAct  = r.statut_interne === 'en_attente_validation';
    const waiting = r.statut_interne === 'en_attente_formulaire'
      ? '<div class="dem-waiting">⏳ En attente du formulaire client</div>'
      : '';

    return `
      <div class="dem-card">
        <div class="dem-top">
          <div class="dem-client">${escHtml(r.prenom)} ${escHtml(r.nom)}</div>
          <div class="dem-ts">Reçue le ${escHtml(r.submittedAt)}</div>
        </div>
        <div class="dem-meta">📅 ${escHtml(formatFullDate(r.date))} à ${escHtml(r.heure)}</div>
        <div class="dem-prests">
          ${prests.map(p => `<span class="dem-prest">${escHtml(p)}</span>`).join('')}
        </div>
        ${r.remarque ? `<div class="dem-rem">📝 ${escHtml(r.remarque)}</div>` : ''}
        ${(r.photo_modele_url || r.photo_ongles_url) ? `
          <div class="dem-imgs">
            ${r.photo_modele_url ? `<div class="dem-img-wrap"><span class="dem-img-lbl">Modèle</span><img src="${escHtml(r.photo_modele_url)}" class="dem-img" alt="Modèle"></div>` : ''}
            ${r.photo_ongles_url ? `<div class="dem-img-wrap"><span class="dem-img-lbl">Ongle</span><img src="${escHtml(r.photo_ongles_url)}" class="dem-img" alt="Ongle"></div>` : ''}
          </div>
        ` : ''}
        ${waiting}
        ${canAct ? `
          <div class="dem-actions">
            <button class="btn bdd dem-refuse" data-id="${escHtml(r.id)}">✕ Refuser</button>
            <button class="btn bp  dem-accept" data-id="${escHtml(r.id)}">✓ Valider</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  list.querySelectorAll('.dem-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptRequest(btn.dataset.id))
  );
  list.querySelectorAll('.dem-refuse').forEach(btn =>
    btn.addEventListener('click', () => refuseRequest(btn.dataset.id))
  );
}

// ── Accept / Refuse ────────────────────────────────────────────────────────

async function acceptRequest(id) {
  const req = pendingRequests.find(r => r.id === id);
  if (!req) return;

  try {
    toast('Traitement…', 'Validation en cours');
    const res = await fetch('/api/rdv', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        action:             'accept',
        airtable_record_id: req.id,
        creneau_id:         req.creneau_id,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await loadData();
    renderDemandes();
    toast('RDV validé ✓', req.prenom + ' ' + req.nom + ' — ' + req.date + ' à ' + req.heure);
  } catch (e) {
    toast('Erreur', e.message);
  }
}

async function refuseRequest(id) {
  const req = pendingRequests.find(r => r.id === id);
  if (!req) return;

  // Deux clics pour confirmer
  if (refuseConfirmId !== id) {
    refuseConfirmId = id;
    document.querySelectorAll('.dem-refuse, .sb-dem-refuse').forEach(btn => {
      if (btn.dataset.id === id) {
        btn.textContent = '⚠️ Confirmer ?';
        btn.classList.replace('bdd', 'bd2');
      }
    });
    setTimeout(() => {
      refuseConfirmId = null;
      renderDemandes();
      renderSidebar();
    }, 3000);
    return;
  }

  refuseConfirmId = null;
  try {
    const res = await fetch('/api/rdv', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        action:             'refuse',
        airtable_record_id: req.id,
        creneau_id:         req.creneau_id,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await loadData();
    renderDemandes();
    toast('Demande refusée', req.prenom + ' ' + req.nom);
  } catch (e) {
    toast('Erreur', e.message);
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────

function toast(title, body) {
  const el     = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="tt">${escHtml(title)}</div><div class="tb">${escHtml(body)}</div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 3500);
  setTimeout(() => el.remove(), 4000);
}

// ── Event listeners ────────────────────────────────────────────────────────

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
document.getElementById('btnD').addEventListener('click', openDemandes);

document.getElementById('tabDem').addEventListener('click', () => {
  setSidebarTab('demandes');
  renderSidebar();
});
document.getElementById('tabRdv').addEventListener('click', () => {
  setSidebarTab('rdv');
  renderSidebar();
});

document.getElementById('closeDBtn').addEventListener('click',   closeDetail);
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('closeDemX').addEventListener('click',   closeDemandes);
document.getElementById('closeDemBtn').addEventListener('click', closeDemandes);

document.getElementById('dov').addEventListener('click',   e => { if (e.target.id === 'dov')   closeDetail(); });
document.getElementById('demOv').addEventListener('click', e => { if (e.target.id === 'demOv') closeDemandes(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDetail(); closeDemandes(); closeSlotForm(); }
});

// ── Manual booking form ────────────────────────────────────────────────────

const PRESTS_TAILLE = ['Pose simple', 'Nail art', 'Freestyle chargée'];
const PRESTS_EXCLU  = new Set(['Pose simple', 'Nail art', 'Freestyle chargée']);

let selectedSlot        = null;       // creneau_id Airtable du créneau choisi
let selectedTaille      = null;       // 'Court' | 'Moyen' | 'Long'
let selectedPrestations = new Set();  // prestations sélectionnées (multi)

function formatSlotDayHeader(dateStr) {
  const d    = new Date(dateStr + 'T12:00:00');
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const mths = ['jan.','fév.','mar.','avr.','mai','juin','juil.','août','sep.','oct.','nov.','déc.'];
  return days[d.getDay()] + '. ' + pad2(d.getDate()) + ' ' + mths[d.getMonth()];
}

function openManualForm() {
  ['mPrenom','mNom','mTel','mNotes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('mAge').value  = '';
  document.getElementById('mDate').value = '';
  document.getElementById('mBijoux').checked = false;
  const errEl0 = document.getElementById('manErr');
  errEl0.textContent   = '';
  errEl0.style.display = 'none';

  selectedSlot        = null;
  selectedTaille      = null;
  selectedPrestations = new Set();
  pendingSlotId       = null;

  document.getElementById('slotsSection').classList.add('hidden');
  document.getElementById('slotsLoading').classList.add('hidden');
  document.getElementById('slotsEmpty').classList.add('hidden');
  document.getElementById('tailleSection').classList.add('hidden');
  document.getElementById('slotsGrid').innerHTML     = '';
  document.getElementById('slotsDayHdr').textContent = '';

  document.querySelectorAll('.popt').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.taille-opt').forEach(b => b.classList.remove('on'));

  document.getElementById('mDate').min = todayDateString();

  document.getElementById('manOv').classList.remove('hidden');
  setTimeout(() => document.getElementById('mPrenom').focus(), 80);
}

function closeManualForm() {
  document.getElementById('manOv').classList.add('hidden');
}

// Charge les créneaux disponibles quand la date change
document.getElementById('mDate').addEventListener('change', async function () {
  const date = this.value;
  if (!date) return;

  const slotsSection = document.getElementById('slotsSection');
  const slotsLoading = document.getElementById('slotsLoading');
  const slotsEmpty   = document.getElementById('slotsEmpty');
  const slotsGrid    = document.getElementById('slotsGrid');

  slotsSection.classList.add('hidden');
  slotsEmpty.classList.add('hidden');
  slotsLoading.classList.remove('hidden');
  slotsGrid.innerHTML = '';
  selectedSlot = null;

  try {
    const res  = await fetch(`/api/book?date=${date}`);
    const data = await res.json();

    slotsLoading.classList.add('hidden');

    if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);

    const availableSlots = data.slots || [];
    if (!availableSlots.length) {
      slotsEmpty.classList.remove('hidden');
      return;
    }

    document.getElementById('slotsDayHdr').textContent = formatSlotDayHeader(date);

    slotsGrid.innerHTML = availableSlots.map(s =>
      `<button type="button" class="slot-btn" data-creneau-id="${escHtml(s.id)}">${escHtml(s.heure)}</button>`
    ).join('');

    slotsSection.classList.remove('hidden');

    slotsGrid.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        slotsGrid.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        selectedSlot = btn.dataset.creneauId;
      });
    });

    // Pré-sélectionner le créneau si ouvert depuis le calendrier
    if (pendingSlotId) {
      const preBtn = slotsGrid.querySelector(`[data-creneau-id="${pendingSlotId}"]`);
      if (preBtn) { preBtn.classList.add('on'); selectedSlot = pendingSlotId; }
      pendingSlotId = null;
    }
  } catch (e) {
    slotsLoading.classList.add('hidden');
    slotsEmpty.classList.remove('hidden');
    slotsEmpty.textContent = '⚠️ Erreur : ' + e.message;
  }
});

// Grille prestation — multi-sélection avec exclusivité
document.querySelectorAll('.popt').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.v;

    if (selectedPrestations.has(v)) {
      selectedPrestations.delete(v);
      btn.classList.remove('on');
    } else {
      if (PRESTS_EXCLU.has(v)) {
        PRESTS_EXCLU.forEach(excl => {
          if (excl !== v && selectedPrestations.has(excl)) {
            selectedPrestations.delete(excl);
            document.querySelector(`.popt[data-v="${excl}"]`).classList.remove('on');
          }
        });
      }
      selectedPrestations.add(v);
      btn.classList.add('on');
    }

    const showTaille = [...selectedPrestations].some(p => PRESTS_TAILLE.includes(p));
    document.getElementById('tailleSection').classList.toggle('hidden', !showTaille);
    if (!showTaille) {
      selectedTaille = null;
      document.querySelectorAll('.taille-opt').forEach(b => b.classList.remove('on'));
    }
  });
});

// Boutons taille
document.querySelectorAll('.taille-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.taille-opt').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    selectedTaille = btn.dataset.v;
  });
});

// Enregistrer le RDV manuel
document.getElementById('saveManBtn').addEventListener('click', async () => {
  const prenom     = document.getElementById('mPrenom').value.trim();
  const nom        = document.getElementById('mNom').value.trim();
  const telephone  = document.getElementById('mTel').value.trim();
  const age        = document.getElementById('mAge').value.trim();
  const prestation = [...selectedPrestations].join(' · ');
  const bijoux     = document.getElementById('mBijoux').checked;
  const notes      = document.getElementById('mNotes').value.trim();
  const errEl      = document.getElementById('manErr');

  const needTaille = [...selectedPrestations].some(p => PRESTS_TAILLE.includes(p));
  let errMsg = '';
  if (!prenom || !nom || !telephone)       errMsg = 'Prénom, nom et téléphone sont obligatoires.';
  else if (!age || Number(age) < 18)       errMsg = 'Âge obligatoire (18 ans minimum).';
  else if (!selectedSlot)                  errMsg = 'Veuillez choisir un créneau.';
  else if (selectedPrestations.size === 0) errMsg = 'Veuillez choisir au moins une prestation.';
  else if (needTaille && !selectedTaille)  errMsg = 'Veuillez choisir une taille d\'ongles.';

  if (errMsg) {
    errEl.textContent   = errMsg;
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  const btn = document.getElementById('saveManBtn');
  btn.disabled    = true;
  btn.textContent = '⏳ Enregistrement…';

  try {
    const res = await fetch('/api/book', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prenom, nom, telephone,
        age, prestation, bijoux,
        taille_ongles: selectedTaille || '',
        notes,
        creneau_id: selectedSlot,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');

    closeManualForm();
    await loadData();
    selectedDate = data.dateRdv;
    setSidebarTab('rdv');
    renderSidebar();
    render();
    toast('RDV ajouté ✓', prenom + ' ' + nom + ' — ' + data.dateRdv + ' à ' + data.heureRdv);
  } catch (e) {
    errEl.textContent   = '⚠️ Erreur : ' + e.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = '💾 Enregistrer';
  }
});

document.getElementById('sbAdd').addEventListener('click', openManualForm);
document.getElementById('cancelManBtn').addEventListener('click', closeManualForm);
document.getElementById('closeMan').addEventListener('click', closeManualForm);
document.getElementById('manOv').addEventListener('click', e => { if (e.target.id === 'manOv') closeManualForm(); });

// ── Slot creation form ─────────────────────────────────────────────────────

function openSlotForm() {
  document.getElementById('sDate').value = '';
  document.getElementById('sHeure').value = '';
  const errEl = document.getElementById('slotErr');
  errEl.textContent   = '';
  errEl.style.display = 'none';
  document.getElementById('sDate').min = todayDateString();
  document.getElementById('slotOv').classList.remove('hidden');
  setTimeout(() => document.getElementById('sDate').focus(), 80);
}

function closeSlotForm() {
  document.getElementById('slotOv').classList.add('hidden');
}

document.getElementById('btnSlot').addEventListener('click', openSlotForm);
document.getElementById('closeSlot').addEventListener('click', closeSlotForm);
document.getElementById('cancelSlotBtn').addEventListener('click', closeSlotForm);
document.getElementById('slotOv').addEventListener('click', e => { if (e.target.id === 'slotOv') closeSlotForm(); });

document.getElementById('saveSlotBtn').addEventListener('click', async () => {
  const date  = document.getElementById('sDate').value;
  const heure = document.getElementById('sHeure').value;
  const errEl = document.getElementById('slotErr');

  if (!date || !heure) {
    errEl.textContent   = 'Date et heure sont obligatoires.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  const btn = document.getElementById('saveSlotBtn');
  btn.disabled    = true;
  btn.textContent = '⏳ Enregistrement…';

  try {
    const res = await fetch('/api/slots', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ date, heure }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');

    closeSlotForm();
    await loadData();
    selectedDate = date;
    setSidebarTab('rdv');
    renderSidebar();
    render();
    toast('Créneau ajouté ✓', formatFullDate(date) + ' à ' + heure);
  } catch (e) {
    errEl.textContent   = '⚠️ Erreur : ' + e.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = '💾 Enregistrer';
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
loadData();
