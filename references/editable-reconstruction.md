# Editable Reconstruction

Read this reference when planning or building the PPTX. The goal is visual fidelity plus
the editability that is technically possible from an image source.

## 1. Source Audit

Inspect the image at native resolution, not a thumbnail. Record:

- pixel width, height, alpha mode, and any color profile;
- one source slide, or a multi-slide source that must be split explicitly;
- background bounds and full-bleed artwork;
- each visual asset's bounding box and z-order;
- each text block's bounding box, alignment, paragraphs, and exact line breaks;
- flat structural shapes that can be rebuilt natively without changing appearance.

Use a uniform mapping from source pixels to slide units. For example, a 2000 x 1125 source
may use a 2000 x 1125 slide canvas, making one source pixel equal one slide unit. Never
stretch the x and y axes differently. Keep picture aspect ratios unchanged.

Maintain an element inventory before authoring:

```text
id | kind | bbox x0,y0,x1,y1 | z | reconstruction
bg-1 | raster | 0,0,W,H | 0 | cleaned full-bleed picture
img-1 | raster asset | ... | 20 | extracted PNG, independent picture
shape-1 | native shape | ... | 30 | card, bar, line, or connector
text-1 | text | ... | 40 | native text box
```

This inventory prevents missing elements and gives a direct check for source coverage.

## 2. Decompose The Visual Layers

Classify source content into four practical categories:

1. **Background plate:** the full composition behind foreground elements and text.
2. **Foreground raster assets:** people, illustrations, logos, textured decorations,
   luminous effects, and other artwork that cannot be reproduced exactly with simple
   PowerPoint shapes.
3. **Native structural objects:** flat fills, cards, bars, rules, simple borders, arrows,
   connectors, and geometric icons that can be matched cleanly.
4. **Text:** every visible word, number, label, title, caption, and standalone glyph that
   communicates language.

Build from back to front. Preserve source z-order, overlap, shadows, and opacity. Keep
separate any visual asset the user explicitly identifies as an independent element.

Do not claim that a raster-to-vector conversion recreates the original vector paths.
Complex artwork may need to remain an independent picture object. Use that approach when
an approximate vector would alter the requested background or layout.

## 3. Clean The Background

Remove text from the base raster while preserving its visual texture and composition:

- reconstruct covered pixels from nearby matching texture or a locally sampled fill;
- use gradual feathering at patch edges to avoid rectangular seams;
- avoid global blur or recoloring because those change the background;
- do not remove foreground artwork that belongs to the original design;
- render the cleaned plate at the same aspect ratio and compare it with the source.

If meaningful text sits over a person or decoration, remove it from that asset's crop too.
No residual glyph fragments may remain in any picture.

## 4. Extract Independent Assets

Use Node.js image tooling such as `sharp` for cropping and alpha work. Keep source pixels
where possible; only upscale when the PPTX render scale requires it.

For each asset:

1. crop a tight but safe bounding box with enough edge room for antialiasing;
2. create transparency for irregular artwork when needed;
3. suppress background-color halos at alpha edges;
4. preserve internal shadows, highlights, and semi-transparent details;
5. place the asset as its own picture object at the measured source position;
6. verify that moving the asset in PowerPoint does not move unrelated artwork.

If two visual elements touch, separate them only when the source layering can be inferred.
Otherwise preserve them as one picture object rather than inventing a cut that damages the
artwork.

## 5. Rebuild Native Objects

Use native PowerPoint shapes for objects that reproduce the source faithfully:

- rectangular cards and panels with flat or uniformly translucent fills;
- title bars, dividers, rules, borders, and simple connectors;
- circles, rounded rectangles, and simple icons that match the geometry.

Match position, size, corner radius, fill, border, shadow, and z-order. Prefer multiple
simple native objects over an approximate complex vector. Keep textured decoration,
painted marks, paper grain, and irregular artwork as pictures unless a native rebuild is
visually indistinguishable.

The user's request controls the tradeoff. If they require maximum independent editability,
split native shapes aggressively without changing the rendered composition. If exact
appearance has priority, keep complex artwork as independent raster objects.

## 6. Coordinate And Placement Rules

- Use absolute coordinates from the source audit for every object.
- Do not use slide-level stretching, nonuniform scaling, or global transforms.
- Keep text boxes and pictures on stable dimensions so edits do not shift the layout.
- Preserve the source's margins, alignment axes, centers, and repeated spacing.
- Keep the full slide canvas and aspect ratio exactly equal to the source.
- Do not add a cover, extra slide, footer, border, or decorative element.

After assembly, compare the source and rendered candidate at the same output size. Fix
geometry before tuning typography; a font-size change must not be used to hide a placement
error.
