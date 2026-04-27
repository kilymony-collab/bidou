// Vercel Serverless Function — manuel booking
// Variables d'environnement nécessaires :
//   CAL_API_KEY        — clé API Cal.com (cal_live_...)
//   AIRTABLE_API_KEY   — clé API Airtable
//   AIRTABLE_BASE_ID   — ID de la base Airtable

const AIRTABLE_TABLE   = 'tblXe7OerG4Dyhibe';
const CAL_EVENT_TYPE_ID = 5495377;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const calKey = process.env.CAL_API_KEY;
  const atKey  = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  // ── GET : créneaux disponibles Cal.com pour une date ─────────────────────
  if (req.method === 'GET') {
    const { date } = req.query; // format YYYY-MM-DD
    if (!date) return res.status(400).json({ error: 'Paramètre date manquant.' });
    if (!calKey) return res.status(500).json({ error: 'CAL_API_KEY non configuré.' });

    const start = `${date}T00:00:00Z`;
    const end   = `${date}T23:59:59Z`;
    const url   = `https://api.cal.com/v2/slots?eventTypeId=${CAL_EVENT_TYPE_ID}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timeZone=Europe%2FParis`;

    try {
      const r    = await fetch(url, {
        headers: {
          'Authorization':   `Bearer ${calKey}`,
          'cal-api-version': '2024-09-04',
        },
      });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : créer un RDV manuel ────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      prenom, nom, email, telephone,
      age, prestation, bijoux, taille_ongles, notes,
      slotStart,
    } = req.body;

    if (!slotStart || !prenom || !nom || !telephone || !prestation) {
      return res.status(400).json({ error: 'Champs obligatoires manquants (prénom, nom, téléphone, prestation, créneau).' });
    }
    if (!calKey || !atKey || !baseId) {
      return res.status(500).json({ error: 'Variables d\'environnement manquantes.' });
    }

    try {
      // 1. Créer la réservation Cal.com (v2)
      const calRes = await fetch('https://api.cal.com/v2/bookings', {
        method: 'POST',
        headers: {
          'Authorization':   `Bearer ${calKey}`,
          'cal-api-version': '2024-08-13',
          'Content-Type':    'application/json',
        },
        body: JSON.stringify({
          eventTypeId: CAL_EVENT_TYPE_ID,
          start:       slotStart,
          attendee: {
            name:     `${prenom} ${nom}`,
            email,
            timeZone: 'Europe/Paris',
            language: 'fr',
          },
          guests:   [],
          metadata: { source: 'manuel' },
        }),
      });

      const calData    = await calRes.json();
      const bookingUid = calData.data?.uid     || '';
      const calStatus  = calData.data?.status  || 'pending';

      // 2. Confirmer si en attente de validation
      if (bookingUid && (calStatus === 'pending' || calStatus === 'PENDING')) {
        await fetch(`https://api.cal.com/v2/bookings/${bookingUid}/confirm`, {
          method:  'POST',
          headers: {
            'Authorization':   `Bearer ${calKey}`,
            'cal-api-version': '2024-08-13',
            'Content-Type':    'application/json',
          },
        });
      }

      // 3. Convertir slotStart (UTC) → date/heure Paris
      const slotDate  = new Date(slotStart);
      const pParts    = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(slotDate);
      const get = (type) => pParts.find(p => p.type === type).value;
      const dateRdv  = `${get('year')}-${get('month')}-${get('day')}`;
      const heureRdv = `${get('hour')}:${get('minute')}`;

      // 4. Créer l'enregistrement Airtable
      const atBody = {
        fields: {
          nom_client:              `${prenom} ${nom}`,
          email_client:            email,
          telephone_client:        telephone || '',
          date_rdv:                dateRdv,
          heure_rdv:               heureRdv,
          prestation:              prestation,
          bijoux:                  !!bijoux,
          taille_ongles:           taille_ongles || '',
          notes_client:            notes || '',
          age_client:              String(age || ''),
          booking_uid_calcom:      bookingUid,
          statut_interne:          'accepte',
          statut_booking_calcom:   'ACCEPTED',
          statut_formulaire_tally: 'recu',
          source:                  'manuel',
          date_creation_demande:   new Date().toISOString(),
        },
      };

      const atRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${AIRTABLE_TABLE}`,
        {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${atKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify(atBody),
        }
      );

      if (!atRes.ok) {
        const err = await atRes.text();
        return res.status(500).json({ error: 'Airtable: ' + err });
      }

      const atData = await atRes.json();
      return res.status(200).json({
        ok: true,
        bookingUid,
        airtableId: atData.id,
        dateRdv,
        heureRdv,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
