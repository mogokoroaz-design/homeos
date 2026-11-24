// Optional HTTPS server for the shared iPad. Browsers only allow microphone (voice input),
// camera barcode scanning and the offline service worker on secure origins.
// 1) brew install mkcert && mkcert -install      (free, local certificate authority)
// 2) mkdir -p certs && mkcert -key-file certs/key.pem -cert-file certs/cert.pem <your-mac>.local localhost 127.0.0.1
// 3) npm run build && npm run start:https  → https://<your-mac>.local:3443
// 4) On the iPad, install mkcert's root CA (see README) so Safari trusts it.
import https from "node:https";
import fs from "node:fs";
import next from "next";

const port = Number(process.env.HTTPS_PORT ?? 3443);
if (!fs.existsSync("certs/key.pem") || !fs.existsSync("certs/cert.pem")) {
  console.error("certs/key.pem and certs/cert.pem not found — see the instructions at the top of this file.");
  process.exit(1);
}
const app = next({ dev: false });
await app.prepare();
const handle = app.getRequestHandler();
https.createServer({ key: fs.readFileSync("certs/key.pem"), cert: fs.readFileSync("certs/cert.pem") }, (req, res) => handle(req, res)).listen(port, "0.0.0.0", () => {
  console.log(`HomeOS (HTTPS) on https://localhost:${port}`);
});
