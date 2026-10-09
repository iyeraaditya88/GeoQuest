// "My places": a player's own pins (private — only they can read or change them).
import type express from 'express';
import * as accounts from '../users.js';
import { cleanPlaces, getPlaces, setPlaces } from '../places.js';
import { HOSTED, fail, rateLimit } from '../http.js';

const me = (req: express.Request) => (HOSTED ? req.user! : accounts.normName(req.headers['x-gq-as']) || 'you');

export function registerPlaces(app: express.Express) {
  app.get('/api/places', async (req, res) => {
    try { res.json({ places: await getPlaces(me(req)) }); } catch (err) { fail(res, 500, err); }
  });
  app.put('/api/places', rateLimit(60, 10 * 60_000), async (req, res) => {
    const places = cleanPlaces((req.body as { places?: unknown })?.places);
    if (!places) { fail(res, 400, 'Those places couldn’t be saved — try again.'); return; }
    try { await setPlaces(me(req), places); res.json({ places }); } catch (err) { fail(res, 500, err); }
  });
}
