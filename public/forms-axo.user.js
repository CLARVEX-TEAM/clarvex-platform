// ==UserScript==
// @name         Clarvex — Llenar el Forms de asistencia AXO
// @namespace    https://team.clarvex.tech
// @version      1.0.0
// @description  Llena el Forms de asistencia de AXO con los datos y las fotos de entrada de hoy. NUNCA lo envía: tú revisas y picas Enviar.
// @match        https://forms.cloud.microsoft/*
// @match        https://forms.office.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      team.clarvex.tech
// @downloadURL  https://team.clarvex.tech/forms-axo.user.js
// @updateURL    https://team.clarvex.tech/forms-axo.user.js
// @run-at       document-idle
// ==/UserScript==

/*
 * Cómo funciona (ver lib/forms-axo.ts en clarvex-platform):
 *
 *  1. Pide a Clarvex el paquete de HOY con tu código personal (se lo pides al
 *     bot de WhatsApp: «código forms»).
 *  2. Página 1: elige TIENDA y SUPERVISOR y pone la FECHA. Pica «Siguiente».
 *  3. Página 2: por cada «Nombre …» (Gerente, Subgerente, Asesor 1…) escribe el
 *     nombre, la hora de ingreso y adjunta la foto del marcaje.
 *  4. Se DETIENE. Nunca pica «Enviar».
 *
 * ⚠️ Los campos se buscan por su TÍTULO, no por su posición. Si AXO cambia
 * el Forms y algo no se encuentra, lo dice y no adivina.
 */
(function () {
  "use strict";

  const API = "https://team.clarvex.tech/api/forms-axo/paquete";
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const plano = (t) =>
    String(t || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/^\s*\d+\.\s*/, "")
      .replace(/[.:]+\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  // ── Interfaz ────────────────────────────────────────────────────────────
  function aviso(texto, tipo) {
    let caja = document.getElementById("clarvex-aviso");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "clarvex-aviso";
      caja.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:72px;z-index:2147483647;padding:12px 14px;border-radius:12px;font:14px/1.4 system-ui,sans-serif;white-space:pre-line;box-shadow:0 6px 24px rgba(0,0,0,.35);max-height:45vh;overflow:auto";
      caja.addEventListener("click", () => caja.remove());
      document.body.appendChild(caja);
    }
    const colores = { ok: ["#0f5132", "#d1e7dd"], error: ["#842029", "#f8d7da"], info: ["#0b2a5b", "#dbe7ff"] };
    const [fg, bg] = colores[tipo || "info"];
    caja.style.color = fg;
    caja.style.background = bg;
    caja.textContent = texto;
  }

  function boton() {
    if (document.getElementById("clarvex-llenar")) return;
    if (!/asistencia/i.test(document.title)) return; // solo en el Forms de asistencia
    const b = document.createElement("button");
    b.id = "clarvex-llenar";
    b.type = "button";
    b.textContent = "Llenar desde Clarvex";
    b.style.cssText =
      "position:fixed;right:12px;bottom:16px;z-index:2147483647;padding:12px 16px;border:0;border-radius:999px;background:#2563eb;color:#fff;font:600 15px system-ui,sans-serif;box-shadow:0 6px 18px rgba(37,99,235,.45)";
    b.addEventListener("click", () => llenar().catch((e) => aviso("No se pudo llenar: " + (e && e.message ? e.message : e), "error")));
    document.body.appendChild(b);
  }

  // ── Clarvex ─────────────────────────────────────────────────────────────
  function pedirPaquete(codigo) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: API,
        headers: { Authorization: "Bearer " + codigo },
        timeout: 60000,
        onload: (r) => {
          let j = null;
          try {
            j = JSON.parse(r.responseText);
          } catch (e) {
            /* sin JSON */
          }
          if (r.status === 401) return reject(Object.assign(new Error((j && j.error) || "Código inválido."), { codigoMalo: true }));
          if (r.status !== 200 || !j) return reject(new Error((j && j.error) || "Clarvex respondió " + r.status));
          resolve(j);
        },
        onerror: () => reject(new Error("Sin conexión con Clarvex.")),
        ontimeout: () => reject(new Error("Clarvex tardó demasiado."))
      });
    });
  }

  async function codigo() {
    let c = GM_getValue("codigo", "");
    if (!c) {
      c = (window.prompt("Pega tu código de Clarvex (pídeselo al bot de WhatsApp: «código forms»):") || "").trim();
      if (!c) throw new Error("Sin código no puedo pedir los datos.");
      GM_setValue("codigo", c);
    }
    return c;
  }

  // ── El Forms ────────────────────────────────────────────────────────────
  const preguntas = () =>
    [...document.querySelectorAll('[data-automation-id="questionItem"]')].map((el) => ({
      el,
      titulo: plano(el.querySelector('[data-automation-id="questionTitle"] [role="heading"]')?.innerText || el.querySelector('[data-automation-id="questionTitle"]')?.innerText)
    }));

  function escribir(input, valor) {
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, valor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function elegir(pregunta, opcion) {
    const abrir = pregunta.el.querySelector('[aria-haspopup="listbox"]');
    if (!abrir) return false;
    abrir.click();
    await esperar(600);
    const buscada = plano(opcion);
    const op = [...document.querySelectorAll('[role="option"]')].find((o) => plano(o.innerText) === buscada);
    if (!op) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return false;
    }
    op.click();
    await esperar(400);
    return true;
  }

  async function adjuntar(pregunta, foto, nombreArchivo) {
    let input = pregunta.el.querySelector('input[type="file"]');
    if (!input) {
      // En algunas versiones el input nace al picar «Cargar archivo».
      const cargar = [...pregunta.el.querySelectorAll("button")].find((b) => /cargar|upload/i.test(b.innerText || b.getAttribute("aria-label") || ""));
      if (cargar) {
        const original = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function () {
          if (this.type !== "file") return original.call(this);
          input = this; // no abrir el selector del teléfono
        };
        cargar.click();
        await esperar(300);
        HTMLInputElement.prototype.click = original;
      }
    }
    if (!input) return false;
    const bytes = Uint8Array.from(atob(foto.base64), (c) => c.charCodeAt(0));
    const archivo = new File([bytes], nombreArchivo, { type: foto.mimeType || "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(archivo);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await esperar(2500); // el Forms sube el archivo en cuanto lo recibe
    return true;
  }

  function fechaForms(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    return d + "/" + m + "/" + a; // el Forms pide d/M/yyyy
  }

  async function pagina1(p, notas) {
    const qs = preguntas();
    const tienda = qs.find((q) => q.titulo === "tienda");
    const supervisor = qs.find((q) => q.titulo === "supervisor");
    const fecha = qs.find((q) => q.titulo === "fecha");
    if (!tienda || !supervisor || !fecha) return false; // no estamos en la página 1
    if (!(await elegir(tienda, p.tienda))) notas.push("⚠️ No encontré la tienda «" + p.tienda + "» en la lista.");
    if (!(await elegir(supervisor, p.supervisor))) notas.push("⚠️ No encontré al supervisor «" + p.supervisor + "» en la lista.");
    const inputFecha = fecha.el.querySelector("input");
    if (inputFecha) escribir(inputFecha, fechaForms(p.fecha));
    else notas.push("⚠️ No encontré el campo de fecha.");
    await esperar(400);
    const siguiente = [...document.querySelectorAll("button")].find((b) => plano(b.innerText) === "siguiente");
    if (!siguiente) return true;
    siguiente.click();
    for (let i = 0; i < 20 && preguntas().some((q) => q.titulo === "tienda"); i++) await esperar(300);
    if (preguntas().some((q) => q.titulo === "tienda")) {
      throw new Error("El Forms no pasó a la siguiente página. Revisa la tienda, el supervisor y la fecha.\n" + notas.join("\n"));
    }
    return true;
  }

  // «Nombre Gerente» → Gerente; «Nombre Subgerente» → Subgerente; «Nombre Asesor 3» → Asesor 3.
  function lugarDe(titulo) {
    const m = /^nombre (gerente|subgerente|asesor \d+)$/.exec(titulo);
    return m ? m[1] : null;
  }

  async function pagina2(p, notas) {
    const porLugar = new Map(p.lugares.map((l) => [plano(l.etiqueta), l]));
    const usados = new Set();
    let actual = null;
    for (const q of preguntas()) {
      const lugar = lugarDe(q.titulo);
      if (q.titulo.startsWith("nombre ")) {
        actual = lugar ? porLugar.get(lugar) || null : null; // Subgerente Jr., Almacenista: vacíos
        if (actual) {
          const input = q.el.querySelector("input,textarea");
          if (input) escribir(input, actual.nombre);
          usados.add(plano(actual.etiqueta));
        }
        continue;
      }
      if (!actual) continue;
      if (q.titulo === "hora de ingreso") {
        const input = q.el.querySelector("input,textarea");
        if (input && actual.hora) escribir(input, actual.hora);
        continue;
      }
      if (q.titulo.startsWith("imagen de checado")) {
        if (!actual.foto) notas.push("⏳ " + actual.etiqueta + " (" + actual.nombre + "): no ha mandado su foto al bot.");
        else if (!(await adjuntar(q, actual.foto, plano(actual.etiqueta).replace(/\s+/g, "-") + ".jpg"))) {
          notas.push("⚠️ " + actual.etiqueta + ": no pude adjuntar la foto, adjúntala a mano.");
        }
        actual = { ...actual, foto: null, hora: null }; // una foto y una hora por persona
      }
    }
    for (const l of p.lugares) {
      if (!usados.has(plano(l.etiqueta))) notas.push("⚠️ " + l.etiqueta + " (" + l.nombre + ") no tiene lugar en el Forms: llénalo a mano.");
    }
    return usados.size;
  }

  async function llenar() {
    aviso("Pidiendo los datos de hoy a Clarvex…");
    let paquete;
    try {
      paquete = await pedirPaquete(await codigo());
    } catch (e) {
      if (e.codigoMalo) GM_setValue("codigo", "");
      throw e;
    }
    const notas = [];
    await pagina1(paquete, notas);
    aviso("Llenando al personal…");
    await esperar(800);
    const llenos = await pagina2(paquete, notas);
    const resumen = [
      "✅ Listo: llené " + llenos + " persona(s) del " + paquete.fecha + ".",
      notas.length ? "\n" + notas.join("\n") : "",
      "\n👉 Revisa todo y pica «Enviar» tú. Este botón nunca envía.",
      "(Toca este aviso para cerrarlo.)"
    ].join("\n");
    aviso(resumen, notas.length ? "info" : "ok");
  }

  boton();
  new MutationObserver(boton).observe(document.documentElement, { childList: true, subtree: true });
})();
