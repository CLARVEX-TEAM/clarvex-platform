"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X } from "lucide-react";
import { parseAnnouncementDraft } from "@/lib/ai/announcement-draft";
import { toCopilotApiMessages } from "@/lib/ai/copilot-messages";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { CopilotAvatar } from "@/components/CopilotAvatar";

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
    });
  }, [pathname, isOpen, lockUpdate]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

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

  /** Si el modelo solo entregó borrador (sin propose), gerencia puede publicarlo desde aquí. */
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
      const confirmRes = await fetch("/api/ai/copilot/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: pending.proposalId }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || "No se pudo publicar.");

      setMessages((prev) => [
        ...prev.map((msg, index) => (
          index === messageIndex
            ? { ...msg, draftPublishStatus: "done" as const, actions: [pending], actionStatus: "done" as const }
            : msg
        )),
        { role: "assistant", content: `✅ Comunicado publicado: «${draft.title}».` },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setMessages((prev) => prev.map((msg, index) => (index === messageIndex ? { ...msg, draftPublishStatus: "error" as const } : msg)));
      setMessages((prev) => [...prev, { role: "assistant", content: `No se pudo publicar: ${message}` }]);
    }
  }

  const quickPrompts = [
    { label: "¿Cómo voy hoy?", prompt: "¿Cómo voy con mis KPIs de hoy?" },
    { label: "Faltante semanal", prompt: "¿Cuánto le falta a la tienda para llegar al 100% de su meta semanal?" },
    { label: "Mis pendientes", prompt: "Resume mis tareas pendientes prioritarias" },
    { label: "Comisiones", prompt: "¿Quién está más cerca de comisionar o qué comisiones tenemos activas?" },
  ];

  const isManager = canManageAnnouncements(user.role);

  return (
    <>
      <div className="fixed bottom-20 right-4 z-50">
        <motion.button
          onClick={() => setIsOpen(true)}
          aria-label="Abrir Clarvex Copilot"
          className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#00FF66]/25 bg-[#0A0A0A]/95 shadow-[0_0_24px_rgba(0,255,102,0.22)] backdrop-blur-xl transition-all hover:scale-105 hover:border-[#00FF66]/50 hover:shadow-[0_0_32px_rgba(0,255,102,0.35)] active:scale-95"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="absolute inset-0 rounded-full bg-[#00FF66]/5" />
          <CopilotAvatar size={44} pulse />
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
              className="relative flex h-[80vh] w-full max-w-lg flex-col rounded-[28px] border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-white/10 p-4 bg-gradient-to-r from-[#0A0A0A] to-[#121212]">
                <div className="flex items-center space-x-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#00FF66]/20 bg-[#00FF66]/5 shadow-[0_0_20px_rgba(0,255,102,0.12)]">
                    <CopilotAvatar size={36} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Clarvex Copilot</h3>
                    <p className="text-xs text-white/50">Inteligencia Operativa en Retail</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-full p-2 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
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
                            ? "bg-[#00FF66]/10 text-white border border-[#00FF66]/20 rounded-tr-none"
                            : "bg-white/5 text-white/90 border border-white/5 rounded-tl-none"
                        }`}
                      >
                        {msg.content}
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                            {msg.actions.map((action) => (
                              <div key={action.proposalId} className="rounded-xl border border-[#00FF66]/20 bg-[#00FF66]/5 p-2.5">
                                <p className="text-[11px] text-white/70 mb-2">{action.summary}</p>
                                <button
                                  onClick={() => confirmAction(index, action.proposalId)}
                                  disabled={msg.actionStatus === "confirming" || msg.actionStatus === "done"}
                                  className="w-full rounded-lg bg-[#00FF66] px-3 py-2 text-xs font-black uppercase tracking-wider text-black transition active:scale-95 disabled:opacity-50"
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
                          <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                            <div className="rounded-xl border border-[#00FF66]/20 bg-[#00FF66]/5 p-2.5">
                              <p className="text-[11px] text-white/70 mb-2">
                                Borrador listo{draft ? `: «${draft.title}»` : ""}. ¿Lo publicamos al equipo?
                              </p>
                              <button
                                onClick={() => publishDraftFromMessage(index, msg.content)}
                                disabled={msg.draftPublishStatus === "proposing"}
                                className="w-full rounded-lg bg-[#00FF66] px-3 py-2 text-xs font-black uppercase tracking-wider text-black transition active:scale-95 disabled:opacity-50"
                              >
                                {msg.draftPublishStatus === "proposing" ? "Publicando..." : "Publicar comunicado"}
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
                    <div className="max-w-[85%] rounded-[20px] rounded-tl-none px-4 py-3 bg-white/5 border border-white/5 text-[#00FF66] flex items-center space-x-2">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#00FF66] [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#00FF66] [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#00FF66]" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {messages.length <= 2 && (
                <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-white/5 bg-[#0d0d0d]">
                  {quickPrompts.map((qp, index) => (
                    <button
                      key={index}
                      onClick={() => handleSend(qp.prompt)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
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
                className="flex items-center space-x-2 border-t border-white/10 p-3 bg-[#0A0A0A]"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pregúntale a Copilot..."
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-[#00FF66]/50 focus:bg-white/10 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00FF66] text-black shadow-lg shadow-[#00FF66]/20 transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-40"
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
