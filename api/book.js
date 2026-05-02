// Vercel Serverless Function — créneaux disponibles + réservation manuelle
// Variables d'environnement nécessaires :
//   AIRTABLE_API_KEY  — Personal Access Token
//   AIRTABLE_BASE_ID  — ID de la base (appPIwjQ4rPPpmjTO)

const BOOKINGS_TABLE = 'tblXe7OerG4Dyhibe';
const CRENEAUX_TABLE = 'tbl7qSvmQikr65Jmc';

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

  // ── GET : créneaux disponibles pour une date ─────────────────────────────
  if (req.method === 'GET') {
    const { date } = req.query; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: 'Paramètre date manquant.' });

    const formula = encodeURIComponent(`AND({date}='${date}',{statut}='disponible')`);
    const url = `https://api.airtable.com/v0/${baseId}/${CRENEAUX_TABLE}?filterByFormula=${formula}&sort[0][field]=heure&sort[0][direction]=asc`;

    try {
      const r    = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }
      const data = await r.json();
      const slots = (data.records || []).map(rec => ({
        id:    rec.id,
        heure: rec.fields.heure || '',
      }));
      return res.status(200).json({ slots });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : créer un RDV manuel ────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      prenom, nom, telephone,
      age, prestation, bijoux, taille_ongles, notes,
      creneau_id,
    } = req.body;

    if (!creneau_id || !prenom || !nom || !telephone || !prestation) {
      return res.status(400).json({ error: 'Champs obligatoires manquants (prénom, nom, téléphone, prestation, créneau).' });
    }

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    try {
      // 1. Récupérer la date et l'heure depuis le créneau Airtable
      const slotRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${CRENEAUX_TABLE}/${creneau_id}`,
        { headers }
      );
      if (!slotRes.ok) {
        const err = await slotRes.text();
        return res.status(500).json({ error: 'Créneau introuvable: ' + err });
      }
      const slotData = await slotRes.json();
      const dateRdv  = slotData.fields.date  || '';
      const heureRdv = slotData.fields.heure || '';

      // 2. Créer le booking + marquer le créneau accepté en parallèle
      const [bookingRes, patchRes] = await Promise.all([
        fetch(`https://api.airtable.com/v0/${baseId}/${BOOKINGS_TABLE}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fields: {
              prenom_client:       prenom,
              nom_client:          nom,
              telephone_client:    telephone || '',
              date_rdv:            dateRdv,
              heure_rdv:           heureRdv,
              prestation:          prestation,
              bijoux:              !!bijoux,
              taille_ongles:       taille_ongles || '',
              notes_client:        notes || '',
              age_client:          String(age || ''),
              statut_interne:      'accepte',
              source:              'manuel',
              date_creation_demande: new Date().toISOString(),
              creneau_id:          creneau_id,
            },
          }),
        }),
        fetch(`https://api.airtable.com/v0/${baseId}/${CRENEAUX_TABLE}/${creneau_id}`, {
          method:  'PATCH',
          headers,
          body:    JSON.stringify({ fields: { statut: 'accepte' } }),
        }),
      ]);

      if (!bookingRes.ok) {
        const err = await bookingRes.text();
        return res.status(500).json({ error: 'Airtable booking: ' + err });
      }
      if (!patchRes.ok) {
        const err = await patchRes.text();
        return res.status(500).json({ error: 'Airtable créneau: ' + err });
      }

      const bookingData = await bookingRes.json();
      return res.status(200).json({
        ok:         true,
        airtableId: bookingData.id,
        dateRdv,
        heureRdv,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
