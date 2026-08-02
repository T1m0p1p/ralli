# Ralli Live v31

Minimalistlik, build-sammuta WRC live-tulemuste vaade. Failid võib kopeerida otse GitHubi repo juurkausta ja avaldada GitHub Pagesiga.

## v31 muudatused

- SPLIT-vaates ja Dashboardi **SPLITID** plokis kuvatakse sõitjad valitud katse stardijärjekorras.
- Järjestus põhineb katse stardikontrolli tegelikul või planeeritud stardiajal. Kui API stardiaega ei anna, kasutatakse varuna võistlejate nimekirja järjekorda ja autonumbrit.
- Vaikimisi võrdlussõitja on nüüd sama stardijärjekorra esimene nähtav sõitja.

## v30 muudatused

- WRC2 klass tuvastatakse ühtselt ka API nimetustest `Rally2`, `RC2` ja `WRC2 Challenger`.
- Splitid seotakse osalejaga `entryId`, `driverId` või `competitorId` kaudu. See parandab olukorra, kus WRC2 sõitja oli **Kõik** vaates olemas, kuid WRC2 filtriga split kadus.
- TOP10 + EE ei muuda plokki tühjaks, kui valitud klassi eelmine üldseis API vastusest puudub; sel juhul kuvatakse kõik selle klassi sõitjad.
- Desktopi Dashboardi kahte vertikaalset ja üht horisontaalset vaheseina saab hiirega lohistada. Paigutus salvestatakse brauserisse. Topeltklõps vaheseinal või nupp **↺ PAIGUTUS** taastab algse paigutuse.
- API päringutel on 15 sekundi timeout, kattuvad värskendused pannakse järjekorda ja API-st tulev tekst puhastatakse enne HTML-i lisamist.
- `core.js` sisaldab testitavat andmeloogikat ja `tests/core.test.js` WRC2 regressiooniteste.

## Dashboardi fookusfilter

- TOP10 võetakse valitud katsele eelnenud viimase katse lõpu üldarvestusest ning arvutatakse valitud kategooria sees.
- Lisaks jäävad nähtavale kõik sama kategooria Eesti sõitjad.
- Filter mõjutab ainult Dashboardi **SPLITID** ja **LIVE** plokke.
- **KATSE**, **ÜLDSEIS** ja **SUPER SUNDAY** kuvavad alati kõik valitud kategooria sõitjad.

## Kontrollimine

Vajalik on Node.js 20 või uuem.

```bash
npm test
```

GitHub Actions käivitab samad testid iga push'i ja pull request'i korral.

## Teise ralli avamine

Vaikimisi kasutatakse 2026. aasta Rally Finlandi andmeid. Teise võistluse saab anda URL-i parameetritega:

```text
?event=644&rally=712&itinerary=1461&name=Secto%20Rally%20Finland%202026
```
