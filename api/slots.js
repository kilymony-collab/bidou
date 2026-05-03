// Vercel Serverless Function — gestion des créneaux
// Variables d'environnement nécessaires :
//   AIRTABLE_API_KEY  — Personal Access Token
//   AIRTABLE_BASE_ID  — ID de la base (appPIwjQ4rPPpmjTO)

const CRENEAUX_TABLE = 'tbl7qSvmQikr65Jmc';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return res.status(500).json({ error: 'Variables d\'environnement manquantes.' });
  }

  // ── DELETE : supprimer un créneau ────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id est obligatoire.' });

    try {
      const delRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${CRENEAUX_TABLE}/${id}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      if (!delRes.ok) {
        const err = await delRes.text();
        return res.status(500).json({ error: 'Airtable: ' + err });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : créer un nouveau créneau ──────────────────────────────────────
  if (req.method === 'POST') {
    const { date, heure } = req.body;

    if (!date || !heure) {
      return res.status(400).json({ error: 'date et heure sont obligatoires.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD attendu).' });
    }
    if (!/^\d{2}:\d{2}$/.test(heure)) {
      return res.status(400).json({ error: 'Format d\'heure invalide (HH:MM attendu).' });
    }

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    try {
      // Vérifier doublon
      const checkFormula = encodeURIComponent(`AND(IS_SAME({date},'${date}','day'),{heure}='${heure}')`);
      const checkRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${CRENEAUX_TABLE}?filterByFormula=${checkFormula}`,
        { headers }
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.records && checkData.records.length > 0) {
          return res.status(409).json({ error: 'Ce créneau existe déjà.' });
        }
      }

      // Créer le créneau
      const createRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${CRENEAUX_TABLE}`,
        {
          method: 'POST',
          headers,
          body:   JSON.stringify({ fields: { date, heure, statut: 'disponible' } }),
        }
      );

      if (!createRes.ok) {
        const err = await createRes.text();
        return res.status(500).json({ error: 'Airtable: ' + err });
      }

      const created = await createRes.json();
      return res.status(200).json({ ok: true, id: created.id, date, heure });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
