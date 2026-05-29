# PNR Backend – Lookup Rezervări Aeriene

## Deploy pe Railway
1. `railway login` și `railway link` (sau conectează repo-ul Git în dashboard Railway)
2. Adaugă variabila de mediu `PORT=3000` în Railway → Variables
3. Push la main → Railway detectează `railway.toml` și pornește automat cu `node server.js`

## Testare endpoint cu curl
```bash
curl -X POST https://<your-app>.railway.app/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"pnr":"ABC123","lastName":"POPESCU","airline":"RO"}'
```

## Companii suportate
`H4`/`H7` HiSky · `RO` TAROM · `W6`/`W9` Wizz Air · `TK` Turkish · `PC` Pegasus · `LH` Lufthansa

## Health check
```bash
curl https://<your-app>.railway.app/health
```
