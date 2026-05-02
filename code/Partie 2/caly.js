'use strict';

/* ── CONSTANTS ─────────────────────────────────────────────────────────────── */
const DAYS   = ['LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.', 'DIM.'];
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const PRESTATIONS_TAILLE = ['Pose simple', 'Nail art', 'Freestyle chargée'];
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB
const POLL_INTERVAL  = 30_000;          // 30 s

/* ── STATE ─────────────────────────────────────────────────────────────────── */
const st = {
  slots:        [],
  current:      new Date(),   // displayed month
  selectedDate: null,         // 'YYYY-MM-DD'
  selectedSlot: null,         // slot object
  step:         1,
  prestation:   '',
  taille:       '',
  photoOngles:  null,         // File
  photoModele:  null,         // File | null
  timeFormat:   24,
  myBooking:    null,         // object from localStorage
  pollTimer:    null,
};

/* ── UTILS ─────────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function fmtHeure(heure) {
  if (!heure || st.timeFormat === 24) return heure;
  const [h, min] = heure.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(min).padStart(2,'0')} ${ampm}`;
}

function showToast(title, body, duration = 3500) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<div class="tt">${esc(title)}</div><div class="tb">${esc(body)}</div>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

/* ── AIRTABLE / API ────────────────────────────────────────────────────────── */
async function fetchSlots() {
  try {
    const res  = await fetch('/api/slots');
    const data = await res.json();
    st.slots   = data.slots || [];
  } catch {
    showToast('Erreur', 'Impossible de charger les créneaux.');
  }
  renderCalendar();
  if (st.selectedDate) renderSlots(st.selectedDate);
}

/* ── CALENDAR ──────────────────────────────────────────────────────────────── */
function slotsOnDate(dateStr) {
  return st.slots.filter(s => s.date === dateStr);
}

function renderCalendar() {
  const y = st.current.getFullYear();
  const m = st.current.getMonth();

  // Calendar sub-header: "Mai 2026"
  document.getElementById('period').textContent =
    `${MONTHS[m].charAt(0).toUpperCase() + MONTHS[m].slice(1)} ${y}`;

  // Day-of-week headers
  document.getElementById('mrowH').innerHTML =
    DAYS.map(d => `<div class="mhc">${d}</div>`).join('');

  // Build cell list
  const first    = new Date(y, m, 1);
  const last     = new Date(y, m + 1, 0);
  const startDow = (first.getDay() + 6) % 7; // Mon=0, Sun=6
  const today    = toDateStr(new Date());

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ out: true });
  for (let d = 1; d <= last.getDate(); d++) {
    const dateStr  = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow      = new Date(y, m, d).getDay(); // 0=Sun
    const isSun    = dow === 0;
    const daySlots = slotsOnDate(dateStr);
    const hasDispo   = daySlots.some(s => s.statut === 'disponible');
    const hasWaiting = daySlots.some(s => s.statut === 'en_attente');
    cells.push({ out: false, d, dateStr, isSun, hasDispo, hasWaiting });
  }

  const mbody = document.getElementById('mbody');
  mbody.innerHTML = cells.map(c => {
    if (c.out) return `<div class="mc out"></div>`;

    const cls = [
      'mc',
      c.isSun ? 'sun' : 'inmonth',
      (c.hasDispo || c.hasWaiting) ? 'avail' : '',
      c.dateStr === st.selectedDate ? 'sel' : '',
      c.dateStr === today ? 'tod' : '',
    ].filter(Boolean).join(' ');

    const dots = [
      c.hasDispo   ? `<div class="mc-dot dispo"></div>`   : '',
      c.hasWaiting ? `<div class="mc-dot attente"></div>` : '',
    ].join('');

    return `<div class="${cls}" data-date="${c.dateStr}">
      <div class="dn">${c.d}</div>
      <div class="mc-dots">${dots}</div>
    </div>`;
  }).join('');

  mbody.querySelectorAll('.mc.avail').forEach(cell => {
    cell.addEventListener('click', () => selectDate(cell.dataset.date));
  });
}

function selectDate(dateStr) {
  st.selectedDate = dateStr;
  renderCalendar();
  renderSlots(dateStr);

  // Scroll slots panel into view on mobile
  if (window.innerWidth <= 768) {
    document.querySelector('.slots-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ── SLOTS PANEL ───────────────────────────────────────────────────────────── */
const DAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function fmtDateShort(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DAY_SHORT[dow]} ${String(d).padStart(2, '0')}`;
}

function renderSlots(dateStr) {
  const spDate = document.getElementById('spDate');
  const spList = document.getElementById('spList');
  const daySlots = slotsOnDate(dateStr).sort((a, b) => a.heure.localeCompare(b.heure));

  spDate.innerHTML = `<span>${fmtDate(dateStr)}</span>`;

  if (daySlots.length === 0) {
    spList.innerHTML = `<div class="sp-empty">
      <div class="sp-empty-ico">🚫</div>
      Aucun créneau<br>pour cette date
    </div>`;
    return;
  }

  spList.innerHTML = daySlots.map(s => {
    const dotCls  = s.statut === 'disponible' ? 'dispo'
                  : s.statut === 'en_attente'  ? 'attente'
                  : 'indispo';
    const lbl     = s.statut === 'disponible' ? 'Disponible'
                  : s.statut === 'en_attente'  ? 'En attente de confirmation'
                  : 'Indisponible';
    const disabled = s.statut !== 'disponible' ? 'disabled' : '';
    return `<button class="slot-btn" data-id="${s.id}" ${disabled}>
      <div class="slot-dot ${dotCls}"></div>
      <div>
        <div class="slot-time">${esc(fmtHeure(s.heure))}</div>
        <div class="slot-label">${lbl}</div>
      </div>
    </button>`;
  }).join('');

  spList.querySelectorAll('.slot-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = st.slots.find(s => s.id === btn.dataset.id);
      if (slot) openForm(slot);
    });
  });
}

/* ── BOOKING FORM ──────────────────────────────────────────────────────────── */
function openForm(slot) {
  if (st.myBooking) {
    showToast('Déjà un RDV', 'Annulez votre demande actuelle avant d\'en faire une nouvelle.');
    return;
  }
  st.selectedSlot = slot;
  st.step        = 1;
  st.prestation  = '';
  st.taille      = '';
  st.photoOngles = null;
  st.photoModele = null;

  document.getElementById('formTitle').textContent =
    `${fmtDate(slot.date)} — ${fmtHeure(slot.heure)}`;

  // Reset fields
  ['prenom','nom','telephone'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('age').value = '';
  document.getElementById('bijoux').checked = false;
  document.querySelectorAll('.popt').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.topt').forEach(t => t.classList.remove('on'));
  document.getElementById('tailleSection').classList.add('hidden');
  document.getElementById('previewOngles').innerHTML = '';
  document.getElementById('previewModele').innerHTML  = '';
  document.querySelectorAll('.ferr').forEach(e => e.classList.add('hidden'));

  renderStep();
  document.getElementById('formOv').classList.remove('hidden');
}

function renderStep() {
  const steps = ['step1','step2','step3','step4'];
  steps.forEach((id, i) => {
    document.getElementById(id).classList.toggle('hidden', i + 1 !== st.step);
  });

  // Pips
  ['pip1','pip2','pip3','pip4'].forEach((id, i) => {
    const pip = document.getElementById(id);
    pip.className = 'step-pip ' + (i + 1 < st.step ? 'done' : i + 1 === st.step ? 'active' : '');
  });

  const labels = [
    'Étape 1 sur 4 — Vos coordonnées',
    'Étape 2 sur 4 — Prestation',
    'Étape 3 sur 4 — Photos',
    'Étape 4 sur 4 — Récapitulatif',
  ];
  document.getElementById('stepLbl').textContent = labels[st.step - 1];

  document.getElementById('btnPrev').classList.toggle('hidden', st.step === 1);

  const next = document.getElementById('btnNext');
  next.textContent = st.step === 4 ? 'Envoyer ma demande ✓' : 'Suivant →';
  next.disabled    = false;

  if (st.step === 4) buildRecap();
}

function buildRecap() {
  const s = st.selectedSlot;
  document.getElementById('recapSlot').innerHTML = `
    <div class="rs-ico">📅</div>
    <div>
      <div class="rs-date">${fmtDate(s.date)}</div>
      <div class="rs-heure">${fmtHeure(s.heure)}</div>
    </div>`;

  const prenom    = document.getElementById('prenom').value.trim();
  const nom       = document.getElementById('nom').value.trim();
  const age       = document.getElementById('age').value.trim();
  const tel       = document.getElementById('telephone').value.trim();
  const bijoux    = document.getElementById('bijoux').checked ? 'Oui' : 'Non';
  const taille    = st.taille || '—';
  const onglesNm  = st.photoOngles?.name || '—';
  const modeleNm  = st.photoModele?.name || '—';

  const rows = [
    ['Client',     `${prenom} ${nom}`],
    ['Âge',        age],
    ['Téléphone',  tel],
    ['Prestation', st.prestation],
    ...(PRESTATIONS_TAILLE.includes(st.prestation) ? [['Taille', taille]] : []),
    ['Bijoux',     bijoux],
    ['Ongles',     onglesNm],
    ['Modèle',     modeleNm],
  ];

  document.getElementById('recapRows').innerHTML = rows.map(([lbl, val]) =>
    `<div class="recap-row"><div class="recap-lbl">${lbl}</div><div class="recap-val">${esc(val)}</div></div>`
  ).join('');
}

function validateStep() {
  const errEl = document.getElementById(`err${st.step}`);
  const show = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); return false; };
  errEl.classList.add('hidden');

  if (st.step === 1) {
    const prenom = document.getElementById('prenom').value.trim();
    const nom    = document.getElementById('nom').value.trim();
    const age    = parseInt(document.getElementById('age').value);
    const tel    = document.getElementById('telephone').value.trim();
    if (!prenom) return show('Le prénom est obligatoire.');
    if (!nom)    return show('Le nom est obligatoire.');
    if (!tel)    return show('Le numéro de téléphone est obligatoire.');
    if (!age || age < 1 || age > 120) return show('Veuillez entrer un âge valide.');
    if (age < 18) return show('Les réservations sont réservées aux personnes majeures (18 ans et plus).');
  }

  if (st.step === 2) {
    if (!st.prestation) return show('Veuillez choisir une prestation.');
    if (PRESTATIONS_TAILLE.includes(st.prestation) && !st.taille)
      return show('Veuillez choisir une taille d\'ongle pour cette prestation.');
  }

  if (st.step === 3) {
    if (!st.photoOngles) return show('La photo de vos ongles naturels est obligatoire.');
  }

  return true;
}

async function submitBooking() {
  const btn = document.getElementById('btnNext');
  btn.disabled    = true;
  btn.textContent = 'Envoi en cours…';

  try {
    const slot = st.selectedSlot;
    const body = {
      slot_id:    slot.id,
      prenom:     document.getElementById('prenom').value.trim(),
      nom:        document.getElementById('nom').value.trim(),
      age:        parseInt(document.getElementById('age').value),
      telephone:  document.getElementById('telephone').value.trim(),
      prestation: st.prestation,
      taille_ongles: st.taille || '',
      bijoux:     document.getElementById('bijoux').checked,
    };

    // Encode photos as base64
    const encodeFile = f => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const b64 = e.target.result.split(',')[1];
        resolve({ base64: b64, type: f.type, name: f.name });
      };
      reader.readAsDataURL(f);
    });

    const onglesData         = await encodeFile(st.photoOngles);
    body.photo_ongles        = onglesData.base64;
    body.photo_ongles_type   = onglesData.type;
    body.photo_ongles_name   = onglesData.name;

    if (st.photoModele) {
      const modData          = await encodeFile(st.photoModele);
      body.photo_modele      = modData.base64;
      body.photo_modele_type = modData.type;
      body.photo_modele_name = modData.name;
    }

    const res  = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.cancelled) {
      document.getElementById('err4').textContent =
        'Votre demande a été annulée automatiquement car vous devez être majeur(e).';
      document.getElementById('err4').classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = 'Envoyer ma demande ✓';
      return;
    }

    if (!data.success) throw new Error(data.error || 'Erreur serveur');

    // Save to localStorage
    const booking = {
      record_id:  data.record_id,
      slot_id:    data.slot_id,
      date:       slot.date,
      heure:      slot.heure,
      prestation: st.prestation,
      statut:     'en_attente',
      prenom:     document.getElementById('prenom').value.trim(),
    };
    localStorage.setItem('caly_booking', JSON.stringify(booking));
    st.myBooking = booking;

    // Update slot in local state immediately
    const localSlot = st.slots.find(s => s.id === slot.id);
    if (localSlot) localSlot.statut = 'en_attente';

    document.getElementById('formOv').classList.add('hidden');
    document.getElementById('successOv').classList.remove('hidden');
    renderMyBooking();
    renderCalendar();
    if (st.selectedDate) renderSlots(st.selectedDate);
    startPolling(data.record_id);

  } catch (e) {
    document.getElementById('err4').textContent = 'Une erreur est survenue. Veuillez réessayer.';
    document.getElementById('err4').classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Envoyer ma demande ✓';
  }
}

/* ── MY BOOKING BANNER ─────────────────────────────────────────────────────── */
function renderMyBooking() {
  const bk = st.myBooking;
  if (!bk) {
    document.getElementById('myBooking').classList.add('hidden');
    return;
  }

  const dot = document.getElementById('mbDot');
  const lbl = document.getElementById('mbStatus');
  dot.className = `mb-dot ${bk.statut}`;

  const statusMap = {
    en_attente: 'En attente de confirmation',
    accepte:    'Rendez-vous confirmé ✓',
    refuse:     'Demande refusée',
    annule:     'Annulé',
  };
  lbl.textContent = statusMap[bk.statut] || bk.statut;

  document.getElementById('mbInfo').textContent =
    `${fmtDate(bk.date)} à ${fmtHeure(bk.heure)} — ${bk.prestation}`;

  document.getElementById('myBooking').classList.remove('hidden');
}

/* ── POLLING ───────────────────────────────────────────────────────────────── */
function startPolling(recordId) {
  if (st.pollTimer) clearInterval(st.pollTimer);
  st.pollTimer = setInterval(() => pollStatus(recordId), POLL_INTERVAL);
}

async function pollStatus(recordId) {
  try {
    const res  = await fetch(`/api/book?id=${recordId}`);
    const data = await res.json();
    if (!data.statut || !st.myBooking) return;

    const prev = st.myBooking.statut;
    if (data.statut === prev) return;

    st.myBooking.statut = data.statut;
    localStorage.setItem('caly_booking', JSON.stringify(st.myBooking));
    renderMyBooking();

    if (data.statut === 'accepte') {
      showToast('Rendez-vous confirmé !', 'Votre demande a été acceptée. À bientôt !', 6000);
    } else if (data.statut === 'refuse') {
      showToast('Demande refusée', 'Le créneau n\'est plus disponible pour votre demande.', 6000);
      clearInterval(st.pollTimer);
      // Refetch slots so the slot becomes available again
      await fetchSlots();
    }
  } catch { /* silently ignore polling errors */ }
}

/* ── CANCEL BOOKING ────────────────────────────────────────────────────────── */
async function cancelBooking() {
  const bk  = st.myBooking;
  if (!bk) return;

  const btn = document.getElementById('confirmCancelBtn');
  btn.disabled    = true;
  btn.textContent = 'Annulation…';

  try {
    const res  = await fetch(`/api/book?record_id=${bk.record_id}&slot_id=${bk.slot_id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!data.success) throw new Error();

    localStorage.removeItem('caly_booking');
    st.myBooking = null;
    if (st.pollTimer) { clearInterval(st.pollTimer); st.pollTimer = null; }

    document.getElementById('cancelOv').classList.add('hidden');
    renderMyBooking();
    await fetchSlots();
    showToast('Demande annulée', 'Votre demande a bien été supprimée.');

  } catch {
    btn.disabled    = false;
    btn.textContent = 'Oui, annuler';
    showToast('Erreur', 'Impossible d\'annuler. Veuillez réessayer.');
  }
}

/* ── FILE UPLOAD HELPERS ───────────────────────────────────────────────────── */
function buildFileZone(zoneId, inputId, previewId, required) {
  const zone    = document.getElementById(zoneId);
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);

  const handle = file => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      showToast('Fichier trop lourd', `Maximum 4 Mo. Ce fichier fait ${(file.size/1024/1024).toFixed(1)} Mo.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Format invalide', 'Seules les images sont acceptées.');
      return;
    }
    if (inputId === 'fileOngles')  st.photoOngles = file;
    if (inputId === 'fileModele')  st.photoModele = file;

    const url = URL.createObjectURL(file);
    preview.innerHTML = `
      <div class="file-preview">
        <img class="fp-thumb" src="${url}" alt="">
        <div class="fp-name">${esc(file.name)}</div>
        <button class="fp-rm" data-zone="${zoneId}">✕</button>
      </div>`;
    zone.style.display = 'none';

    preview.querySelector('.fp-rm').addEventListener('click', () => {
      if (inputId === 'fileOngles') st.photoOngles = null;
      if (inputId === 'fileModele') st.photoModele = null;
      input.value = '';
      preview.innerHTML = '';
      zone.style.display = '';
    });
  };

  input.addEventListener('change', () => handle(input.files[0]));

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag');
    handle(e.dataTransfer.files[0]);
  });
}

/* ── INIT ──────────────────────────────────────────────────────────────────── */
function init() {
  // Build file zones
  buildFileZone('zoneOngles', 'fileOngles', 'previewOngles', true);
  buildFileZone('zoneModele', 'fileModele', 'previewModele', false);

  // Load booking from localStorage
  const saved = localStorage.getItem('caly_booking');
  if (saved) {
    try {
      st.myBooking = JSON.parse(saved);
      renderMyBooking();
      if (['en_attente', 'accepte'].includes(st.myBooking.statut)) {
        startPolling(st.myBooking.record_id);
      }
    } catch {
      localStorage.removeItem('caly_booking');
    }
  }

  // Render calendar immediately (without slots), then fetch slots
  renderCalendar();
  fetchSlots();

  // Nav
  document.getElementById('prev').addEventListener('click', () => {
    st.current = new Date(st.current.getFullYear(), st.current.getMonth() - 1, 1);
    st.selectedDate = null;
    renderCalendar();
    document.getElementById('spDate').innerHTML = '<span>—</span>';
    document.getElementById('spList').innerHTML =
      '<div class="sp-empty"><div class="sp-empty-ico">📅</div>Sélectionnez une date<br>pour voir les créneaux</div>';
  });

  document.getElementById('next').addEventListener('click', () => {
    st.current = new Date(st.current.getFullYear(), st.current.getMonth() + 1, 1);
    st.selectedDate = null;
    renderCalendar();
    document.getElementById('spDate').innerHTML = '<span>—</span>';
    document.getElementById('spList').innerHTML =
      '<div class="sp-empty"><div class="sp-empty-ico">📅</div>Sélectionnez une date<br>pour voir les créneaux</div>';
  });

  // Form navigation
  document.getElementById('btnNext').addEventListener('click', async () => {
    if (st.step < 4) {
      if (!validateStep()) return;
      st.step++;
      renderStep();
    } else {
      await submitBooking();
    }
  });

  document.getElementById('btnPrev').addEventListener('click', () => {
    if (st.step > 1) { st.step--; renderStep(); }
  });

  document.getElementById('closeForm').addEventListener('click', () => {
    document.getElementById('formOv').classList.add('hidden');
  });

  // Prestation picker
  document.querySelectorAll('.popt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.popt').forEach(p => p.classList.remove('on'));
      opt.classList.add('on');
      st.prestation = opt.dataset.val;

      const showTaille = PRESTATIONS_TAILLE.includes(st.prestation);
      document.getElementById('tailleSection').classList.toggle('hidden', !showTaille);
      if (!showTaille) {
        st.taille = '';
        document.querySelectorAll('.topt').forEach(t => t.classList.remove('on'));
      }
    });
  });

  // Taille picker
  document.querySelectorAll('.topt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.topt').forEach(t => t.classList.remove('on'));
      opt.classList.add('on');
      st.taille = opt.dataset.val;
    });
  });

  // Success modal
  document.getElementById('closeSuccess').addEventListener('click', () => {
    document.getElementById('successOv').classList.add('hidden');
  });
  document.getElementById('closeSucBtn').addEventListener('click', () => {
    document.getElementById('successOv').classList.add('hidden');
  });

  // My booking cancel
  document.getElementById('mbCancelBtn').addEventListener('click', () => {
    document.getElementById('cancelOv').classList.remove('hidden');
  });

  // Cancel confirm modal
  document.getElementById('closeCancelX').addEventListener('click', () => {
    document.getElementById('cancelOv').classList.add('hidden');
  });
  document.getElementById('closeCancelBtn').addEventListener('click', () => {
    document.getElementById('cancelOv').classList.add('hidden');
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', cancelBooking);
}

document.addEventListener('DOMContentLoaded', init);
