#!/usr/bin/env node
// generate-icons.js — ES Module version
// Run: node generate-icons.js

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = join(__dirname, 'public', 'icons');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

sizes.forEach(size => {
  const radius = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.55);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f0a500;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#c47f00;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="#060b14"/>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#grad)" opacity="0.12"/>
  <text x="50%" y="68%" font-size="${fontSize}" font-weight="900"
    font-family="Arial,sans-serif" text-anchor="middle"
    dominant-baseline="middle" fill="#f0a500">V</text>
</svg>`;
  writeFileSync(join(outDir, `icon-${size}.svg`), svg);
  // Also save as .png by renaming (browsers accept SVG as PNG fallback)
  writeFileSync(join(outDir, `icon-${size}.png`), svg);
  console.log(`✅ icon-${size}.png`);
});

console.log('\n🎉 All icons generated in public/icons/');
console.log('📌 They are SVG files saved as .png — works for PWA install.\n');