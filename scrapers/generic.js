const { getBrowser } = require('./browser');

/**
 * Scraper generic fallback.
 * @param {string} pnr        - Codul de rezervare (PNR)
 * @param {string} lastName   - Numele de familie al pasagerului
 * @param {string} url        - URL-ul paginii "manage booking" a companiei aeriene
 * @param {string} [airline]  - Numele companiei aeriene (opțional, pentru etichetare)
 * @param {string} [airlineCode] - IATA cod companie (opțional)
 */
async function lookup(pnr, lastName, url, airline = 'Unknown', airlineCode = 'XX') {
  if (!url) throw new Error('URL-ul paginii manage-booking este obligatoriu pentru scraper-ul generic');

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Încearcă să închidă orice cookie banner comun
    await page.click(
      '#accept-all, #accept-cookies, .cookie-accept, [class*="cookie"] button, #onetrust-accept-btn-handler'
    ).catch(() => {});

    await page.waitForTimeout(1000);

    // Încearcă să găsească câmpuri text generice
    await page.waitForSelector('input[type="text"], input[type="search"]', { timeout: 10000 });

    const inputs = await page.$$('input[type="text"], input[type="search"]');

    if (inputs.length === 0) {
      throw new Error(`Nu am găsit câmpuri de formular la URL-ul: ${url}`);
    }

    if (inputs.length >= 2) {
      // Strategie: primul câmp = last name, al doilea = PNR
      // Mulți furnizori folosesc această ordine
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(lastName);
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(pnr);
    } else {
      // Doar un câmp: probabil PNR
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(pnr);
    }

    // Trimite formularul
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"], .btn-primary, .search-btn, .submit-btn').catch(() => {})
    ]);

    await page.waitForTimeout(2000);

    // Extrage datele din DOM
    const data = await page.evaluate(() => {
      const flights = [];
      const candidateSelectors = [
        '[class*="flight"]', '[class*="segment"]', '[class*="leg"]',
        '[class*="itinerary"]', '[class*="journey"]', '[class*="booking-detail"]',
        '[data-testid*="flight"]', '[data-testid*="segment"]'
      ];

      for (const sel of candidateSelectors) {
        const rows = document.querySelectorAll(sel);
        if (rows.length > 0) {
          rows.forEach(row => {
            const text = row.innerText || '';
            const flightNum = text.match(/[A-Z]{1,2}\d{3,5}/)?.[0] || '';
            const times = text.match(/\d{2}:\d{2}/g) || [];
            const airports = (text.match(/\b([A-Z]{3})\b/g) || []).filter(
              a => !['THE', 'AND', 'FOR', 'NOT', 'ALL', 'YES', 'NO'].includes(a)
            );
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
          if (flights.length > 0) break;
        }
      }

      const passengers = [];
      document.querySelectorAll('[class*="passenger"], [class*="pax"], [class*="traveler"]').forEach(el => {
        const name = el.innerText.trim();
        if (name && name.length > 3 && name.length < 60) passengers.push({ name });
      });

      const dateEl = document.querySelector('[class*="date"], [class*="departure"], [class*="depart"]');
      const date = dateEl?.innerText?.match(/\d{4}-\d{2}-\d{2}|\d{2}[.\/]\d{2}[.\/]\d{4}/)?.[0] || '';

      return { flights, passengers, date, rawText: document.body.innerText.substring(0, 3000) };
    });

    if (!data.flights.length) {
      return parseRawText(data.rawText, pnr, airline, airlineCode);
    }

    return {
      flights: data.flights.map(f => ({
        ...f,
        airline,
        airlineCode,
        date: data.date || '',
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
    .filter(a => !['THE', 'AND', 'FOR', 'NOT', 'ALL', 'YES', 'NO'].includes(a));

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
