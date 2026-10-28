#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printUsage() {
  console.error(`Usage:
  node analyze-raster-text-bands.mjs --image FILE [options]

Options:
  --region NAME=x0,y0,x1,y1   Analyze a region. Repeat for multiple regions.
  --mode dark|light           Ink mode. Default: dark.
  --threshold N               Dark RGB maximum or light RGB minimum.
  --min-ink-pixels N          Minimum matched pixels per row. Default: 1.
  --row-gap N                 Blank rows allowed inside a band. Default: 1.
  --json                      Emit JSON instead of text.

If no region is supplied, the whole image is analyzed. Coordinates are inclusive.`);
}

function parseInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) fail(`${label} must be an integer: ${value}`);
  return parsed;
}

function parseNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be a number: ${value}`);
  return parsed;
}

function parseRegion(value) {
  const separator = value.indexOf("=");
  const name = separator >= 0 ? value.slice(0, separator) : "region";
  const coordinates = separator >= 0 ? value.slice(separator + 1) : value;
  const nums = coordinates.split(",").map((part) => Number.parseInt(part.trim(), 10));
  if (nums.length !== 4 || nums.some((num) => !Number.isFinite(num))) {
    fail(`Invalid region "${value}". Use NAME=x0,y0,x1,y1 or x0,y0,x1,y1.`);
  }
  return { name, x0: nums[0], y0: nums[1], x1: nums[2], y1: nums[3] };
}

function parseArgs(argv) {
  const options = {
    image: null,
    regions: [],
    mode: "dark",
    threshold: null,
    minInkPixels: 1,
    rowGap: 1,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const takeValue = () => {
      i += 1;
      if (i >= argv.length) fail(`Missing value for ${arg}`);
      return argv[i];
    };

    if (arg === "--image") options.image = takeValue();
    else if (arg === "--region") options.regions.push(parseRegion(takeValue()));
    else if (arg === "--mode") options.mode = takeValue();
    else if (arg === "--threshold") options.threshold = parseNumber(takeValue(), arg);
    else if (arg === "--min-ink-pixels") {
      options.minInkPixels = parseInteger(takeValue(), arg);
    } else if (arg === "--row-gap") options.rowGap = parseInteger(takeValue(), arg);
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      fail(`Unknown option: ${arg}`);
    }
  }

  if (!options.image) fail("--image is required");
  if (!["dark", "light"].includes(options.mode)) fail("--mode must be dark or light");
  if (options.threshold == null) options.threshold = options.mode === "dark" ? 150 : 210;
  if (options.minInkPixels < 1) fail("--min-ink-pixels must be at least 1");
  if (options.rowGap < 0) fail("--row-gap cannot be negative");
  return options;
}

async function loadSharp() {
  const runtimeModules = process.env.RUNTIME_NODE_MODULES;
  if (runtimeModules) {
    const entry = path.join(runtimeModules, "sharp", "dist", "index.mjs");
    return (await import(pathToFileURL(entry).href)).default;
  }
  try {
    return (await import("sharp")).default;
  } catch (error) {
    fail(
      `Unable to load sharp. Set RUNTIME_NODE_MODULES to the runtime package directory. ${error.message}`,
    );
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isInk(r, g, b, a, mode, threshold) {
  if (a < 32) return false;
  if (mode === "dark") return r < threshold && g < threshold && b < threshold;
  return r > threshold && g > threshold && b > threshold;
}

function analyzeRegion(data, imageWidth, imageHeight, region, options) {
  const x0 = clamp(Math.min(region.x0, region.x1), 0, imageWidth - 1);
  const x1 = clamp(Math.max(region.x0, region.x1), 0, imageWidth - 1);
  const y0 = clamp(Math.min(region.y0, region.y1), 0, imageHeight - 1);
  const y1 = clamp(Math.max(region.y0, region.y1), 0, imageHeight - 1);
  const rows = [];

  for (let y = y0; y <= y1; y += 1) {
    let count = 0;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = -1;
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * imageWidth + x) * 4;
      if (isInk(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], options.mode, options.threshold)) {
        count += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    rows.push({ y, count, minX, maxX });
  }

  const bands = [];
  let current = null;
  let pendingGap = 0;

  const commit = () => {
    if (!current) return;
    const center = (current.start + current.end) / 2;
    bands.push({
      startY: current.start,
      endY: current.end,
      height: current.end - current.start + 1,
      minX: current.minX,
      maxX: current.maxX,
      width: current.maxX - current.minX + 1,
      centerY: center,
      inkPixels: current.inkPixels,
    });
    current = null;
  };

  for (const row of rows) {
    if (row.count >= options.minInkPixels) {
      if (!current) {
        current = {
          start: row.y,
          end: row.y,
          minX: row.minX,
          maxX: row.maxX,
          inkPixels: row.count,
        };
      } else {
        current.end = row.y;
        current.minX = Math.min(current.minX, row.minX);
        current.maxX = Math.max(current.maxX, row.maxX);
        current.inkPixels += row.count;
      }
      pendingGap = 0;
    } else if (current) {
      pendingGap += 1;
      if (pendingGap > options.rowGap) commit();
    }
  }
  commit();

  for (let i = 1; i < bands.length; i += 1) {
    bands[i].centerDelta = Number((bands[i].centerY - bands[i - 1].centerY).toFixed(2));
  }

  return {
    name: region.name,
    bounds: { x0, y0, x1, y1 },
    bands,
  };
}

const options = parseArgs(process.argv.slice(2));
const sharp = await loadSharp();
const { data, info } = await sharp(options.image)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const regions = options.regions.length
  ? options.regions
  : [{ name: "full", x0: 0, y0: 0, x1: info.width - 1, y1: info.height - 1 }];

const result = {
  image: path.resolve(options.image),
  width: info.width,
  height: info.height,
  mode: options.mode,
  threshold: options.threshold,
  minInkPixels: options.minInkPixels,
  rowGap: options.rowGap,
  regions: regions.map((region) =>
    analyzeRegion(data, info.width, info.height, region, options),
  ),
};

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`image: ${result.image}`);
  console.log(`size: ${result.width} x ${result.height}`);
  console.log(`mode: ${result.mode}, threshold: ${result.threshold}`);
  for (const region of result.regions) {
    const { x0, y0, x1, y1 } = region.bounds;
    console.log(`\n# ${region.name}: x ${x0}-${x1}, y ${y0}-${y1}`);
    for (const band of region.bands) {
      const delta = band.centerDelta == null ? "" : `, center delta ${band.centerDelta}`;
      console.log(
        `  y ${band.startY}-${band.endY} h=${band.height}, x ${band.minX}-${band.maxX} w=${band.width}, ink=${band.inkPixels}${delta}`,
      );
    }
    if (region.bands.length === 0) console.log("  no text bands matched");
  }
}
