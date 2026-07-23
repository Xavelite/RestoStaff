import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1'
});
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });
if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error('P-256 key generation returned an incomplete key pair.');
}

const applicationServerKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(publicJwk.x, 'base64url'),
  Buffer.from(publicJwk.y, 'base64url')
]).toString('base64url');

console.log(JSON.stringify({
  publicKey: applicationServerKey,
  privateKey: privateJwk.d,
  dispatchSecret: randomBytes(32).toString('base64url')
}, null, 2));
