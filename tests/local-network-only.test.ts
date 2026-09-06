import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("la precarga permite loopback y bloquea SDKs TCP, DNS y fetch externos", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "clarvex-network-test-"));
  try {
    const result = spawnSync(process.execPath, ["--require", path.resolve("tests/local-network-only.cjs"), "-e", `
      const assert=require('node:assert/strict'), net=require('node:net'), dns=require('node:dns');
      assert.throws(()=>net.connect(443, '203.0.113.1'), /bloqueada/);
      assert.throws(()=>dns.lookup('example.invalid', ()=>{}), /bloqueada/);
      (async()=>{
        await assert.rejects(fetch('https://example.invalid'));
        const server=net.createServer(socket=>socket.end('local'));
        server.listen(0,'127.0.0.1',()=>{
          const client=net.connect(server.address().port,'127.0.0.1');
          client.resume(); client.on('end',()=>server.close());
        });
      })().catch(e=>{console.error(e);process.exitCode=1;});
    `], { cwd, encoding: "utf8", timeout: 10000, env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
