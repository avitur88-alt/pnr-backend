const { getBrowser } = require('./browser');

const PEGASUS_URL = 'https://www.flypgs.com/en/manage-booking';

async function lookup(pnr, lastName) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(PEGASUS_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Închide cookie banner dacă există
    await page.click('#accept-all-cookies, .cookie-accept, [class*="cookie-btn"], [id*="cookie"] button')
      .catch(() => {});

    await page.waitForTimeout(1000);

    // Pegasus: câmp PNR + last name
    await page.waitForSelector(
      'input[name*="surname"], input[name*="lastName"], input[id*="surname"], input[placeholder*="Surname"], input[placeholder*="Last"]',
      { timeout: 10000 }
    ).catch(() => page.waitForSelector('input[type="text"]', { timeout: 5000 }));

    const lastNameInput = await page.$(
      'input[name*="surname"], input[id*="surname"], input[name*="lastName"], input[id*="lastName"]'
    );
    const pnrInput = await page.$(
      'input[name*="reservationCode"], input[id*="reservationCode"], input[name*="pnr"], input[id*="pnr"], input[name*="reference"]'
    );

    if (lastNameInput && pnrInput) {
      await lastNameInput.click({ clickCount: 3 });
      await lastNameInput.type(lastName);
      await pnrInput.click({ clickCount: 3 });
      await pnrInput.type(pnr);
    } else {
      const inputs = await page.$$('input[type="text"]');
      if (inputs.length >= 2) {
        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type(lastName);
        await inputs[1].click({ clickCount: 3 });
        await inputs[1].type(pnr);
      } else {
        throw new Error('Nu am găsit câmpurile de formular pe pagina Pegasus Airlines');
      }
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"], .pg-btn, .pg-btn-primary, button[class*="submit"], input[type="submit"]').catch(() => {})
    ]);

    await page.waitForTimeout(2000);

    const data = await page.evaluate(() => {
      const flights = [];
      const flightRows = document.querySelectorAll(
        '[class*="flight"], [class*="segment"], [class*="leg"], [class*="itinerary"], [class*="journey"]'
      );
      flightRows.forEach(row => {
        const text = row.innerText;
        const flightNum = text.match(/PC\d{3,5}|[A-Z]{1,2}\d{3,5}/)?.[0] || '';
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

      const passengers = [];
      document.querySelectorAll('[class*="passenger"], [class*="pax"], [class*="traveler"]').forEach(el => {
        const name = el.innerText.trim();
        if (name && name.length > 3) passengers.push({ name });
      });

      const dateEl = document.querySelector('[class*="date"], [class*="departure"], [class*="depart"]');
      const date = dateEl?.innerText?.match(/\d{4}-\d{2}-\d{2}|\d{2}[.\/]\d{2}[.\/]\d{4}/)?.[0] || '';

      return { flights, passengers, date, rawText: document.body.innerText.substring(0, 2000) };
    });

    if (!data.flights.length) {
      return parseRawText(data.rawText, pnr, 'Pegasus Airlines', 'PC');
    }

    return {
      flights: data.flights.map(f => ({
        ...f,
        airline: 'Pegasus Airlines',
        airlineCode: 'PC',
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
