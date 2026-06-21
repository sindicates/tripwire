"use client"

import { useState, useEffect, useCallback } from "react"
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

// ── Config ────────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ── Types ─────────────────────────────────────────────────────────────────────

type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "timeline" | "settings"
type IconComponent = React.ComponentType<LucideProps>
interface NavItem { id: NavId; Icon: IconComponent; label: string }

interface SupabaseProfile {
  display_name: string | null
  school: string | null
  year: string | null
  gpa: string | null
  credits_completed: string | null
  credits_required: string | null
  major: string | null
}

interface BackendStudent {
  id: string
  email: string
  display_name: string | null
  supabase_user_id: string | null
  school_id: string | null
  major: string | null
  gpa: number | null
  credits_completed: number | null
  credits_attempted: number | null
  credits_required: number | null
  aid_package_json: Record<string, unknown> | null
}

interface ActionStep {
  label: string
  url: string | null
  deadline: string | null
}

interface ActionPacket {
  title: string
  description: string
  urgency: string
  actions: ActionStep[]
  citations: string[]
}

interface RiskEvent {
  id: string
  risk_type: string
  severity: "info" | "warn" | "high" | "urgent"
  predicted_at: string
  resolved_at: string | null
  context_json: Record<string, unknown> | null
  action_packet_json: ActionPacket | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard" },
  { id: "risk-feed", Icon: AlertTriangle,   label: "Risk Feed" },
  { id: "advisor",   Icon: MessageSquare,   label: "Ask Advisor" },
  { id: "actions",   Icon: ListChecks,      label: "Action Center" },
  { id: "timeline",  Icon: Compass,         label: "Timeline" },
  { id: "settings",  Icon: Settings,        label: "Settings" },
]

const SEV: Record<string, { border: string; badge: string; label: string; bg: string }> = {
  urgent: { border: "#b5b0a8", badge: "#b5b0a8", label: "URGENT",  bg: "rgba(181,176,168,0.1)" },
  high:   { border: "#fb923c", badge: "#fb923c", label: "HIGH",    bg: "rgba(251,146,60,0.1)"  },
  warn:   { border: "#facc15", badge: "#facc15", label: "WARNING", bg: "rgba(250,204,21,0.1)"  },
  info:   { border: "#4ade80", badge: "#4ade80", label: "INFO",    bg: "rgba(74,222,128,0.1)"  },
}

const SUGGESTED_QUESTIONS = [
  "Can I drop a class without losing aid?",
  "What is SAP?",
  "When does registration open?",
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function sevSort(a: RiskEvent, b: RiskEvent) {
  const order = { urgent: 0, high: 1, warn: 2, info: 3 }
  return (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
}

function fmt(name: string | null) {
  return (name ?? "").replace(/_/g, " ")
}

// ── Sherpa logo SVG ──────────────────────────────────────────────────────────

function SherpaLogo({ size = 26 }: { size?: number }) {
  return (
    <img src="/logo.png" width={size} height={size} alt="Sherpa" style={{ objectFit: "contain" }} />
  )
}

// ── Root component ───────────────────────────────────────────────────────────

export default function SherpaDashboard() {
  const [activeNav, setActiveNav]         = useState<NavId>("dashboard")
  const [advisorOpen, setAdvisorOpen]     = useState(false)
  const [profile, setProfile]             = useState<SupabaseProfile>({ display_name: null, school: null, year: null, gpa: null, credits_completed: null, credits_required: null, major: null })
  const [backendStudent, setBackendStudent] = useState<BackendStudent | null>(null)
  const [riskEvents, setRiskEvents]       = useState<RiskEvent[]>([])
  const [backendStatus, setBackendStatus] = useState<"loading" | "ok" | "offline">("loading")
  const [scanning, setScanning]           = useState(false)
  const router = useRouter()

  const resolveEvent = useCallback(async (eventId: string) => {
    setRiskEvents(prev => prev.map(e => e.id === eventId ? { ...e, resolved_at: new Date().toISOString() } : e))
    try {
      await fetch(`${API}/api/v1/risk-events/${eventId}/resolve`, { method: "PUT" })
    } catch { /* optimistic — ignore backend error */ }
  }, [])

  const runScan = useCallback(async (studentId: string) => {
    setScanning(true)
    try {
      const res = await fetch(`${API}/api/v1/students/${studentId}/scan`, { method: "POST" })
      if (res.ok) {
        const newEvents: RiskEvent[] = await res.json()
        setRiskEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          return [...newEvents.filter(e => !existingIds.has(e.id)), ...prev]
        })
      }
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      // Load Supabase profile
      const { data: sbData } = await supabase
        .from("students")
        .select("display_name, school, year, gpa, credits_completed, credits_required, major")
        .eq("user_id", user.id)
        .single()
      if (sbData) setProfile(sbData as SupabaseProfile)

      // Sync with backend
      setBackendStatus("loading")
      try {
        const linkRes = await fetch(`${API}/api/v1/students/link-supabase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supabase_user_id: user.id,
            email: user.email ?? "",
            display_name: sbData?.display_name ?? null,
            school_name: sbData?.school ?? null,
            gpa: sbData?.gpa != null ? parseFloat(String(sbData.gpa)) || null : null,
            credits_completed: sbData?.credits_completed != null ? parseInt(String(sbData.credits_completed)) || null : null,
            credits_required: sbData?.credits_required != null ? parseInt(String(sbData.credits_required)) || null : null,
            major: sbData?.major ?? null,
          }),
        })

        if (!linkRes.ok) throw new Error("link failed")
        const student: BackendStudent = await linkRes.json()
        setBackendStudent(student)

        // Fetch risk events
        const evRes = await fetch(`${API}/api/v1/students/${student.id}/risk-events`)
        if (evRes.ok) setRiskEvents(await evRes.json())

        setBackendStatus("ok")
      } catch {
        setBackendStatus("offline")
      }
    }
    init()
  }, [router])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  function handleNavClick(id: NavId) {
    setActiveNav(id)
    if (id === "advisor")  router.push("/chat")
    else if (id === "actions")  router.push("/actions")
    else if (id === "settings") router.push("/settings")
    else if (id === "timeline") router.push("/deadline-radar")
    else if (id === "risk-feed") router.push("/deadline-radar")
  }

  const activeEvents = riskEvents.filter(e => e.resolved_at === null).sort(sevSort)

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(180deg, #2e5a3c 0%, #8faaa4 60%)", backgroundAttachment: "fixed", color: "#ffffff", fontFamily: "'Satoshi', sans-serif" }}>
      <Sidebar activeNav={activeNav} onNavClick={handleNavClick} onSignOut={signOut} profile={profile} />
      <main className="tw-main-content" style={{ flex: 1, overflowY: "auto", padding: "36px 44px", minWidth: 0 }}>
        <DashboardHeader profile={profile} activeCount={activeEvents.length} onSignOut={signOut} />
        <StatCards student={backendStudent} profile={profile} status={backendStatus} />
        <RiskFeed
          events={activeEvents}
          status={backendStatus}
          scanning={scanning}
          studentId={backendStudent?.id ?? null}
          onResolve={resolveEvent}
          onScan={runScan}
        />
        <ActionCenter events={activeEvents} status={backendStatus} onResolve={resolveEvent} />
      </main>

      <button
        className="tw-fab"
        aria-label="Open Trail Guide"
        onClick={() => setAdvisorOpen(true)}
        style={{ position: "fixed", bottom: 32, right: 32, width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(to top, #4a8e50, #8a9490)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 24px rgba(181, 176, 168, 0.3)", zIndex: 40 }}
      >
        <MessageSquare size={20} color="#111e14" strokeWidth={2} />
      </button>

      {advisorOpen && (
        <div onClick={() => setAdvisorOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 49, backdropFilter: "blur(2px)" }} />
      )}
      <AdvisorPanel open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ activeNav, onNavClick, onSignOut, profile }: { activeNav: NavId; onNavClick: (id: NavId) => void; onSignOut: () => void; profile: SupabaseProfile }) {
  const name = profile.display_name || "—"
  const initials = name === "—" ? "—" : name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const subtitle = [profile.school, profile.year].filter(Boolean).join(" · ") || "—"

  return (
    <aside className="tw-sidebar" style={{ width: 220, minWidth: 220, background: "#1e3824", borderRight: "1px solid #2a5636", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flexShrink: 0 }}>
      <a href="/" className="tw-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 20px 32px", textDecoration: "none" }}>
        <SherpaLogo size={44} />
        <span className="sidebar-brand tw-sidebar-logo-text">Sherpa</span>
      </a>
      <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(({ id, Icon, label }) => (
          <button key={id} className={`tw-nav-link${activeNav === id ? " active" : ""}`} onClick={() => onNavClick(id)}>
            <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            <span className="tw-sidebar-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="tw-sidebar-user" style={{ padding: "16px 20px", borderTop: "1px solid #2a5636", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #b5b0a8, #2d6030)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 12, color: "#111e14", flexShrink: 0, letterSpacing: "0.03em" }}>{initials}</div>
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

// ── Dashboard header ──────────────────────────────────────────────────────────

function DashboardHeader({ profile, activeCount, onSignOut }: { profile: SupabaseProfile; activeCount: number; onSignOut: () => void }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = profile.display_name?.split(" ")[0] ?? null

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 28, margin: 0, letterSpacing: "-0.3px", lineHeight: 1.2 }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p style={{ color: "#ffffff", margin: "8px 0 0", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: activeCount > 0 ? "#facc15" : "#4ade80", boxShadow: `0 0 5px ${activeCount > 0 ? "#facc15" : "#4ade80"}` }} />
          {activeCount > 0 ? `${activeCount} risk${activeCount > 1 ? "s" : ""} need${activeCount === 1 ? "s" : ""} your attention` : "No active risks"}
        </p>
      </div>
      <button
        onClick={onSignOut}
        style={{ background: "none", border: "1px solid #2a5636", borderRadius: 8, padding: "8px 14px", color: "#ffffff", fontSize: 13, cursor: "pointer", transition: "border-color 0.15s ease, color 0.15s ease", whiteSpace: "nowrap", flexShrink: 0 }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#b5b0a8"; e.currentTarget.style.color = "#b5b0a8" }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a5636"; e.currentTarget.style.color = "#ffffff" }}
      >Sign out</button>
    </div>
  )
}

// ── Stat cards ────────────────────────────────────────────────────────────────

function StatCards({ student, profile, status }: { student: BackendStudent | null; profile: SupabaseProfile; status: string }) {
  const gpa = student?.gpa ?? (profile.gpa ? parseFloat(profile.gpa) : null)
  const done = student?.credits_completed ?? (profile.credits_completed ? parseInt(profile.credits_completed) : null)
  const req  = student?.credits_required  ?? (profile.credits_required  ? parseInt(profile.credits_required)  : null)
  const aid  = student?.aid_package_json ?? null

  const AID_FLOOR = 2.0
  const gpaStatus = gpa == null ? null : gpa >= AID_FLOOR + 0.5 ? "SAFE" : gpa >= AID_FLOOR ? "AT RISK" : "BELOW"
  const gpaColor  = gpaStatus === "SAFE" ? "#4ade80" : gpaStatus === "AT RISK" ? "#facc15" : "#fb923c"
  const gpaPct    = gpa != null ? Math.min(100, Math.round((gpa / 4.0) * 100)) : 0

  const creditPct = done != null && req ? Math.round((done / req) * 100) : null
  const remaining = done != null && req ? req - done : null

  const aidStatus = (aid as any)?.status ?? (done != null ? "Active" : null)
  const aidType   = (aid as any)?.type ?? (profile.school ? "FAFSA" : null)
  const aidReview = (aid as any)?.next_review ?? null

  const isLoading = status === "loading"

  return (
    <div className="tw-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 36 }}>

      {/* GPA */}
      <div className="tw-card" style={{ padding: 24, borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 6 }}>Current GPA</div>
            <div style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 40, color: gpa != null ? gpaColor : "#9aafa0", lineHeight: 1 }}>
              {isLoading ? "—" : gpa != null ? gpa.toFixed(2) : "—"}
            </div>
          </div>
          {gpaStatus && (
            <span style={{ background: `${gpaColor}20`, color: gpaColor, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: `1px solid ${gpaColor}40`, letterSpacing: "0.05em" }}>{gpaStatus}</span>
          )}
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
            <span>Aid floor: {AID_FLOOR.toFixed(1)}</span>
            {gpa != null && <span style={{ color: gpaColor }}>{gpa >= AID_FLOOR ? `+${(gpa - AID_FLOOR).toFixed(2)} above` : `${(gpa - AID_FLOOR).toFixed(2)} below`}</span>}
          </div>
          <div style={{ background: "#2a5636", borderRadius: 4, height: 5, overflow: "hidden" }}>
            <div style={{ background: `linear-gradient(90deg, ${gpaColor}, ${gpaColor}99)`, width: `${gpaPct}%`, height: "100%", borderRadius: 4, transition: "width 0.4s ease" }} />
          </div>
        </div>
      </div>

      {/* Credits */}
      <div className="tw-card" style={{ padding: 24, borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 6 }}>Credits Completed</div>
            <div style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 40, lineHeight: 1 }}>
              <span style={{ color: "#b5b0a8" }}>{isLoading ? "—" : done ?? "—"}</span>
              {req && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 22, fontWeight: 400 }}> / {req}</span>}
            </div>
          </div>
          {creditPct != null && (
            <span style={{ background: "rgba(181,176,168,0.12)", color: "#b5b0a8", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(181,176,168,0.25)", letterSpacing: "0.05em" }}>{creditPct}%</span>
          )}
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
            <span>Progress to degree</span>
            {remaining != null && <span>{remaining} remaining</span>}
          </div>
          <div style={{ background: "#2a5636", borderRadius: 4, height: 5, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(90deg, #b5b0a8, #ccc9c2)", width: `${creditPct ?? 0}%`, height: "100%", borderRadius: 4, transition: "width 0.4s ease" }} />
          </div>
        </div>
      </div>

      {/* Financial Aid */}
      <div className="tw-card" style={{ padding: 24, borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 8 }}>Financial Aid</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80", display: "inline-block", boxShadow: "0 0 8px rgba(74,222,128,0.7)", flexShrink: 0 }} />
            <span style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 30, color: "#4ade80" }}>
              {isLoading ? "—" : aidStatus ?? "Active"}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #2a5636", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>Next review</div>
            <div style={{ fontSize: 14, color: "#ffffff", fontWeight: 600, marginTop: 2 }}>{aidReview ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>Aid type</div>
            <div style={{ fontSize: 14, color: "#ffffff", fontWeight: 600, marginTop: 2 }}>{aidType ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Risk feed ─────────────────────────────────────────────────────────────────

function RiskFeed({ events, status, scanning, studentId, onResolve, onScan }: {
  events: RiskEvent[]
  status: string
  scanning: boolean
  studentId: string | null
  onResolve: (id: string) => void
  onScan: (id: string) => void
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 17, margin: 0 }}>Risk Feed</h2>
          {status === "ok" && (
            <span style={{ background: events.length > 0 ? "rgba(251,146,60,0.15)" : "rgba(74,222,128,0.15)", color: events.length > 0 ? "#fb923c" : "#4ade80", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20, border: `1px solid ${events.length > 0 ? "rgba(251,146,60,0.4)" : "rgba(74,222,128,0.4)"}`, letterSpacing: "0.05em" }}>
              {events.length > 0 ? `${events.length} ACTIVE` : "ALL CLEAR"}
            </span>
          )}
          {status === "offline" && (
            <span style={{ fontSize: 11, color: "#ffffff" }}>backend offline</span>
          )}
        </div>
        {status === "ok" && studentId && (
          <button className="tw-btn-ghost" disabled={scanning} style={{ color: "#ffffff", fontWeight: 600 }} onClick={() => onScan(studentId)}>
            {scanning ? "Scanning…" : "Run scan →"}
          </button>
        )}
      </div>

      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} className="tw-risk-card" style={{ borderLeftColor: "#2a5636", padding: "18px 22px", opacity: 0.4, animation: "pulse 1.5s ease infinite" }}>
              <div style={{ height: 14, background: "#2a5636", borderRadius: 4, width: "60%", marginBottom: 10 }} />
              <div style={{ height: 11, background: "#2a5636", borderRadius: 4, width: "85%" }} />
            </div>
          ))}
        </div>
      )}

      {status === "ok" && events.length === 0 && (
        <div style={{ border: "1px dashed #2a5636", borderRadius: 10, padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#4ade80", fontWeight: 600, marginBottom: 6 }}>No active risks</div>
          <div style={{ fontSize: 13, color: "#ffffff" }}>
            {studentId
              ? <>Click <strong>Run scan</strong> above to check for new risks.</>
              : "Risks will appear here once detected."}
          </div>
        </div>
      )}

      {status === "offline" && (
        <div style={{ border: "1px dashed #2a5636", borderRadius: 10, padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#ffffff" }}>Start the FastAPI server to load live risk events.</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>cd backend && uvicorn app.main:app --reload</div>
        </div>
      )}

      {status === "ok" && events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map(ev => <RiskCardItem key={ev.id} event={ev} onResolve={onResolve} />)}
        </div>
      )}
    </section>
  )
}

function RiskCardItem({ event, onResolve }: { event: RiskEvent; onResolve: (id: string) => void }) {
  const s = SEV[event.severity] ?? SEV.warn
  const packet = event.action_packet_json
  const title = packet?.title ?? fmt(event.risk_type)
  const description = packet?.description ?? JSON.stringify(event.context_json ?? {})

  return (
    <div className="tw-risk-card" style={{ borderLeftColor: s.border, padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#ffffff", lineHeight: 1.4, fontFamily: "'Merriweather', serif" }}>{title}</h3>
        <span style={{ background: s.badge, color: "#111e14", fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 4, letterSpacing: "0.08em", flexShrink: 0, marginTop: 2 }}>{s.label}</span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.65 }}>{description}</p>
      {packet?.actions && packet.actions.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {packet.actions.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: s.border }}>→</span>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" style={{ color: s.border, textDecoration: "none" }}>{a.label}</a>
              ) : <span>{a.label}</span>}
              {a.deadline && <span style={{ color: "rgba(255,255,255,0.45)" }}>· due {a.deadline}</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="tw-btn-primary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => onResolve(event.id)}>Resolve</button>
        {packet?.citations?.[0] && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", alignSelf: "center" }}>Source: {packet.citations[0]}</span>
        )}
      </div>
    </div>
  )
}

// ── Action center ─────────────────────────────────────────────────────────────

interface DerivedAction {
  id: string
  title: string
  meta: string
  tag: string
  tagColor: string
  url: string | null
  riskEventId: string
}

function deriveActions(events: RiskEvent[]): DerivedAction[] {
  return events
    .flatMap(e => {
      const s = SEV[e.severity] ?? SEV.warn
      const steps = e.action_packet_json?.actions ?? []
      if (steps.length === 0) {
        return [{
          id: e.id,
          title: e.action_packet_json?.title ?? fmt(e.risk_type),
          meta: fmt(e.risk_type),
          tag: s.label,
          tagColor: s.badge,
          url: null,
          riskEventId: e.id,
        }]
      }
      return steps.slice(0, 2).map((a, i) => ({
        id: `${e.id}-${i}`,
        title: a.label,
        meta: [a.deadline ? `Due ${a.deadline}` : null, fmt(e.risk_type)].filter(Boolean).join(" · "),
        tag: s.label,
        tagColor: s.badge,
        url: a.url,
        riskEventId: e.id,
      }))
    })
    .slice(0, 6)
}

function ActionCenter({ events, status, onResolve }: { events: RiskEvent[]; status: string; onResolve: (id: string) => void }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const actions = deriveActions(events)

  function toggleDone(id: string, riskEventId: string) {
    setDone(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) } else { n.add(id); onResolve(riskEventId) }
      return n
    })
  }

  const pending = actions.filter(a => !done.has(a.id)).length

  return (
    <section style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 17, margin: 0 }}>Action Center</h2>
          {status === "ok" && actions.length > 0 && (
            <span style={{ background: "rgba(234,88,12,0.15)", color: "#ea580c", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20, border: "1px solid rgba(234,88,12,0.4)", letterSpacing: "0.05em" }}>{pending} PENDING</span>
          )}
        </div>
      </div>

      {status === "loading" && (
        <div style={{ border: "1px dashed #2a5636", borderRadius: 10, padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#ffffff" }}>Loading actions…</div>
        </div>
      )}

      {status === "ok" && actions.length === 0 && (
        <div style={{ border: "1px dashed #2a5636", borderRadius: 10, padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#ffffff" }}>No pending actions — looking good.</div>
        </div>
      )}

      {status === "ok" && actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {actions.map(item => {
            const isDone = done.has(item.id)
            return (
              <div key={item.id} className="tw-card" style={{ borderRadius: 8, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, opacity: isDone ? 0.5 : 1, transition: "opacity 0.2s ease" }}>
                <input type="checkbox" checked={isDone} onChange={() => toggleDone(item.id, item.riskEventId)} style={{ width: 16, height: 16, accentColor: "#b5b0a8", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: isDone ? "#9aafa0" : "#ffffff", textDecoration: isDone ? "line-through" : "none", marginBottom: 4 }}>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" style={{ color: isDone ? "#9aafa0" : "#ffffff", textDecoration: isDone ? "line-through" : "none" }}>{item.title}</a>
                    ) : item.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: `${item.tagColor}20`, color: item.tagColor, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.06em" }}>{item.tag}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{item.meta}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Advisor panel ─────────────────────────────────────────────────────────────

function AdvisorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("")
  const router = useRouter()

  function handleSend() {
    if (!input.trim()) return
    router.push(`/chat?q=${encodeURIComponent(input.trim())}`)
    onClose()
  }

  return (
    <div className="tw-advisor-panel" style={{ position: "fixed", top: 0, right: 0, width: 390, height: "100vh", background: "linear-gradient(to top, #2e5236, #3a4440)", borderLeft: "1px solid #2a5636", display: "flex", flexDirection: "column", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)", zIndex: 50, boxShadow: open ? "-8px 0 40px rgba(0,0,0,0.5)" : "none" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #2a5636", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Compass size={18} color="#b5b0a8" strokeWidth={1.75} />
            <span style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 17 }}>Trail Guide</span>
          </div>
          <div style={{ fontSize: 12, color: "#9aafa0" }}>Ask anything about your school&apos;s policies</div>
        </div>
        <button className="tw-icon-btn" onClick={onClose} aria-label="Close" style={{ fontSize: 16, marginTop: 2 }}>✕</button>
      </div>
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #2a5636" }}>
        <div style={{ fontSize: 10, color: "#9aafa0", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Suggested</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SUGGESTED_QUESTIONS.map((q) => <button key={q} className="tw-pill" onClick={() => setInput(q)} style={{ textAlign: "left" }}>{q}</button>)}
        </div>
      </div>
      <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#9aafa0" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(181,176,168,0.1)", border: "1px solid rgba(181,176,168,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <SherpaLogo size={30} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#ffffff", marginBottom: 6 }}>Ask me anything</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>Questions go to the full chat page<br />where answers are cited to your school&apos;s docs.</div>
        </div>
      </div>
      <div style={{ padding: "16px 24px", borderTop: "1px solid #2a5636", display: "flex", gap: 8, background: "#162a18" }}>
        <input className="tw-chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question..." onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }} style={{ flex: 1, background: "#1e3828", border: "1px solid #2a5636", borderRadius: 10, padding: "11px 14px", color: "#ffffff", fontSize: 14, outline: "none" }} />
        <button className="tw-btn-primary" onClick={handleSend} style={{ padding: "11px 20px", borderRadius: 10 }}>Send</button>
      </div>
    </div>
  )
}
