# Validation And Delivery

Read this reference after exporting the first candidate and before delivery.

## 1. Export And Render

Set `SKILL_DIR`, `RUNTIME_NODE`, `RUNTIME_NODE_MODULES`, `RUNTIME_PYTHON`, and
`SKIA_FONT_ROOTS`. Register all required fonts before exporting. Write the candidate and
preview into a private build directory, not the final output directory.

Run the Presentations operation marker exactly once before the first authoring command.
Then export the candidate PPTX and render the slide at the source aspect ratio.

## 2. Compare Source And Render

Inspect the actual rendered image at full size. Automated checks do not detect font
fallback, bad crops, incorrect z-order, or subtle text displacement.

Check:

- slide canvas ratio and full-bleed background;
- source coordinates versus rendered coordinates for every major object;
- people, decorations, and icons against their original bounds;
- z-order, shadows, opacity, and overlap;
- native shapes against card, bar, divider, and connector geometry;
- text content, line breaks, alignment, baseline, font weight, and spacing;
- clipping, hidden glyphs, accidental wrapping, and text-on-text overlap;
- residual source text inside pictures or the cleaned background.

Use a source/render difference image when useful, but inspect the visual result directly.
Antialiasing can create harmless pixel differences; geometry drift and font substitution
cannot.

## 3. Verify Editability

Inspect the PPTX object model, not only the rendered image:

- every visible text string exists as native text;
- the number of picture objects matches the asset inventory;
- native structural objects remain shapes, not flattened pictures;
- each requested independent visual element can move without moving unrelated elements;
- there are no text placeholders, missing fonts, or zero-sized objects;
- the PPTX imports successfully with Artifact Tool.

If a complex raster asset remains a picture object, report that accurately. It is
independently editable in position, scale, crop, and z-order, but it is not a vector path.

## 4. Finalize The Package

Follow the Presentations skill's `references/finalization.md`. Build `requirements` from
the user request and source geometry, including the expected slide size. Use
`finalizePresentation` with the integrity validator, layout validator, font policy, and a
validation receipt outside the output directory.

The finalizer does not overwrite an existing output. Use a new filename for each revision.
If the user explicitly requires a fixed filename, remove only the prior generated output
after verifying that it is not the source image and that the target is inside the intended
workspace.

Aim for zero integrity and layout findings. Treat warnings as issues to inspect and
explain, not as automatic proof that the slide is wrong.

## 5. Delivery Gate

Do not deliver until all of these are true:

- the source and final render have the same composition and aspect ratio;
- every visual element in the inventory is present;
- every visible text string is editable and exactly transcribed;
- no text remains inside raster assets;
- required fonts are registered and listed for the user;
- complex raster assets are accurately described as picture objects;
- the final PPTX passes integrity and layout validation;
- the final file has been rendered and visually inspected.

In the final response, link the PPTX, list required fonts, and mention any unavoidable
approximation that affects editability or appearance.
