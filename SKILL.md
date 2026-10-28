---
name: image-to-editable-pptx
description: Convert raster slides, posters, infographics, or screenshots into visually faithful editable PowerPoint files by separating visual artwork into independent picture objects and rebuilding all text as native editable text boxes. Use when the source is an image and the output must be a PPTX with intact layout, editable text, and independently movable elements. Do not use for ordinary deck creation or editing an existing PPTX.
metadata:
  short-description: Rebuild raster slides as editable PowerPoint
---

# Image To Editable PPTX

Treat the source image as the design authority. Preserve its slide count, canvas ratio,
absolute placement, layering, background appearance, colors, and visual scale. Do not
redesign, add content, omit content, or crop the overall composition.

The deliverable must satisfy these invariants:

- Every visible text string is rebuilt as a native PowerPoint text box. No text remains
  baked into a raster asset.
- People, decorative artwork, logos, and other complex visual assets are separate picture
  objects with stable positions and z-order.
- Flat cards, bars, dividers, connectors, and simple geometric icons are native editable
  PowerPoint shapes when they can reproduce the source without visible loss.
- The reconstructed slide renders at the same aspect ratio and composition as the source.

A raster image does not contain the original vector paths. Complex artwork can be kept as
an independent picture object, but exact path-level vectorization is not possible without
approximation. State that limitation if the user asks for every complex artwork stroke to
be editable as a vector.

## Workflow

1. Inspect the source at native resolution. Record width, height, alpha, color profile,
   text bands, and element boundaries before authoring.
2. Build an element inventory with an ID, type, pixel bounding box, z-order, and intended
   reconstruction method. Separate raster assets, native shapes, and text.
3. Map source pixels to slide units with one uniform scale so geometry and typography do
   not distort. Use the same coordinate system for measurement and placement.
4. Create a cleaned background plate that removes text while preserving the surrounding
   texture. Crop each foreground visual asset at native or higher resolution.
5. Reconstruct all text as native text boxes. Preserve exact characters, punctuation,
   spaces, paragraphs, line breaks, alignment, color, and relative line spacing.
6. Assemble pictures and native shapes in source z-order. Keep a single source image as a
   single slide unless the source itself contains multiple slides.
7. Export a candidate PPTX, render it, and compare the render with the source. Iterate on
   geometry and typography until there is no clipping, drift, overlap, or font fallback.

## References

Read only the references needed for the active task:

- [Editable reconstruction](references/editable-reconstruction.md) for decomposition,
  background cleanup, asset extraction, native-shape policy, and coordinate mapping.
- [Font reconstruction](references/font-reconstruction.md) for text transcription, font
  registration, size and spacing calibration, and required-font reporting.
- [Validation](references/validation.md) for visual comparison, editability checks,
  finalization, and delivery.

## Measurement Scripts

Use the scripts to measure local text bands and colored structural runs. Run them with the
runtime Node executable and set `RUNTIME_NODE_MODULES` to the supplied runtime package
directory.

```text
$RUNTIME_NODE scripts/analyze-raster-text-bands.mjs \
  --image source.png \
  --region body=150,315,585,745

$RUNTIME_NODE scripts/analyze-raster-color-runs.mjs \
  --image source.png \
  --color "#8c1e23" \
  --row 255 --row 280 \
  --extent left=200,240,520,330
```

The scripts return measurements only. Use rendered comparisons to calibrate the final
font size, leading, and shape geometry.

## PPTX Implementation

Use the installed Presentations skill. Before coding, read its
`references/implementation.md`, `artifact_tool_docs/API_QUICK_START.md`, and
`references/finalization.md`. Author local PPTX files with JavaScript ES modules and
`@oai/artifact-tool`; do not use `python-pptx`.

Run the Presentations operation marker exactly once immediately before the first create
or edit command. Set `SKILL_DIR`, `RUNTIME_NODE`, `RUNTIME_NODE_MODULES`,
`RUNTIME_PYTHON`, and `SKIA_FONT_ROOTS` before importing Artifact Tool. Register every
nonstandard font with `skia-canvas` `FontLibrary.use(...)` before export so preview and
font metrics match the intended family.

## Delivery

Render and inspect the final slide. Confirm the source-to-output geometry, exact text
coverage, independent element count, native text boxes, and absence of baked text.
Use the finalizer for package integrity and layout checks, but do not treat a passing
validator as visual proof.

In the final response, link the PPTX, list every nonstandard font required for faithful
editing, and explain that font identification from a raster source is a calibrated visual
match rather than guaranteed metadata recovery.
