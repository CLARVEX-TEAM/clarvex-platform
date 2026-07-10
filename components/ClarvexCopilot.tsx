"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";

type PendingAction = { proposalId: string; type: string; summary: string };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: PendingAction[];
  actionStatus?: "idle" | "confirming" | "done" | "error";
};

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
    // Hidden on login screen
    if (pathname === "/login") {
      setUser(null);
      setMessages([]);
      setIsOpen(false);
      return;
    }

    // Hidden on desktop routes if screen is locked
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
                content: `¡Hola, ${session.name}! Soy Clarvex Copilot. Estoy conectado en tiempo real a los KPIs, pendientes y horarios de tu tienda. ¿En qué te puedo ayudar hoy?`,
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
    setMessages((prev) => [...prev, { role: "user", content: userQuery }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al conectar con la IA.");
      const actions: PendingAction[] | undefined = Array.isArray(data.pendingActions) && data.pendingActions.length > 0 ? data.pendingActions : undefined;
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, actions, actionStatus: actions ? "idle" : undefined }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Lo siento, ocurrió un error: ${err.message}` },
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
        { role: "assistant", content: "✅ Listo, la acción se ejecutó y quedó registrada." },
      ]);
    } catch (err: any) {
      setMessages((prev) => prev.map((msg, index) => (index === messageIndex ? { ...msg, actionStatus: "error" as const } : msg)));
      setMessages((prev) => [...prev, { role: "assistant", content: `No se pudo confirmar: ${err.message}` }]);
    }
  }

  const quickPrompts = [
    { label: "¿Cómo voy hoy?", prompt: "¿Cómo voy con mis KPIs de hoy?" },
    { label: "¿Cómo va mi tienda?", prompt: "¿Cuál es el avance general de venta de mi tienda hoy?" },
    { label: "Mis pendientes", prompt: "Resume mis tareas pendientes prioritarias" },
    { label: "Comisiones", prompt: "¿Quién está más cerca de comisionar o qué comisiones tenemos activas?" },
  ];

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-20 right-4 z-50">
        <motion.button
          onClick={() => setIsOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-[#00FF66]/30 bg-[#0A0A0A] text-[#00FF66] shadow-[0_0_20px_rgba(0,255,102,0.2)] backdrop-blur-xl transition-all hover:scale-105 hover:border-[#00FF66]/60 active:scale-95"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          <Sparkles className="h-6 w-6 animate-pulse" />
        </motion.button>
      </div>

      {/* Chat Panel / Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative flex h-[80vh] w-full max-w-lg flex-col rounded-[28px] border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 p-4 bg-gradient-to-r from-[#0A0A0A] to-[#121212]">
                <div className="flex items-center space-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/20">
                    <Bot className="h-5 w-5" />
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

              {/* Chat Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {messages.map((msg, index) => (
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
                                  ? "Confirmado ✓"
                                  : msg.actionStatus === "confirming"
                                    ? "Confirmando..."
                                    : "Confirmar y publicar"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

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

              {/* Quick Prompt Suggester */}
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

              {/* Form Input */}
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
