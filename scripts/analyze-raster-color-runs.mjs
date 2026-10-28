#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printUsage() {
  console.error(`Usage:
  node analyze-raster-color-runs.mjs --image FILE --color HEX [options]

Options:
  --row Y                       Scan a horizontal row. Repeat as needed.
  --x-range X0,X1               Limit row scans to an x interval.
  --extent NAME=x0,y0,x1,y1     Measure the vertical color extent.
  --tolerance N                 RGB distance tolerance. Default: 40.
  --min-run N                   Minimum horizontal run length. Default: 60.
  --extent-coverage R           Row coverage ratio for extent. Default: 0.5.
  --json                        Emit JSON instead of text.

Consistent color runs help locate title bars, cards, rules, and connectors.`);
}

function parseNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be a number: ${value}`);
  return parsed;
}

function parsePair(value) {
  const nums = value.split(",").map((part) => Number.parseInt(part.trim(), 10));
  if (nums.length !== 2 || nums.some((num) => !Number.isFinite(num))) {
    fail(`Invalid pair "${value}". Use x,y.`);
  }
  return nums;
}

function parseExtent(value) {
  const separator = value.indexOf("=");
  const name = separator >= 0 ? value.slice(0, separator) : "extent";
  const coordinates = separator >= 0 ? value.slice(separator + 1) : value;
  const nums = coordinates.split(",").map((part) => Number.parseInt(part.trim(), 10));
  if (nums.length !== 4 || nums.some((num) => !Number.isFinite(num))) {
    fail(`Invalid extent "${value}". Use NAME=x0,y0,x1,y1.`);
  }
  return { name, x0: nums[0], y0: nums[1], x1: nums[2], y1: nums[3] };
}

function parseHexColor(value) {
  const normalized = value.trim().replace(/^#/, "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) fail(`Invalid color: ${value}`);
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function parseArgs(argv) {
  const options = {
    image: null,
    color: null,
    rows: [],
    xRange: null,
    extents: [],
    tolerance: 40,
    minRun: 60,
    extentCoverage: 0.5,
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
    else if (arg === "--color") options.color = parseHexColor(takeValue());
    else if (arg === "--row") options.rows.push(Number.parseInt(takeValue(), 10));
    else if (arg === "--x-range") options.xRange = parsePair(takeValue());
    else if (arg === "--extent") options.extents.push(parseExtent(takeValue()));
    else if (arg === "--tolerance") options.tolerance = parseNumber(takeValue(), arg);
    else if (arg === "--min-run") options.minRun = Number.parseInt(takeValue(), 10);
    else if (arg === "--extent-coverage") {
      options.extentCoverage = parseNumber(takeValue(), arg);
    } else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      fail(`Unknown option: ${arg}`);
    }
  }

  if (!options.image) fail("--image is required");
  if (!options.color) fail("--color is required");
  if (options.rows.some((row) => !Number.isFinite(row))) fail("--row must be an integer");
  if (options.minRun < 1) fail("--min-run must be at least 1");
  if (options.tolerance < 0) fail("--tolerance cannot be negative");
  if (options.extentCoverage <= 0 || options.extentCoverage > 1) {
    fail("--extent-coverage must be greater than 0 and at most 1");
  }
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

function matchesColor(data, width, x, y, target, tolerance) {
  const offset = (y * width + x) * 4;
  if (data[offset + 3] < 32) return false;
  const dr = data[offset] - target.r;
  const dg = data[offset + 1] - target.g;
  const db = data[offset + 2] - target.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance;
}

function runsAt(data, width, height, y, x0, x1, target, tolerance, minRun) {
  if (y < 0 || y >= height) return [];
  const runs = [];
  let start = -1;
  for (let x = x0; x <= x1; x += 1) {
    const hit = matchesColor(data, width, x, y, target, tolerance);
    if (hit && start < 0) start = x;
    if (!hit && start >= 0) {
      if (x - start >= minRun) runs.push({ x0: start, x1: x - 1, length: x - start });
      start = -1;
    }
  }
  if (start >= 0 && x1 - start + 1 >= minRun) {
    runs.push({ x0: start, x1, length: x1 - start + 1 });
  }
  return runs;
}

function extentAt(data, width, height, extent, target, tolerance, coverage) {
  const x0 = clamp(Math.min(extent.x0, extent.x1), 0, width - 1);
  const x1 = clamp(Math.max(extent.x0, extent.x1), 0, width - 1);
  const y0 = clamp(Math.min(extent.y0, extent.y1), 0, height - 1);
  const y1 = clamp(Math.max(extent.y0, extent.y1), 0, height - 1);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = -1;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let matchedRows = 0;

  for (let y = y0; y <= y1; y += 1) {
    let count = 0;
    let rowMinX = Number.POSITIVE_INFINITY;
    let rowMaxX = -1;
    for (let x = x0; x <= x1; x += 1) {
      if (matchesColor(data, width, x, y, target, tolerance)) {
        count += 1;
        rowMinX = Math.min(rowMinX, x);
        rowMaxX = Math.max(rowMaxX, x);
      }
    }
    if (count >= (x1 - x0 + 1) * coverage) {
      matchedRows += 1;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minX = Math.min(minX, rowMinX);
      maxX = Math.max(maxX, rowMaxX);
    }
  }

  return {
    name: extent.name,
    bounds: { x0, y0, x1, y1 },
    matchedRows,
    minX: Number.isFinite(minX) ? minX : null,
    maxX: maxX >= 0 ? maxX : null,
    minY: Number.isFinite(minY) ? minY : null,
    maxY: maxY >= 0 ? maxY : null,
    height: maxY >= 0 ? maxY - minY + 1 : 0,
  };
}

const options = parseArgs(process.argv.slice(2));
const sharp = await loadSharp();
const { data, info } = await sharp(options.image)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const defaultXRange = [0, info.width - 1];
const xRange = options.xRange
  ? [
      clamp(Math.min(options.xRange[0], options.xRange[1]), 0, info.width - 1),
      clamp(Math.max(options.xRange[0], options.xRange[1]), 0, info.width - 1),
    ]
  : defaultXRange;

const result = {
  image: path.resolve(options.image),
  width: info.width,
  height: info.height,
  color: options.color,
  tolerance: options.tolerance,
  rows: options.rows.map((y) => ({
    y,
    runs: runsAt(data, info.width, info.height, y, xRange[0], xRange[1], options.color, options.tolerance, options.minRun),
  })),
  extents: options.extents.map((extent) =>
    extentAt(
      data,
      info.width,
      info.height,
      extent,
      options.color,
      options.tolerance,
      options.extentCoverage,
    ),
  ),
};

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`image: ${result.image}`);
  console.log(`size: ${result.width} x ${result.height}`);
  console.log(
    `color: rgb(${result.color.r}, ${result.color.g}, ${result.color.b}), tolerance: ${result.tolerance}`,
  );
  for (const row of result.rows) {
    const runs = row.runs.length
      ? row.runs.map((run) => `[${run.x0},${run.x1}] length=${run.length}`).join(", ")
      : "none";
    console.log(`y=${row.y}: ${runs}`);
  }
  for (const extent of result.extents) {
    console.log(
      `${extent.name}: x ${extent.minX}-${extent.maxX}, y ${extent.minY}-${extent.maxY}, height=${extent.height}, rows=${extent.matchedRows}`,
    );
  }
}
