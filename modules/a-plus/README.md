# Fenix A+ Content Generator

Isolated Fenix module for preparing Amazon KDP A+ content projects. The visible interface is Polish-first from Phase 4 onward.

## Current Status

Phase 5 implements the first real renderable A+ module:

- `standard-image-text-overlay` - Baner z obrazem i tekstem

Phase 5 also preserves support for the earlier Phase 4 value `standard_image_text_overlay` when loading older project JSON.

Phase 5B adds context-aware image validation for imported A+ images. Image metadata now stores an `intendedUse` value so the same imported image can be checked differently as a full book page, three-image module tile, banner source, or comparison chart cover.

The A+ workspace now supports:

- project details and book/series data
- local JSON save/load with stable internal schema keys
- A+ module selection and ordering
- local image import, previews, metadata capture, and context-aware validation
- banner-specific configuration
- banner text and alt text fields
- local canvas preview for the banner
- PNG/JPG export for the banner graphic
- text package export for the banner module
- validation grouped by project data, ASINs, selected modules, images, and Baner A+

## Context-Aware Image Validation

Imported image metadata includes:

- `role` - current import role, such as cover, sample page, or promotional graphic
- `intendedUse` - intended A+ usage context
- dimensions, aspect ratio, MIME type, file size, validation status, and validation messages

Available intended-use values:

- `full_book_page` - Pełna strona książki
- `three_images_tile` - Kafelek modułu „Trzy obrazy i tekst”
- `banner_source` - Źródło do banera
- `comparison_cover` - Okładka do tabeli porównawczej
- `unspecified` - Nie określono

Sample-page imports default to `unspecified`. In validation this keeps the legacy full-page expectation until the operator assigns a more specific use. A 600 × 600 PNG assigned to `three_images_tile` passes as a valid square tile, while the same image assigned to `full_book_page` may still warn because a full sample book page is expected to be portrait and larger.

The `standard_three_images_text` and `comparison_chart` renderers remain planning-only. Phase 5B only validates image suitability and shows readiness feedback for three valid 600 × 600 tile images.

## Polish UI Decision

The operator-facing A+ generator interface remains in Polish. Amazon.com marketing copy entered into the banner fields should normally be written in English. Internal JSON keys, JavaScript function names, and schema field names remain English.

## First Renderable Module

The first implemented renderable module is:

- visible label: `Baner z obrazem i tekstem`
- internal type: `standard-image-text-overlay`
- renderer file: `core/banner-renderer.js`

The following module templates remain planning-only:

- `standard_three_images_text` - Trzy obrazy i tekst
- `comparison_chart` - Tabela porównawcza

## Banner Configuration Options

The banner configuration stores:

- source image role and ID
- layout preset
- canvas size preset
- background preset
- image fit
- text alignment
- banner style
- default export format

Available canvas sizes:

- `standard-970x300`
- `hi-res-1940x600`

Available export formats:

- PNG
- JPG

## Banner Text Workflow

Section E stores:

- headline
- supporting text
- up to 3 short bullet lines
- optional extra line
- alt text

The helper note in the UI reminds the operator: `Treści dla Amazon.com wpisuj po angielsku.`

## Preview Behavior

The banner preview is local-only and uses HTML canvas. It updates after banner configuration, text, source image, and project color changes. If the selected image is missing after loading JSON, the preview shows a Polish placeholder requiring local file reselection.

Phase 5A adds safer text fitting. The renderer uses the same fitting rules for preview and export, keeps text inside a safe banner area, reduces font sizes before truncating, preserves top content first, and hides the optional extra line when there is not enough room.

No original image binary, base64 payload, or object URL is saved in project JSON.

## Export Behavior

Section G exports only the banner module in Phase 5:

- `<project-slug>-banner-main.png`
- `<project-slug>-banner-main.jpg`
- `<project-slug>-banner-text.txt`

Graphic export is blocked when required banner data is missing, especially the source image, headline, or alt text. The text package includes module type, text fields, layout, source image reference, export size, and timestamp.

ZIP packaging is not implemented yet.

## Separation From MBG

- The A+ module does not load `mbg.js`.
- The A+ module does not share globals with MBG.
- The banner renderer is isolated under `window.FenixAPlus`.
- Existing MBG files remain independent and protected.

## Current Limitations

- Only the banner module renders and exports.
- No renderer for `Trzy obrazy i tekst`.
- No renderer for `Tabela porównawcza`.
- No ZIP export.
- No Amazon login, API calls, upload, or network requests.
- No external libraries.
- No full Amazon rule-set validation.

## Remaining Future Phases

- Phase 6: additional module renderer and production export refinement.
- Phase 7: comparison chart and series workflow.
- Phase 8: full Amazon guideline validation after official rule verification.
- Phase 9: presets and production testing.
