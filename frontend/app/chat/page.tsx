"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  LayoutDashboard,
  MessageSquare,
  ListChecks,
  Settings,
  Compass,
} from "lucide-react"
import type { LucideProps } from "lucide-react"

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

type NavId = "dashboard" | "advisor" | "actions" | "timeline" | "settings"
type IconComponent = React.ComponentType<LucideProps>
interface NavItem { id: NavId; Icon: IconComponent; label: string }

interface Profile {
  display_name: string | null
  school: string | null
  year: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard"     },
  { id: "advisor",   Icon: MessageSquare,   label: "Ask Advisor"   },
  { id: "actions",   Icon: ListChecks,      label: "Action Center" },
  { id: "timeline",  Icon: Compass,         label: "Timeline"      },
  { id: "settings",  Icon: Settings,        label: "Settings"      },
]

const SUGGESTED_QUESTIONS = [
  "Can I drop a class without losing financial aid?",
  "What is the SAP policy at my school?",
  "How do I appeal an academic suspension?",
  "When is the FAFSA deadline for next year?",
  "What GPA do I need to keep my scholarship?",
  "What forms do I need for an incomplete grade?",
]

const DEMO_SCHOOL_ID = "00000000-0000-0000-0000-000000000001"

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2) }

// ── Sherpa logo ───────────────────────────────────────────────────────────────

function SherpaLogo({ size = 26 }: { size?: number }) {
  return (
    <img src="/logo.png" width={size} height={size} alt="Sherpa" style={{ objectFit: "contain" }} />
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ onNavClick, onSignOut, profile }: { onNavClick: (id: NavId) => void; onSignOut: () => void; profile: Profile }) {
  const name     = profile.display_name || "—"
  const initials = name === "—" ? "—" : name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const subtitle = [profile.school, profile.year].filter(Boolean).join(" · ") || "—"

  return (
    <div className="tw-sidebar-wrapper">
      <aside className="tw-sidebar">
        <div className="tw-sidebar-content-wrapper">
          <div style={{ width: 240, display: "flex", flexDirection: "column", minHeight: "100%", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <a href="/" className="tw-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 12px 32px", textDecoration: "none" }}>
                <SherpaLogo size={44} />
                <span className="sidebar-brand tw-sidebar-logo-text">Sherpa</span>
              </a>
              <nav style={{ padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                {NAV_ITEMS.map(({ id, Icon, label }) => (
                  <button
                    key={id}
                    className={`tw-nav-link${id === "advisor" ? " active" : ""}`}
                    onClick={() => onNavClick(id)}
                  >
                    <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                    <span className="tw-sidebar-label">{label}</span>
                  </button>
                ))}
              </nav>
            </div>
            <div className="tw-sidebar-user" style={{ padding: "16px 20px", borderTop: "1px solid #2a5636", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #b5b0a8, #2d6030)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 12, color: "#111e14", flexShrink: 0, letterSpacing: "0.03em" }}>
                  {initials}
                </div>
                <div className="tw-sidebar-user-text" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                  <div style={{ fontSize: 11, color: "#9aafa0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
                </div>
              </div>
              <button className="tw-btn-ghost tw-sidebar-label" onClick={onSignOut} style={{ fontSize: 12, textAlign: "left", padding: "4px 0", color: "#9aafa0" }}>Sign out →</button>
            </div>
          </div>
        </div>

        {/* Dynamic Indicators */}
        <div className="tw-sidebar-indicator">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </div>
        <div className="tw-sidebar-glow-strip" />
      </aside>
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState("")
  const [loading,   setLoading]   = useState(false)
  const [schoolId,  setSchoolId]  = useState(DEMO_SCHOOL_ID)
  const [profile,   setProfile]   = useState<Profile>({ display_name: null, school: null, year: null })
  const [riskId,    setRiskId]    = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const router    = useRouter()

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data } = await supabase
        .from("students")
        .select("display_name, school, year")
        .eq("user_id", user.id)
        .single()
      if (data) setProfile(data as Profile)

      // Pull real school_id from backend
      try {
        const res = await fetch(`${API_BASE}/api/v1/students/by-supabase/${user.id}`)
        if (res.ok) {
          const student = await res.json()
          if (student.school_id) setSchoolId(student.school_id)
        }
      } catch { /* fall back to demo school id */ }
    }
    init()
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Pre-fill from URL params (linked from dashboard FAB or action links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get("q")
    const rId = params.get("risk_id")

    if (q) {
      sendMessage(q)
    } else if (rId) {
      setRiskId(rId)
      async function loadRisk() {
        try {
          const res = await fetch(`${API_BASE}/api/v1/risk-events/${rId}`)
          if (res.ok) {
            const data = await res.json()
            const packet = data.action_packet_json
            const title = packet?.title || data.risk_type.replace(/_/g, ' ').toUpperCase()
            const desc = packet?.description || ''
            const actions = packet?.actions || []
            const greeting = `Hello! I've loaded your academic warning for **${title}**${desc ? ` (${desc})` : ''}.\n\nUnder your school's policy, here are the suggested action steps to resolve this:\n${actions.map((a: any, i: number) => `${i+1}. **${a.label}**${a.deadline ? ` (due ${a.deadline})` : ''}`).join('\n')}\n\nLet's work together to resolve this. How can I help you get started, or would you like to discuss the requirements?`
            setMessages([{ id: genId(), role: "assistant", content: greeting }])
          }
        } catch { /* ignore and let user start empty */ }
      }
      loadRisk()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  function handleNavClick(id: NavId) {
    if (id === "dashboard") router.push("/dashboard")
    else if (id === "actions")  router.push("/actions")
    else if (id === "timeline") router.push("/deadline-radar")
    else if (id === "settings") router.push("/settings")
  }

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return
    setInput("")

    const userMsg:    Message = { id: genId(), role: "user",      content: question }
    const thinkingMsg: Message = { id: genId(), role: "assistant", content: "", isStreaming: true }
    setMessages(prev => [...prev, userMsg, thinkingMsg])
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: schoolId,
          school_name: profile.school,
          question,
          risk_id: riskId,
          history: messages
            .filter(m => !m.isStreaming && m.content)
            .map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      const data = await res.json()
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { id: thinkingMsg.id, role: "assistant", content: data.answer, citations: data.citations ?? [], isStreaming: false }
        return updated
      })
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { id: thinkingMsg.id, role: "assistant", content: `Sorry, I couldn't get an answer right now. ${err.message}`, isStreaming: false, error: true }
        return updated
      })
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(180deg, #2e5a3c 0%, #8faaa4 60%)", backgroundAttachment: "fixed", color: "#ffffff", fontFamily: "'Satoshi', sans-serif" }}>

      <Sidebar onNavClick={handleNavClick} onSignOut={signOut} profile={profile} />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: "20px 32px", borderBottom: "1px solid rgba(42,86,54,0.6)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "rgba(30,56,36,0.7)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 20, letterSpacing: "-0.3px" }}>Ask Advisor</h1>
            <div style={{ fontSize: 12, color: "#9aafa0", marginTop: 3 }}>Grounded in your school&apos;s official policy documents</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 5px #4ade80" }} />
            <span style={{ fontSize: 12, color: "#4ade80" }}>Online</span>
          </div>
        </div>

        {/* Thread */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px", display: "flex", flexDirection: "column", gap: 24 }}>
          {messages.length === 0 && (
            <EmptyState questions={SUGGESTED_QUESTIONS} onSelect={sendMessage} />
          )}
          {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding: "20px 32px 16px", borderTop: "1px solid rgba(42,86,54,0.6)", background: "rgba(30,56,36,0.7)", backdropFilter: "blur(12px)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", maxWidth: 800, margin: "0 auto" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about financial aid, deadlines, or academic policies…"
                rows={1}
                disabled={loading}
                style={{ width: "100%", background: "rgba(18,38,24,0.9)", border: "1px solid #2a5636", borderRadius: 8, padding: "13px 46px 13px 16px", color: "#ffffff", fontSize: 14, outline: "none", resize: "none", lineHeight: 1.5, fontFamily: "'Satoshi', sans-serif", transition: "border-color 0.15s ease, box-shadow 0.15s ease", boxSizing: "border-box", opacity: loading ? 0.7 : 1, display: "block" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#b5b0a8"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(181,176,168,0.1)" }}
                onBlur={e => { e.currentTarget.style.borderColor = "#2a5636"; e.currentTarget.style.boxShadow = "none" }}
              />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#4a6a52" }}>⏎</span>
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{ padding: "0 22px", height: 46, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg, #b5b0a8, #2d6030)", color: "#111e14", border: "none", fontSize: 14, fontWeight: 700, fontFamily: "'Satoshi', sans-serif", cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.5 : 1, whiteSpace: "nowrap", transition: "filter 0.15s ease", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={e => { if (!loading && input.trim()) e.currentTarget.style.filter = "brightness(1.1)" }}
              onMouseLeave={e => { e.currentTarget.style.filter = "none" }}
            >
              {loading ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> : "Send"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center", marginTop: 10 }}>
            Answers are grounded in official policy documents. Verify with your advisor before acting.
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin    { from { transform: rotate(0deg)   } to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse   { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        .chat-md > *:first-child { margin-top: 0 !important; }
        .chat-md > *:last-child  { margin-bottom: 0 !important; }
        .chat-md ul li::marker, .chat-md ol li::marker { color: #9aafa0; }
      `}</style>
    </div>
  )
}

// ── Markdown components ───────────────────────────────────────────────────────

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => <h1 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 16, margin: "14px 0 6px", color: "#ffffff", letterSpacing: "-0.2px" }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 15, margin: "12px 0 5px", color: "#ffffff", letterSpacing: "-0.2px" }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 14, margin: "10px 0 4px", color: "#ccc9c2" }}>{children}</h3>,
  p:  ({ children }) => <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.65, color: "inherit" }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 14, lineHeight: 1.65, display: "flex", flexDirection: "column", gap: 3 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 14, lineHeight: 1.65, display: "flex", flexDirection: "column", gap: 3 }}>{children}</ol>,
  li: ({ children }) => <li style={{ color: "inherit" }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: "#ffffff" }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: "italic", color: "#ccc9c2" }}>{children}</em>,
  hr: () => <hr style={{ border: "none", borderTop: "1px solid #2a5636", margin: "10px 0" }} />,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: "3px solid #b5b0a8", margin: "8px 0", padding: "4px 12px", background: "rgba(181,176,168,0.06)", borderRadius: "0 4px 4px 0", color: "#ccc9c2", fontSize: 13 }}>
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-")
    return isBlock
      ? <code style={{ display: "block", background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontFamily: "monospace", color: "#9aafa0", overflowX: "auto", margin: "6px 0" }}>{children}</code>
      : <code style={{ background: "rgba(181,176,168,0.1)", borderRadius: 3, padding: "1px 5px", fontSize: 12, fontFamily: "monospace", color: "#ccc9c2" }}>{children}</code>
  },
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "8px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ borderBottom: "1px solid #2a5636" }}>{children}</thead>,
  th: ({ children }) => <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "#9aafa0", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(42,86,54,0.5)", color: "#ffffff", verticalAlign: "top" }}>{children}</td>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: "#b5b0a8", textDecoration: "underline", textUnderlineOffset: 2 }}>
      {children}
    </a>
  ),
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ questions, onSelect }: { questions: string[]; onSelect: (q: string) => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "16px 20px", animation: "fadeIn 0.4s ease" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 8, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", backdropFilter: "blur(4px)" }}>
          <MessageSquare size={28} color="#ffffff" strokeWidth={1.5} />
        </div>
        <h2 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 22, margin: "0 0 10px", letterSpacing: "-0.3px", color: "#ffffff", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>Ask me anything</h2>
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, margin: 0, lineHeight: 1.7, maxWidth: 400, textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>
          Questions about financial aid, SAP requirements, registration deadlines, and more — all cited to your school&apos;s official source.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 580 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12, textAlign: "center" }}>Try asking</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {questions.map(q => (
            <button
              key={q}
              onClick={() => onSelect(q)}
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "12px 16px", color: "rgba(255,255,255,0.8)", fontSize: 13, cursor: "pointer", textAlign: "left", lineHeight: 1.4, transition: "all 0.15s ease", fontFamily: "'Satoshi', sans-serif", backdropFilter: "blur(4px)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; e.currentTarget.style.color = "#ffffff" }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)" }}
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
        <div style={{ background: "linear-gradient(135deg, #b5b0a8, #ccc9c2)", color: "#111e14", borderRadius: "18px 18px 4px 18px", padding: "12px 18px", maxWidth: "70%", fontSize: 14, lineHeight: 1.6, fontFamily: "'Satoshi', sans-serif", fontWeight: 500 }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", animation: "fadeIn 0.25s ease" }}>
      <div style={{ width: 34, height: 34, borderRadius: 6, background: "rgba(181,176,168,0.1)", border: "1px solid rgba(181,176,168,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
        <MessageSquare size={16} color="#b5b0a8" strokeWidth={1.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {message.isStreaming ? (
          <ThinkingIndicator />
        ) : (
          <div style={{ background: message.error ? "rgba(251,146,60,0.08)" : "rgba(18,38,24,0.85)", border: `1px solid ${message.error ? "rgba(251,146,60,0.25)" : "#2a5636"}`, borderRadius: "18px 18px 18px 4px", padding: "14px 18px", maxWidth: "85%" }}>
            <div className="chat-md" style={{ color: message.error ? "#fb923c" : "#ffffff" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {message.content}
              </ReactMarkdown>
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
    <div style={{ background: "rgba(18,38,24,0.85)", border: "1px solid #2a5636", borderRadius: "18px 18px 18px 4px", padding: "16px 20px", display: "inline-flex", alignItems: "center", gap: 6 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#b5b0a8", display: "inline-block", animation: `pulse 1.4s ease ${i * 0.2}s infinite` }} />
      ))}
    </div>
  )
}

// ── Citations ─────────────────────────────────────────────────────────────────

function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #2a5636" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9aafa0", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Sources</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {citations.map(c => (
          <div key={c.n} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ background: "rgba(181,176,168,0.12)", color: "#b5b0a8", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0, marginTop: 1 }}>[{c.n}]</span>
            <div style={{ minWidth: 0 }}>
              {c.heading && <div style={{ fontSize: 12, color: "#ffffff", fontWeight: 500, marginBottom: 2 }}>{c.heading}</div>}
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "#9aafa0", textDecoration: "none", wordBreak: "break-all" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#b5b0a8")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#9aafa0")}
                >
                  {c.url}
                </a>
              ) : (
                <span style={{ fontSize: 11, color: "#4a6a52" }}>No URL</span>
              )}
              {c.fetched_at && (
                <span style={{ fontSize: 10, color: "#4a6a52", marginLeft: 8 }}>· verified {new Date(c.fetched_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
