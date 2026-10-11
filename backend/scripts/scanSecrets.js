/**
 * Secret & Sensitive Data Scanner
 * Scans all git-tracked files for potential secrets:
 * - MongoDB connection strings with real passwords
 * - Real JWT secrets
 * - Private key blocks
 * - Tracked .env files
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('[SECURITY SCAN] Starting secret scan on git-tracked files...');

// Get all files tracked by git
let files = [];
try {
  const stdout = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8' });
  files = stdout.split('\n').map(f => f.trim()).filter(Boolean);
} catch (err) {
  console.error('[SECURITY SCAN] Error running git ls-files:', err.message);
  process.exit(1);
}

let violations = [];

// Patterns to detect
const MONGO_PASSWORD_REGEX = /mongodb(\+srv)?:\/\/[^:\s]+:([^@\s]+)@/i;
const PRIVATE_KEY_REGEX = /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const JWT_SECRET_HARDCODED = /JWT_SECRET\s*=\s*['"]?([a-zA-Z0-9_\-!@#$%^&*+=]{12,})['"]?/i;

const SAFE_PLACEHOLDERS = [
  'password', 'your_password', 'change_me', 'testsecret', 'placeholder',
  'username', 'your_mongodb_atlas_connection_string', 'cluster.mongodb.net',
  'your_jwt_secret_min_32_characters_random', 'your_super_secret_jwt_key_at_least_32_characters_long'
];

for (const relFile of files) {
  // Check 1: No .env files should be tracked (except .env.example)
  const basename = path.basename(relFile);
  if (basename.startsWith('.env') && basename !== '.env.example') {
    violations.push({
      file: relFile,
      rule: 'Tracked .env file detected',
      snippet: relFile
    });
    continue;
  }

  const absPath = path.join(ROOT_DIR, relFile);
  if (!fs.existsSync(absPath)) continue;

  // Skip binary/large media files
  const ext = path.extname(relFile).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.ico', '.pdf', '.zip'].includes(ext)) {
    continue;
  }

  let content = '';
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    continue;
  }

  // Check 2: Private keys
  if (PRIVATE_KEY_REGEX.test(content)) {
    violations.push({
      file: relFile,
      rule: 'Private key block found',
      snippet: '-----BEGIN PRIVATE KEY-----'
    });
  }

  // Check 3: Real MongoDB connection string with non-placeholder password
  const mongoMatch = content.match(MONGO_PASSWORD_REGEX);
  if (mongoMatch) {
    const rawPass = mongoMatch[2];
    const isSafe = SAFE_PLACEHOLDERS.some(p => rawPass.toLowerCase().includes(p.toLowerCase()));
    if (!isSafe && !relFile.includes('tests/')) {
      violations.push({
        file: relFile,
        rule: 'Potentially real MongoDB password in connection string',
        snippet: mongoMatch[0].replace(rawPass, '***')
      });
    }
  }

  // Check 4: Hardcoded JWT secrets (in non-test, non-example files)
  if (!relFile.includes('.env.example') && !relFile.includes('tests/') && !relFile.includes('scanSecrets.js')) {
    const jwtMatch = content.match(JWT_SECRET_HARDCODED);
    if (jwtMatch) {
      const val = jwtMatch[1];
      const isSafe = SAFE_PLACEHOLDERS.some(p => val.toLowerCase().includes(p.toLowerCase()));
      if (!isSafe) {
        violations.push({
          file: relFile,
          rule: 'Potentially real hardcoded JWT_SECRET',
          snippet: `JWT_SECRET=${val.slice(0, 3)}***`
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\n[SECURITY SCAN] FAILED! Detected security violations:');
  violations.forEach(v => {
    console.error(`- [${v.rule}] in ${v.file}: ${v.snippet}`);
  });
  process.exit(1);
} else {
  console.log(`[SECURITY SCAN] PASSED! Scanned ${files.length} tracked files. Zero secrets or tracked .env files found.\n`);
  process.exit(0);
}
