# Ralli Live – WRC live-andmetega prototüüp

Staatiline GitHub Pagesi rakendus. Buildi ega oma serverit pole vaja.

## Paigaldamine olemasolevasse reposse

Laadi repo juurkausta ja asenda järgmised failid:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

Commiti muudatused `main` branchi. GitHub Pages avaldab uue versiooni automaatselt.

## Andmeallikas

Rakendus kasutab WRC veebilehe praeguseid JSON-andmeid Red Bulli CDN-ist:

- `stages.json`
- `entries.json`
- `stagetimes.json`
- `splittimes.json`
- `results.json`

Vaikimisi on seadistatud Secto Rally Finland 2026:

- event ID: `644`
- rally ID: `712`
- itinerary ID: `1461`

## Teise ralli testimine

ID-d saab URL-is üle kirjutada:

```text
https://kasutaja.github.io/ralli/?event=644&rally=712&itinerary=1461
```

Rakendus värskendab aktiivse katse andmeid iga 10 sekundi järel.
