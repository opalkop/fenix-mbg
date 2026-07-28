# Rozdzielenie MBG i Book Buildera

## Cel

Rozdzielić obecny wspólny moduł `MBG / Book Builder` na dwa niezależne narzędzia, bez naruszania działającego silnika generowania labiryntów i eksportu książki.

## Stan obecny

- `index.html` pokazuje jeden główny moduł: **MBG / Book Builder**.
- `mbg.html` zawiera interfejs zarówno generatora labiryntów, jak i składacza całej książki.
- `mbg.js` przechowuje stan generatora, assetów, podglądu, Koszyka Feniksa i eksportu PDF w jednym pliku.
- Stan `MBG.fenixBasket` oraz funkcje `bindFenixBasketControls()`, `refreshFenixBasket()` i eksport PDF wskazują, że warstwa produkcji stron i warstwa składania książki są obecnie połączone.

## Docelowa odpowiedzialność modułów

### MBG — Maze Book Generator

Moduł-producent stron, odpowiedzialny za:

- generowanie labiryntów,
- poziomy trudności,
- start, metę, checkpointy i przeciwników,
- maski, dekoracje i bibliotekę assetów,
- podgląd pojedynczej strony,
- generowanie rozwiązań,
- dodawanie stron do Koszyka Feniksa,
- eksport stron jako `.fenixpack`.

MBG nie powinien składać kompletnej książki ani eksportować finalnego wielostronicowego PDF książki.

### Book Builder

Moduł-składacz, odpowiedzialny za:

- odczyt Koszyka Feniksa,
- import `.fenixpack`,
- porządkowanie stron,
- strony wstępne i końcowe,
- intro, instrukcję, tracker, certyfikat, QR i podobne dodatki,
- format książki i marginesy,
- podgląd planu książki,
- eksport finalnego PDF.

Book Builder nie powinien generować nowych labiryntów.

## Warstwa wspólna

Elementy współdzielone powinny zostać przeniesione do `shared/`:

- obsługa IndexedDB Koszyka Feniksa,
- format `.fenixpack`,
- wspólne metadane stron,
- walidacja rozmiarów stron,
- pomocnicze funkcje plikowe i obrazowe,
- wspólne komunikaty błędów.

Proponowane pliki:

```text
shared/fenix-basket.js
shared/fenix-pack.js
shared/fenix-page-model.js
```

## Bezpieczna kolejność prac

### Etap 1 — audyt i oznaczenie granic

- sklasyfikować sekcje `mbg.html` jako `MBG`, `BOOK_BUILDER` albo `SHARED`,
- sklasyfikować funkcje i stan w `mbg.js`,
- wskazać zależności pomiędzy generowaniem strony a eksportem książki,
- nie zmieniać jeszcze działania aplikacji.

### Etap 2 — wydzielenie warstwy wspólnej

- przenieść obsługę Koszyka Feniksa do `shared/fenix-basket.js`,
- zachować zgodność z istniejącą bazą IndexedDB,
- przenieść format `.fenixpack` do `shared/fenix-pack.js`,
- pozostawić adaptery kompatybilności w `mbg.js`.

### Etap 3 — utworzenie Book Buildera

Proponowana struktura:

```text
modules/book-builder/book-builder.html
modules/book-builder/book-builder.js
modules/book-builder/book-builder.css
```

Pierwsza wersja Book Buildera powinna używać istniejących funkcji eksportu i planowania stron, ale już w osobnym interfejsie.

### Etap 4 — odchudzenie MBG

- usunąć z interfejsu MBG funkcje składania całej książki,
- pozostawić generowanie i przekazywanie stron do Koszyka,
- zachować dotychczasową logikę labiryntów bez zmian funkcjonalnych.

### Etap 5 — aktualizacja launchera Feniksa

Launcher powinien pokazywać osobno:

1. **Book Builder** — główny składacz książki,
2. **Maze Book Generator** — moduł tworzenia stron labiryntowych,
3. pozostałe moduły-producentów stron.

## Zasady bezpieczeństwa

- `main` pozostaje wersją działającą.
- Wszystkie prace odbywają się na gałęzi `feature/split-mbg-book-builder`.
- Najpierw kopiujemy i przekierowujemy funkcje, dopiero później usuwamy stare ścieżki.
- Każdy etap powinien kończyć się testem:
  - generowania podglądu labiryntu,
  - dodania strony do Koszyka,
  - ponownego odczytu Koszyka po odświeżeniu,
  - importu `.fenixpack`,
  - eksportu finalnego PDF.

## Pierwszy techniczny punkt podziału

W `mbg.js` już na początku widoczna jest naturalna granica:

- `MBG.assets`, `maskAssets`, `decoAssets`, `assetLibrary`, `lastPreviewMaze` — część generatora MBG,
- `MBG.fenixBasket` oraz stałe `FENIX_BOOK_BASKET_*` — część wspólna / Book Builder,
- `isPdfExportRunning` — część eksportu Book Buildera.

Pierwszą implementacyjną zmianą powinno być wydzielenie obsługi Koszyka Feniksa bez zmiany jego formatu ani nazwy bazy danych.
