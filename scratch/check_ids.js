const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const jsPath = path.join(__dirname, '..', 'app.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

// Find all IDs in HTML
const htmlIds = new Set();
const idRegex = /id=["']([^"']+)["']/g;
let match;
while ((match = idRegex.exec(htmlContent)) !== null) {
  htmlIds.add(match[1]);
}

// Find all document.getElementById calls in JS
const getElementRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
const queriedIds = new Set();
while ((match = getElementRegex.exec(jsContent)) !== null) {
  queriedIds.add(match[1]);
}

// Find all querySelector calls with IDs in JS
const querySelectorRegex = /querySelector\(['"]#([^'"]+)['"]\)/g;
while ((match = querySelectorRegex.exec(jsContent)) !== null) {
  queriedIds.add(match[1]);
}

console.log(`Found ${htmlIds.size} IDs in HTML.`);
console.log(`Found ${queriedIds.size} unique IDs queried in JS.`);

console.log('\nChecking for missing IDs in HTML...');
let missingCount = 0;
for (const id of queriedIds) {
  // Ignore dynamic IDs like 'tier-rate-' + idx or 'f-disp-' + etc.
  if (id.includes('+') || id.includes('${')) {
    continue;
  }
  if (!htmlIds.has(id)) {
    console.warn(`[WARNING] ID "${id}" is queried in app.js but does not exist in index.html`);
    missingCount++;
  }
}

if (missingCount === 0) {
  console.log('[SUCCESS] All queried IDs exist in index.html!');
} else {
  console.log(`[TOTAL] ${missingCount} missing IDs found.`);
}
