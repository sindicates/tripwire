"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  LayoutDashboard,
  MessageSquare,
  ListChecks,
  Compass,
  Settings,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Building2,
  TrendingDown,
  Clock,
  CheckCircle2,
} from "lucide-react"
import type { LucideProps } from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = "info" | "warn" | "urgent"
type NavId = "dashboard" | "advisor" | "actions" | "timeline" | "settings"
type IconComponent = React.ComponentType<LucideProps>

interface ActionItem {
  title: string
  description: string
  url?: string
  deadline?: string
  office?: string
  estimated_minutes?: number
  email_template?: { subject: string; body: string }
  phone_script?: string
}

interface ActionPacket {
  title: string
  description: string
  urgency: string
  actions: ActionItem[]
  citations?: string[]
}

interface RiskEvent {
  id: string
  student_id: string
  risk_type: string
  severity: Severity
  predicted_at: string
  resolved_at: string | null
  context_json: Record<string, unknown> | null
  action_packet_json: ActionPacket | null
}

interface NavItem { id: NavId; Icon: IconComponent; label: string }
interface Profile { display_name: string | null; school: string | null; year: string | null }

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard"     },
  { id: "advisor",   Icon: MessageSquare,   label: "Ask Advisor"   },
  { id: "actions",   Icon: ListChecks,      label: "Action Center" },
  { id: "timeline",  Icon: Compass,         label: "Timeline"      },
  { id: "settings",  Icon: Settings,        label: "Settings"      },
]

const SEVERITY_CONFIG: Record<Severity, { label: string; textColor: string; bg: string; borderLeft: string; order: number }> = {
  urgent: { label: "URGENT",  textColor: "#ffffff", bg: "#dc2626", borderLeft: "#dc2626", order: 0 },
  warn:   { label: "WARNING", textColor: "#0a1a0f", bg: "#facc15", borderLeft: "#ca8a04", order: 1 },
  info:   { label: "INFO",    textColor: "#0a1a0f", bg: "#4ade80", borderLeft: "#16a34a", order: 2 },
}

const RISK_TYPE_LABELS: Record<string, string> = {
  gpa_drop: "GPA Drop",
  credit_deficit: "Credit Deficit",
  aid_risk: "Aid Risk",
  deadline_miss: "Deadline",
  academic_probation: "Academic Probation",
  satisfactory_academic_progress: "SAP Warning",
}

const DEMO_STUDENT_ID = "00000000-0000-0000-0000-000000000001"

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanizeRiskType(riskType: string) {
  return RISK_TYPE_LABELS[riskType] ?? riskType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

function relativeTime(dateStr: string) {
  const delta = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(delta / 3_600_000)
  if (hours < 1) return "just now"
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

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
                    className={`tw-nav-link${id === "actions" ? " active" : ""}`}
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

export default function ActionsPage() {
  const [events,       setEvents]       = useState<RiskEvent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [resolving,    setResolving]    = useState<Set<string>>(new Set())
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [filter,       setFilter]       = useState<Severity | "all">("all")
  const [studentId,    setStudentId]    = useState(DEMO_STUDENT_ID)
  const [profile,      setProfile]      = useState<Profile>({ display_name: null, school: null, year: null })
  const [userEmail,    setUserEmail]    = useState("")
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      setUserEmail(user.email || "")

      const { data } = await supabase
        .from("students")
        .select("display_name, school, year")
        .eq("user_id", user.id)
        .single()
      if (data) setProfile(data as Profile)

      try {
        const res = await fetch(`${API_BASE}/api/v1/students/by-supabase/${user.id}`)
        if (res.ok) {
          const student = await res.json()
          if (student.id) setStudentId(student.id)
        }
      } catch { /* fall back to demo id */ }
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
    if (id === "dashboard") router.push("/dashboard")
    else if (id === "advisor")  router.push("/chat")
    else if (id === "timeline") router.push("/deadline-radar")
    else if (id === "settings") router.push("/settings")
  }

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("student_id", studentId)
      const res = await fetch(`${API_BASE}/api/v1/risk-events/?${params}`)
      if (!res.ok) throw new Error(await res.text())
      setEvents(await res.json() as RiskEvent[])
    } catch (err: any) {
      setError(err.message ?? "Failed to load risk events")
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  async function resolveEvent(id: string) {
    setResolving(prev => new Set(Array.from(prev).concat(id)))
    try {
      const res = await fetch(`${API_BASE}/api/v1/risk-events/${id}/resolve`, { method: "PUT" })
      if (!res.ok) throw new Error(await res.text())
      const updated: RiskEvent = await res.json()
      setEvents(prev => prev.map(e => e.id === id ? updated : e))
    } catch (err) {
      console.error("Failed to resolve event", err)
    } finally {
      setResolving(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const activeEvents = events
    .filter(e => !e.resolved_at)
    .filter(e => filter === "all" || e.severity === filter)
    .sort((a, b) => SEVERITY_CONFIG[a.severity].order - SEVERITY_CONFIG[b.severity].order)

  const resolvedEvents = events.filter(e => !!e.resolved_at)
  const urgentCount = activeEvents.filter(e => e.severity === "urgent").length
  const warnCount   = activeEvents.filter(e => e.severity === "warn").length

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(180deg, #2e5a3c 0%, #8faaa4 60%)", backgroundAttachment: "fixed", color: "#ffffff", fontFamily: "'Satoshi', sans-serif" }}>

      <Sidebar onNavClick={handleNavClick} onSignOut={signOut} profile={profile} />

      <main style={{ flex: 1, overflowY: "auto", padding: "36px 44px", minWidth: 0 }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 28, margin: "0 0 8px", letterSpacing: "-0.5px" }}>Action Center</h1>
          <p style={{ color: "#9aafa0", margin: 0, fontSize: 14 }}>
            {loading ? "Loading your risk events…" : (
              activeEvents.length === 0
                ? "You're all caught up — no active risks right now."
                : `${urgentCount > 0 ? `${urgentCount} urgent` : ""}${urgentCount > 0 && warnCount > 0 ? ", " : ""}${warnCount > 0 ? `${warnCount} warning` : ""} · ${activeEvents.length} total active`
            )}
          </p>
        </div>

        {/* Filter bar */}
        {!loading && events.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
            {(["all", "urgent", "warn", "info"] as const).map(f => {
              const active = filter === f
              const count = f === "all"
                ? events.filter(e => !e.resolved_at).length
                : events.filter(e => !e.resolved_at && e.severity === f).length
              const label = f === "all" ? "All" : f === "warn" ? "Warnings" : f === "info" ? "Info" : "Urgent"
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{ padding: "6px 16px", borderRadius: 20, border: active ? "1px solid rgba(181,176,168,0.5)" : "1px solid #2a5636", background: active ? "rgba(181,176,168,0.12)" : "transparent", color: active ? "#b5b0a8" : "#9aafa0", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease", textTransform: "uppercase", letterSpacing: "0.06em" }}
                >
                  {label} ({count})
                </button>
              )
            })}
            <button
              onClick={fetchEvents}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, border: "1px solid #2a5636", background: "transparent", color: "#9aafa0", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#b5b0a8"; e.currentTarget.style.color = "#ffffff" }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a5636"; e.currentTarget.style.color = "#9aafa0" }}
            >
              <RefreshCw size={12} strokeWidth={2} />
              Refresh
            </button>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ fontSize: 14, color: "#f87171" }}>{error}</div>
            <button onClick={fetchEvents} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(220,38,38,0.3)", background: "transparent", color: "#f87171", fontSize: 12, cursor: "pointer" }}>Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: "rgba(18,38,24,0.7)", borderTop: "1px solid #2a5636", borderRight: "1px solid #2a5636", borderBottom: "1px solid #2a5636", borderLeft: "4px solid #2a5636", borderRadius: 12, padding: "20px 24px", animation: "pulse 1.5s ease infinite" }}>
                <div style={{ height: 14, background: "#2a5636", borderRadius: 6, width: "55%", marginBottom: 12 }} />
                <div style={{ height: 12, background: "#2a5636", borderRadius: 6, width: "80%", marginBottom: 8 }} />
                <div style={{ height: 12, background: "#2a5636", borderRadius: 6, width: "45%" }} />
              </div>
            ))}
          </div>
        )}

        {/* Active events */}
        {!loading && activeEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
            {activeEvents.map(event => (
              <RiskEventCard
                key={event.id}
                event={event}
                expanded={expandedId === event.id}
                resolving={resolving.has(event.id)}
                onExpand={() => setExpandedId(expandedId === event.id ? null : event.id)}
                onResolve={() => resolveEvent(event.id)}
                userEmail={userEmail}
              />
            ))}
          </div>
        )}

        {/* Empty active state */}
        {!loading && !error && activeEvents.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px 20px", animation: "fadeIn 0.4s ease" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 20, margin: "0 0 8px", color: "#4ade80" }}>All clear!</h2>
            <p style={{ color: "#9aafa0", margin: 0, fontSize: 14 }}>No active risk events{filter !== "all" ? " for this filter" : ""}. Keep it up.</p>
          </div>
        )}

        {/* Resolved events toggle */}
        {!loading && resolvedEvents.length > 0 && (
          <div>
            <button
              onClick={() => setShowResolved(!showResolved)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "#9aafa0", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "8px 0", marginBottom: 16 }}
            >
              <ChevronRight size={14} strokeWidth={2.5} style={{ transition: "transform 0.2s ease", transform: showResolved ? "rotate(90deg)" : "rotate(0deg)" }} />
              Resolved ({resolvedEvents.length})
            </button>
            {showResolved && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: 0.6 }}>
                {resolvedEvents.map(event => (
                  <RiskEventCard
                    key={event.id}
                    event={event}
                    expanded={false}
                    resolving={false}
                    onExpand={() => {}}
                    onResolve={() => {}}
                    userEmail={userEmail}
                    resolved
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse  { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
      `}</style>
    </div>
  )
}

// ── Risk event card ────────────────────────────────────────────────────────────

interface RiskEventCardProps {
  event: RiskEvent
  expanded: boolean
  resolving: boolean
  onExpand: () => void
  onResolve: () => void
  resolved?: boolean
  userEmail: string
}

function RiskEventCard({ event, expanded, resolving, onExpand, onResolve, resolved = false, userEmail }: RiskEventCardProps) {
  const cfg    = SEVERITY_CONFIG[event.severity]
  const packet = event.action_packet_json

  return (
    <div
      style={{
        background: "rgba(18,38,24,0.75)",
        borderTop: "1px solid #2a5636",
        borderRight: "1px solid #2a5636",
        borderBottom: "1px solid #2a5636",
        borderLeft: `4px solid ${resolved ? "#2a5636" : cfg.borderLeft}`,
        borderRadius: 12,
        padding: "18px 22px",
        transition: "all 0.2s ease",
        animation: "fadeIn 0.3s ease",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Card header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: expanded ? 16 : 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ background: resolved ? "rgba(154,175,160,0.15)" : cfg.bg, color: resolved ? "#9aafa0" : cfg.textColor, fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 6, letterSpacing: "0.08em", flexShrink: 0 }}>
              {resolved ? "RESOLVED" : cfg.label}
            </span>
            <span style={{ fontSize: 11, color: "#4a6a52" }}>{humanizeRiskType(event.risk_type)}</span>
            <span style={{ fontSize: 11, color: "#4a6a52" }}>·</span>
            <span style={{ fontSize: 11, color: "#4a6a52" }}>{relativeTime(event.predicted_at)}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: resolved ? "#9aafa0" : "#ffffff", lineHeight: 1.4, fontFamily: "'Satoshi', sans-serif" }}>
            {packet?.title ?? humanizeRiskType(event.risk_type)}
          </h3>
          {packet?.description && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9aafa0", lineHeight: 1.65 }}>
              {packet.description}
            </p>
          )}
          {!packet && event.context_json && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(event.context_json).map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, background: "rgba(42,86,54,0.5)", color: "#9aafa0", padding: "3px 10px", borderRadius: 12 }}>
                  {k.replace(/_/g, " ")}: <strong style={{ color: "#ffffff" }}>{String(v)}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        {!resolved && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {packet && (
              <button
                onClick={onExpand}
                style={{ padding: "7px 14px", borderRadius: 8, background: expanded ? "rgba(181,176,168,0.15)" : "rgba(181,176,168,0.08)", border: "1px solid rgba(181,176,168,0.25)", color: "#b5b0a8", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(181,176,168,0.2)"; e.currentTarget.style.color = "#ffffff" }}
                onMouseLeave={e => { e.currentTarget.style.background = expanded ? "rgba(181,176,168,0.15)" : "rgba(181,176,168,0.08)"; e.currentTarget.style.color = "#b5b0a8" }}
              >
                {expanded ? "Collapse" : "Action Steps"}
              </button>
            )}
            <button
              onClick={() => window.location.href = `/chat?risk_id=${event.id}`}
              style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(42,86,54,0.25)", border: "1px solid rgba(42,86,54,0.6)", color: "#ffffff", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(42,86,54,0.4)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(42,86,54,0.25)" }}
            >
              Talk to Advisor
            </button>
            <button
              onClick={onResolve}
              disabled={resolving}
              style={{ padding: "7px 14px", borderRadius: 8, background: "transparent", border: "1px solid #2a5636", color: "#9aafa0", fontSize: 12, fontWeight: 600, cursor: resolving ? "not-allowed" : "pointer", opacity: resolving ? 0.5 : 1, transition: "all 0.15s ease" }}
              onMouseEnter={e => { if (!resolving) { e.currentTarget.style.borderColor = "#b5b0a8"; e.currentTarget.style.color = "#ffffff" } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a5636"; e.currentTarget.style.color = "#9aafa0" }}
            >
              {resolving ? "…" : "Resolve"}
            </button>
          </div>
        )}

        {resolved && event.resolved_at && (
          <span style={{ fontSize: 11, color: "#4a6a52", flexShrink: 0, marginTop: 4 }}>
            Resolved {relativeTime(event.resolved_at)}
          </span>
        )}
      </div>

      {expanded && packet && !resolved && (
        <ActionPacketDetail
          packet={packet}
          eventId={event.id}
          userEmail={userEmail}
          contextJson={event.context_json}
          severity={event.severity}
        />
      )}
    </div>
  )
}

// ── ICS helpers ───────────────────────────────────────────────────────────────

function buildICS(summary: string, deadline: string, description: string): string {
  const startDate = deadline.replace(/-/g, "")
  const [y, m, d] = deadline.split("-").map(Number)
  const next = new Date(y, m - 1, d + 1)
  const endDate = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`
  const now = new Date().toISOString().replace(/-/g, "").replace(/:/g, "").replace(/\./g, "").slice(0, 15) + "Z"
  const uid = Math.random().toString(36).slice(2, 11) + "@sherpa"
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n")
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sherpa//Action Center//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`, `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${startDate}`, `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(description)}`,
    "BEGIN:VALARM", "TRIGGER:-P2D", "ACTION:DISPLAY", "DESCRIPTION:Sherpa reminder", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n")
}

function triggerICSDownload(ics: string, filename: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── Action packet detail ──────────────────────────────────────────────────────

function ActionPacketDetail({ packet, eventId, userEmail }: { packet: ActionPacket; eventId: string; userEmail: string; contextJson?: Record<string, unknown> | null; severity?: Severity }) {
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      const saved = localStorage.getItem(`sherpa_checked_${eventId}`)
      return new Set(JSON.parse(saved || "[]") as number[])
    } catch { return new Set() }
  })
  const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null)
  const [copiedStep, setCopiedStep] = useState<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(`sherpa_checked_${eventId}`, JSON.stringify(Array.from(checkedSteps)))
    } catch {}
  }, [checkedSteps, eventId])

  function toggleStep(idx: number) {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  async function copyText(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedStep(idx)
      setTimeout(() => setCopiedStep(null), 2000)
    } catch {}
  }

  const mailtoHref = (() => {
    const subject = encodeURIComponent(`Your Sherpa action plan: ${packet.title}`)
    let body = `Action Plan: ${packet.title}\n\n`
    packet.actions.forEach((a, i) => {
      body += `${i + 1}. ${a.title}\n   ${a.description}\n`
      if (a.deadline) body += `   Due: ${a.deadline}\n`
      if (a.url) body += `   ${a.url}\n`
      body += "\n"
    })
    return `mailto:${userEmail}?subject=${subject}&body=${encodeURIComponent(body.slice(0, 1800))}`
  })()

  return (
    <div style={{ borderTop: "1px solid #2a5636", paddingTop: 16, animation: "fadeIn 0.25s ease" }}>
      {packet.urgency && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(181,176,168,0.06)", border: "1px solid rgba(181,176,168,0.15)", borderRadius: 8, fontSize: 13, color: "#b5b0a8", lineHeight: 1.5 }}>
          {packet.urgency}
        </div>
      )}

      {packet.actions && packet.actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9aafa0", textTransform: "uppercase", letterSpacing: "0.07em" }}>Action Steps</div>
            <a
              href={mailtoHref}
              style={{ fontSize: 11, color: "#9aafa0", textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#b5b0a8" }}
              onMouseLeave={e => { e.currentTarget.style.color = "#9aafa0" }}
            >
              Email me this plan →
            </a>
          </div>

          {packet.actions.map((action, idx) => {
            const checked = checkedSteps.has(idx)
            const isExpanded = expandedTemplate === idx
            const hasTemplate = !!action.email_template
            const hasScript = !!action.phone_script

            return (
              <div
                key={idx}
                style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  padding: "12px 0",
                  borderBottom: idx < packet.actions.length - 1 ? "1px solid rgba(42,86,54,0.5)" : "none",
                  opacity: checked ? 0.5 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                <button
                  onClick={() => toggleStep(idx)}
                  aria-label={checked ? `Mark step ${idx + 1} incomplete` : `Mark step ${idx + 1} complete`}
                  style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    background: checked ? "rgba(74,222,128,0.15)" : "rgba(181,176,168,0.1)",
                    border: checked ? "1px solid rgba(74,222,128,0.5)" : "1px solid rgba(181,176,168,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    color: checked ? "#4ade80" : "#b5b0a8",
                    cursor: "pointer", transition: "all 0.2s ease",
                  }}
                >
                  {checked ? "✓" : idx + 1}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: checked ? "#9aafa0" : "#ffffff", textDecoration: checked ? "line-through" : "none", transition: "all 0.2s" }}>
                      {action.title}
                    </div>
                    {action.estimated_minutes && (
                      <span style={{ fontSize: 11, color: "#4a6a52", flexShrink: 0, whiteSpace: "nowrap" }}>~{action.estimated_minutes} min</span>
                    )}
                  </div>

                  {action.description && (
                    <div style={{ fontSize: 13, color: "#9aafa0", lineHeight: 1.6, marginBottom: 8 }}>{action.description}</div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: action.deadline || action.office ? 8 : 0 }}>
                    {action.deadline && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, background: "rgba(250,204,21,0.1)", color: "#facc15", border: "1px solid rgba(250,204,21,0.2)", padding: "3px 10px", borderRadius: 20 }}>
                          Due: {action.deadline}
                        </span>
                        <button
                          onClick={() => triggerICSDownload(buildICS(`Sherpa: ${action.title}`, action.deadline!, action.description || ""), `sherpa-${eventId.slice(0, 8)}-${idx}.ics`)}
                          style={{ fontSize: 11, color: "#9aafa0", background: "transparent", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#b5b0a8" }}
                          onMouseLeave={e => { e.currentTarget.style.color = "#9aafa0" }}
                        >
                          + Add to calendar
                        </button>
                      </div>
                    )}
                    {action.office && (
                      <div style={{ fontSize: 11, color: "#9aafa0" }}>🏢 {action.office}</div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(hasTemplate || hasScript) && (
                      <button
                        onClick={() => setExpandedTemplate(isExpanded ? null : idx)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, padding: "4px 12px", borderRadius: 20,
                          background: isExpanded ? "rgba(181,176,168,0.15)" : "rgba(181,176,168,0.07)",
                          border: "1px solid rgba(181,176,168,0.25)", color: "#b5b0a8",
                          cursor: "pointer", transition: "all 0.15s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(181,176,168,0.2)" }}
                        onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? "rgba(181,176,168,0.15)" : "rgba(181,176,168,0.07)" }}
                      >
                        {hasTemplate
                          ? (isExpanded ? "▲ Email draft" : "▾ Copy email draft")
                          : (isExpanded ? "▲ Talking points" : "▾ Talking points")}
                      </button>
                    )}
                    {action.url && (
                      <a
                        href={action.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "rgba(181,176,168,0.07)", border: "1px solid rgba(181,176,168,0.25)", color: "#b5b0a8", textDecoration: "none", transition: "all 0.15s ease" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(181,176,168,0.2)"; e.currentTarget.style.color = "#ffffff" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(181,176,168,0.07)"; e.currentTarget.style.color = "#b5b0a8" }}
                      >
                        Open <ExternalLink size={10} strokeWidth={2} />
                      </a>
                    )}
                  </div>

                  {isExpanded && (hasTemplate || hasScript) && (
                    <div style={{ marginTop: 10, padding: "12px 14px", background: "rgba(10,26,15,0.7)", border: "1px solid rgba(42,86,54,0.8)", borderRadius: 8, animation: "fadeIn 0.2s ease" }}>
                      {hasTemplate && action.email_template && (
                        <>
                          <div style={{ fontSize: 11, color: "#4a6a52", fontWeight: 600, marginBottom: 4 }}>
                            Subject: {action.email_template.subject}
                          </div>
                          <div style={{ fontSize: 12, color: "#9aafa0", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 10 }}>
                            {action.email_template.body}
                          </div>
                          <button
                            onClick={() => copyText(`Subject: ${action.email_template!.subject}\n\n${action.email_template!.body}`, idx)}
                            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer", transition: "all 0.2s ease", background: copiedStep === idx ? "rgba(74,222,128,0.15)" : "rgba(181,176,168,0.1)", border: copiedStep === idx ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(181,176,168,0.25)", color: copiedStep === idx ? "#4ade80" : "#b5b0a8" }}
                          >
                            {copiedStep === idx ? "Copied ✓" : "Copy to clipboard"}
                          </button>
                        </>
                      )}
                      {hasScript && action.phone_script && (
                        <>
                          <div style={{ fontSize: 12, color: "#9aafa0", lineHeight: 1.7, fontStyle: "italic", marginBottom: 10 }}>
                            "{action.phone_script}"
                          </div>
                          <button
                            onClick={() => copyText(action.phone_script!, idx)}
                            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer", transition: "all 0.2s ease", background: copiedStep === idx ? "rgba(74,222,128,0.15)" : "rgba(181,176,168,0.1)", border: copiedStep === idx ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(181,176,168,0.25)", color: copiedStep === idx ? "#4ade80" : "#b5b0a8" }}
                          >
                            {copiedStep === idx ? "Copied ✓" : "Copy script"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {packet.citations && packet.citations.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #2a5636" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#4a6a52", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Policy Sources</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {packet.citations.map((cite, i) => (
              <div key={i} style={{ fontSize: 12, color: "#4a6a52" }}>· {cite}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
