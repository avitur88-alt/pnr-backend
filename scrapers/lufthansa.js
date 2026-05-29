const { getBrowser } = require('./browser');

const LUFTHANSA_URL = 'https://www.lufthansa.com/ro/en/manage-booking';

async function lookup(pnr, lastName) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(LUFTHANSA_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Închide cookie consent Lufthansa
    await page.click('#cm-acceptAll, .cookie-consent__btn--accept, [data-testid="accept-all-cookies"]')
      .catch(() => {});

    await page.waitForTimeout(1000);

    // Lufthansa: câmp booking reference (PNR) + family name
    await page.waitForSelector(
      'input[name*="bookingCode"], input[id*="bookingCode"], input[name*="familyName"], input[id*="familyName"], input[placeholder*="Booking"], input[placeholder*="Family"]',
      { timeout: 10000 }
    ).catch(() => page.waitForSelector('input[type="text"]', { timeout: 5000 }));

    const familyNameInput = await page.$(
      'input[name*="familyName"], input[id*="familyName"], input[name*="lastName"], input[id*="lastName"], input[name*="surname"]'
    );
    const bookingCodeInput = await page.$(
      'input[name*="bookingCode"], input[id*="bookingCode"], input[name*="pnr"], input[id*="pnr"], input[name*="bookingReference"]'
    );

    if (familyNameInput && bookingCodeInput) {
      await familyNameInput.click({ clickCount: 3 });
      await familyNameInput.type(lastName);
      await bookingCodeInput.click({ clickCount: 3 });
      await bookingCodeInput.type(pnr);
    } else {
      const inputs = await page.$$('input[type="text"]');
      if (inputs.length >= 2) {
        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type(pnr);
        await inputs[1].click({ clickCount: 3 });
        await inputs[1].type(lastName);
      } else {
        throw new Error('Nu am găsit câmpurile de formular pe pagina Lufthansa');
      }
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"], .lh-btn, [data-testid*="submit"], .ibe-form__submit').catch(() => {})
    ]);

    await page.waitForTimeout(2000);

    const data = await page.evaluate(() => {
      const flights = [];
      const flightRows = document.querySelectorAll(
        '[class*="flight"], [class*="segment"], [class*="leg"], [class*="itinerary"], [class*="journey"], [data-testid*="flight"]'
      );
      flightRows.forEach(row => {
        const text = row.innerText;
        const flightNum = text.match(/LH\d{3,5}|[A-Z]{1,2}\d{3,5}/)?.[0] || '';
        const times = text.match(/\d{2}:\d{2}/g) || [];
        const airports = (text.match(/\b([A-Z]{3})\b/g) || []).filter(
          a => !['THE', 'AND', 'FOR', 'NOT', 'ALL', 'YES', 'NO', 'LHR'].includes(a)
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
      document.querySelectorAll('[class*="passenger"], [class*="pax"], [class*="traveler"], [data-testid*="passenger"]').forEach(el => {
        const name = el.innerText.trim();
        if (name && name.length > 3) passengers.push({ name });
      });

      const dateEl = document.querySelector('[class*="date"], [class*="departure"], [data-testid*="date"]');
      const date = dateEl?.innerText?.match(/\d{4}-\d{2}-\d{2}|\d{2}[.\/]\d{2}[.\/]\d{4}/)?.[0] || '';

      return { flights, passengers, date, rawText: document.body.innerText.substring(0, 2000) };
    });

    if (!data.flights.length) {
      return parseRawText(data.rawText, pnr, 'Lufthansa', 'LH');
    }

    return {
      flights: data.flights.map(f => ({
        ...f,
        airline: 'Lufthansa',
        airlineCode: 'LH',
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
