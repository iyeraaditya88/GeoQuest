// Local API server (npm run dev / npm start). On Vercel the same app runs from api/index.ts.
import app, { checkAi } from './app.js';

const PORT = Number(process.env.PORT ?? 8787);
// Localhost only: this server can hold your API key.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[geoquest] API on http://127.0.0.1:${PORT}`);
  void checkAi().then((ok) => console.log(`[geoquest] Claude ${ok ? 'connected ✓' : 'not configured — add a key from the app'}`));
});
