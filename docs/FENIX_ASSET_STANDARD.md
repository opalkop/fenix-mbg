# FENIX Asset Standard

Oficjalny standard assetow Fenixa opisuje, jakie pliki SVG i PNG sa bezpieczne do uzycia w modulach, imporcie stron oraz skladaniu ksiazek przez MBG. Ten dokument nie zmienia dzialania generatorow. Jest punktem odniesienia dla przygotowania, kontroli i audytu biblioteki assetow.

## 1. Cel standardu

Celem standardu jest utrzymanie jednej, przewidywalnej biblioteki assetow dla Fenixa:

- assety maja byc czytelne dla dzieci i bezpieczne technicznie dla canvas/PDF,
- moduly Fenixa maja korzystac z plikow o znanej jakosci,
- pliki robocze maja byc oddzielone od plikow gotowych,
- assety wysokiego ryzyka maja byc odrzucane albo czyszczone przed uzyciem,
- pelne strony maja miec format zgodny z wymaganiami Amazon KDP.

## 2. Typy assetow

### SVG

SVG jest najlepszy do pelnej kontroli technicznej. Pozwala sprawdzic viewBox, kontury, wypelnienia, linki i ryzykowne elementy bez analizy wizualnej.

### PNG

PNG jest najlepszy do bardziej atrakcyjnych ilustracji line art, szczegolnie wtedy, gdy obrazek jest rysunkowy, czysty i gotowy do uzycia jako asset.

### Pelne strony PNG

Pelne strony PNG sa najlepsze do importu jako gotowe strony do MBG. Taki plik powinien reprezentowac kompletna strone 8.5x11 cala w 300 DPI.

## 3. Standard SVG

Preferowany SVG produkcyjny:

- ma `viewBox="0 0 1024 1024"`,
- ma czarny kontur,
- nie ma tla,
- nie ma zewnetrznej ramki,
- nie zawiera osadzonych bitmap,
- nie zawiera zewnetrznych linkow,
- nie zawiera `<image href="...">`,
- nie uzywa malego ikonowego viewBox typu `0 0 24 24` jako standardu produkcyjnego,
- uzywa `stroke-linecap="round"`,
- uzywa `stroke-linejoin="round"`,
- ma czytelny kontur,
- nie ma linii nachodzacych na siebie chaotycznie,
- reprezentuje zasade: jeden asset = jeden czytelny obiekt.

SVG powinien byc mozliwie prosty technicznie. Dopuszczalne sa `path`, `line`, `polyline`, `polygon`, `circle`, `ellipse`, `rect`, `g` oraz podstawowe atrybuty stylu. Ryzykowne sa bitmapy, zewnetrzne linki, importy, filtry generujace cienie oraz nietypowe style.

## 4. Standard PNG

Preferowany PNG produkcyjny:

- uzywa formatu PNG, nie JPG,
- przedstawia czarny line art,
- ma biale albo przezroczyste tlo,
- nie ma cieni,
- nie ma kolorow dla trybow B/W,
- nie ma szumu,
- nie ma artefaktow kompresji,
- ma minimum `1024x1024 px` dla pojedynczych assetow,
- dla pelnych stron ma `2550x3300 px` dla 8.5x11 cala przy 300 DPI.

PNG nie powinien byc wizualnie analizowany przez prosty audyt techniczny. Audyt sprawdza format, wymiary i podstawowe cechy naglowka, a ostateczna ocena jakosci line art wymaga kontroli recznej.

## 5. Standard pelnych stron 8.5x11

Pelna strona gotowa do MBG powinna miec:

- format PNG,
- rozmiar `2550x3300 px`,
- proporcje 8.5x11 cala,
- rozdzielczosc odpowiadajaca 300 DPI,
- biale tlo dla stron czarno-bialych,
- brak elementow ucietych przy krawedzi,
- marginesy zgodne z projektem ksiazki,
- brak przypadkowych znakow, metadanych wizualnych i roboczych opisow.

## 6. Nazewnictwo plikow

Zalecane nazwy:

- male litery,
- slowa rozdzielone myslnikiem,
- bez polskich znakow,
- bez spacji,
- bez numerow roboczych typu `final-final-2`,
- z opisem kategorii lub celu, jesli pomaga w wyszukiwaniu.

Przyklady:

- `puppy-sitting.svg`
- `dino-triceratops-line-art.png`
- `vehicle-maze-page-001.png`
- `farm-cow-complete-picture.png`

## 7. Struktura folderow

Proponowana struktura jest opisana w [FENIX_ASSET_LIBRARY_STRUCTURE.md](./FENIX_ASSET_LIBRARY_STRUCTURE.md). Pliki robocze powinny trafiać do `raw-imports`, a pliki gotowe do odpowiednich katalogow SVG, PNG albo paczek tematycznych.

## 8. Status assetu

Audyt techniczny moze przypisac assetowi status:

- `FENIX_OK` - SVG zgodny z podstawowym standardem technicznym,
- `FENIX_OK_FULL_PAGE` - PNG ma rozmiar pelnej strony `2550x3300 px`,
- `FENIX_OK_ASSET` - PNG ma co najmniej `1024x1024 px` i nie jest pelna strona,
- `NEEDS_REVIEW` - plik moze dzialac, ale wymaga recznego sprawdzenia,
- `REJECT_RISK` - plik ma ryzyko techniczne i nie powinien trafic do canvas/PDF bez oczyszczenia.

## 9. Czego unikac

Unikac:

- SVG z `<image>`,
- SVG z `href` do `http` albo `https`,
- SVG z `data:image`,
- SVG z osadzonymi bitmapami,
- SVG z malym ikonowym viewBox jako produkcyjnym assetem,
- plikow PNG mniejszych niz `1024x1024 px` jako glowne assety,
- JPG jako formatu biblioteki produkcyjnej,
- cieni, gradientow i kolorow w trybach B/W,
- przypadkowych ramek zewnetrznych,
- assetow z chaotycznie nakladajacymi sie liniami,
- plikow o niejasnym statusie w modulach produkcyjnych.

## 10. Wymagania pod Amazon KDP

Dla stron 8.5x11 cala standardem roboczym Fenixa jest `2550x3300 px`, czyli 300 DPI. Strony powinny byc przygotowane jako czyste PNG bez artefaktow kompresji. Dla ksiazek B/W nalezy unikac kolorow, cieni i szumow, ktore moga pogorszyc druk.

Pelne strony importowane do MBG powinny byc kontrolowane jako kompletne strony, nie jako pojedyncze assety.

## 11. Jak asset trafia do modulow Fenixa

Asset powinien przejsc przez taki proces:

1. Trafia do biblioteki jako plik roboczy, najlepiej do `raw-imports`.
2. Jest czyszczony albo standaryzowany recznie.
3. Przechodzi audyt techniczny.
4. Dostaje status `FENIX_OK`, `FENIX_OK_ASSET` albo `FENIX_OK_FULL_PAGE`.
5. Dopiero wtedy moze byc testowany w modulach Fenixa.

Status `NEEDS_REVIEW` oznacza koniecznosc kontroli recznej. Status `REJECT_RISK` oznacza, ze pliku nie nalezy uzywac w canvas/PDF bez oczyszczenia.

## 12. Jak asset trafia do .fenixpack / MBG

Do `.fenixpack` i MBG powinny trafiac tylko pliki gotowe:

- SVG po audycie i kontroli wizualnej,
- PNG pojedynczych assetow po audycie i kontroli wizualnej,
- pelne strony PNG w rozmiarze `2550x3300 px`.

`.fenixpack` powinien przenosic gotowe strony albo gotowe zasoby, a nie pliki robocze. MBG powinien skladac material z plikow, ktore maja znany status i nie zawieraja ryzyk technicznych.

## Instrukcja audytu

Uruchom audyt:

```bash
node tools/audit-assets.js book-assets
```

Mozna tez podac dowolna sciezke:

```bash
node tools/audit-assets.js /sciezka/do/folderu
```

Raporty sa zapisywane do:

- `tools/reports/asset-audit-report.json`
- `tools/reports/asset-audit-report.md`

Jak czytac statusy:

- `FENIX_OK` - SVG mozna testowac w modulach po kontroli wizualnej,
- `FENIX_OK_FULL_PAGE` - PNG ma poprawny rozmiar pelnej strony do MBG,
- `FENIX_OK_ASSET` - PNG ma poprawny minimalny rozmiar pojedynczego assetu,
- `NEEDS_REVIEW` - plik trzeba obejrzec i ocenic recznie,
- `REJECT_RISK` - pliku nie uzywac w canvas/PDF bez oczyszczenia.

Po audycie:

- `FENIX_OK` mozna testowac w modulach,
- `NEEDS_REVIEW` trzeba obejrzec recznie,
- `REJECT_RISK` nie uzywac w canvas/PDF bez oczyszczenia.
