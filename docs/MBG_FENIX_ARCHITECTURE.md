# MBG → FENIX: architektura modułowa

## Zasada nadrzędna

**Moduł ≠ nowy silnik.**

Moduł jest odrębnym zadaniem tworzącym określony typ strony książki, ale działa na wspólnym silniku MBG i kończy pracę w tym samym projekcie książki.

## Model aplikacji

```text
FENIX / MBG
│
├── Wspólny silnik
│   ├── projekt książki
│   ├── ustawienia formatu strony
│   ├── system assetów
│   ├── podgląd strony
│   ├── eksport PNG
│   ├── Koszyk Feniksa
│   ├── zapis / odczyt presetów
│   └── eksport PDF
│
├── Moduły zadań
│   ├── Maze
│   ├── Coloring
│   ├── Tracing
│   ├── Matching
│   ├── Alphabet
│   ├── Math
│   ├── Dot to Dot
│   ├── Hidden Objects
│   ├── Logic
│   └── kolejne moduły
│
└── Składanie książki
    ├── strony początkowe
    ├── strony zadań z modułów
    ├── rozwiązania
    ├── strony końcowe
    ├── kolejność stron
    └── PDF
```

## Odpowiedzialność modułu

Każdy moduł:

1. wykonuje jedno konkretne zadanie,
2. ma własne ustawienia właściwe tylko dla tego zadania,
3. generuje stronę zgodną ze wspólnym formatem projektu,
4. przekazuje stronę do wspólnego Koszyka Feniksa,
5. opcjonalnie przekazuje rozwiązanie,
6. nie tworzy własnego Book Buildera, Koszyka, eksportera PDF ani osobnego systemu projektu.

## Odpowiedzialność wspólnego silnika

Wspólny silnik odpowiada za:

- format i rozmiar strony,
- marginesy i spady,
- wspólny model strony,
- trwałość projektu,
- Koszyk Feniksa,
- kolejność stron,
- podgląd całej książki,
- rozwiązania,
- eksport PDF,
- wspólną bibliotekę assetów,
- wspólny wygląd i zachowanie paneli.

## Docelowy interfejs

Interfejs Feniksa ma być jedną aplikacją podzieloną na kafelki/panele robocze.

- Kafelek modułu otwiera panel danego zadania.
- Panel nie uruchamia nowego silnika.
- Każdy panel pracuje na tym samym aktywnym projekcie książki.
- Osobny, wyróżniony panel „Składanie książki” pokazuje wszystkie strony zebrane z modułów.
- Użytkownik może przechodzić między modułami bez utraty projektu.

## Wspólny kontrakt strony

Każdy moduł powinien przekazywać do silnika stronę w ujednoliconym formacie:

```js
{
  id: "unikalny-identyfikator",
  module: "maze",
  title: "Maze 01",
  pageType: "activity",
  width: 2550,
  height: 3300,
  dpi: 300,
  imageData: "...",
  solutionData: "...", // opcjonalne
  settings: {},
  createdAt: "ISO-8601"
}
```

Nazwy pól mogą zostać dopasowane do istniejącego modelu MBG. Najważniejsza jest jedna wspólna struktura dla wszystkich modułów.

## Kolejność przebudowy

1. Zachować działający rdzeń MBG bez przepisywania generatorów.
2. Rozpoznać istniejące punkty wejścia: projekt, podgląd, Koszyk, PDF i presety.
3. Ujednolicić sposób dodawania stron przez moduły.
4. Zmienić launcher na wspólny pulpit kafelkowy.
5. Otwierać zadania jako panele jednej aplikacji.
6. Wyróżnić panel „Składanie książki”.
7. Dopiero później usuwać duplikaty i wydzielać wspólne usługi.

## Reguły bezpieczeństwa przebudowy

- Nie usuwać działającej logiki MBG bez odpowiednika.
- Nie przepisywać generatora tylko po to, by zmienić wygląd.
- Każda zmiana ma zachować możliwość wygenerowania dotychczasowej książki.
- Najpierw adapter do wspólnego silnika, później refaktoryzacja wnętrza modułu.
- `main` pozostaje stabilną kopią; prace prowadzone są na gałęzi `mbg-fenix`.
