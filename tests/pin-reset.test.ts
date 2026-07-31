import { test } from "node:test";
import assert from "node:assert/strict";
import { generateToken, hashToken, isTokenUsable, safeEqualHex, tooManyRecentRequests, MAX_REQUESTS_PER_ACCOUNT, TOKEN_TTL_MS } from "../lib/pin-reset-token";
import { hasRealEmail, PLACEHOLDER_EMAIL_DOMAIN } from "../lib/email";
import { pinResetEmail } from "../lib/email-templates";

test("token de restablecimiento", async (t) => {
  await t.test("cada token es distinto y suficientemente largo", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    assert.equal(tokens.size, 200, "no puede repetirse ninguno");
    // 32 bytes en base64url son 43 caracteres. El endpoint exige min(20).
    for (const token of tokens) assert.ok(token.length >= 40, `token corto: ${token.length}`);
  });

  await t.test("el hash es estable y no deja ver el token", () => {
    const token = generateToken();
    assert.equal(hashToken(token), hashToken(token), "mismo token, mismo hash");
    assert.notEqual(hashToken(token), token);
    assert.equal(hashToken(token).length, 64, "SHA-256 en hex");
    assert.notEqual(hashToken(token), hashToken(generateToken()));
  });

  await t.test("safeEqualHex compara bien y no revienta con basura", () => {
    const a = hashToken("uno");
    assert.equal(safeEqualHex(a, a), true);
    assert.equal(safeEqualHex(a, hashToken("dos")), false);
    assert.equal(safeEqualHex(a, "corto"), false, "longitudes distintas");
    assert.equal(safeEqualHex("zz", "zz"), false, "no es hex: no lanza, devuelve false");
  });
});

test("vigencia del enlace", async (t) => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  const futuro = new Date(now.getTime() + TOKEN_TTL_MS);
  const pasado = new Date(now.getTime() - 1000);

  await t.test("sirve mientras no haya caducado ni se haya usado", () => {
    assert.equal(isTokenUsable({ expiresAt: futuro, usedAt: null }, now), true);
  });

  await t.test("un token caducado NO sirve", () => {
    assert.equal(isTokenUsable({ expiresAt: pasado, usedAt: null }, now), false);
  });

  await t.test("UN SOLO USO: con usedAt ya no sirve, aunque no haya caducado", () => {
    assert.equal(isTokenUsable({ expiresAt: futuro, usedAt: now }, now), false);
  });

  await t.test("un token inexistente no sirve", () => {
    assert.equal(isTokenUsable(null, now), false);
  });

  await t.test("justo en el instante de caducar ya no sirve", () => {
    assert.equal(isTokenUsable({ expiresAt: now, usedAt: null }, now), false);
  });
});

test("tope de solicitudes por cuenta", async (t) => {
  await t.test("deja pedir hasta el tope y corta a partir de ahí", () => {
    assert.equal(tooManyRecentRequests(0), false);
    assert.equal(tooManyRecentRequests(MAX_REQUESTS_PER_ACCOUNT - 1), false);
    assert.equal(tooManyRecentRequests(MAX_REQUESTS_PER_ACCOUNT), true);
    assert.equal(tooManyRecentRequests(MAX_REQUESTS_PER_ACCOUNT + 5), true);
  });
});

/**
 * El punto ciego de esta función: 12 de los 17 usuarios activos tenían un
 * correo inventado por la app. Mandarles el enlace ahí es tirarlo, y peor,
 * hacerles creer que les llegó algo.
 */
test("correo real contra el relleno de la app", async (t) => {
  await t.test("el dominio de relleno NO cuenta como correo", () => {
    assert.equal(hasRealEmail(`2554@${PLACEHOLDER_EMAIL_DOMAIN}`), false);
    assert.equal(hasRealEmail(`CUALQUIERA@${PLACEHOLDER_EMAIL_DOMAIN.toUpperCase()}`), false, "sin distinguir mayúsculas");
    assert.equal(hasRealEmail(`  2554@${PLACEHOLDER_EMAIL_DOMAIN}  `), false, "con espacios alrededor");
  });

  await t.test("un correo de verdad sí cuenta", () => {
    assert.equal(hasRealEmail("juan@gmail.com"), true);
    assert.equal(hasRealEmail("alguien@clarvex.com"), true, "el dominio real de la marca no es el relleno");
  });

  await t.test("vacío, nulo o sin arroba no cuentan", () => {
    assert.equal(hasRealEmail(null), false);
    assert.equal(hasRealEmail(undefined), false);
    assert.equal(hasRealEmail(""), false);
    assert.equal(hasRealEmail("noesuncorreo"), false);
  });
});

test("plantilla del correo", async (t) => {
  const url = "https://app.adrianluna.mx/recuperar/AbC-123_xyz";
  const logoUrl = "https://app.adrianluna.mx/icon-192.png";
  const privacyUrl = "https://app.adrianluna.mx/privacidad";
  const base = { url, minutes: 30, logoUrl, privacyUrl };

  await t.test("lleva el enlace en HTML y en texto plano", () => {
    const mail = pinResetEmail({ ...base, name: "JUAN Castro" });
    assert.ok(mail.html.includes(url), "el HTML debe llevar el enlace");
    assert.ok(mail.text.includes(url), "el texto plano también, no todos pintan HTML");
    assert.ok(mail.subject.length > 0);
  });

  await t.test("saluda por el nombre de pila, no por el nombre completo", () => {
    const mail = pinResetEmail({ ...base, name: "JUAN Castro" });
    assert.ok(mail.text.includes("JUAN"));
    assert.ok(!mail.text.includes("JUAN Castro"), "el apellido sobra en un saludo");
  });

  await t.test("avisa de la caducidad para que nadie deje el enlace para mañana", () => {
    const mail = pinResetEmail({ ...base, name: "Ana" });
    assert.ok(mail.text.includes("30"));
    assert.ok(mail.html.includes("30"));
  });

  await t.test("escapa el HTML del nombre: un nombre no puede inyectar marcado", () => {
    const mail = pinResetEmail({ ...base, name: "<script>alert(1)</script>" });
    assert.ok(!mail.html.includes("<script>alert"), "debe ir escapado");
    assert.ok(mail.html.includes("&lt;script&gt;"));
  });

  /**
   * El logo es la ÚNICA imagen, y muchos clientes bloquean las imágenes por
   * omisión. Si el título viviera dentro del PNG, esas personas abrirían un
   * correo mudo justo cuando intentan recuperar su acceso.
   */
  await t.test("funciona con las imágenes bloqueadas", () => {
    const mail = pinResetEmail({ ...base, name: "Ana" });
    const sinImagenes = mail.html.replace(/<img[^>]*>/gi, "");
    assert.ok(sinImagenes.includes("Restablece tu PIN"), "el título es texto, no parte del PNG");
    assert.ok(sinImagenes.includes("Elegir un PIN nuevo"), "el botón es texto");
    assert.ok(sinImagenes.includes(url), "el enlace sigue ahí");
  });

  await t.test("la única imagen es el logo, en PNG y con texto alternativo", () => {
    const mail = pinResetEmail({ ...base, name: "Ana" });
    const imgs = mail.html.match(/<img[^>]*>/gi) ?? [];
    assert.equal(imgs.length, 1, "solo el logo");
    assert.ok(imgs[0].includes(logoUrl));
    assert.ok(/alt="[^"]+"/.test(imgs[0]), "con alt, para cuando no carga");
    assert.ok(!/\.svg/i.test(mail.html), "SVG no: Gmail no lo renderiza");
  });

  await t.test("nada de scripts ni CSS externo ni animación", () => {
    const mail = pinResetEmail({ ...base, name: "Ana" });
    assert.ok(!/<script/i.test(mail.html), "sin scripts");
    assert.ok(!/<link\s/i.test(mail.html), "sin CSS externo");
    assert.ok(!/@keyframes/i.test(mail.html), "Gmail las borra: no fingir que animan");
  });

  await t.test("el degradado lleva respaldo de color plano para Outlook", () => {
    const mail = pinResetEmail({ ...base, name: "Ana" });
    const banda = mail.html.slice(mail.html.indexOf("linear-gradient") - 200, mail.html.indexOf("linear-gradient"));
    assert.ok(banda.includes("background-color:"), "el color plano va ANTES del degradado");
  });

  await t.test("el pie legal va completo y enlaza al aviso real de la app", () => {
    const mail = pinResetEmail({ ...base, name: "Ana" });
    assert.ok(mail.html.includes("Confidencial"));
    assert.ok(mail.html.includes(privacyUrl), "el enlace del aviso no puede estar roto");
    assert.ok(mail.html.includes("No respondas a esta dirección"));
    assert.ok(mail.text.includes(privacyUrl), "también en texto plano");
    assert.ok(mail.text.includes("CONFIDENCIAL"));
  });
});
