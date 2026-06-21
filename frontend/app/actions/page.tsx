"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  LayoutDashboard,
  AlertTriangle,
  MessageSquare,
  ListChecks,
  Compass,
  Settings,
  RefreshCw,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import type { LucideProps } from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = "info" | "warn" | "urgent"
type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "timeline" | "settings"
type IconComponent = React.ComponentType<LucideProps>

interface ActionItem {
  title: string
  description: string
  url?: string
  deadline?: string
  office?: string
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
  { id: "risk-feed", Icon: AlertTriangle,   label: "Risk Feed"     },
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
    <aside className="tw-sidebar" style={{ width: 220, minWidth: 220, background: "#1e3824", borderRight: "1px solid #2a5636", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flexShrink: 0 }}>
      <div className="tw-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 20px 32px" }}>
        <SherpaLogo size={44} />
        <span className="sidebar-brand tw-sidebar-logo-text">Sherpa</span>
      </div>
      <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
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
  const router = useRouter()

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
    else if (id === "risk-feed") router.push("/dashboard")
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
              <div key={i} style={{ background: "rgba(18,38,24,0.7)", border: "1px solid #2a5636", borderLeft: "4px solid #2a5636", borderRadius: 12, padding: "20px 24px", animation: "pulse 1.5s ease infinite" }}>
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
}

function RiskEventCard({ event, expanded, resolving, onExpand, onResolve, resolved = false }: RiskEventCardProps) {
  const cfg    = SEVERITY_CONFIG[event.severity]
  const packet = event.action_packet_json

  return (
    <div
      style={{
        background: "rgba(18,38,24,0.75)",
        border: "1px solid #2a5636",
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
        <ActionPacketDetail packet={packet} />
      )}
    </div>
  )
}

// ── Action packet detail ──────────────────────────────────────────────────────

function ActionPacketDetail({ packet }: { packet: ActionPacket }) {
  return (
    <div style={{ borderTop: "1px solid #2a5636", paddingTop: 16, animation: "fadeIn 0.25s ease" }}>
      {packet.urgency && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(181,176,168,0.06)", border: "1px solid rgba(181,176,168,0.15)", borderRadius: 8, fontSize: 13, color: "#b5b0a8", lineHeight: 1.5 }}>
          {packet.urgency}
        </div>
      )}

      {packet.actions && packet.actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9aafa0", textTransform: "uppercase", letterSpacing: "0.07em" }}>Action Steps</div>
          {packet.actions.map((action, idx) => (
            <div key={idx} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(181,176,168,0.1)", border: "1px solid rgba(181,176,168,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#b5b0a8", flexShrink: 0 }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", marginBottom: 4 }}>{action.title}</div>
                {action.description && (
                  <div style={{ fontSize: 13, color: "#9aafa0", lineHeight: 1.6, marginBottom: 8 }}>{action.description}</div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {action.deadline && (
                    <span style={{ fontSize: 11, background: "rgba(250,204,21,0.1)", color: "#facc15", border: "1px solid rgba(250,204,21,0.2)", padding: "3px 10px", borderRadius: 20 }}>
                      Due: {action.deadline}
                    </span>
                  )}
                  {action.office && (
                    <span style={{ fontSize: 11, background: "rgba(42,86,54,0.5)", color: "#9aafa0", padding: "3px 10px", borderRadius: 20 }}>
                      {action.office}
                    </span>
                  )}
                  {action.url && (
                    <a
                      href={action.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 12px", borderRadius: 20, background: "rgba(181,176,168,0.1)", border: "1px solid rgba(181,176,168,0.25)", color: "#b5b0a8", textDecoration: "none", transition: "all 0.15s ease" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(181,176,168,0.2)"; e.currentTarget.style.color = "#ffffff" }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(181,176,168,0.1)"; e.currentTarget.style.color = "#b5b0a8" }}
                    >
                      Open <ExternalLink size={10} strokeWidth={2} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
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
