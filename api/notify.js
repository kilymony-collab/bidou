// Vercel Serverless Function — Notifications ntfy.sh
// Variables d'environnement nécessaires :
//   AIRTABLE_API_KEY — Personal Access Token
//   AIRTABLE_BASE_ID — ID de la base
//   NTFY_TOPIC       — Nom du topic ntfy.sh (ex: make-urnails-abc123)
//   NTFY_URL         — (optionnel) URL ntfy, défaut https://ntfy.sh

const BOOKINGS_TABLE = 'tblXe7OerG4Dyhibe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ntfyTopic = process.env.NTFY_TOPIC;
  const ntfyBase  = (process.env.NTFY_URL || 'https://ntfy.sh').replace(/\/$/, '');

  if (!ntfyTopic) {
    return res.status(500).json({ error: 'NTFY_TOPIC non configuré.' });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '?';
    const d       = new Date(dateStr + 'T12:00:00Z');
    const days    = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const pad2    = n => String(n).padStart(2, '0');
    return `${days[d.getUTCDay()]} ${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  async function push(title, message, priority = 'default') {
    return fetch(`${ntfyBase}/${ntfyTopic}`, {
      method:  'POST',
      headers: {
        'Title':    title,
        'Priority': priority,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: message,
    });
  }

  // ── GET : appelé par le cron Vercel à minuit UTC (= 20h Guadeloupe) ─────
  // Envoie les RDV du lendemain (date UTC courante = lendemain heure locale)
  if (req.method === 'GET') {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      return res.status(500).json({ error: 'Variables Airtable manquantes.' });
    }

    // À minuit UTC, la date UTC est déjà "demain" en heure locale (UTC-4)
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const formula = encodeURIComponent(
      `AND(IS_SAME({date_rdv},'${dateStr}','day'),{statut_interne}='accepte')`
    );
    const url = `https://api.airtable.com/v0/${baseId}/${BOOKINGS_TABLE}?filterByFormula=${formula}&sort[0][field]=heure_rdv&sort[0][direction]=asc`;

    try {
      const r = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!r.ok) {
        const err = await r.text();
        return res.status(500).json({ error: err });
      }
      const data    = await r.json();
      const records = data.records || [];

      if (!records.length) {
        return res.status(200).json({ ok: true, count: 0 });
      }

      // Formater la date pour le titre
      const d        = new Date(dateStr + 'T12:00:00Z');
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const mthNames = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
      const dateLabel = `${dayNames[d.getUTCDay()]} ${d.getUTCDate()} ${mthNames[d.getUTCMonth()]}`;

      const lines = records.map(rec => {
        const f = rec.fields;
        return `• ${f.heure_rdv || '??:??'} — ${f.prenom_client || ''} ${f.nom_client || ''} (${f.prestation || ''})`;
      }).join('\n');

      await push(
        `💅 ${records.length} RDV demain — ${dateLabel}`,
        lines,
        'default'
      );
      return res.status(200).json({ ok: true, count: records.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : nouvelle demande ou annulation ────────────────────────────────
  if (req.method === 'POST') {
    const b = req.body || {};

    // Accepte les deux formats : champs courts (frontend) ou noms Airtable (automation)
    const type       = b.type        || 'new';
    const prenom     = b.prenom      || b.prenom_client  || '';
    const nom        = b.nom         || b.nom_client     || '';
    const date       = b.date        || b.date_rdv       || '';
    const heure      = b.heure       || b.heure_rdv      || '';
    const prestation = b.prestation  || '';

    if (!prenom && !nom) {
      return res.status(400).json({ error: 'Données manquantes.' });
    }

    const message = [
      `${prenom} ${nom}`.trim(),
      `📅 ${formatDate(date)} à ${heure || '?'}`,
      `💅 ${prestation || '?'}`,
    ].join('\n');

    try {
      if (type === 'cancel') {
        await push('🚫 RDV annulé', message, 'high');
      } else {
        await push('📋 Nouvelle demande de RDV', message, 'high');
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
