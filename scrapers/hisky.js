const { getBrowser } = require('./browser');

async function lookup(pnr, lastName) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://hisky.aero/en/manage-booking', { waitUntil: 'networkidle2', timeout: 30000 });

    // Completăm PNR și nume
    await page.waitForSelector('input[name*="booking"], input[placeholder*="booking"], input[id*="booking"]', { timeout: 10000 })
      .catch(() => page.waitForSelector('input[type="text"]', { timeout: 5000 }));

    const inputs = await page.$$('input[type="text"], input[type="search"]');
    if (inputs.length >= 2) {
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(lastName);
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(pnr);
    } else {
      throw new Error('Nu am găsit câmpurile de pe pagina HiSky');
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"], .btn-search, .search-btn, button.btn').catch(() => {})
    ]);

    await page.waitForTimeout(2000);

    const data = await page.evaluate(() => {
      const flights = [];
      // Selectori generici pentru detalii zbor
      const flightRows = document.querySelectorAll('.flight-row, .segment, .itinerary-item, [class*="flight"], [class*="segment"]');
      flightRows.forEach(row => {
        const text = row.innerText;
        const flightNum = text.match(/[A-Z]{1,2}\d{3,5}/)?.[0] || '';
        const times = text.match(/\d{2}:\d{2}/g) || [];
        const airports = text.match(/[A-Z]{3}/g)?.filter(a => a.length === 3) || [];
        if (flightNum) {
          flights.push({
            flightNumber: flightNum,
            depTime: times[0] || '',
            arrTime: times[1] || '',
            depIata: airports[0] || '',
            arrIata: airports[1] || '',
          });
        }
      });

      const passengers = [];
      document.querySelectorAll('[class*="passenger"], [class*="pax"]').forEach(el => {
        const name = el.innerText.trim();
        if (name && name.length > 3) passengers.push({ name });
      });

      const dateEl = document.querySelector('[class*="date"], [class*="departure"]');
      const date = dateEl?.innerText?.match(/\d{4}-\d{2}-\d{2}|\d{2}[.\/]\d{2}[.\/]\d{4}/)?.[0] || '';

      return { flights, passengers, date, rawText: document.body.innerText.substring(0, 2000) };
    });

    if (!data.flights.length) {
      // Fallback: parsare text brut
      return parseRawText(data.rawText, pnr, 'HiSky', 'H4');
    }

    return {
      flights: data.flights.map(f => ({
        ...f,
        airline: 'HiSky',
        airlineCode: pnr.startsWith('A') ? 'H4' : 'H7',
      })),
      passengers: data.passengers,
    };
  } finally {
    await page.close();
  }
}

function parseRawText(text, pnr, airline, airlineCode) {
  const flights = [];
  const flightNums = [...text.matchAll(/([A-Z]{1,2}\d{3,5})/g)].map(m => m[1]);
  const times = [...text.matchAll(/(\d{2}:\d{2})/g)].map(m => m[1]);
  const airports = [...text.matchAll(/\b([A-Z]{3})\b/g)]
    .map(m => m[1])
    .filter(a => !['THE','AND','FOR','NOT','ALL'].includes(a));

  if (flightNums[0]) {
    flights.push({
      flightNumber: flightNums[0],
      airline, airlineCode,
      depIata: airports[0] || '',
      arrIata: airports[1] || '',
      depTime: times[0] || '',
      arrTime: times[1] || '',
    });
  }
  return { flights, passengers: [], warning: 'Date extrase prin parsare text - verificați manual' };
}

module.exports = { lookup };
