# FENIX — test działania przed dalszą pracą

Ta wersja skupia się na działaniu, nie na redesignie.

## Zanim zaczniesz

1. W starej wersji otwórz **Koszyk Feniksa**.
2. Wyeksportuj aktualny projekt do pliku `.fenixbasket`.
3. Pobierz ZIP z gałęzi `stabilize/fenix-working-flow`.
4. Rozpakuj go do nowego folderu. Nie nadpisuj starego Feniksa.
5. Otwórz `index.html` dwuklikiem.
6. W Koszyku zaimportuj kopię `.fenixbasket` w trybie **Zastąp obecny koszyk**.

## Test 1 — Maze Studio 1:1

1. Otwórz Maze Studio.
2. Utwórz jedną parę: labirynt + rozwiązanie 1:1.
3. Otwórz Koszyk.

Wynik prawidłowy:
- są dokładnie dwie nowe strony,
- jedna ma oznaczenie **ZADANIE**, druga **ROZWIĄZANIE**,
- przycisk edycji mówi **Edytuj parę w module**,
- usunięcie proponuje usunięcie całej pary.

## Test 2 — Word Search 1:1

1. Otwórz Word Search Studio.
2. Użyj przycisku **Dodaj zadanie + rozwiązanie 1:1**.
3. Otwórz Koszyk.

Wynik prawidłowy:
- są dokładnie dwie nowe strony,
- rozwiązanie odpowiada temu samemu zadaniu,
- obie strony mają oznaczenie pary 1:1,
- edycja prowadzi do całej pary.

## Test 3 — Book Builder

1. Otwórz Book Builder.
2. Znajdź panel **Kontrola przed eksportem**.
3. Sprawdź liczbę zadań, rozwiązań, poprawnych par i finalnych stron PDF.

Prawidłowa kolejność:
1. strony początkowe,
2. wszystkie zadania z Koszyka,
3. rozwiązania Maze Studio,
4. rozwiązania Word Search,
5. pozostałe rozwiązania,
6. Congratulations / QR,
7. certyfikat i potrzebne puste strony techniczne.

Book Builder nie może sam generować dodatkowych labiryntów, rozwiązań, tracingu ani coloring pages poza Koszykiem.

## Test 4 — blokada błędnego eksportu

Kontrola przed eksportem ma zatrzymać PDF, gdy:
- zadanie lub rozwiązanie nie ma partnera,
- partnerzy mają błędne identyfikatory,
- Word Search ma różne seedy,
- strona nie zawiera obrazu PNG,
- włączono QR bez assetu QR,
- powtórzono identyfikator strony.

## Test 5 — PDF

1. Gdy kontrola pokazuje **GOTOWE**, wygeneruj PDF.
2. Porównaj liczbę stron PDF z liczbą w kontroli.
3. Sprawdź pierwsze zadanie i odpowiadające mu rozwiązanie Maze Studio.
4. Sprawdź pierwsze zadanie i odpowiadające mu rozwiązanie Word Search.

## Bezpieczny import

Przy trybie **Dołącz do obecnego koszyka** Fenix automatycznie:
- zmienia kolidujące identyfikatory stron,
- zmienia kolidujące identyfikatory par,
- naprawia wzajemne połączenia zadanie–rozwiązanie,
- umieszcza importowane strony za istniejącymi.

Nie scalaj PR ani nie usuwaj starego folderu, dopóki ten test nie przejdzie na Twoim prawdziwym projekcie.
