#!/usr/bin/env node
import { Resvg } from '@resvg/resvg-js';
import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HELP = `Usage: node code/export-round.mjs [--source DIR] [--output DIR]
       node code/export-round.mjs <sourceDir> <outputDir>

Defaults: outputs/portraits/full -> outputs/portraits
Exports all input PNGs: avatar-512/, avatar-round/ (256 and 64),
contact-sheet-round.png, avatars-512.zip (all exports).
Source images are never modified. Existing matching exports are replaced;
unrelated output files are retained. Use a fresh output directory for a new set.`;
const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[c]));

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return null;
  if (args.length === 2 && args.every((arg) => !arg.startsWith('-'))) {
    return { source: path.resolve(args[0]), output: path.resolve(args[1]) };
  }
  const options = {
    source: path.join(ROOT, 'outputs/portraits/full'),
    output: path.join(ROOT, 'outputs/portraits'),
  };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--source', '--output'].includes(flag) || !args[i + 1] ||
        args[i + 1].startsWith('-') || seen.has(flag)) {
      throw new Error('Invalid arguments. Use --help for usage.');
    }
    seen.add(flag);
    options[flag.slice(2)] = path.resolve(args[i + 1]);
  }
  return options;
}

function pngSize(data) {
  if (data.length < 33 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      data.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Input must be a valid square PNG.');
  }
  const w = data.readUInt32BE(16), h = data.readUInt32BE(20);
  if (!w || w !== h) throw new Error('Input must be a nonempty square PNG; no automatic cropping is applied.');
  return w;
}

function render(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

function avatar(b64, size, round) {
  const radius = size / 2;
  return render(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><clipPath id="c"><circle cx="${radius}" cy="${radius}" r="${radius}"/></clipPath></defs>
    <image ${round ? 'clip-path="url(#c)"' : ''} width="${size}" height="${size}" href="data:image/png;base64,${b64}"/>
  </svg>`, size);
}

function exportAvatars({ source, output }) {
  source = fs.realpathSync(source);
  // Resolve an existing output path before testing aliases of the input directory.
  if (fs.existsSync(output)) output = fs.realpathSync(output);
  if (source === output || source.startsWith(output + path.sep) &&
      ['avatar-512', 'avatar-round'].includes(path.relative(output, source).split(path.sep)[0])) {
    throw new Error('Output would overwrite source images. Choose another output directory.');
  }
  const files = fs.readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
    .map((entry) => entry.name).sort();
  if (!files.length) throw new Error('No PNG images found in source directory.');
  const names = files.map((file) => file.replace(/\.png$/i, ''));
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    throw new Error('Duplicate avatar names (case-insensitive).');
  }
  const targets = names.flatMap((name) => [
    `avatar-512/${name}.png`, `avatar-round/${name}-256.png`, `avatar-round/${name}-64.png`,
  ]).concat('contact-sheet-round.png', 'avatars-512.zip');
  for (const relative of targets) {
    const target = path.join(output, relative);
    for (const candidate of [path.dirname(target), target]) {
      if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) {
        throw new Error('Export targets must not be symbolic links.');
      }
    }
  }
  const images = files.map((file) => {
    const data = fs.readFileSync(path.join(source, file));
    pngSize(data);
    return data.toString('base64');
  });
  // Prepare the complete export before writing any output.
  const artifacts = {};
  names.forEach((name, i) => {
    artifacts[`avatar-512/${name}.png`] = avatar(images[i], 512, false);
    for (const size of [256, 64]) {
      artifacts[`avatar-round/${name}-${size}.png`] = avatar(images[i], size, true);
    }
  });
  const cell = 340, cols = Math.min(4, names.length), pad = 18, labelH = 30;
  const rows = Math.ceil(names.length / cols);
  const W = cols * cell + (cols + 1) * pad;
  const H = rows * (cell + labelH) + (rows + 1) * pad;
  let body = '';
  names.forEach((name, i) => {
    const x = pad + (i % cols) * (cell + pad);
    const y = pad + Math.floor(i / cols) * (cell + labelH + pad);
    const r = cell / 2;
    body += `<defs><clipPath id="cp${i}"><circle cx="${x + r}" cy="${y + r}" r="${r}"/></clipPath></defs>`;
    body += `<image clip-path="url(#cp${i})" x="${x}" y="${y}" width="${cell}" height="${cell}" href="data:image/png;base64,${images[i]}"/>`;
    body += `<text x="${x + r}" y="${y + cell + 22}" text-anchor="middle" font-family="Helvetica,Arial" font-size="16" fill="#6b6b72">${escapeXml(name)}</text>`;
  });
  artifacts['contact-sheet-round.png'] = render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body}</svg>`, 1400);
  const archive = zipSync(artifacts);
  for (const [relative, data] of Object.entries(artifacts)) {
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  fs.writeFileSync(path.join(output, 'avatars-512.zip'), archive);
  console.log(`Exported ${names.length} avatars: ${names.length} squares, ${names.length * 2} circles, 1 overview, 1 ZIP.`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options) exportAvatars(options);
  else console.log(HELP);
} catch (error) {
  console.error(`Export failed: ${error.message}`);
  process.exitCode = 1;
}
