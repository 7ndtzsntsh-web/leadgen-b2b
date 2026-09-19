// Roda o scanner oficial do MDN HTTP Observatory (@mdn/mdn-http-observatory) contra o servidor LOCAL,
// antes de publicar. O Observatório do site só alcança endereços públicos; aqui usamos um proxy HTTPS de teste
// (certificado autoassinado) e o domínio localtest.me, que sempre resolve para 127.0.0.1.
//
// Uso:  npm run build && npm start        (em outro terminal)
//       npm run security:scan             (ou: node scripts/observatory-local.mjs 3000)
//
// Requer: openssl (vem com o Git for Windows) e internet (o npx baixa o scanner do MDN).
// Observação: o teste de HSTS depende de certificado válido; no proxy de teste ele sempre acusa
// "hsts-invalid-cert". Na Vercel o certificado é válido, então esse item é ignorado no resultado local.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";

const targetPort = Number(process.argv[2] ?? 3000);
const proxyPort = 8443;
const IGNORED_LOCALLY = new Set(["hsts-invalid-cert", "hsts-not-implemented-no-https", "redirection-not-needed-no-http"]);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(2);
}

// 1) O servidor local precisa estar no ar.
await new Promise((resolve) => {
  const req = http.get({ host: "127.0.0.1", port: targetPort, path: "/", timeout: 5000 }, (res) => { res.resume(); resolve(); });
  req.on("error", () => fail(`Nada respondendo em http://localhost:${targetPort}. Rode "npm run build && npm start" em outro terminal.`));
  req.on("timeout", () => { req.destroy(); fail("Tempo esgotado ao falar com o servidor local."); });
});

// 2) Certificado de teste (vale 1 dia, descartado ao final).
const dir = mkdtempSync(path.join(tmpdir(), "observatory-"));
const keyFile = path.join(dir, "key.pem");
const certFile = path.join(dir, "cert.pem");
const openssl = spawnSync(
  "openssl",
  ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "1", "-subj", "/CN=localhost"],
  { env: { ...process.env, MSYS_NO_PATHCONV: "1" }, encoding: "utf8" }
);
if (openssl.status !== 0) fail(`Não consegui gerar o certificado de teste (openssl). ${openssl.stderr || openssl.error?.message || ""}`);

// 3) Proxy HTTPS -> servidor local.
const server = https
  .createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
    const upstream = http.request(
      { host: "127.0.0.1", port: targetPort, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${targetPort}` } },
      (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); }
    );
    upstream.on("error", () => { res.writeHead(502); res.end("bad gateway"); });
    req.pipe(upstream);
  })
  .listen(proxyPort);
await new Promise((resolve) => server.once("listening", resolve));

// 4) Scanner oficial do MDN (assíncrono para o proxy continuar atendendo).
const { spawn } = await import("node:child_process");
const output = await new Promise((resolve) => {
  // Comando único e fixo (sem entrada externa): funciona em Windows/macOS/Linux sem o aviso do `shell` com argumentos.
  const child = spawn(`npx --yes @mdn/mdn-http-observatory localtest.me:${proxyPort}`, {
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    shell: true,
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.on("close", () => resolve(stdout));
});
server.close();
rmSync(dir, { recursive: true, force: true });

let result;
try {
  result = JSON.parse(output.slice(output.indexOf("{")));
} catch {
  fail("Não consegui ler a resposta do scanner. Verifique a internet (localtest.me e npm).");
}
if (result.error) fail(`O scanner recusou o teste: ${result.error}`);

// 5) Relatório.
const tests = Object.entries(result.tests);
const failures = tests.filter(([, t]) => !t.pass && !IGNORED_LOCALLY.has(t.result));
console.log(`\nMDN HTTP Observatory (local) — nota ${result.scan.grade}, score ${result.scan.score}\n`);
for (const [name, t] of tests) {
  const ignored = !t.pass && IGNORED_LOCALLY.has(t.result);
  const mark = t.pass ? "✔" : ignored ? "~" : "✖";
  console.log(`  ${mark} ${name.padEnd(30)} ${String(t.scoreModifier).padStart(4)}  ${t.result}${ignored ? "  (ignorado localmente: depende do certificado real)" : ""}`);
}
if (failures.length === 0) {
  console.log("\n✔ Nenhum problema. Depois de publicar, confirme no site: https://developer.mozilla.org/en-US/observatory\n");
} else {
  console.log(`\n✖ ${failures.length} teste(s) com problema. Corrija antes de publicar.\n`);
  process.exit(1);
}
