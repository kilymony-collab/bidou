// Vercel Serverless Function — proxy Airtable + Make webhook
// Variables d'environnement nécessaires dans Vercel :
//   AIRTABLE_API_KEY  — clé API Airtable (Personal Access Token)
//   AIRTABLE_BASE_ID  — ID de la base (ex: appPIwjQ4rPPpmjTO)
//   MAKE_WEBHOOK_S3   — URL du webhook Make Scénario 3

const AIRTABLE_TABLE = 'tblXe7OerG4Dyhibe';

export default async function handler(req, res) {
  // CORS — permet à l'interface d'appeler cette fonction
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── GET : récupère les rendez-vous depuis Airtable ────────────────────────
  if (req.method === 'GET') {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      return res.status(500).json({ error: 'Variables d\'environnement manquantes.' });
    }

    // Récupère les RDV avec un statut actif (en attente ou accepté)
    const formula = encodeURIComponent(
      "OR({statut_interne}='en_attente_validation',{statut_interne}='accepte',{statut_interne}='en_attente_formulaire')"
    );
    const url = `https://api.airtable.com/v0/${baseId}/${AIRTABLE_TABLE}?filterByFormula=${formula}&sort[0][field]=date_rdv&sort[0][direction]=asc&sort[1][field]=heure_rdv&sort[1][direction]=asc`;

    try {
      const airtableRes = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!airtableRes.ok) {
        const err = await airtableRes.text();
        return res.status(airtableRes.status).json({ error: err });
      }

      const data = await airtableRes.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : envoie une action (accept/refuse) vers Make Scénario 3 ─────────
  if (req.method === 'POST') {
    const webhookUrl = process.env.MAKE_WEBHOOK_S3;

    if (!webhookUrl) {
      return res.status(500).json({ error: 'MAKE_WEBHOOK_S3 non configuré.' });
    }

    try {
      const makeRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });

      if (!makeRes.ok) {
        return res.status(500).json({ error: 'Make webhook a échoué.' });
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
