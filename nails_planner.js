const DAYS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const HOURS  = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

let appointments    = [];
let pendingRequests = [];
let slots           = [];
let view            = 'month';
let activeTab       = null;
let refuseConfirmId = null;
let deleteConfirmId = null;
let pendingSlotId   = null;
let knownPendingIds = null; // null = premier chargement, pas de notif
let cur             = new Date();
let selectedDate    = todayDateString();

// ── Utilities ──────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

function toDateString(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayDateString() { return toDateString(new Date()); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatFullDate(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString + 'T12:00:00');
  const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()];
  return dayName + ' ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

function formatPrestations(a) {
  const parts = [...(a.prestations || [])];
  if (a.bijoux) parts.push('💎 Bijoux');
  return parts.join(' · ') || '—';
}

function formatSlotDayHeader(dateStr) {
  const d    = new Date(dateStr + 'T12:00:00');
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const mths = ['jan.','fév.','mar.','avr.','mai','juin','juil.','août','sep.','oct.','nov.','déc.'];
  return days[d.getDay()] + '. ' + pad2(d.getDate()) + ' ' + mths[d.getMonth()];
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
    appointments = []; pendingRequests = []; slots = [];
    const isNetwork = e instanceof TypeError;
    const msg = isNetwork
      ? 'Serveur non disponible — lancez "vercel dev" ou vérifiez le déploiement.'
      : e.message;
    toast('Erreur de chargement', msg);
  }

  // Détection des nouvelles demandes (en_attente_validation)
  const currentValidation = pendingRequests.filter(r => r.statut_interne === 'en_attente_validation');
  if (knownPendingIds !== null) {
    const newReqs = currentValidation.filter(r => !knownPendingIds.has(r.id));
    newReqs.forEach(r => {
      // Notification browser
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('📋 Nouvelle demande de RDV', {
          body: `${r.prenom} ${r.nom} — ${formatFullDate(r.date)} à ${r.heure}`,
        });
      }
      // Notification ntfy (silencieuse si non configuré)
      fetch('/api/notify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prenom: r.prenom, nom: r.nom,
          date:   r.date,   heure: r.heure,
          prestation: formatPrestations(r),
        }),
      }).catch(() => {});
    });
  }
  knownPendingIds = new Set(currentValidation.map(r => r.id));

  updateDemBadge();
  render();
  if (activeTab && activeTab !== 'infos') renderSidebarCont();
  if (!document.getElementById('infoOv').classList.contains('hidden')) renderInfoPage();
}

function updateDemBadge() {
  const toValidate = pendingRequests.filter(r => r.statut_interne === 'en_attente_validation').length;
  const badge = document.getElementById('sbnBadge');
  badge.textContent = toValidate;
  badge.classList.toggle('hidden', toValidate === 0);
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
  render();
}

function render() {
  if (view === 'month') renderMonth();
  else renderWeek();
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
    const dayDems  = pendingRequests.filter(r => r.date === ds).sort((a, b) => a.heure.localeCompare(b.heure));
    const daySlots = slots.filter(s => s.fields.date === ds);

    const visAppts  = dayAppts.slice(0, 2);
    const extraAppts = dayAppts.length - 2;
    const visDems   = dayDems.slice(0, 1);
    const extraDems  = dayDems.length - 1;
    const visSlots  = daySlots.slice(0, 1);
    const extraSlots = daySlots.length - 1;

    html += `<div class="${cls}" data-ds="${ds}"><div class="dn">${d}</div>`;

    visAppts.forEach(a => {
      html += `<div class="pill" data-id="${escHtml(a.id)}">` +
        `<span class="pt">${escHtml(a.heure)}</span>` +
        `<span class="pn">${escHtml(a.prenom)}</span></div>`;
    });
    if (extraAppts > 0) html += `<div class="mmore">+${extraAppts} rdv</div>`;

    visDems.forEach(r => {
      html += `<div class="pill pill-dem" data-id="${escHtml(r.id)}">` +
        `<span class="pt">${escHtml(r.heure)}</span>` +
        `<span class="pn">${escHtml(r.prenom)}</span></div>`;
    });
    if (extraDems > 0) html += `<div class="mmore">+${extraDems} dem.</div>`;

    visSlots.forEach(s => {
      html += `<div class="pill pill-slot" data-slot-id="${escHtml(s.id)}">` +
        `<span class="pt">${escHtml(s.fields.heure || '')}</span>` +
        `<span class="pn">libre</span></div>`;
    });
    if (extraSlots > 0) html += `<div class="mmore">+${extraSlots} créneaux</div>`;

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
  document.querySelectorAll('#cal .pill:not(.pill-dem):not(.pill-slot)').forEach(pill =>
    pill.addEventListener('click', e => { e.stopPropagation(); openDetail(pill.dataset.id); })
  );
  document.querySelectorAll('#cal .pill-dem').forEach(pill =>
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
    const ds      = toDateString(x);
    const isSel   = ds === selectedDate;
    html += `<div class="whd${isSel ? ' wsel' : ''}" data-ds="${ds}">` +
      `<div class="wdn">${DAYS[(x.getDay() + 6) % 7]}</div>` +
      `<div class="wnum${ds === today ? ' wt' : ''}">${x.getDate()}</div></div>`;
  });

  html += '</div><div class="wbody"><div class="wtc">';
  HOURS.forEach(hh => { html += `<div class="wts">${pad2(hh)}h</div>`; });
  html += '</div>';

  weekDays.forEach(x => {
    const ds       = toDateString(x);
    const dayAppts = appointments.filter(a => a.date === ds);
    const dayDems  = pendingRequests.filter(r => r.date === ds);
    const daySlots = slots.filter(s => s.fields.date === ds);

    html += '<div class="wdc">';
    HOURS.forEach(() => { html += '<div class="wsl"></div>'; });

    dayAppts.forEach(a => {
      const [hh, mm]     = a.heure.split(':').map(Number);
      const minutesFrom8 = (hh - 8) * 60 + mm;
      if (minutesFrom8 < 0 || minutesFrom8 >= 13 * 60) return;
      html += `<div class="wapt" style="top:${minutesFrom8 / 60 * 60}px" data-id="${escHtml(a.id)}">` +
        `<div class="wat">${escHtml(a.heure)}</div>` +
        `<div class="wan">${escHtml(a.prenom)}</div></div>`;
    });

    dayDems.forEach(r => {
      const [hh, mm]     = r.heure.split(':').map(Number);
      const minutesFrom8 = (hh - 8) * 60 + mm;
      if (minutesFrom8 < 0 || minutesFrom8 >= 13 * 60) return;
      html += `<div class="wapt wapt-dem" style="top:${minutesFrom8 / 60 * 60}px" data-id="${escHtml(r.id)}">` +
        `<div class="wat">${escHtml(r.heure)}</div>` +
        `<div class="wan">${escHtml(r.prenom)}</div></div>`;
    });

    daySlots.forEach(s => {
      const heure = s.fields.heure || '';
      const [hh, mm]     = heure.split(':').map(Number);
      const minutesFrom8 = (hh - 8) * 60 + mm;
      if (minutesFrom8 < 0 || minutesFrom8 >= 13 * 60) return;
      html += `<div class="wapt wapt-slot" style="top:${minutesFrom8 / 60 * 60}px" data-slot-id="${escHtml(s.id)}">` +
        `<div class="wat">${escHtml(heure)}</div>` +
        `<div class="wan">Libre</div></div>`;
    });

    html += '</div>';
  });

  html += '</div></div>';
  document.getElementById('cal').innerHTML = html;

  document.querySelectorAll('#cal .whd').forEach(col =>
    col.addEventListener('click', () => selectDay(col.dataset.ds))
  );
  document.querySelectorAll('#cal .wapt:not(.wapt-dem):not(.wapt-slot)').forEach(apt =>
    apt.addEventListener('click', () => openDetail(apt.dataset.id))
  );
  document.querySelectorAll('#cal .wapt-dem').forEach(apt =>
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
    body += `<div class="dr"><span class="dic">🖼️</span><div><div class="dlb">Modèle souhaité</div><div class="dv">
      <a href="${escHtml(a.photo_modele_url)}" target="_blank" rel="noopener">
        <img class="detail-img" src="${escHtml(a.photo_modele_url)}" alt="Modèle"
          onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
        <span class="img-fallback" style="display:none">🔗 Voir l'image (lien)</span>
      </a></div></div></div>`;
  if (a.photo_ongles_url)
    body += `<div class="dr"><span class="dic">💅</span><div><div class="dlb">Ongle naturel</div><div class="dv">
      <a href="${escHtml(a.photo_ongles_url)}" target="_blank" rel="noopener">
        <img class="detail-img" src="${escHtml(a.photo_ongles_url)}" alt="Ongle naturel"
          onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
        <span class="img-fallback" style="display:none">🔗 Voir l'image (lien)</span>
      </a></div></div></div>`;

  document.getElementById('dbdy').innerHTML = body;

  const footer = document.getElementById('dft');
  if (a.statut_interne === 'en_attente_validation') {
    footer.innerHTML =
      `<button class="btn bdd" id="dRefuse">✕ Refuser</button>` +
      `<button class="btn bp"  id="dAccept">✓ Valider</button>` +
      `<button class="btn bn"  id="dClose">Fermer</button>`;
    document.getElementById('dAccept').addEventListener('click', () => { closeDetail(); acceptRequest(id); });
    document.getElementById('dClose').addEventListener('click', closeDetail);
    const refuseBtn = document.getElementById('dRefuse');
    refuseBtn.addEventListener('click', () => {
      if (refuseConfirmId !== id) {
        refuseConfirmId = id;
        refuseBtn.textContent = '⚠️ Confirmer ?';
        refuseBtn.classList.replace('bdd', 'bd2');
        setTimeout(() => {
          refuseConfirmId = null;
          if (refuseBtn.isConnected) {
            refuseBtn.textContent = '✕ Refuser';
            refuseBtn.classList.replace('bd2', 'bdd');
          }
        }, 3000);
      } else {
        closeDetail();
        refuseRequest(id);
      }
    });
  } else if (a.statut_interne === 'accepte') {
    footer.innerHTML =
      `<button class="btn bdd" id="dCancel">🚫 Annuler le RDV</button>` +
      `<button class="btn bn"  id="dClose">Fermer</button>`;
    document.getElementById('dCancel').addEventListener('click', () => { closeDetail(); cancelAppointment(id); });
    document.getElementById('dClose').addEventListener('click', closeDetail);
  } else {
    footer.innerHTML = `<button class="btn bn" id="dClose">Fermer</button>`;
    document.getElementById('dClose').addEventListener('click', closeDetail);
  }

  document.getElementById('dov').classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('dov').classList.add('hidden');
}

// ── Slot detail ────────────────────────────────────────────────────────────

function openSlotDetail(id) {
  const s = slots.find(x => x.id === id);
  if (!s) return;
  openManualForm();
  pendingSlotId = id;
  const dateInput = document.getElementById('mDate');
  dateInput.value = s.fields.date || '';
  dateInput.dispatchEvent(new Event('change'));
}

// ── Hamburger + sidebar ────────────────────────────────────────────────────

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const btn = document.getElementById('hamBtn');
  const open = sb.classList.toggle('open');
  btn.classList.toggle('open', open);
  if (!open) clearActiveTab();
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('hamBtn').classList.remove('open');
  clearActiveTab();
}

function clearActiveTab() {
  activeTab = null;
  document.querySelectorAll('.sbnav-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('sbCont').classList.add('hidden');
  document.getElementById('sidebar').classList.remove('sb-content-view');
}

// ── Sidebar tabs ───────────────────────────────────────────────────────────

function setActiveTab(tab) {
  if (tab === 'infos') {
    activeTab = 'infos';
    document.querySelectorAll('.sbnav-btn').forEach(b => b.classList.remove('on'));
    document.querySelector('.sbnav-btn[data-tab="infos"]').classList.add('on');
    document.getElementById('sbCont').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('sb-content-view');
    openInfoPage();
    return;
  }

  if (activeTab === tab) {
    clearActiveTab();
    return;
  }

  activeTab = tab;
  document.querySelectorAll('.sbnav-btn').forEach(b => b.classList.remove('on'));
  document.querySelector(`.sbnav-btn[data-tab="${tab}"]`).classList.add('on');

  const titles = { rdv: 'Rendez-vous', demandes: 'Demandes', creneaux: 'Créneaux libres' };
  document.getElementById('sbContTtl').textContent = titles[tab] || '';

  document.getElementById('sidebar').classList.add('sb-content-view');
  document.getElementById('sbCont').classList.remove('hidden');
  renderSidebarCont();
}

function renderSidebarCont() {
  if (activeTab === 'rdv')       renderSbRdv();
  else if (activeTab === 'demandes') renderSbDemandes();
  else if (activeTab === 'creneaux') renderSbCreneaux();
}

function renderSbRdv() {
  const body = document.getElementById('sbContBody');
  if (!appointments.length) {
    body.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucun rendez-vous.</div>';
    return;
  }
  body.innerHTML = appointments
    .slice().sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure))
    .map(a =>
      `<div class="rdv-card" data-id="${escHtml(a.id)}">` +
        `<div class="rdv-badge">${escHtml(a.heure)}</div>` +
        `<div class="rdv-info">` +
          `<div class="rdv-nm">${escHtml(a.prenom)} ${escHtml(a.nom)}</div>` +
          `<div class="rdv-pr">${escHtml(formatFullDate(a.date))}</div>` +
        `</div><div class="rdv-ch">›</div>` +
      `</div>`
    ).join('');
  body.querySelectorAll('.rdv-card').forEach(card =>
    card.addEventListener('click', () => openDetail(card.dataset.id))
  );
}

function renderSbDemandes() {
  const body = document.getElementById('sbContBody');
  if (!pendingRequests.length) {
    body.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucune demande en attente.</div>';
    return;
  }
  body.innerHTML = pendingRequests.map(r => {
    const prests  = [...(r.prestations || [])];
    if (r.bijoux) prests.push('💎 Bijoux');
    const canAct  = r.statut_interne === 'en_attente_validation';
    const waiting = r.statut_interne === 'en_attente_formulaire'
      ? '<div class="sb-dem-waiting">⏳ En attente du formulaire</div>' : '';
    return `
      <div class="sb-dem-card">
        <div class="sb-dem-name">${escHtml(r.prenom)} ${escHtml(r.nom)}</div>
        <div class="sb-dem-meta">📅 ${escHtml(formatFullDate(r.date))} · ${escHtml(r.heure)}</div>
        <div class="sb-dem-prests">
          ${prests.map(p => `<span class="sb-dem-prest">${escHtml(p)}</span>`).join('')}
        </div>
        ${r.remarque ? `<div class="sb-dem-rem">📝 ${escHtml(r.remarque)}</div>` : ''}
        ${waiting}
        ${canAct ? `<div class="sb-dem-actions">
          <button class="btn bdd sb-dem-refuse" data-id="${escHtml(r.id)}">✕</button>
          <button class="btn bp  sb-dem-accept" data-id="${escHtml(r.id)}">✓ Valider</button>
        </div>` : ''}
      </div>`;
  }).join('');
  body.querySelectorAll('.sb-dem-accept').forEach(btn =>
    btn.addEventListener('click', () => acceptRequest(btn.dataset.id))
  );
  body.querySelectorAll('.sb-dem-refuse').forEach(btn =>
    btn.addEventListener('click', () => refuseRequest(btn.dataset.id))
  );
}

function renderSbCreneaux() {
  const body = document.getElementById('sbContBody');
  if (!slots.length) {
    body.innerHTML = '<div class="empty-st"><div class="empty-ico">📅</div>Aucun créneau disponible.</div>';
    return;
  }
  body.innerHTML = slots.map(s =>
    `<div class="rdv-card rdv-card-slot">` +
      `<div class="rdv-badge rdv-badge-slot">${escHtml(s.fields.heure || '')}</div>` +
      `<div class="rdv-info slot-book-area" data-slot-id="${escHtml(s.id)}">` +
        `<div class="rdv-nm">${escHtml(formatFullDate(s.fields.date || ''))}</div>` +
        `<div class="rdv-pr">Disponible — cliquer pour réserver</div>` +
      `</div>` +
      `<button class="slot-del-btn" data-del-id="${escHtml(s.id)}" title="Supprimer">🗑</button>` +
    `</div>`
  ).join('');
  body.querySelectorAll('.slot-book-area').forEach(el =>
    el.addEventListener('click', () => openSlotDetail(el.dataset.slotId))
  );
  body.querySelectorAll('.slot-del-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteSlot(btn.dataset.delId))
  );
}

// ── Info page ──────────────────────────────────────────────────────────────

function openInfoPage() {
  renderInfoPage();
  document.getElementById('infoOv').classList.remove('hidden');
}

function closeInfoPage() {
  document.getElementById('infoOv').classList.add('hidden');
  clearActiveTab();
}

function renderInfoPage() {
  // RDV column
  const rdvBody = document.getElementById('infoRdvBody');
  if (!appointments.length) {
    rdvBody.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucun RDV.</div>';
  } else {
    rdvBody.innerHTML = appointments
      .slice().sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure))
      .map(a =>
        `<div class="rdv-card" data-id="${escHtml(a.id)}">` +
          `<div class="rdv-badge">${escHtml(a.heure)}</div>` +
          `<div class="rdv-info">` +
            `<div class="rdv-nm">${escHtml(a.prenom)} ${escHtml(a.nom)}</div>` +
            `<div class="rdv-pr">${escHtml(formatFullDate(a.date))}</div>` +
          `</div></div>`
      ).join('');
    rdvBody.querySelectorAll('.rdv-card').forEach(card =>
      card.addEventListener('click', () => { closeInfoPage(); openDetail(card.dataset.id); })
    );
  }

  // Demandes column
  const demBody = document.getElementById('infoDemBody');
  if (!pendingRequests.length) {
    demBody.innerHTML = '<div class="empty-st"><div class="empty-ico">🌸</div>Aucune demande.</div>';
  } else {
    demBody.innerHTML = pendingRequests.map(r => {
      const prests = [...(r.prestations || [])];
      if (r.bijoux) prests.push('💎 Bijoux');
      const canAct = r.statut_interne === 'en_attente_validation';
      return `
        <div class="sb-dem-card">
          <div class="sb-dem-name">${escHtml(r.prenom)} ${escHtml(r.nom)}</div>
          <div class="sb-dem-meta">📅 ${escHtml(formatFullDate(r.date))} · ${escHtml(r.heure)}</div>
          <div class="sb-dem-prests">
            ${prests.map(p => `<span class="sb-dem-prest">${escHtml(p)}</span>`).join('')}
          </div>
          ${r.remarque ? `<div class="sb-dem-rem">📝 ${escHtml(r.remarque)}</div>` : ''}
          ${canAct ? `<div class="sb-dem-actions">
            <button class="btn bdd info-dem-refuse" data-id="${escHtml(r.id)}">✕</button>
            <button class="btn bp  info-dem-accept" data-id="${escHtml(r.id)}">✓ Valider</button>
          </div>` : '<div class="sb-dem-waiting">⏳ En attente du formulaire</div>'}
        </div>`;
    }).join('');
    demBody.querySelectorAll('.info-dem-accept').forEach(btn =>
      btn.addEventListener('click', () => acceptRequest(btn.dataset.id))
    );
    demBody.querySelectorAll('.info-dem-refuse').forEach(btn =>
      btn.addEventListener('click', () => refuseRequest(btn.dataset.id))
    );
  }

  // Créneaux column
  const creBody = document.getElementById('infoCreBody');
  if (!slots.length) {
    creBody.innerHTML = '<div class="empty-st"><div class="empty-ico">📅</div>Aucun créneau.</div>';
  } else {
    creBody.innerHTML = slots.map(s =>
      `<div class="rdv-card rdv-card-slot">` +
        `<div class="rdv-badge rdv-badge-slot">${escHtml(s.fields.heure || '')}</div>` +
        `<div class="rdv-info slot-book-area" data-slot-id="${escHtml(s.id)}">` +
          `<div class="rdv-nm">${escHtml(formatFullDate(s.fields.date || ''))}</div>` +
        `</div>` +
        `<button class="slot-del-btn" data-del-id="${escHtml(s.id)}" title="Supprimer">🗑</button>` +
      `</div>`
    ).join('');
    creBody.querySelectorAll('.slot-book-area').forEach(el =>
      el.addEventListener('click', () => { closeInfoPage(); openSlotDetail(el.dataset.slotId); })
    );
    creBody.querySelectorAll('.slot-del-btn').forEach(btn =>
      btn.addEventListener('click', () => deleteSlot(btn.dataset.delId))
    );
  }

  // Badge demandes
  const toValidate = pendingRequests.filter(r => r.statut_interne === 'en_attente_validation').length;
  const badge = document.getElementById('infoBadge');
  badge.textContent = toValidate;
  badge.classList.toggle('hidden', toValidate === 0);
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
    notifyOtherTab();
    toast('RDV validé ✓', req.prenom + ' ' + req.nom + ' — ' + req.date + ' à ' + req.heure);
  } catch (e) {
    toast('Erreur', e.message);
  }
}

async function refuseRequest(id) {
  const req = pendingRequests.find(r => r.id === id);
  if (!req) return;

  if (refuseConfirmId !== id) {
    refuseConfirmId = id;
    document.querySelectorAll('.sb-dem-refuse, .info-dem-refuse').forEach(btn => {
      if (btn.dataset.id === id) {
        btn.textContent = '⚠️ Confirmer ?';
        btn.classList.replace('bdd', 'bd2');
      }
    });
    setTimeout(() => {
      refuseConfirmId = null;
      if (activeTab && activeTab !== 'infos') renderSidebarCont();
      if (!document.getElementById('infoOv').classList.contains('hidden')) renderInfoPage();
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
    notifyOtherTab();
    toast('Demande refusée', req.prenom + ' ' + req.nom);
  } catch (e) {
    toast('Erreur', e.message);
  }
}

// ── Cancel appointment ─────────────────────────────────────────────────────

async function cancelAppointment(id) {
  const appt = appointments.find(a => a.id === id);
  if (!appt) return;

  try {
    toast('Annulation…', 'Mise à jour en cours');
    const res = await fetch('/api/rdv', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        action:             'cancel',
        airtable_record_id: appt.id,
        creneau_id:         appt.creneau_id,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await loadData();
    notifyOtherTab();
    toast('RDV annulé', appt.prenom + ' ' + appt.nom);

    // Ouvre WhatsApp avec un message pré-rédigé pour informer la cliente
    if (appt.telephone_client) {
      const tel = appt.telephone_client.replace(/\s+/g, '');
      const msg = encodeURIComponent(
        `Bonjour ${appt.prenom} 💅\n` +
        `Je suis au regret de vous informer que votre rendez-vous du ${formatFullDate(appt.date)} à ${appt.heure} a dû être annulé.\n` +
        `N'hésitez pas à reprendre un créneau. À bientôt ! 🌸`
      );
      window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
    }
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

// ── Event listeners — navigation ───────────────────────────────────────────

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

// ── Event listeners — hamburger + sidebar ──────────────────────────────────

document.getElementById('hamBtn').addEventListener('click', toggleSidebar);

document.querySelectorAll('.sbnav-btn').forEach(btn =>
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab))
);

document.getElementById('sbnAddSlot').addEventListener('click', e => { e.stopPropagation(); openSlotForm(); });
document.getElementById('sbnAddRdv').addEventListener('click',  e => { e.stopPropagation(); openManualForm(); });
document.getElementById('sbContBack').addEventListener('click', clearActiveTab);

// ── Event listeners — detail modal ─────────────────────────────────────────

document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('dov').addEventListener('click', e => { if (e.target.id === 'dov') closeDetail(); });

// ── Event listeners — info page ────────────────────────────────────────────

document.getElementById('closeInfo').addEventListener('click', closeInfoPage);
document.getElementById('infoOv').addEventListener('click', e => { if (e.target.id === 'infoOv') closeInfoPage(); });
document.getElementById('infoAddRdv').addEventListener('click', () => { closeInfoPage(); openManualForm(); });
document.getElementById('infoAddSlot').addEventListener('click', () => { closeInfoPage(); openSlotForm(); });

// ── Event listeners — keyboard ─────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDetail(); closeSlotForm(); closeManualForm(); closeInfoPage(); clearActiveTab(); }
});

// ── Manual booking form ────────────────────────────────────────────────────

const PRESTS_TAILLE = ['Pose simple', 'Nail art', 'Freestyle chargée'];
const PRESTS_EXCLU  = new Set(['Pose simple', 'Nail art', 'Freestyle chargée']);

let selectedSlot        = null;
let selectedTaille      = null;
let selectedPrestations = new Set();

function openManualForm() {
  ['mPrenom','mNom','mTel','mNotes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('mAge').value  = '';
  document.getElementById('mDate').value = '';
  document.getElementById('mBijoux').checked = false;
  const errEl = document.getElementById('manErr');
  errEl.textContent = ''; errEl.style.display = 'none';

  selectedSlot = null; selectedTaille = null; selectedPrestations = new Set();
  pendingSlotId = null;

  document.getElementById('slotsSection').classList.add('hidden');
  document.getElementById('slotsLoading').classList.add('hidden');
  document.getElementById('slotsEmpty').classList.add('hidden');
  document.getElementById('tailleSection').classList.add('hidden');
  document.getElementById('slotsGrid').innerHTML = '';
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

document.querySelectorAll('.popt').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.v;
    if (selectedPrestations.has(v)) {
      selectedPrestations.delete(v); btn.classList.remove('on');
    } else {
      if (PRESTS_EXCLU.has(v)) {
        PRESTS_EXCLU.forEach(excl => {
          if (excl !== v && selectedPrestations.has(excl)) {
            selectedPrestations.delete(excl);
            document.querySelector(`.popt[data-v="${excl}"]`).classList.remove('on');
          }
        });
      }
      selectedPrestations.add(v); btn.classList.add('on');
    }
    const showTaille = [...selectedPrestations].some(p => PRESTS_TAILLE.includes(p));
    document.getElementById('tailleSection').classList.toggle('hidden', !showTaille);
    if (!showTaille) { selectedTaille = null; document.querySelectorAll('.taille-opt').forEach(b => b.classList.remove('on')); }
  });
});

document.querySelectorAll('.taille-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.taille-opt').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    selectedTaille = btn.dataset.v;
  });
});

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

  if (errMsg) { errEl.textContent = errMsg; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  const btn = document.getElementById('saveManBtn');
  btn.disabled = true; btn.textContent = '⏳ Enregistrement…';

  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prenom, nom, telephone, age, prestation, bijoux, taille_ongles: selectedTaille || '', notes, creneau_id: selectedSlot }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');

    closeManualForm();
    await loadData();
    notifyOtherTab();
    selectedDate = data.dateRdv;
    render();
    toast('RDV ajouté ✓', prenom + ' ' + nom + ' — ' + data.dateRdv + ' à ' + data.heureRdv);
  } catch (e) {
    errEl.textContent = '⚠️ Erreur : ' + e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '💾 Enregistrer';
  }
});

document.getElementById('cancelManBtn').addEventListener('click', closeManualForm);
document.getElementById('closeMan').addEventListener('click', closeManualForm);
document.getElementById('manOv').addEventListener('click', e => { if (e.target.id === 'manOv') closeManualForm(); });

// ── Slot creation form ─────────────────────────────────────────────────────

function openSlotForm() {
  document.getElementById('sDate').value = '';
  document.getElementById('sHeure').value = '';
  const errEl = document.getElementById('slotErr');
  errEl.textContent = ''; errEl.style.display = 'none';
  document.getElementById('sDate').min = todayDateString();
  document.getElementById('slotOv').classList.remove('hidden');
  setTimeout(() => document.getElementById('sDate').focus(), 80);
}

function closeSlotForm() {
  document.getElementById('slotOv').classList.add('hidden');
}

document.getElementById('closeSlot').addEventListener('click', closeSlotForm);
document.getElementById('cancelSlotBtn').addEventListener('click', closeSlotForm);
document.getElementById('slotOv').addEventListener('click', e => { if (e.target.id === 'slotOv') closeSlotForm(); });

document.getElementById('saveSlotBtn').addEventListener('click', async () => {
  const date  = document.getElementById('sDate').value;
  const heure = document.getElementById('sHeure').value;
  const errEl = document.getElementById('slotErr');

  if (!date || !heure) { errEl.textContent = 'Date et heure sont obligatoires.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  const btn = document.getElementById('saveSlotBtn');
  btn.disabled = true; btn.textContent = '⏳ Enregistrement…';

  try {
    const res = await fetch('/api/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, heure }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');

    closeSlotForm();
    await loadData();
    notifyOtherTab();
    selectedDate = date;
    render();
    toast('Créneau ajouté ✓', formatFullDate(date) + ' à ' + heure);
  } catch (e) {
    errEl.textContent = '⚠️ Erreur : ' + e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '💾 Enregistrer';
  }
});

// ── Delete slot ────────────────────────────────────────────────────────────

async function deleteSlot(id) {
  if (deleteConfirmId !== id) {
    deleteConfirmId = id;
    document.querySelectorAll(`.slot-del-btn[data-del-id="${id}"]`).forEach(btn => {
      btn.textContent = '⚠️';
      btn.title = 'Confirmer la suppression';
    });
    setTimeout(() => {
      deleteConfirmId = null;
      if (activeTab === 'creneaux') renderSbCreneaux();
      if (!document.getElementById('infoOv').classList.contains('hidden')) renderInfoPage();
    }, 3000);
    return;
  }

  deleteConfirmId = null;
  try {
    const res = await fetch(`/api/slots?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await loadData();
    notifyOtherTab();
    toast('Créneau supprimé', 'Le créneau a été retiré.');
  } catch (e) {
    toast('Erreur', e.message);
  }
}

// ── Cross-tab sync ─────────────────────────────────────────────────────────

const _sync = 'BroadcastChannel' in window ? new BroadcastChannel('make_urnails_sync') : null;
function notifyOtherTab() { _sync?.postMessage({ type: 'refresh' }); }
if (_sync) { _sync.onmessage = () => loadData(); }

// ── Init ───────────────────────────────────────────────────────────────────

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

loadData();

let _refreshTimer = null;

function startRefresh() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(loadData, 15_000);
}

function stopRefresh() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

startRefresh();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRefresh();
  } else {
    loadData();
    startRefresh();
  }
});

window.addEventListener('online', () => {
  loadData();
  startRefresh();
});
