import { generateKeyPairSync } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, '..', '..', 'keys');

if (!existsSync(keysDir)) {
  mkdirSync(keysDir, { recursive: true });
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(join(keysDir, 'private.pem'), privateKey);
writeFileSync(join(keysDir, 'public.pem'), publicKey);

console.log('RSA-2048 key pair generated in keys/');
