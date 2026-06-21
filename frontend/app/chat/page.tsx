"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  LayoutDashboard,
  AlertTriangle,
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

type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "timeline" | "settings"
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
  { id: "risk-feed", Icon: AlertTriangle,   label: "Risk Feed"     },
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
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Sherpa">
      <path d="M14 3L26 23H2L14 3Z" stroke="#b5b0a8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M14 3L10.5 11L14 9L17.5 11L14 3Z" fill="#b5b0a8" />
    </svg>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ onNavClick, onSignOut, profile }: { onNavClick: (id: NavId) => void; onSignOut: () => void; profile: Profile }) {
  const name     = profile.display_name || "—"
  const initials = name === "—" ? "—" : name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const subtitle = [profile.school, profile.year].filter(Boolean).join(" · ") || "—"

  return (
    <aside className="tw-sidebar" style={{ width: 220, minWidth: 220, background: "#1e3824", borderRight: "1px solid #2a5636", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flexShrink: 0 }}>
      <div className="tw-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 20px 32px" }}>
        <SherpaLogo size={26} />
        <span className="sidebar-brand tw-sidebar-logo-text">Sherpa</span>
      </div>
      <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
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
    </aside>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState("")
  const [loading,   setLoading]   = useState(false)
  const [schoolId,  setSchoolId]  = useState(DEMO_SCHOOL_ID)
  const [profile,   setProfile]   = useState<Profile>({ display_name: null, school: null, year: null })
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

  // Pre-fill from URL ?q= param (linked from dashboard FAB)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")
    if (q) sendMessage(q)
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
    else if (id === "risk-feed") router.push("/dashboard")
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
        body: JSON.stringify({ school_id: schoolId, question }),
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
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(180deg, #2e5a3c 0%, #c8d4d0 60%)", backgroundAttachment: "fixed", color: "#ffffff", fontFamily: "'Satoshi', sans-serif" }}>

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
        <div style={{ padding: "16px 32px 24px", borderTop: "1px solid rgba(42,86,54,0.6)", background: "rgba(30,56,36,0.7)", backdropFilter: "blur(12px)", flexShrink: 0 }}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, maxWidth: 800, margin: "0 auto 12px" }}>
              {SUGGESTED_QUESTIONS.slice(0, 3).map(q => (
                <button key={q} className="tw-pill" onClick={() => sendMessage(q)} style={{ fontSize: 12 }}>{q}</button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 800, margin: "0 auto" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about financial aid, deadlines, or academic policies…"
                rows={1}
                disabled={loading}
                style={{ width: "100%", background: "rgba(18,38,24,0.9)", border: "1px solid #2a5636", borderRadius: 8, padding: "13px 46px 13px 16px", color: "#ffffff", fontSize: 14, outline: "none", resize: "none", lineHeight: 1.5, fontFamily: "'Satoshi', sans-serif", transition: "border-color 0.15s ease, box-shadow 0.15s ease", boxSizing: "border-box", opacity: loading ? 0.7 : 1 }}
                onFocus={e => { e.currentTarget.style.borderColor = "#b5b0a8"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(181,176,168,0.1)" }}
                onBlur={e => { e.currentTarget.style.borderColor = "#2a5636"; e.currentTarget.style.boxShadow = "none" }}
              />
              <span style={{ position: "absolute", right: 14, bottom: 13, fontSize: 11, color: "#4a6a52" }}>⏎</span>
            </div>
            <button
              className="tw-btn-primary"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{ padding: "13px 22px", borderRadius: 8, flexShrink: 0, opacity: loading || !input.trim() ? 0.5 : 1 }}
            >
              {loading ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> : "Send"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#4a6a52", textAlign: "center", marginTop: 10 }}>
            Answers are grounded in official policy documents. Verify with your advisor before acting.
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin    { from { transform: rotate(0deg)   } to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse   { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ questions, onSelect }: { questions: string[]; onSelect: (q: string) => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32, padding: "40px 20px", animation: "fadeIn 0.4s ease" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 8, background: "rgba(181,176,168,0.1)", border: "1px solid rgba(181,176,168,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <MessageSquare size={28} color="#b5b0a8" strokeWidth={1.5} />
        </div>
        <h2 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 22, margin: "0 0 10px", letterSpacing: "-0.3px" }}>Ask me anything</h2>
        <p style={{ color: "#9aafa0", fontSize: 14, margin: 0, lineHeight: 1.7, maxWidth: 400 }}>
          Questions about financial aid, SAP requirements, registration deadlines, and more — all cited to your school&apos;s official source.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 580 }}>
        <div style={{ fontSize: 11, color: "#9aafa0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12, textAlign: "center" }}>Try asking</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {questions.map(q => (
            <button
              key={q}
              onClick={() => onSelect(q)}
              style={{ background: "rgba(18,38,24,0.8)", border: "1px solid #2a5636", borderRadius: 8, padding: "12px 16px", color: "#9aafa0", fontSize: 13, cursor: "pointer", textAlign: "left", lineHeight: 1.4, transition: "all 0.15s ease", fontFamily: "'Satoshi', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(181,176,168,0.4)"; e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.background = "rgba(181,176,168,0.06)" }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a5636"; e.currentTarget.style.color = "#9aafa0"; e.currentTarget.style.background = "rgba(18,38,24,0.8)" }}
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
            <div style={{ fontSize: 14, lineHeight: 1.75, color: message.error ? "#fb923c" : "#ffffff", whiteSpace: "pre-wrap", fontFamily: "'Satoshi', sans-serif" }}>
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
