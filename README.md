# Ralli Live – WRC live-andmetega prototüüp

Täiesti staatiline GitHub Pagesi prototüüp. Eraldi serverit, buildi ega pakette pole vaja.

## Käivitamine

Laadi failid GitHubi repo juurkausta ja lülita sisse:

1. **Settings → Pages**
2. **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`

GitHub Pagesi HTTPS-versioon on oluline, sest WRC API kasutab samuti HTTPS-i.

## Live-andmed

Rakendus proovib automaatselt:

- leida WRC aktiivse või kuupäeva järgi lähima ralli;
- laadida itinerary ja katsete nimekirja;
- laadida osalejad;
- laadida valitud katse ajad, splitid ja katsejärgse üldseisu;
- värskendada andmeid iga 15 sekundi järel.

Ralli saab vajadusel käsitsi määrata URL-is:

`https://kasutaja.github.io/repo/?event=EVENT_ID`


## Piirang

WRC API ei ole ametlikult avalik arendaja-API. Kui WRC muudab endpoint'e või brauseri CORS-reegleid, kuvatakse automaatselt näidisandmed ja prototüübi päringukihti tuleb uuendada.
