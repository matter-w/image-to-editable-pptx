# Font Reconstruction

Read this reference when rebuilding visible text or reporting required fonts.

## 1. Transcribe Text Exactly

Preserve the source's exact characters, punctuation, capitalization, numbers, spaces, and
line breaks. Do not normalize punctuation, translate content, correct wording, or merge
visual lines unless the source itself does so.

Use one native text box per logical text block. Split blocks only when spacing, background,
color, or alignment clearly requires separate objects. Keep paragraph arrays when a block
contains multiple lines so PowerPoint stores the intended line breaks:

```js
title.text = ["First exact line", "Second exact line"];
```

Do not leave any visible text inside a cropped picture, background plate, icon, or shape.
Remove the source glyph pixels before placing the native text box over that position.

## 2. Recover Typography

Use the band-analysis script to measure text rows:

```text
$RUNTIME_NODE scripts/analyze-raster-text-bands.mjs \
  --image source.png \
  --region body=150,315,585,745
```

The script reports each text band's x/y bounds, pixel height, center, and center deltas.
Use these as first-pass measurements:

- band height estimates the visual cap or glyph height;
- center-to-center deltas estimate intended line spacing;
- x bounds and text length estimate horizontal scale and tracking;
- repeated blocks reveal whether the source uses a consistent type scale.

Raster pixels do not encode a font family, point size, or leading value. Match the font by
visual features, then calibrate size and spacing against rendered output.

For fixed line breaks, explicitly disable automatic rewriting and fitting when appropriate:

```js
box.text.style = {
  typeface: "Exact Family Name",
  fontSize: 20.4,
  lineSpacing: 1.22,
  autoFit: "none",
  wrap: "none",
};
```

Set text-frame insets to zero unless the source clearly has internal padding. Use explicit
paragraph line spacing rather than blank text lines. If a block must wrap naturally, use a
measured width with `wrap: "square"` and verify every rendered line break. Do not let
PowerPoint shrink, grow, clip, or reposition the text autonomously.

Calibrate in this order:

1. match the font family and weight;
2. match the text block's horizontal origin and width;
3. match glyph size using a rendered comparison;
4. match baseline positions through text-box top and height;
5. match paragraph and line spacing;
6. fix tracking only if the source visibly requires it.

## 3. Register Fonts Before Export

Set `SKIA_FONT_ROOTS` to the directories containing the required font files plus the system
font directory. Register the exact family names used in the deck before exporting or
rendering:

```js
process.env.SKIA_FONT_ROOTS = `${FONT_DIR};C:/Windows/Fonts`;

const { FontLibrary } = await import(
  pathToFileURL(
    path.join(
      RUNTIME_NODE_MODULES,
      "@oai",
      "artifact-tool",
      "node_modules",
      "skia-canvas",
      "lib",
      "index.mjs",
    ),
  ).href
);

FontLibrary.use("Exact Family Name", [
  path.join(FONT_DIR, "ExactFamily-Regular.otf"),
  path.join(FONT_DIR, "ExactFamily-Bold.otf"),
]);
```

Use the family name that PowerPoint will resolve, and register every weight actually used.
If registration fails, do not continue with an assumed fallback; fix the path or report the
missing font.

## 4. Identify And Report Required Fonts

Compare candidate fonts using representative glyphs, not only a whole-block preview. Check
distinctive characters, stroke terminals, counters, punctuation, and numerals. If the
source is calligraphic or custom, identify the closest known family and state the residual
uncertainty.

The delivery must list:

- the exact family name written into the PPTX;
- the exact font files needed for faithful rendering;
- which weights are required;
- which source text blocks use each family;
- whether the match is confirmed, likely, or approximate.

Example:

```text
Required fonts:
- "Display Calligraphy": main title; 38DisplayCalligraphy.ttf; likely match.
- "Subtitle Sans": top subtitle; SubtitleSans-Bold.otf; confirmed by glyph comparison.
- "Source Serif CN": body and headings; regular, medium, semibold, bold OTF; likely match.
```

Tell the user to install missing fonts before opening the deck. A raster image contains no
font metadata, so never describe a visual identification as guaranteed unless the source
file supplies that metadata.
