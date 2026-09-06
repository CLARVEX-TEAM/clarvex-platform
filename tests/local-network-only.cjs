// Precarga exclusivamente para pruebas en un checkout desechable sin .env.
// Se hereda por next dev; un SDK o fetch olvidado no puede salir a Internet.
const fs = require("node:fs");
const net = require("node:net");
const dns = require("node:dns");
const { syncBuiltinESMExports } = require("node:module");
for (const name of [".env", ".env.local", ".env.test", ".env.test.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]) {
  if (fs.existsSync(name)) throw new Error("Las pruebas aisladas requieren un checkout sin archivos .env.");
}
const local = host => [undefined, "localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
const deny = host => { if (!local(host)) throw new Error(`Red externa bloqueada en pruebas: ${host}`); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = first && typeof first === "object" ? first : { host: typeof args[1] === "string" ? args[1] : undefined };
  // Las rutas de sockets/IPC no son conexiones TCP.
  if (!options.path) deny(options.host || options.hostname);
  return connect.apply(this, args);
};
const lookup = dns.lookup;
dns.lookup = function (hostname, ...args) { deny(hostname); return lookup.call(this, hostname, ...args); };
syncBuiltinESMExports();
