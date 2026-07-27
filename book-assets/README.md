# FENIX Book Assets

`book-assets/` to wspolna biblioteka assetow dla modulow Fenixa. Moze przechowywac SVG, PNG, pelne strony PNG oraz paczki tematyczne uzywane przez rozne workflow.

Pliki w tej bibliotece nie powinny byc usuwane bez kontroli, bo ten sam asset moze byc potrzebny w kilku modulach albo ksiazkach. Kazdy asset powinien docelowo przejsc audyt techniczny i kontrole wizualna.

Oficjalny standard assetow znajduje sie w:

```text
docs/FENIX_ASSET_STANDARD.md
```

Proponowana struktura biblioteki znajduje sie w:

```text
docs/FENIX_ASSET_LIBRARY_STRUCTURE.md
```

Audyt mozna uruchomic poleceniem:

```bash
node tools/audit-assets.js book-assets
```
