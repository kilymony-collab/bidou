const BASE_ID   = process.env.AIRTABLE_BASE_ID   || 'appPIwjQ4rPPpmjTO';
const API_KEY   = process.env.AIRTABLE_API_KEY;
const TABLE_ID  = process.env.AIRTABLE_SLOTS_TABLE || 'tbl7qSvmQikr65Jmc';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const filter = encodeURIComponent(`NOT({statut} = 'annule')`);
    const sort   = 'sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=asc&sort%5B1%5D%5Bfield%5D=heure&sort%5B1%5D%5Bdirection%5D=asc';
    const url    = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${filter}&${sort}`;

    const airtableRes = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      return res.status(502).json({ error: 'Airtable error', detail: err });
    }

    const data = await airtableRes.json();
    const slots = (data.records || []).map(r => ({
      id:     r.id,
      date:   r.fields.date   || '',
      heure:  r.fields.heure  || '',
      statut: r.fields.statut || 'disponible',
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ slots });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
