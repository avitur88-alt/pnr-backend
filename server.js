require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const scrapers = {
  H4: require('./scrapers/hisky'),
  H7: require('./scrapers/hisky'),
  RO: require('./scrapers/tarom'),
  W6: require('./scrapers/wizzair'),
  W9: require('./scrapers/wizzair'),
  TK: require('./scrapers/turkish'),
  PC: require('./scrapers/pegasus'),
  LH: require('./scrapers/lufthansa'),
};

app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.post('/api/lookup', async (req, res) => {
  const { pnr, lastName, airline } = req.body;

  if (!pnr || !lastName || !airline) {
    return res.status(400).json({ success: false, error: 'Lipsesc câmpurile: pnr, lastName, airline' });
  }

  const scraper = scrapers[airline.toUpperCase()];
  if (!scraper) {
    return res.status(400).json({
      success: false,
      error: `Compania aeriană "${airline}" nu este suportată încă. Companii disponibile: ${Object.keys(scrapers).join(', ')}`
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] Lookup: ${airline} / PNR: ${pnr} / ${lastName}`);
    const result = await scraper.lookup(pnr.trim().toUpperCase(), lastName.trim().toUpperCase());
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`Eroare lookup ${airline}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PNR Backend pornit pe portul ${PORT}`));
