"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X } from "lucide-react";
import { parseAnnouncementDraft } from "@/lib/ai/announcement-draft";
import { toCopilotApiMessages } from "@/lib/ai/copilot-messages";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { CopilotAvatar } from "@/components/CopilotAvatar";
import { TypingText } from "@/components/magic/TypingText";

type PendingAction = { proposalId: string; type: string; summary: string };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: PendingAction[];
  actionStatus?: "idle" | "confirming" | "done" | "error";
  draftPublishStatus?: "idle" | "proposing" | "done" | "error";
};

function canManageAnnouncements(role: string | undefined) {
  return role === "GERENTE" || role === "SUBGERENTE";
}

export function ClarvexCopilot() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [lockUpdate, setLockUpdate] = useState(0);

  useEffect(() => {
    function handleLockChange() {
      setLockUpdate((prev) => prev + 1);
    }
    window.addEventListener("desktop-lock-change", handleLockChange);
    return () => window.removeEventListener("desktop-lock-change", handleLockChange);
  }, []);

  useEffect(() => {
    if (pathname === "/login") {
      setUser(null);
      setMessages([]);
      setIsOpen(false);
      return;
    }

    const isDesktop = pathname.startsWith("/escritorio");
    const isDesktopUnlocked = typeof window !== "undefined" && sessionStorage.getItem("desktop_unlocked") === "true";
    if (isDesktop && !isDesktopUnlocked) {
      setUser(null);
      setMessages([]);
      setIsOpen(false);
      return;
    }

    getSession().then((session) => {
      if (session) {
        setUser(session);
        setMessages((prev) => {
          if (prev.length === 0) {
            return [
              {
                role: "assistant",
                content: `¡Hola, ${session.name}! Soy Clarvex Copilot. Consulto en tiempo real los KPIs retail de tu tienda (semana/mes RDV, mismos números que la pestaña KPIs). ¿En qué te puedo ayudar?`,
              },
            ];
          }
          return prev;
        });
      } else {
        setUser(null);
        setMessages([]);
      }
    })
      // Sin sesión resuelta el copiloto no se muestra (`if (!user) return null`)
      // y ya está: es un extra, no puede tirar un error a Sentry desde CUALQUIER
      // pantalla por un bache de señal. Monta en todas.
      .catch(() => undefined);
  }, [pathname, isOpen, lockUpdate]);

  // `useCallback` para que TypingText no reinicie el efecto en cada render al
  // recibirla como prop: sin esto, el texto volvería a empezar constantemente.
  const scrollToEnd = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, loading, scrollToEnd]);

  if (!user) return null;

  async function handleSend(text: string) {
    if (!text.trim() || loading) return;
    const userQuery = text.trim();
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userQuery }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toCopilotApiMessages(nextMessages) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al conectar con la IA.");
      const actions: PendingAction[] | undefined = Array.isArray(data.pendingActions) && data.pendingActions.length > 0 ? data.pendingActions : undefined;
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, actions, actionStatus: actions ? "idle" : undefined }]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Lo siento, ocurrió un error: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(messageIndex: number, proposalId: string) {
    setMessages((prev) => prev.map((msg, index) => (index === messageIndex ? { ...msg, actionStatus: "confirming" } : msg)));
    try {
      const res = await fetch("/api/ai/copilot/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo ejecutar la acción.");
      setMessages((prev) => [
        ...prev.map((msg, index) => (index === messageIndex ? { ...msg, actionStatus: "done" as const } : msg)),
        { role: "assistant", content: "✅ Listo, el comunicado se publicó y quedó registrado." },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setMessages((prev) => prev.map((msg, index) => (index === messageIndex ? { ...msg, actionStatus: "error" as const } : msg)));
      setMessages((prev) => [...prev, { role: "assistant", content: `No se pudo confirmar: ${message}` }]);
    }
  }

  /**
   * Si el modelo solo entregó borrador (sin propose), gerencia PREPARA la
   * publicación aquí. Fase 3 = dos pasos: este botón solo PROPONE (registra la
   * acción pendiente); publicar requiere confirmar en el botón que aparece.
   */
  async function publishDraftFromMessage(messageIndex: number, content: string) {
    const draft = parseAnnouncementDraft(content);
    if (!draft) {
      setMessages((prev) => [...prev, { role: "assistant", content: "No pude leer título y cuerpo del borrador. Pídeme: «Publícalo» o genera de nuevo el comunicado." }]);
      return;
    }

    setMessages((prev) => prev.map((msg, index) => (index === messageIndex ? { ...msg, draftPublishStatus: "proposing" } : msg)));
    try {
      const proposeRes = await fetch("/api/ai/copilot/propose-announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const proposeData = await proposeRes.json();
      if (!proposeRes.ok) throw new Error(proposeData.error || "No se pudo preparar la publicación.");

      const pending = proposeData.pendingAction as PendingAction;
      // NO se publica aún: se muestra el paso de confirmación explícito.
      setMessages((prev) => prev.map((msg, index) => (
        index === messageIndex
          ? { ...msg, draftPublishStatus: "done" as const, actions: [pending], actionStatus: "idle" as const }
          : msg
      )));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setMessages((prev) => prev.map((msg, index) => (index === messageIndex ? { ...msg, draftPublishStatus: "error" as const } : msg)));
      setMessages((prev) => [...prev, { role: "assistant", content: `No se pudo preparar la publicación: ${message}` }]);
    }
  }

  const isManager = canManageAnnouncements(user.role);

  /**
   * Accesos rápidos por ROL. Antes eran los mismos para todos, y a un asesor le
   * ofrecían «¿cuánto le falta a la tienda?», que no puede consultar: pulsarlo
   * solo conseguía que el Copilot le explicara que no tiene permiso.
   *
   * Están redactados como la pregunta que de verdad se hace en piso, no como el
   * nombre del indicador.
   */
  const quickPrompts = isManager
    ? [
        { label: "¿Cómo va la tienda?", prompt: "¿Cómo va la tienda hoy y cuánto falta para la meta?" },
        { label: "Ticket electrónico", prompt: "¿Cómo vamos en ticket electrónico? Dime quién está por debajo de la meta." },
        { label: "Quién necesita apoyo", prompt: "¿Qué asesor necesita más apoyo hoy y qué le recomiendas trabajar?" },
        { label: "Comisiones", prompt: "¿Quién está más cerca de subir de escalón de comisión?" },
        { label: "Pendientes", prompt: "Resume los pendientes abiertos de la tienda por prioridad." }
      ]
    : [
        { label: "¿Cómo voy?", prompt: "¿Cómo voy con mis KPIs y cuánto me falta para mi meta?" },
        { label: "Mi ticket electrónico", prompt: "¿Cómo voy en ticket electrónico contra mi meta?" },
        { label: "Mi comisión", prompt: "¿Cuánto llevo de comisión y cuánto me falta para el siguiente escalón?" },
        { label: "Mis pendientes", prompt: "Resume mis pendientes por prioridad." }
      ];

  return (
    <>
      {/* En móvil se sube por encima de la barra inferior; en escritorio no hay
          barra, así que baja. Antes era `bottom-20` en ambos y en el monitor
          quedaba flotando a media pantalla sin motivo. */}
      <div className="fixed bottom-[calc(84px+var(--safe-bottom))] right-4 z-50 lg:bottom-6 lg:right-6">
        <motion.button
          onClick={() => setIsOpen(true)}
          aria-label="Abrir Clarvex Copilot"
          className="flex size-14 items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.35)] transition-shadow hover:shadow-[0_10px_32px_rgba(37,99,235,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          {/* La marca ES el botón: sin cápsula alrededor. El aro que late ya
              señala que está vivo, sin necesitar borde ni fondo extra. */}
          <CopilotAvatar size={56} pulse />
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center">
            <div className="absolute inset-0" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="desk-adopt relative flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-line bg-card shadow-2xl sm:max-w-xl lg:h-[70vh] lg:max-w-2xl"
            >
              <div className="flex items-center justify-between border-b border-line p-4 bg-panel">
                <div className="flex items-center space-x-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-volt/25 bg-volt/[0.07] ">
                    <CopilotAvatar size={36} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink">Clarvex Copilot</h3>
                    <p className="text-xs text-muted">Inteligencia Operativa en Retail</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-full p-2 text-muted hover:bg-line/60 hover:text-ink transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {messages.map((msg, index) => {
                  const draft = msg.role === "assistant" && (!msg.actions || msg.actions.length === 0)
                    ? parseAnnouncementDraft(msg.content)
                    : null;
                  const showDraftPublish = Boolean(isManager && draft && msg.draftPublishStatus !== "done");

                  return (
                    <div
                      key={index}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === "user"
                            ? "bg-volt/10 text-white border border-volt/25 rounded-tr-none"
                            : "bg-panel text-white/90 border border-line/60 rounded-tl-none"
                        }`}
                      >
                        {/* Solo se escribe la ÚLTIMA respuesta del Copilot: el
                            historial ya se leyó y re-escribirlo al abrir el
                            panel sería insufrible. Los mensajes del usuario
                            aparecen enteros, que es lo que él acaba de teclear. */}
                        {msg.role === "assistant" && index === messages.length - 1 ? (
                          <TypingText text={msg.content} onTick={scrollToEnd} />
                        ) : (
                          msg.content
                        )}
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="mt-3 space-y-2 border-t border-line pt-3">
                            {msg.actions.map((action) => (
                              <div key={action.proposalId} className="rounded-xl border border-volt/25 bg-volt/[0.07] p-2.5">
                                <p className="text-[11px] text-muted mb-2">{action.summary}</p>
                                <button
                                  onClick={() => confirmAction(index, action.proposalId)}
                                  disabled={msg.actionStatus === "confirming" || msg.actionStatus === "done"}
                                  className="w-full rounded-lg bg-volt px-3 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
                                >
                                  {msg.actionStatus === "done"
                                    ? "Publicado ✓"
                                    : msg.actionStatus === "confirming"
                                      ? "Publicando..."
                                      : "Confirmar y publicar"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {showDraftPublish && (
                          <div className="mt-3 space-y-2 border-t border-line pt-3">
                            <div className="rounded-xl border border-volt/25 bg-volt/[0.07] p-2.5">
                              <p className="text-[11px] text-muted mb-2">
                                Borrador listo{draft ? `: «${draft.title}»` : ""}. ¿Lo publicamos al equipo?
                              </p>
                              <button
                                onClick={() => publishDraftFromMessage(index, msg.content)}
                                disabled={msg.draftPublishStatus === "proposing"}
                                className="w-full rounded-lg bg-volt px-3 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
                              >
                                {msg.draftPublishStatus === "proposing" ? "Preparando..." : "Preparar publicación"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-[20px] rounded-tl-none px-4 py-3 bg-panel border border-line/60 text-volt flex items-center space-x-2">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-volt [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-volt [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-volt" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {messages.length <= 2 && (
                <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-line/60 bg-panel">
                  {quickPrompts.map((qp, index) => (
                    <button
                      key={index}
                      onClick={() => handleSend(qp.prompt)}
                      className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-muted hover:bg-white/10 hover:text-ink transition-colors"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend(input);
                }}
                className="flex items-center space-x-2 border-t border-line p-3 bg-card"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pregúntale a Copilot..."
                  className="flex-1 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-volt/60 focus:bg-white/10 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-volt text-white transition-all hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
