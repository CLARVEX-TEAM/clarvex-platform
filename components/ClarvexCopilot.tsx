"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";

export function ClarvexCopilot() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Hidden on login screen
    if (pathname === "/login") {
      setUser(null);
      setMessages([]);
      setIsOpen(false);
      return;
    }

    getSession().then((session) => {
      if (session) {
        setUser(session);
        if (messages.length === 0) {
          setMessages([
            {
              role: "assistant",
              content: `¡Hola, ${session.name}! Soy Clarvex Copilot. Estoy conectado en tiempo real a los KPIs, pendientes y horarios de tu tienda. ¿En qué te puedo ayudar hoy?`,
            },
          ]);
        }
      } else {
        setUser(null);
        setMessages([]);
      }
    });
  }, [pathname, isOpen]);

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
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Lo siento, ocurrió un error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
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
