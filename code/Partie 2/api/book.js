const BASE_ID        = process.env.AIRTABLE_BASE_ID        || 'appPIwjQ4rPPpmjTO';
const API_KEY        = process.env.AIRTABLE_API_KEY;
const SLOTS_TABLE    = process.env.AIRTABLE_SLOTS_TABLE    || 'tbl7qSvmQikr65Jmc';
const RDV_TABLE      = process.env.AIRTABLE_RDV_TABLE      || 'tblXe7OerG4Dyhibe';
const FIELD_ONGLES   = 'fldvexSMOQkV9BVms';
const FIELD_MODELE   = 'fldNdJQcBeCZcVyk0';

const AT  = `https://api.airtable.com/v0/${BASE_ID}`;
const ATU = `https://content.airtable.com/v0/${BASE_ID}`;

async function at(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${AT}${path}`, opts);
  return r.json();
}

async function uploadAttachment(recordId, fieldId, base64, mimeType, filename) {
  const buffer = Buffer.from(base64, 'base64');
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), filename);
  formData.append('type', mimeType);

  return fetch(`${ATU}/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: formData,
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  /* ── GET : check booking status ──────────────────────────────────────────── */
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const data = await at(`/${RDV_TABLE}/${id}`);
    if (data.error) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json({
      statut: data.fields?.statut_interne || 'en_attente',
      date:   data.fields?.date_rdv,
      heure:  data.fields?.heure_rdv,
    });
  }

  /* ── POST : create booking ───────────────────────────────────────────────── */
  if (req.method === 'POST') {
    const {
      slot_id, prenom, nom, age, telephone,
      prestation, taille_ongles, bijoux,
      photo_ongles, photo_ongles_type, photo_ongles_name,
      photo_modele, photo_modele_type, photo_modele_name,
    } = req.body;

    // Age gate
    if (parseInt(age) < 18) {
      return res.status(200).json({ cancelled: true, reason: 'age_mineure' });
    }

    // Verify slot
    const slotData = await at(`/${SLOTS_TABLE}/${slot_id}`);
    if (!slotData.fields) return res.status(404).json({ error: 'Slot not found' });
    if (slotData.fields.statut !== 'disponible') {
      return res.status(409).json({ error: 'Slot no longer available' });
    }

    // Create Demandes_RDV record (text fields first)
    const rdvData = await at(`/${RDV_TABLE}`, 'POST', {
      fields: {
        prenom_client:         prenom,
        nom_client:            nom,
        age_client:            String(age),
        telephone_client:      telephone,
        prestation:            prestation,
        taille_ongles:         taille_ongles || '',
        bijoux:                !!bijoux,
        creneau_id:            slot_id,
        date_rdv:              slotData.fields.date,
        heure_rdv:             slotData.fields.heure,
        statut_interne:        'en_attente',
        source:                'caly',
        date_creation_demande: new Date().toISOString(),
      },
    });

    const recordId = rdvData.id;
    if (!recordId) return res.status(500).json({ error: 'Failed to create record', detail: rdvData });

    // Upload photos (non-blocking failures tolerated)
    const uploads = [
      uploadAttachment(recordId, FIELD_ONGLES,
        photo_ongles, photo_ongles_type || 'image/jpeg', photo_ongles_name || 'ongles.jpg'),
    ];
    if (photo_modele) {
      uploads.push(uploadAttachment(recordId, FIELD_MODELE,
        photo_modele, photo_modele_type || 'image/jpeg', photo_modele_name || 'modele.jpg'));
    }
    await Promise.allSettled(uploads);

    // Mark slot as en_attente
    await at(`/${SLOTS_TABLE}/${slot_id}`, 'PATCH', {
      fields: { statut: 'en_attente' },
    });

    return res.status(200).json({ success: true, record_id: recordId, slot_id });
  }

  /* ── DELETE : cancel booking ─────────────────────────────────────────────── */
  if (req.method === 'DELETE') {
    const { record_id, slot_id } = req.query;
    if (!record_id) return res.status(400).json({ error: 'Missing record_id' });

    // Delete the booking record
    await at(`/${RDV_TABLE}/${record_id}`, 'DELETE');

    // Free the slot
    if (slot_id) {
      await at(`/${SLOTS_TABLE}/${slot_id}`, 'PATCH', {
        fields: { statut: 'disponible' },
      });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
