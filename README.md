# FENIX MBG — archiwum silnika MBG

Migawka roboczej kopii z Linuksa z 27 lipca 2026 r. Zawiera **pełny, oryginalny silnik MBG** (Maze Book Generator), na którym zbudowano FENIX, oraz materiały produkcyjne pierwszych książek.

> **Status: archiwum.** Aktywny rozwój FENIX odbywa się w repozytorium `opalkop/fenix`, na gałęzi `feature/fenix-portable-mobile`.
> FENIX ma w `legacy/mbg-recovered.js` tylko częściowo odzyskany kod MBG (ok. 62 KB). Pełny silnik (`mbg.js`, ok. 210 KB) jest **wyłącznie tutaj**, dlatego to repozytorium należy zachować.

## Uruchomienie

Otwórz `index.html` w przeglądarce. Główny generator labiryntów to `mbg.html`.

## Zawartość

| Ścieżka | Co to jest |
|---|---|
| `mbg.html`, `mbg.js`, `styles/` | silnik MBG: generator książek z labiryntami |
| `index.html`, `modules/`, `shared/` | wczesne moduły Feniksa (A+, kolorowanki, szlaczki, łączenie, alfabet, matematyka, kropki, ukryte obiekty, logika, generator assetów) |
| `assets/` | assety serii (basic, dino, farm, jungle, puppy, space, vehicles), okładki, PDF-y książek, `library.json` |
| `presets/` | ustawienia książek do wczytania w MBG (Puppy, Space, Knight, Vehicles, Jungle) |
| `deco/`, `mask/`, `ui-assets/` | dekoracje, maski i grafiki interfejsu |
| `A+/` | grafiki A+ Content na Amazon |
| `QR/` | grafika z kodami QR |
| `[prototyp]/` | wcześniejsza wersja MBG i plik próbny paperback KDP |
| `podpis.png`, `creator mark.png` | znak twórcy używany przez MBG |
| `docs/`, `tools/`, `tests/` | standard assetów, raport A+, audyt assetów, test |
| `backups/` | kopie plików sprzed fazy 5B |
