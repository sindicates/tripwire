"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Citation {
  n: number
  heading: string | null
  url: string | null
  fetched_at: string | null
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: Citation[]
  isStreaming?: boolean
  error?: boolean
}

type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "progress" | "settings"
interface NavItem { id: NavId; icon: string; label: string }

// ── Static data ───────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "risk-feed", icon: "⚠️", label: "Risk Feed" },
  { id: "advisor", icon: "💬", label: "Ask Advisor" },
  { id: "actions", icon: "🎯", label: "Action Center" },
  { id: "progress", icon: "📊", label: "My Progress" },
  { id: "settings", icon: "⚙️", label: "Settings" },
]

const SUGGESTED_QUESTIONS = [
  "Can I drop a class without losing financial aid?",
  "What is the SAP policy at UNR?",
  "How do I appeal an academic suspension?",
  "When is the FAFSA deadline for next year?",
  "What GPA do I need to keep my scholarship?",
  "What forms do I need for an incomplete grade?",
]

// Hard-coded school ID for demo — in production, pull from student profile
const DEMO_SCHOOL_ID = "00000000-0000-0000-0000-000000000001"

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2)
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// ── Root component ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [activeNav, setActiveNav] = useState<NavId>("advisor")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [schoolId, setSchoolId] = useState(DEMO_SCHOOL_ID)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const handleNavClick = (id: NavId) => {
    setActiveNav(id)
    if (id === "dashboard") router.push("/dashboard")
    if (id === "actions") router.push("/actions")
  }

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return
    setInput("")

    const userMsg: Message = { id: genId(), role: "user", content: question }
    const thinkingMsg: Message = { id: genId(), role: "assistant", content: "", isStreaming: true }

    setMessages((prev) => [...prev, userMsg, thinkingMsg])
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, question }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `HTTP ${res.status}`)
      }

      const data = await res.json()

      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          id: thinkingMsg.id,
          role: "assistant",
          content: data.answer,
          citations: data.citations ?? [],
          isStreaming: false,
        }
        return updated
      })
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          id: thinkingMsg.id,
          role: "assistant",
          content: `Sorry, I couldn't get an answer right now. ${err.message}`,
          isStreaming: false,
          error: true,
        }
        return updated
      })
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a1a0f", color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      <Sidebar activeNav={activeNav} onNavClick={handleNavClick} onSignOut={signOut} />

      {/* Main chat area */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        {/* Header */}
        <div style={{ padding: "20px 32px", borderBottom: "1px solid #1e3d28", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "rgba(10, 26, 15, 0.8)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(255,107,157,0.2), rgba(255,143,177,0.1))", border: "1px solid rgba(255,107,157,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎓</div>
            <div>
              <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 }}>Policy Advisor</h1>
              <div style={{ fontSize: 12, color: "#a3c4a8", marginTop: 2 }}>Grounded in UNR&apos;s official policy documents</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            <span style={{ fontSize: 12, color: "#4ade80" }}>Online</span>
          </div>
        </div>

        {/* Message thread */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px", display: "flex", flexDirection: "column", gap: 24 }}>
          {messages.length === 0 && (
            <EmptyState questions={SUGGESTED_QUESTIONS} onSelect={(q) => sendMessage(q)} />
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding: "16px 32px 24px", borderTop: "1px solid #1e3d28", background: "#0a1a0f", flexShrink: 0 }}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {SUGGESTED_QUESTIONS.slice(0, 3).map((q) => (
                <button
                  key={q}
                  className="tw-pill"
                  onClick={() => sendMessage(q)}
                  style={{ fontSize: 12 }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 800, margin: "0 auto" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about UNR policies, deadlines, or your aid status…"
                rows={1}
                disabled={loading}
                style={{
                  width: "100%",
                  background: "#112318",
                  border: "1px solid #1e3d28",
                  borderRadius: 12,
                  padding: "13px 50px 13px 16px",
                  color: "#ffffff",
                  fontSize: 14,
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                  fontFamily: "'Inter', sans-serif",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                  boxSizing: "border-box",
                  opacity: loading ? 0.7 : 1,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#ff6b9d"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255, 107, 157, 0.15)" }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#1e3d28"; e.currentTarget.style.boxShadow = "none" }}
              />
              <span style={{ position: "absolute", right: 14, bottom: 13, fontSize: 11, color: "#1e3d28" }}>⏎</span>
            </div>
            <button
              className="tw-btn-primary"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{ padding: "13px 22px", borderRadius: 12, flexShrink: 0, opacity: loading || !input.trim() ? 0.5 : 1 }}
            >
              {loading ? (
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
              ) : "Send"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#4a6b50", textAlign: "center", marginTop: 10 }}>
            Answers are grounded in UNR policy documents. Always verify with your advisor for high-stakes decisions.
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ activeNav, onNavClick, onSignOut }: { activeNav: NavId; onNavClick: (id: NavId) => void; onSignOut: () => void }) {
  return (
    <aside className="tw-sidebar" style={{ width: 220, minWidth: 220, background: "#0d1f13", borderRight: "1px solid #1e3d28", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flexShrink: 0 }}>
      <div className="tw-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 8, padding: "28px 20px 32px" }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>⚡</span>
        <span className="tw-sidebar-logo-text" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, color: "#ff6b9d", letterSpacing: "-0.5px" }}>Tripwire</span>
      </div>

      <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => (
          <button key={item.id} className={`tw-nav-link${activeNav === item.id ? " active" : ""}`} onClick={() => onNavClick(item.id)}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
            <span className="tw-sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="tw-sidebar-user" style={{ padding: "16px 20px", borderTop: "1px solid #1e3d28", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #ff6b9d, #ff8fb1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>RA</div>
          <div className="tw-sidebar-user-text" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>Retuz A.</div>
            <div style={{ fontSize: 11, color: "#a3c4a8" }}>UNR · Junior</div>
          </div>
        </div>
        <button className="tw-btn-ghost tw-sidebar-label" onClick={onSignOut} style={{ fontSize: 12, textAlign: "left", padding: "4px 0", color: "#a3c4a8" }}>Sign out →</button>
      </div>
    </aside>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ questions, onSelect }: { questions: string[]; onSelect: (q: string) => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32, padding: "40px 20px", animation: "fadeIn 0.4s ease" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, rgba(255,107,157,0.15), rgba(255,143,177,0.08))", border: "1px solid rgba(255,107,157,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, margin: "0 auto 20px" }}>🎓</div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, margin: "0 0 10px" }}>Ask me anything</h2>
        <p style={{ color: "#a3c4a8", fontSize: 14, margin: 0, lineHeight: 1.6, maxWidth: 400 }}>
          I can answer questions about UNR&apos;s financial aid policies, SAP requirements, registration deadlines, and more — all cited to the official source.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 580 }}>
        <div style={{ fontSize: 11, color: "#a3c4a8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12, textAlign: "center" }}>Try asking</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {questions.map((q) => (
            <button
              key={q}
              onClick={() => onSelect(q)}
              style={{
                background: "#112318",
                border: "1px solid #1e3d28",
                borderRadius: 10,
                padding: "12px 16px",
                color: "#a3c4a8",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                lineHeight: 1.4,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,107,157,0.4)"; e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.background = "rgba(255,107,157,0.06)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3d28"; e.currentTarget.style.color = "#a3c4a8"; e.currentTarget.style.background = "#112318" }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", animation: "fadeIn 0.25s ease" }}>
        <div style={{
          background: "linear-gradient(135deg, #ff6b9d, #ff8fb1)",
          color: "#ffffff",
          borderRadius: "18px 18px 4px 18px",
          padding: "12px 18px",
          maxWidth: "70%",
          fontSize: 14,
          lineHeight: 1.6,
          boxShadow: "0 2px 12px rgba(255, 107, 157, 0.25)",
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", animation: "fadeIn 0.25s ease" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, rgba(255,107,157,0.2), rgba(255,143,177,0.1))", border: "1px solid rgba(255,107,157,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, marginTop: 2 }}>🎓</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {message.isStreaming ? (
          <ThinkingIndicator />
        ) : (
          <div style={{
            background: message.error ? "rgba(255, 107, 107, 0.08)" : "#112318",
            border: `1px solid ${message.error ? "rgba(255, 107, 107, 0.2)" : "#1e3d28"}`,
            borderRadius: "18px 18px 18px 4px",
            padding: "14px 18px",
            maxWidth: "85%",
          }}>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: message.error ? "#ff9999" : "#ffffff", whiteSpace: "pre-wrap" }}>
              {message.content}
            </div>
            {message.citations && message.citations.length > 0 && (
              <CitationList citations={message.citations} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Thinking indicator ────────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div style={{ background: "#112318", border: "1px solid #1e3d28", borderRadius: "18px 18px 18px 4px", padding: "16px 20px", display: "inline-flex", alignItems: "center", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff6b9d", display: "inline-block", animation: `pulse 1.4s ease ${i * 0.2}s infinite` }} />
      ))}
    </div>
  )
}

// ── Citations ─────────────────────────────────────────────────────────────────

function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1e3d28" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#a3c4a8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Sources</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {citations.map((c) => (
          <div key={c.n} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ background: "rgba(255,107,157,0.15)", color: "#ff6b9d", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0, marginTop: 1 }}>[{c.n}]</span>
            <div style={{ minWidth: 0 }}>
              {c.heading && (
                <div style={{ fontSize: 12, color: "#ffffff", fontWeight: 500, marginBottom: 2 }}>{c.heading}</div>
              )}
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#a3c4a8", textDecoration: "none", wordBreak: "break-all" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ff6b9d")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#a3c4a8")}
                >
                  {c.url}
                </a>
              ) : (
                <span style={{ fontSize: 11, color: "#4a6b50" }}>No URL</span>
              )}
              {c.fetched_at && (
                <span style={{ fontSize: 10, color: "#4a6b50", marginLeft: 8 }}>· verified {new Date(c.fetched_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
