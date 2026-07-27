#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REPORT_DIR = path.join(__dirname, 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'asset-audit-report.json');
const MD_REPORT = path.join(REPORT_DIR, 'asset-audit-report.md');

function main() {
  const inputRoot = process.argv[2] || 'book-assets';
  const root = path.resolve(process.cwd(), inputRoot);
  const report = createEmptyReport(root);

  if (!fs.existsSync(root)) {
    report.message = `Folder does not exist: ${root}`;
    writeReports(report);
    printReport(report);
    return;
  }

  const rootStats = fs.statSync(root);
  if (!rootStats.isDirectory()) {
    report.message = `Path is not a directory: ${root}`;
    writeReports(report);
    printReport(report);
    return;
  }

  const files = walk(root).filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.svg' || ext === '.png';
  });

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const item = ext === '.svg' ? auditSvg(filePath, root) : auditPng(filePath, root);
    report.files.push(item);
  }

  summarize(report);
  if (report.files.length === 0) {
    report.message = `No SVG or PNG files found in: ${root}`;
  }

  writeReports(report);
  printReport(report);
}

function createEmptyReport(root) {
  return {
    createdAt: new Date().toISOString(),
    root,
    summary: {
      totalFiles: 0,
      svgCount: 0,
      pngCount: 0,
      fenixOk: 0,
      needsReview: 0,
      rejectRisk: 0,
    },
    files: [],
  };
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(fullPath));
    } else if (entry.isFile()) {
      found.push(fullPath);
    }
  }

  return found;
}

function auditSvg(filePath, root) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lower = text.toLowerCase();
  const issues = [];
  const warnings = [];
  const details = {};

  details.hasSvgTag = /<svg[\s>]/i.test(text);
  details.viewBox = getAttribute(text, 'viewBox');
  details.hasViewBox = Boolean(details.viewBox);
  details.isPreferredViewBox = normalizeSpace(details.viewBox) === '0 0 1024 1024';
  details.isSmallIconViewBox = isSmallIconViewBox(details.viewBox);
  details.width = getAttribute(text, 'width');
  details.height = getAttribute(text, 'height');
  details.hasWidthHeight = Boolean(details.width && details.height);
  details.containsImageTag = /<image[\s>]/i.test(text);
  details.containsHttpHref = /\b(?:href|xlink:href)\s*=\s*["']https?:\/\//i.test(text);
  details.containsDataImage = /data:image/i.test(text);
  details.containsExternalLinks = /https?:\/\//i.test(text);
  details.containsStroke = /\bstroke\s*=\s*["'](?!none["'])/i.test(text) || /stroke\s*:\s*(?!none\b)/i.test(text);
  details.hasReadablePaths = /<(path|line|polyline|polygon|circle|ellipse|rect)\b/i.test(text);
  details.nonStandardFills = getNonStandardFills(text);

  if (!details.hasSvgTag) {
    issues.push('Missing <svg> tag.');
  }

  if (!details.hasViewBox) {
    warnings.push('Missing viewBox.');
  } else if (!details.isPreferredViewBox) {
    warnings.push(`Non-standard viewBox: ${details.viewBox}.`);
  }

  if (details.isSmallIconViewBox) {
    warnings.push(`Small icon-style viewBox: ${details.viewBox}.`);
  }

  if (!details.hasWidthHeight) {
    warnings.push('Missing width and/or height attributes.');
  }

  if (details.nonStandardFills.length > 0) {
    warnings.push(`Non-standard fill values: ${details.nonStandardFills.join(', ')}.`);
  }

  if (!details.containsStroke && !details.hasReadablePaths) {
    warnings.push('No stroke or readable vector shapes detected.');
  } else if (!details.containsStroke) {
    warnings.push('No stroke detected.');
  }

  if (details.containsImageTag) {
    issues.push('Contains <image> tag.');
  }

  if (details.containsHttpHref) {
    issues.push('Contains http/https href.');
  }

  if (details.containsDataImage) {
    issues.push('Contains embedded data:image bitmap.');
  }

  if (details.containsExternalLinks) {
    issues.push('Contains external link text.');
  }

  details.potentiallyFenixSafe = issues.length === 0;

  let status = 'NEEDS_REVIEW';
  if (issues.length > 0) {
    status = 'REJECT_RISK';
  } else if (
    details.isPreferredViewBox &&
    !details.containsImageTag &&
    !details.containsExternalLinks &&
    !details.containsDataImage &&
    (details.containsStroke || details.hasReadablePaths)
  ) {
    status = 'FENIX_OK';
  }

  return {
    path: relativePath(filePath, root),
    type: 'svg',
    status,
    issues,
    warnings,
    details,
  };
}

function auditPng(filePath, root) {
  const issues = [];
  const warnings = [];
  const details = {};
  const buffer = fs.readFileSync(filePath);

  details.fileSizeBytes = buffer.length;
  details.hasValidSignature = buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);

  if (!details.hasValidSignature) {
    issues.push('Invalid PNG signature.');
    return pngResult(filePath, root, 'REJECT_RISK', issues, warnings, details);
  }

  const ihdrType = buffer.subarray(12, 16).toString('ascii');
  details.hasIHDR = ihdrType === 'IHDR';

  if (!details.hasIHDR || buffer.length < 33) {
    issues.push('Cannot read PNG IHDR dimensions.');
    return pngResult(filePath, root, 'REJECT_RISK', issues, warnings, details);
  }

  details.width = buffer.readUInt32BE(16);
  details.height = buffer.readUInt32BE(20);
  details.bitDepth = buffer.readUInt8(24);
  details.colorType = buffer.readUInt8(25);
  details.hasAlpha = details.colorType === 4 || details.colorType === 6;
  details.isFullPage = details.width === 2550 && details.height === 3300;
  details.meetsAssetMinimum = details.width >= 1024 && details.height >= 1024;
  details.isVerySmallFile = details.fileSizeBytes < 1024;
  details.aspectRatio = Number((details.width / details.height).toFixed(4));
  details.potentiallyFullPage = isNear(details.aspectRatio, 2550 / 3300, 0.02);
  details.potentiallySingleAsset = !details.isFullPage && details.meetsAssetMinimum;

  if (details.isVerySmallFile) {
    warnings.push('Very small PNG file size.');
  }

  if (!details.meetsAssetMinimum && !details.isFullPage) {
    warnings.push('PNG is smaller than 1024x1024.');
  }

  if (!details.isFullPage && !details.potentiallySingleAsset) {
    warnings.push('Cannot clearly classify as full page or single asset.');
  }

  if (details.potentiallyFullPage && !details.isFullPage) {
    warnings.push('Looks like a full-page ratio but is not 2550x3300.');
  }

  let status = 'NEEDS_REVIEW';
  if (details.isFullPage) {
    status = 'FENIX_OK_FULL_PAGE';
  } else if (details.meetsAssetMinimum) {
    status = 'FENIX_OK_ASSET';
  }

  return pngResult(filePath, root, status, issues, warnings, details);
}

function pngResult(filePath, root, status, issues, warnings, details) {
  return {
    path: relativePath(filePath, root),
    type: 'png',
    status,
    issues,
    warnings,
    details,
  };
}

function getAttribute(text, attributeName) {
  const pattern = new RegExp(`\\b${attributeName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function getNonStandardFills(text) {
  const allowed = new Set(['none', 'transparent', 'white', '#fff', '#ffffff', 'black', '#000', '#000000']);
  const fills = new Set();
  const attrPattern = /\bfill\s*=\s*["']([^"']+)["']/gi;
  const stylePattern = /fill\s*:\s*([^;"']+)/gi;

  collectFillMatches(text, attrPattern, allowed, fills);
  collectFillMatches(text, stylePattern, allowed, fills);

  return Array.from(fills).sort();
}

function collectFillMatches(text, pattern, allowed, fills) {
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[1].trim().toLowerCase();
    if (value.startsWith('url(')) {
      fills.add(match[1].trim());
    } else if (!allowed.has(value) && value !== 'currentcolor') {
      fills.add(match[1].trim());
    }
  }
}

function normalizeSpace(value) {
  return value ? value.trim().replace(/,/g, ' ').replace(/\s+/g, ' ') : null;
}

function isSmallIconViewBox(viewBox) {
  const normalized = normalizeSpace(viewBox);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split(' ').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return false;
  }

  return parts[2] <= 64 && parts[3] <= 64;
}

function isNear(value, expected, tolerance) {
  return Math.abs(value - expected) <= tolerance;
}

function summarize(report) {
  report.summary.totalFiles = report.files.length;
  report.summary.svgCount = report.files.filter((file) => file.type === 'svg').length;
  report.summary.pngCount = report.files.filter((file) => file.type === 'png').length;
  report.summary.fenixOk = report.files.filter((file) => file.status.startsWith('FENIX_OK')).length;
  report.summary.needsReview = report.files.filter((file) => file.status === 'NEEDS_REVIEW').length;
  report.summary.rejectRisk = report.files.filter((file) => file.status === 'REJECT_RISK').length;
}

function writeReports(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(JSON_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(MD_REPORT, renderMarkdown(report), 'utf8');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# FENIX Asset Audit Report');
  lines.push('');
  lines.push(`Created at: ${report.createdAt}`);
  lines.push(`Root: ${report.root}`);
  lines.push('');

  if (report.message) {
    lines.push(`Message: ${report.message}`);
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total files: ${report.summary.totalFiles}`);
  lines.push(`- SVG files: ${report.summary.svgCount}`);
  lines.push(`- PNG files: ${report.summary.pngCount}`);
  lines.push(`- FENIX OK: ${report.summary.fenixOk}`);
  lines.push(`- Needs review: ${report.summary.needsReview}`);
  lines.push(`- Reject risk: ${report.summary.rejectRisk}`);
  lines.push('');

  appendStatusSection(lines, report, 'FENIX_OK', 'FENIX_OK');
  appendStatusSection(lines, report, 'FENIX_OK_FULL_PAGE', 'FENIX_OK_FULL_PAGE');
  appendStatusSection(lines, report, 'FENIX_OK_ASSET', 'FENIX_OK_ASSET');
  appendStatusSection(lines, report, 'NEEDS_REVIEW', 'NEEDS_REVIEW');
  appendStatusSection(lines, report, 'REJECT_RISK', 'REJECT_RISK');

  lines.push('## Recommendations');
  lines.push('');
  lines.push('- Test FENIX_OK assets in the target Fenix module before production use.');
  lines.push('- Review NEEDS_REVIEW files manually for visual quality and technical cleanup.');
  lines.push('- Do not use REJECT_RISK files in canvas/PDF workflows until cleaned.');
  lines.push('- Keep raw imports separate from approved production assets.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function appendStatusSection(lines, report, status, title) {
  const files = report.files.filter((file) => file.status === status);
  lines.push(`## ${title}`);
  lines.push('');

  if (files.length === 0) {
    lines.push('- None');
    lines.push('');
    return;
  }

  for (const file of files) {
    const notes = [...file.issues, ...file.warnings];
    const suffix = notes.length > 0 ? ` - ${notes.join(' ')}` : '';
    lines.push(`- ${file.path}${suffix}`);
  }

  lines.push('');
}

function printReport(report) {
  console.log('FENIX Asset Audit');
  console.log(`Root: ${report.root}`);

  if (report.message) {
    console.log(report.message);
  }

  console.log(`Total files: ${report.summary.totalFiles}`);
  console.log(`SVG files: ${report.summary.svgCount}`);
  console.log(`PNG files: ${report.summary.pngCount}`);
  console.log(`FENIX OK: ${report.summary.fenixOk}`);
  console.log(`Needs review: ${report.summary.needsReview}`);
  console.log(`Reject risk: ${report.summary.rejectRisk}`);
  console.log(`JSON report: ${JSON_REPORT}`);
  console.log(`Markdown report: ${MD_REPORT}`);
}

function relativePath(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

main();
