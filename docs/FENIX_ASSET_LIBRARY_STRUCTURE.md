# FENIX Asset Library Structure

Ten dokument opisuje proponowana strukture biblioteki assetow Fenixa. Nie wymaga przenoszenia istniejacych plikow i nie zmienia dzialania MBG, Complete the Picture, `.fenixpack` ani innych modulow.

## Proponowana struktura

```text
book-assets/
├── svg/
│   ├── animals/
│   ├── vehicles/
│   ├── dinosaurs/
│   ├── farm/
│   ├── shapes/
│   ├── symbols/
│   ├── objects/
│   └── seasonal/
│
├── png/
│   ├── line-art/
│   ├── complete-picture/
│   ├── coloring/
│   ├── full-pages/
│   └── raw-imports/
│
├── packs/
│   ├── puppy/
│   ├── dino/
│   ├── vehicles/
│   ├── farm/
│   └── jungle/
│
└── README.md
```

## Foldery SVG

`book-assets/svg/` przechowuje technicznie kontrolowalne assety wektorowe. Kategorie powinny odpowiadac realnym grupom tematycznym, na przyklad `animals`, `vehicles`, `dinosaurs`, `farm`, `shapes`, `symbols`, `objects` i `seasonal`.

SVG powinny docelowo spelniac standard z [FENIX_ASSET_STANDARD.md](./FENIX_ASSET_STANDARD.md).

## Foldery PNG

`book-assets/png/` przechowuje assety rastrowe:

- `line-art/` - czyste pojedyncze ilustracje line art,
- `complete-picture/` - assety przeznaczone do Complete the Picture,
- `coloring/` - kolorowanki i ilustracje B/W,
- `full-pages/` - gotowe strony 8.5x11,
- `raw-imports/` - pliki robocze, jeszcze niesprawdzone.

## Foldery packs

`book-assets/packs/` grupuje assety tematyczne uzywane w konkretnych seriach albo typach ksiazek, na przyklad `puppy`, `dino`, `vehicles`, `farm` i `jungle`.

Paczka tematyczna nie musi byc osobnym formatem technicznym. To folder porzadkujacy zasoby, ktore moga byc pozniej uzyte przez moduly Fenixa, `.fenixpack` albo MBG.

## Statusy robocze folderow

Zalecane statusy organizacyjne:

- `raw-imports` - pliki robocze, jeszcze niesprawdzone,
- `clean` - pliki oczyszczone, ale jeszcze niezatwierdzone produkcyjnie,
- `fenix-ok` - pliki zgodne ze standardem,
- `rejected` - pliki odrzucone,
- `used` - pliki wykorzystane w ksiazkach.

Statusy moga byc realizowane jako podfoldery w danej kategorii, jesli biblioteka zacznie rosnac. Na tym etapie nie nalezy automatycznie przenosic istniejacych assetow.

## Zasady bezpieczenstwa

- Nie przenosic istniejacych assetow automatycznie.
- Nie usuwac assetow bez kontroli.
- Nie nadpisywac plikow roboczych plikami po czyszczeniu.
- Nie mieszac `raw-imports` z plikami gotowymi.
- Nie dawac statusu produkcyjnego bez audytu technicznego i kontroli wizualnej.

## Rekomendowany przeplyw

1. Nowy plik trafia do `raw-imports` albo odpowiedniej paczki roboczej.
2. Plik jest recznie oceniany i czyszczony.
3. Audyt `tools/audit-assets.js` zapisuje raport techniczny.
4. Asset z dobrym statusem moze trafic do `clean` albo `fenix-ok`.
5. Asset wykorzystany w ksiazce moze byc dodatkowo oznaczony jako `used`.
