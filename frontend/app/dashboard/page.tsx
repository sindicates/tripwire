"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// ── Types ────────────────────────────────────────────────────────────────────

type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "progress" | "settings"

interface NavItem { id: NavId; icon: string; label: string }

interface RiskCard {
  id: number
  severity: "URGENT" | "WARNING" | "INFO"
  borderColor: string
  badgeColor: string
  badgeText: string
  title: string
  description: string
}

interface ActionItem {
  id: number
  title: string
  meta: string
  tag: string
  tagColor: string
}

// ── Static data ──────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "risk-feed", icon: "⚠️", label: "Risk Feed" },
  { id: "advisor", icon: "💬", label: "Ask Advisor" },
  { id: "actions", icon: "🎯", label: "Action Center" },
  { id: "progress", icon: "📊", label: "My Progress" },
  { id: "settings", icon: "⚙️", label: "Settings" },
]

const RISK_CARDS: RiskCard[] = [
  {
    id: 1, severity: "URGENT", borderColor: "#ff6b9d", badgeColor: "#ff6b9d", badgeText: "URGENT",
    title: "FAFSA Renewal Window Opens in 14 Days",
    description: "Your FAFSA renewal deadline is approaching fast. Missing this window may pause your financial aid disbursement for the spring semester and require a manual reinstatement process.",
  },
  {
    id: 2, severity: "WARNING", borderColor: "#facc15", badgeColor: "#facc15", badgeText: "WARNING",
    title: "Credit Pace Risk: On track to graduate June 2029, not Dec 2028",
    description: "At your current credit load of 12 credits/semester, you will miss your target graduation date by one full semester. Adding one more course next term keeps you on schedule.",
  },
  {
    id: 3, severity: "INFO", borderColor: "#4ade80", badgeColor: "#4ade80", badgeText: "INFO",
    title: "Registration opens in 21 days — 2 of your target courses are filling fast",
    description: "MATH 285 is at 82% capacity and CS 446 is at 67%. Both are required for your degree plan. Plan to register on day one to secure your seat.",
  },
]

const ACTION_ITEMS: ActionItem[] = [
  { id: 1, title: "Submit FAFSA renewal", meta: "Due Jan 1, 2027 · Financial Aid Office", tag: "URGENT", tagColor: "#ff6b9d" },
  { id: 2, title: "Meet with advisor to adjust credit load", meta: "Schedule before Nov 15", tag: "IMPORTANT", tagColor: "#facc15" },
  { id: 3, title: "Register for MATH 285 before section fills", meta: "18% seats remaining", tag: "TIME-SENSITIVE", tagColor: "#ff8fb1" },
]

const SUGGESTED_QUESTIONS = [
  "Can I drop a class without losing aid?",
  "What is SAP?",
  "When does registration open?",
]

// ── Root component ───────────────────────────────────────────────────────────

interface Profile {
  display_name: string | null
  school: string | null
  year: string | null
}

export default function TripwireDashboard() {
  const [activeNav, setActiveNav] = useState<NavId>("dashboard")
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [profile, setProfile] = useState<Profile>({ display_name: null, school: null, year: null })
  const router = useRouter()

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("students")
        .select("display_name, school, year")
        .eq("user_id", user.id)
        .single()
      if (data) setProfile(data)
    }
    loadProfile()
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const handleNavClick = (id: NavId) => {
    setActiveNav(id)
    if (id === "advisor") setAdvisorOpen(true)
    if (id === "settings") router.push("/settings")
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a1a0f", color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      <Sidebar activeNav={activeNav} onNavClick={handleNavClick} onSignOut={signOut} profile={profile} />
      <main className="tw-main-content" style={{ flex: 1, overflowY: "auto", padding: "36px 44px", minWidth: 0 }}>
        <DashboardHeader onSignOut={signOut} profile={profile} />
        <StatCards />
        <RiskFeed />
        <ActionCenter />
      </main>

      {/* Floating advisor button */}
      <button
        className="tw-fab"
        aria-label="Open Policy Advisor"
        onClick={() => { setAdvisorOpen(true); console.log("TODO: open advisor panel") }}
        style={{ position: "fixed", bottom: 32, right: 32, width: 58, height: 58, borderRadius: "50%", background: "linear-gradient(135deg, #ff6b9d, #ff8fb1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 24px rgba(255, 107, 157, 0.4)", zIndex: 40 }}
      >💬</button>

      {advisorOpen && (
        <div onClick={() => setAdvisorOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 49, backdropFilter: "blur(2px)" }} />
      )}
      <AdvisorPanel open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ activeNav, onNavClick, onSignOut, profile }: { activeNav: NavId; onNavClick: (id: NavId) => void; onSignOut: () => void; profile: Profile }) {
  const name = profile.display_name || "You"
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const subtitle = [profile.school, profile.year].filter(Boolean).join(" · ") || "Tripwire"

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
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #ff6b9d, #ff8fb1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>{initials}</div>
          <div className="tw-sidebar-user-text" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 11, color: "#a3c4a8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
          </div>
        </div>
        <button className="tw-btn-ghost tw-sidebar-label" onClick={onSignOut} style={{ fontSize: 12, textAlign: "left", padding: "4px 0", color: "#a3c4a8" }}>Sign out →</button>
      </div>
    </aside>
  )
}

// ── Dashboard header ──────────────────────────────────────────────────────────

function DashboardHeader({ onSignOut, profile }: { onSignOut: () => void; profile: Profile }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = profile.display_name?.split(" ")[0] ?? null

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 30, margin: 0, letterSpacing: "-0.5px", lineHeight: 1.2 }}>{greeting}{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p style={{ color: "#a3c4a8", margin: "8px 0 0", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#ff6b9d", boxShadow: "0 0 6px #ff6b9d" }} />
          3 risks need your attention
        </p>
      </div>
      <button
        onClick={onSignOut}
        style={{ background: "none", border: "1px solid #1e3d28", borderRadius: 8, padding: "8px 14px", color: "#a3c4a8", fontSize: 13, cursor: "pointer", transition: "border-color 0.15s ease, color 0.15s ease", whiteSpace: "nowrap", flexShrink: 0 }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff6b9d"; e.currentTarget.style.color = "#ff6b9d" }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3d28"; e.currentTarget.style.color = "#a3c4a8" }}
      >Sign out</button>
    </div>
  )
}

// ── Stat cards ────────────────────────────────────────────────────────────────

function StatCards() {
  return (
    <div className="tw-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 36 }}>
      {/* GPA */}
      <div className="tw-card" style={{ padding: 24, borderRadius: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "#a3c4a8", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 6 }}>Current GPA</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 40, color: "#4ade80", lineHeight: 1 }}>3.82</div>
          </div>
          <span style={{ background: "rgba(74, 222, 128, 0.12)", color: "#4ade80", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(74, 222, 128, 0.25)" }}>✓ SAFE</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#a3c4a8", marginBottom: 6 }}>
            <span>Aid floor: 2.5</span><span style={{ color: "#4ade80" }}>+1.32 above</span>
          </div>
          <div style={{ background: "#1e3d28", borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(90deg, #4ade80, #86efac)", width: "74%", height: "100%", borderRadius: 4 }} />
          </div>
        </div>
      </div>

      {/* Credits */}
      <div className="tw-card" style={{ padding: 24, borderRadius: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "#a3c4a8", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 6 }}>Credits Completed</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 40, lineHeight: 1 }}>
              <span style={{ color: "#ff6b9d" }}>67</span>
              <span style={{ color: "#a3c4a8", fontSize: 22, fontWeight: 500 }}> / 120</span>
            </div>
          </div>
          <span style={{ background: "rgba(255, 107, 157, 0.12)", color: "#ff6b9d", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(255, 107, 157, 0.25)" }}>56%</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#a3c4a8", marginBottom: 6 }}>
            <span>Progress to degree</span><span>53 remaining</span>
          </div>
          <div style={{ background: "#1e3d28", borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(90deg, #ff6b9d, #ff8fb1)", width: "56%", height: "100%", borderRadius: 4 }} />
          </div>
        </div>
      </div>

      {/* Aid Status */}
      <div className="tw-card" style={{ padding: 24, borderRadius: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#a3c4a8", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 8 }}>Financial Aid</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#4ade80", display: "inline-block", boxShadow: "0 0 10px rgba(74, 222, 128, 0.7)", flexShrink: 0 }} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 32, color: "#4ade80" }}>Active</span>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #1e3d28", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "#a3c4a8" }}>Next review</div>
            <div style={{ fontSize: 14, color: "#ffffff", fontWeight: 600, marginTop: 2 }}>Dec 2026</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#a3c4a8" }}>Aid type</div>
            <div style={{ fontSize: 14, color: "#ffffff", fontWeight: 600, marginTop: 2 }}>FAFSA + Merit</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Risk feed ─────────────────────────────────────────────────────────────────

function RiskFeed() {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, margin: 0 }}>Risk Feed</h2>
          <span style={{ background: "rgba(255, 107, 157, 0.15)", color: "#ff6b9d", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, border: "1px solid rgba(255, 107, 157, 0.3)" }}>3 active</span>
        </div>
        <button className="tw-btn-ghost" onClick={() => console.log("TODO: view all risks")}>View all →</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {RISK_CARDS.map((card) => <RiskCardItem key={card.id} card={card} />)}
      </div>
    </section>
  )
}

function RiskCardItem({ card }: { card: RiskCard }) {
  const badgeTextColor = card.severity === "WARNING" ? "#0a1a0f" : "#ffffff"
  return (
    <div className="tw-risk-card" style={{ borderLeftColor: card.borderColor, padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#ffffff", lineHeight: 1.4, fontFamily: "'Space Grotesk', sans-serif" }}>{card.title}</h3>
        <span style={{ background: card.badgeColor, color: badgeTextColor, fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 6, letterSpacing: "0.08em", flexShrink: 0, marginTop: 2 }}>{card.badgeText}</span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#a3c4a8", lineHeight: 1.65 }}>{card.description}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="tw-btn-primary" style={{ fontSize: 13, padding: "7px 16px" }} onClick={() => console.log(`TODO: view action steps for risk ${card.id}`)}>View Action Steps</button>
        <button className="tw-btn-outline" style={{ fontSize: 13, padding: "7px 16px" }} onClick={() => console.log(`TODO: dismiss risk ${card.id}`)}>Dismiss</button>
      </div>
    </div>
  )
}

// ── Action center ─────────────────────────────────────────────────────────────

function ActionCenter() {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const toggle = (id: number) => {
    setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); console.log(`TODO: toggle action ${id}`); return n })
  }
  return (
    <section style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, margin: 0 }}>Action Center</h2>
          <span style={{ background: "rgba(250, 204, 21, 0.12)", color: "#facc15", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, border: "1px solid rgba(250, 204, 21, 0.25)" }}>{ACTION_ITEMS.length - checked.size} pending</span>
        </div>
        <button className="tw-btn-ghost" onClick={() => console.log("TODO: view all actions")}>View all →</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ACTION_ITEMS.map((item) => {
          const done = checked.has(item.id)
          return (
            <div key={item.id} className="tw-card" style={{ borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, opacity: done ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
              <input type="checkbox" checked={done} onChange={() => toggle(item.id)} style={{ width: 18, height: 18, accentColor: "#ff6b9d", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: done ? "#a3c4a8" : "#ffffff", textDecoration: done ? "line-through" : "none", marginBottom: 4 }}>{item.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ background: `${item.tagColor}18`, color: item.tagColor, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.06em" }}>{item.tag}</span>
                  <span style={{ fontSize: 12, color: "#a3c4a8" }}>{item.meta}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="tw-btn-outline" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => console.log(`TODO: mark done ${item.id}`)}>Mark Done</button>
                <button className="tw-btn-ghost" style={{ fontSize: 12 }} onClick={() => console.log(`TODO: learn more ${item.id}`)}>Learn More</button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Advisor panel ─────────────────────────────────────────────────────────────

function AdvisorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("")
  const handleSend = () => { if (!input.trim()) return; console.log(`TODO: send: ${input}`); setInput("") }
  return (
    <div className="tw-advisor-panel" style={{ position: "fixed", top: 0, right: 0, width: 390, height: "100vh", background: "#112318", borderLeft: "1px solid #1e3d28", display: "flex", flexDirection: "column", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)", zIndex: 50, boxShadow: open ? "-8px 0 40px rgba(0,0,0,0.4)" : "none" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e3d28", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🎓</span>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 }}>Policy Advisor</span>
          </div>
          <div style={{ fontSize: 12, color: "#a3c4a8" }}>Ask anything about your school&apos;s policies</div>
        </div>
        <button className="tw-icon-btn" onClick={onClose} aria-label="Close" style={{ fontSize: 18, marginTop: 2 }}>✕</button>
      </div>
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #1e3d28" }}>
        <div style={{ fontSize: 11, color: "#a3c4a8", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Suggested</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SUGGESTED_QUESTIONS.map((q) => <button key={q} className="tw-pill" onClick={() => setInput(q)} style={{ textAlign: "left" }}>{q}</button>)}
        </div>
      </div>
      <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#a3c4a8" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255, 107, 157, 0.1)", border: "1px solid rgba(255, 107, 157, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 14px" }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#ffffff", marginBottom: 6 }}>Ask me anything</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>I can help with UNR&apos;s academic policies,<br />financial aid rules, and registration info.</div>
        </div>
      </div>
      <div style={{ padding: "16px 24px", borderTop: "1px solid #1e3d28", display: "flex", gap: 8, background: "#0d1f13" }}>
        <input className="tw-chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question..." onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }} style={{ flex: 1, background: "#112318", border: "1px solid #1e3d28", borderRadius: 10, padding: "11px 14px", color: "#ffffff", fontSize: 14, outline: "none" }} />
        <button className="tw-btn-primary" onClick={handleSend} style={{ padding: "11px 20px", borderRadius: 10 }}>Send</button>
      </div>
    </div>
  )
}
