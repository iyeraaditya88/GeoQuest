// Create a GeoQuest login for the hosted site.
//
//   npm run user:add -- <username>            → prints a GEOQUEST_USERS entry
//   npm run user:add -- <username> --secret   → also prints a fresh SESSION_SECRET
//
// The password is typed here (hidden) and only its scrypt hash is printed. Paste the output
// into Vercel → Project → Settings → Environment Variables (Production), then redeploy.
import { randomBytes } from 'node:crypto';
import { hashUser } from '../server/auth.js';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
if (!name || !/^[a-z0-9._-]{2,32}$/.test(name)) {
  console.error('Usage: npm run user:add -- <username> [--secret]   (2–32 chars: letters, digits, . _ -)');
  process.exit(1);
}

/** Read a line from the terminal without echoing it. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(value); return; }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); } // Ctrl-C
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

const pw = await askHidden(`Password for ${name}: `);
if (pw.length < 8) { console.error('Use at least 8 characters.'); process.exit(1); }
const again = await askHidden('Repeat password: ');
if (again !== pw) { console.error('Passwords didn’t match.'); process.exit(1); }

const entry = await hashUser(name, pw);
console.log('\nAdd this to GEOQUEST_USERS in Vercel (comma-separate multiple users):\n');
console.log(entry);
if (args.includes('--secret')) {
  console.log('\nAnd set SESSION_SECRET (once — changing it signs everyone out):\n');
  console.log(randomBytes(32).toString('base64url'));
}
console.log('\nVercel → geoquest → Settings → Environment Variables → Production, then redeploy.');
