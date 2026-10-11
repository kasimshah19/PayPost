/**
 * Verification script for architectural diagrams
 * Confirms all 25 diagrams are present in docs/diagrams/
 */
const fs = require('fs');
const path = require('path');

const DIAGRAMS_DIR = path.resolve(__dirname, '../../docs/diagrams');

function checkDiagrams() {
  if (!fs.existsSync(DIAGRAMS_DIR)) {
    console.error('docs/diagrams directory not found!');
    return false;
  }
  const files = fs.readdirSync(DIAGRAMS_DIR).filter((f) => f.endsWith('.md'));
  console.log(`Found ${files.length} diagrams in docs/diagrams/`);
  return files.length >= 25;
}

if (require.main === module) {
  checkDiagrams();
}

module.exports = { checkDiagrams };
