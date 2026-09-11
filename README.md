# Ralli Live v30

Automaatse ralli tuvastusega versioon.

- Finlandi `eventId`, `rallyId` ja `itineraryId` hardcode on eemaldatud.
- Rakendus otsib WRC tulemuste API-st ise aktiivse või viimase ralli.
- `rallyId` leitakse automaatselt vastava eventi entries endpointi järgi.
- Super Sunday katsed leitakse automaatselt viimase võistluspäeva kuupäeva järgi; itinerary ID-d pole vaja.
- Leitud ralli konfiguratsioon puhverdatakse 6 tunniks.
- Kord tunnis kontrollitakse, kas aktiivne ralli on muutunud.
- URL-i `?event=...&rally=...&name=...` parameetrid jäävad diagnostiliseks käsitsi override'iks.
- Kõik v29 funktsioonid, sh TOP10 + EE, Dashboard, telemeetria ja splitid, on alles.
