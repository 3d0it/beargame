# Gioco dell'Orso

Implementazione a codebase unica del gioco dell'orso con:
- Modalità `umano vs umano`
- Modalità `umano vs computer`
- Distribuzione web (GitHub Pages)
- Packaging Android + pubblicazione Play Store via GitHub Actions

## Regole implementate
- L'orso muove per primo.
- I 3 cacciatori scelgono la lunetta iniziale.
- L'orso sceglie una posizione iniziale libera.
- Obiettivo cacciatori: bloccare completamente l'orso.
- Se l'orso non viene bloccato entro 40 mosse dell'orso, la manche è patta.
- Match su 2 manche con scambio ruoli (gestione parità con spareggio manuale: nuova partita).

## Avvio locale web
```bash
npm ci
npm run serve
```
Poi apri `http://localhost:4173`.

## CI e quality gate
Workflow: `.github/workflows/ci.yml`
- Trigger: pull request e push su `main`
- Esegue test con coverage (`npm run test:coverage`) e soglie minime.

## Pubblicazione web automatica
Workflow: `.github/workflows/deploy-web.yml`
- Trigger: esecuzione conclusa con successo del workflow `CI` su branch `main`
- Deploy automatico su GitHub Pages.

## Pubblicazione Play Store automatica
Workflow: `.github/workflows/publish-playstore.yml`
- Trigger: manuale (`workflow_dispatch`) o push tag `v*`.
- Build AAB, firma e upload su track `internal`.

### Secrets richiesti
- `SIGNING_KEY_BASE64`
- `KEY_ALIAS`
- `KEYSTORE_PASSWORD`
- `KEY_PASSWORD`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

## Note architetturali
- UI e logica di gioco in `web/`.
- Capacitor incapsula la stessa web app per Android, senza duplicare la logica.

## Licenza
MIT, vedi `LICENSE`.
