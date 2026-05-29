const { getBrowser } = require('./browser');

const WIZZAIR_URL = 'https://wizzair.com/en-gb/flights/manage-booking';

async function lookup(pnr, lastName) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(WIZZAIR_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wizz Air poate afișa un cookie banner - închidem dacă există
    await page.click('[data-testid="cookie-accept"], .cookie-accept, #cookie-accept-btn, .accept-cookies')
      .catch(() => {});

    await page.waitForTimeout(1000);

    // Câmpuri formular Wizz Air: last name + booking reference
    await page.waitForSelector(
      'input[data-testid*="surname"], input[name*="surname"], input[name*="lastName"], input[id*="surname"], input[placeholder*="surname"], input[placeholder*="last"]',
      { timeout: 10000 }
    ).catch(() => page.waitForSelector('input[type="text"]', { timeout: 5000 }));

    // Wizz Air are de obicei: câmp surname, câmp PNR
    const surnameInput = await page.$('input[data-testid*="surname"], input[name*="surname"], input[name*="lastName"], input[id*="surname"]');
    const pnrInput = await page.$('input[data-testid*="reference"], input[name*="reference"], input[name*="bookingReference"], input[id*="reference"]');

    if (surnameInput && pnrInput) {
      await surnameInput.click({ clickCount: 3 });
      await surnameInput.type(lastName);
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
        throw new Error('Nu am găsit câmpurile de formular pe pagina Wizz Air');
      }
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"], [data-testid*="submit"], .btn-primary, button.btn').catch(() => {})
    ]);

    await page.waitForTimeout(2000);

    const data = await page.evaluate(() => {
      const flights = [];
      const flightRows = document.querySelectorAll(
        '[class*="flight"], [class*="segment"], [class*="itinerary"], [data-testid*="flight"], [data-testid*="segment"]'
      );
      flightRows.forEach(row => {
        const text = row.innerText;
        const flightNum = text.match(/W[6-9]\d{3,5}|[A-Z]{1,2}\d{3,5}/)?.[0] || '';
        const times = text.match(/\d{2}:\d{2}/g) || [];
        const airports = (text.match(/\b([A-Z]{3})\b/g) || []).filter(
          a => !['THE', 'AND', 'FOR', 'NOT', 'ALL', 'YES', 'NO', 'AIR'].includes(a)
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
      document.querySelectorAll('[class*="passenger"], [class*="pax"], [data-testid*="passenger"]').forEach(el => {
        const name = el.innerText.trim();
        if (name && name.length > 3) passengers.push({ name });
      });

      const dateEl = document.querySelector('[class*="date"], [data-testid*="date"], [class*="departure"]');
      const date = dateEl?.innerText?.match(/\d{4}-\d{2}-\d{2}|\d{2}[.\/]\d{2}[.\/]\d{4}/)?.[0] || '';

      return { flights, passengers, date, rawText: document.body.innerText.substring(0, 2000) };
    });

    if (!data.flights.length) {
      return parseRawText(data.rawText, pnr, 'Wizz Air', 'W6');
    }

    return {
      flights: data.flights.map(f => ({
        ...f,
        airline: 'Wizz Air',
        airlineCode: 'W6',
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
