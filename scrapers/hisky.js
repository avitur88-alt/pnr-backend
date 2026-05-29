const { getBrowser } = require('./browser');

async function lookup(pnr, lastName) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // HiSky folosește Videcom VRS — manage booking
    await page.goto('https://hisky.aero/en/manage-booking', {
      waitUntil: 'networkidle2', timeout: 30000
    });

    // Acceptă cookies dacă apare
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const accept = btns.find(b => /accept|agree|ok|allow/i.test(b.textContent));
      if (accept) accept.click();
    });
    await page.waitForTimeout(1000);

    // Caută câmpuri după mai mulți selectori posibili
    const fieldSelectors = [
      'input[name="bookingRef"]', 'input[name="BookingRef"]',
      'input[id*="booking"]', 'input[id*="Booking"]',
      'input[placeholder*="booking"]', 'input[placeholder*="PNR"]',
      'input[placeholder*="reference"]', 'input[placeholder*="code"]',
      'input[type="text"]'
    ];

    let lastNameField = null, pnrField = null;

    for (const sel of fieldSelectors) {
      const fields = await page.$$(sel);
      if (fields.length >= 2) {
        lastNameField = fields[0];
        pnrField = fields[1];
        break;
      } else if (fields.length === 1 && !pnrField) {
        pnrField = fields[0];
      }
    }

    // Caută câmpul pentru last name separat
    const lnSelectors = ['input[name*="name"]','input[name*="Name"]','input[name*="surname"]','input[placeholder*="name"]','input[placeholder*="Name"]'];
    for (const sel of lnSelectors) {
      const f = await page.$(sel);
      if (f) { lastNameField = f; break; }
    }

    if (!pnrField) throw new Error('Pagina HiSky nu a putut fi accesată. Verificați că PNR-ul este corect sau încercați din nou.');

    if (lastNameField) {
      await lastNameField.click({ clickCount: 3 });
      await lastNameField.type(lastName, { delay: 50 });
    }
    await pnrField.click({ clickCount: 3 });
    await pnrField.type(pnr, { delay: 50 });

    // Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
      page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"], input[type="submit"], .btn-primary, .search-button, button.btn');
        if (btn) btn.click();
      })
    ]);
    await page.waitForTimeout(3000);

    // Extrage date zbor din pagina de confirmare
    const data = await page.evaluate(() => {
      const text = document.body.innerText;
      // Flight numbers
      const flightNums = [...text.matchAll(/\b([A-Z]{1,2}\d{3,5})\b/g)].map(m => m[1]).filter(n => !['OK','NO'].includes(n));
      // Times HH:MM
      const times = [...text.matchAll(/\b(\d{2}:\d{2})\b/g)].map(m => m[1]);
      // Airports (3 letter uppercase)
      const airports = [...text.matchAll(/\b([A-Z]{3})\b/g)].map(m => m[1])
        .filter(a => !['THE','AND','FOR','NOT','ALL','PNR','EUR','USD'].includes(a));
      // Dates
      const dates = [...text.matchAll(/(\d{4}-\d{2}-\d{2}|\d{2}[.\/]\d{2}[.\/]\d{4})/g)].map(m => m[1]);
      // Passenger names (LASTNAME/FIRSTNAME pattern)
      const paxNames = [...text.matchAll(/([A-Z]+\/[A-Z]+)/g)].map(m => m[1]);

      return { flightNums, times, airports, dates, paxNames, rawText: text.substring(0, 3000) };
    });

    if (!data.flightNums.length && !data.airports.length) {
      throw new Error('Rezervarea nu a fost găsită. Verificați PNR-ul și numele de familie.');
    }

    const flights = [];
    if (data.flightNums[0]) {
      const nr = data.flightNums[0];
      const alCode = nr.replace(/[0-9]/g, '').substring(0, 2);
      const date = data.dates[0] ? normalizeDate(data.dates[0]) : '';
      flights.push({
        flightNumber: nr,
        airline: alCode === 'H4' ? 'HiSky Europe' : alCode === 'H7' ? 'HiSky' : alCode,
        airlineCode: alCode,
        depIata: data.airports[0] || '',
        arrIata: data.airports[1] || '',
        depTime: date && data.times[0] ? date + 'T' + data.times[0] : data.times[0] || '',
        arrTime: date && data.times[1] ? date + 'T' + data.times[1] : data.times[1] || '',
        date
      });
    }

    return {
      flights,
      passengers: data.paxNames.map(n => ({ name: n }))
    };
  } finally {
    await page.close();
  }
}

function normalizeDate(d) {
  if (d.includes('-') && d.length === 10) return d;
  const parts = d.split(/[.\/]/);
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  return d;
}

module.exports = { lookup };
