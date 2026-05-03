// Vercel Serverless Function — RDV + Créneaux
// Variables d'environnement nécessaires :
//   AIRTABLE_API_KEY  — Personal Access Token
//   AIRTABLE_BASE_ID  — ID de la base (appPIwjQ4rPPpmjTO)

const BOOKINGS_TABLE = 'tblXe7OerG4Dyhibe';
const CRENEAUX_TABLE = 'tbl7qSvmQikr65Jmc';

function atPatch(baseId, apiKey, table, recordId, fields) {
  return fetch(`https://api.airtable.com/v0/${baseId}/${table}/${recordId}`, {
    method:  'PATCH',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return res.status(500).json({ error: 'Variables d\'environnement manquantes.' });
  }

  // ── GET : récupère les bookings actifs + créneaux disponibles ────────────
  if (req.method === 'GET') {
    const bookingsFormula = encodeURIComponent(
      "OR({statut_interne}='en_attente_validation',{statut_interne}='accepte',{statut_interne}='en_attente_formulaire')"
    );
    const bookingsUrl = `https://api.airtable.com/v0/${baseId}/${BOOKINGS_TABLE}?filterByFormula=${bookingsFormula}&sort[0][field]=date_rdv&sort[0][direction]=asc&sort[1][field]=heure_rdv&sort[1][direction]=asc`;

    const creneauxFormula = encodeURIComponent("{statut}='disponible'");
    const creneauxUrl = `https://api.airtable.com/v0/${baseId}/${CRENEAUX_TABLE}?filterByFormula=${creneauxFormula}&sort[0][field]=date&sort[0][direction]=asc&sort[1][field]=heure&sort[1][direction]=asc`;

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    try {
      const [bookingsRes, creneauxRes] = await Promise.all([
        fetch(bookingsUrl, { headers }),
        fetch(creneauxUrl, { headers }),
      ]);

      if (!bookingsRes.ok) {
        const err = await bookingsRes.text();
        return res.status(bookingsRes.status).json({ error: err });
      }
      if (!creneauxRes.ok) {
        const err = await creneauxRes.text();
        return res.status(creneauxRes.status).json({ error: err });
      }

      const bookingsData  = await bookingsRes.json();
      const creneauxData  = await creneauxRes.json();

      return res.status(200).json({
        records: bookingsData.records || [],
        slots:   creneauxData.records || [],
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : accepter ou refuser une demande (PATCH direct Airtable) ────────
  if (req.method === 'POST') {
    const { action, airtable_record_id, creneau_id } = req.body;

    if (!action || !airtable_record_id) {
      return res.status(400).json({ error: 'action et airtable_record_id sont obligatoires.' });
    }

    const now = new Date().toISOString();

    try {
      if (action === 'accept') {
        const patches = [
          atPatch(baseId, apiKey, BOOKINGS_TABLE, airtable_record_id, {
            statut_interne:      'accepte',
            decision_horodatage: now,
          }),
        ];
        if (creneau_id) {
          patches.push(atPatch(baseId, apiKey, CRENEAUX_TABLE, creneau_id, { statut: 'accepte' }));
        }
        const results = await Promise.all(patches);
        for (const r of results) {
          if (!r.ok) {
            const err = await r.text();
            return res.status(500).json({ error: 'Airtable PATCH: ' + err });
          }
        }
        return res.status(200).json({ ok: true });

      } else if (action === 'refuse') {
        const patches = [
          atPatch(baseId, apiKey, BOOKINGS_TABLE, airtable_record_id, {
            statut_interne:      'refuse',
            decision_horodatage: now,
          }),
        ];
        if (creneau_id) {
          patches.push(atPatch(baseId, apiKey, CRENEAUX_TABLE, creneau_id, { statut: 'disponible' }));
        }
        const results = await Promise.all(patches);
        for (const r of results) {
          if (!r.ok) {
            const err = await r.text();
            return res.status(500).json({ error: 'Airtable PATCH: ' + err });
          }
        }
        return res.status(200).json({ ok: true });

      } else if (action === 'cancel') {
        const patches = [
          atPatch(baseId, apiKey, BOOKINGS_TABLE, airtable_record_id, {
            statut_interne:      'annule',
            decision_horodatage: now,
          }),
        ];
        if (creneau_id) {
          patches.push(atPatch(baseId, apiKey, CRENEAUX_TABLE, creneau_id, { statut: 'disponible' }));
        }
        const results = await Promise.all(patches);
        for (const r of results) {
          if (!r.ok) {
            const err = await r.text();
            return res.status(500).json({ error: 'Airtable PATCH: ' + err });
          }
        }
        return res.status(200).json({ ok: true });

      } else {
        return res.status(400).json({ error: 'action doit être "accept", "refuse" ou "cancel".' });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
