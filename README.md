# Ralli Live v26

Puhas versioon nelja failiga.

Desktopi päis on ümber kujundatud:
- ralli nimi üleval vasakul;
- kategooriad vasakul otse vajutatavate nuppudena;
- katse nimi keskel ning eelmise/järgmise katse nupud nime kõrval;
- katse algusaeg/staatus paremal;
- Dashboardi varasem dubleeriv ülarida on eemaldatud.

Failid: `index.html`, `app.js`, `styles.css`, `README.md`.


## v24
Katse- ja üldseisu ajavahed kuvatakse alates 60 sekundist kujul `+1:04.3`; alla minuti kujul `+42.7`.


## v25
- SPLIT vaates kuvatakse üle 60 sekundi vahed minutite ja sekunditena (nt +1:04.3).
- Sama vorming kehtib Dashboardi SPLITID plokis.


## v26

SPLIT, KATSE ja ÜLDSEIS kasutavad ühist ajavahe formaati: alla 60 s `+42.7`, alates 60 s `+1:04.3`. Lisatud tugevam cache-busting.
