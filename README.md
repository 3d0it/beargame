# Gioco dell'Orso

Questo progetto è usato per esplorare la programmazione con agenti, implementando un gioco tradizionale diffuso nei villaggi alpini, in particolare nella Valle Cervo.

Implementazione a codebase unica del gioco dell'orso con:
- Modalità `umano vs umano`
- Modalità `umano vs IA` con livelli `facile`, `medio`, `difficile`
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
Prerequisiti: Node.js `>= 22`.

```bash
npm ci
npm run serve
```
Poi apri `http://localhost:4173`.

## CI e quality gate
Workflow: `.github/workflows/ci.yml`
- Trigger: pull request e push su `main`
- Esegue test con coverage (`npm run test:coverage`) e soglie minime.
- Esegue audit dipendenze runtime (`npm audit --omit=dev --audit-level=high`).

## Strategia test
- Unit test logica partita: `web/game.test.js`
- Unit test rendering SVG: `web/board-renderer.test.js`
- Unit/integration bootstrap UI: `web/main.test.js`
- UI integration su DOM reale (jsdom): `web/ui.integration.test.js`
- Test service worker: `web/sw.test.js`

Comandi utili:
```bash
npm test
npm run test:ui
npm run test:coverage
```

## Pubblicazione web automatica
Workflow: `.github/workflows/deploy-web.yml`
- Trigger: esecuzione conclusa con successo del workflow `CI` su branch `main`
- Deploy automatico su GitHub Pages.

## Pubblicazione Play Store automatica
Workflow: `.github/workflows/publish-playstore.yml`
- Trigger: manuale (`workflow_dispatch`).
- Build AAB, firma e upload su track selezionabile (`internal` default, oppure `beta`).

### Secrets richiesti
- `SIGNING_KEY_BASE64`
- `KEY_ALIAS`
- `KEYSTORE_PASSWORD`
- `KEY_PASSWORD`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

## Note architetturali
- UI e logica di gioco in `web/`.
- Capacitor incapsula la stessa web app per Android, senza duplicare la logica.

## Artwork
Illustrazioni originali generate con AI.

## Disclaimer
Tutti i marchi, nomi e segni distintivi eventualmente citati appartengono ai rispettivi proprietari.
Questo progetto è indipendente, senza affiliazione o approvazione ufficiale da parte di terzi.

## Licenza
MIT, vedi `LICENSE`.
