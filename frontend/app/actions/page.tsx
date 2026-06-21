"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = "info" | "warn" | "urgent"
type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "progress" | "settings"

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

// Demo student ID — in production pull from auth session
const DEMO_STUDENT_ID = "00000000-0000-0000-0000-000000000001"

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string; borderLeft: string; order: number }> = {
  urgent: { label: "URGENT", color: "#ffffff", bg: "#ff6b9d", border: "rgba(255,107,157,0.3)", borderLeft: "#ff6b9d", order: 0 },
  warn:   { label: "WARNING", color: "#0a1a0f", bg: "#facc15", border: "rgba(250,204,21,0.3)",  borderLeft: "#facc15",  order: 1 },
  info:   { label: "INFO",    color: "#0a1a0f", bg: "#4ade80", border: "rgba(74,222,128,0.3)",  borderLeft: "#4ade80",  order: 2 },
}

const RISK_TYPE_LABELS: Record<string, string> = {
  gpa_drop: "GPA Drop",
  credit_deficit: "Credit Deficit",
  aid_risk: "Aid Risk",
  deadline_miss: "Deadline",
  academic_probation: "Academic Probation",
  satisfactory_academic_progress: "SAP Warning",
}

function humanizeRiskType(riskType: string) {
  return RISK_TYPE_LABELS[riskType] ?? riskType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function relativeTime(dateStr: string) {
  const delta = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(delta / 3_600_000)
  if (hours < 1) return "just now"
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Root component ────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const [activeNav, setActiveNav] = useState<NavId>("actions")
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [resolving, setResolving] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Severity | "all">("all")
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const handleNavClick = (id: NavId) => {
    setActiveNav(id)
    if (id === "dashboard") router.push("/dashboard")
    if (id === "advisor") router.push("/chat")
  }

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("student_id", DEMO_STUDENT_ID)
      const res = await fetch(`${API_BASE}/api/v1/risk-events/?${params}`)
      if (!res.ok) throw new Error(await res.text())
      const data: RiskEvent[] = await res.json()
      setEvents(data)
    } catch (err: any) {
      setError(err.message ?? "Failed to load risk events")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  async function resolveEvent(id: string) {
    setResolving((prev) => new Set(Array.from(prev).concat(id)))
    try {
      const res = await fetch(`${API_BASE}/api/v1/risk-events/${id}/resolve`, { method: "PUT" })
      if (!res.ok) throw new Error(await res.text())
      const updated: RiskEvent = await res.json()
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)))
    } catch (err) {
      console.error("Failed to resolve event", err)
    } finally {
      setResolving((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const activeEvents = events
    .filter((e) => !e.resolved_at)
    .filter((e) => filter === "all" || e.severity === filter)
    .sort((a, b) => SEVERITY_CONFIG[a.severity].order - SEVERITY_CONFIG[b.severity].order)

  const resolvedEvents = events.filter((e) => !!e.resolved_at)

  const urgentCount = activeEvents.filter((e) => e.severity === "urgent").length
  const warnCount = activeEvents.filter((e) => e.severity === "warn").length

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a1a0f", color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      <Sidebar activeNav={activeNav} onNavClick={handleNavClick} onSignOut={signOut} />

      <main className="tw-main-content" style={{ flex: 1, overflowY: "auto", padding: "36px 44px", minWidth: 0 }}>
        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 30, margin: "0 0 8px", letterSpacing: "-0.5px" }}>Action Center</h1>
          <p style={{ color: "#a3c4a8", margin: 0, fontSize: 15 }}>
            {loading ? "Loading your risk events…" : (
              activeEvents.length === 0
                ? "You're all caught up! No active risks right now."
                : `${urgentCount > 0 ? `${urgentCount} urgent` : ""}${urgentCount > 0 && warnCount > 0 ? ", " : ""}${warnCount > 0 ? `${warnCount} warning` : ""} · ${activeEvents.length} total active`
            )}
          </p>
        </div>

        {/* Filter bar */}
        {!loading && events.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            {(["all", "urgent", "warn", "info"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 20,
                  border: filter === f ? "1px solid rgba(255,107,157,0.5)" : "1px solid #1e3d28",
                  background: filter === f ? "rgba(255,107,157,0.1)" : "transparent",
                  color: filter === f ? "#ff6b9d" : "#a3c4a8",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {f === "all" ? `All (${events.filter(e => !e.resolved_at).length})` : f === "warn" ? `Warnings (${events.filter(e => !e.resolved_at && e.severity === f).length})` : f.charAt(0).toUpperCase() + f.slice(1) + ` (${events.filter(e => !e.resolved_at && e.severity === f).length})`}
              </button>
            ))}
            <button onClick={fetchEvents} className="tw-btn-ghost" style={{ marginLeft: "auto", fontSize: 12 }}>
              ↻ Refresh
            </button>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ background: "rgba(255, 100, 100, 0.08)", border: "1px solid rgba(255, 100, 100, 0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ fontSize: 14, color: "#ff9999" }}>⚠ {error}</div>
            <button className="tw-btn-outline" style={{ fontSize: 12, padding: "6px 14px" }} onClick={fetchEvents}>Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="tw-card" style={{ padding: "20px 24px", borderRadius: 12, borderLeftWidth: 4, borderLeftColor: "#1e3d28", animation: "pulse 1.5s ease infinite" }}>
                <div style={{ height: 16, background: "#1e3d28", borderRadius: 6, width: "60%", marginBottom: 10 }} />
                <div style={{ height: 13, background: "#1e3d28", borderRadius: 6, width: "80%", marginBottom: 6 }} />
                <div style={{ height: 13, background: "#1e3d28", borderRadius: 6, width: "50%" }} />
              </div>
            ))}
          </div>
        )}

        {/* Active events */}
        {!loading && activeEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
            {activeEvents.map((event) => (
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
          <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeIn 0.4s ease" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(74, 222, 128, 0.1)", border: "1px solid rgba(74, 222, 128, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px" }}>✓</div>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, margin: "0 0 8px", color: "#4ade80" }}>All clear!</h2>
            <p style={{ color: "#a3c4a8", margin: 0, fontSize: 14 }}>No active risk events{filter !== "all" ? ` for this filter` : ""}. Keep up the good work.</p>
          </div>
        )}

        {/* Resolved events toggle */}
        {!loading && resolvedEvents.length > 0 && (
          <div>
            <button
              onClick={() => setShowResolved(!showResolved)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "#a3c4a8", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "8px 0", marginBottom: 16 }}
            >
              <span style={{ transition: "transform 0.2s ease", display: "inline-block", transform: showResolved ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
              Resolved ({resolvedEvents.length})
            </button>
            {showResolved && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: 0.6 }}>
                {resolvedEvents.map((event) => (
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
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
        @keyframes slideDown { from { opacity: 0; max-height: 0 } to { opacity: 1; max-height: 1000px } }
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
  const cfg = SEVERITY_CONFIG[event.severity]
  const packet = event.action_packet_json
  const hasPacket = !!packet

  return (
    <div
      className="tw-risk-card"
      style={{
        borderLeftColor: resolved ? "#1e3d28" : cfg.borderLeft,
        padding: "18px 22px",
        transition: "all 0.2s ease",
        animation: "fadeIn 0.3s ease",
      }}
    >
      {/* Card header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: expanded ? 16 : (hasPacket ? 12 : 0) }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ background: resolved ? "rgba(163,196,168,0.1)" : cfg.bg, color: resolved ? "#a3c4a8" : cfg.color, fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 6, letterSpacing: "0.08em", flexShrink: 0 }}>
              {resolved ? "RESOLVED" : cfg.label}
            </span>
            <span style={{ fontSize: 11, color: "#4a6b50" }}>{humanizeRiskType(event.risk_type)}</span>
            <span style={{ fontSize: 11, color: "#4a6b50" }}>·</span>
            <span style={{ fontSize: 11, color: "#4a6b50" }}>{relativeTime(event.predicted_at)}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: resolved ? "#a3c4a8" : "#ffffff", lineHeight: 1.4, fontFamily: "'Space Grotesk', sans-serif" }}>
            {packet?.title ?? humanizeRiskType(event.risk_type)}
          </h3>
          {packet?.description && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#a3c4a8", lineHeight: 1.65 }}>
              {packet.description}
            </p>
          )}
          {/* Context fallback if no packet */}
          {!packet && event.context_json && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(event.context_json).map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, background: "#1e3d28", color: "#a3c4a8", padding: "3px 10px", borderRadius: 12 }}>
                  {k.replace(/_/g, " ")}: <strong style={{ color: "#ffffff" }}>{String(v)}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {!resolved && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {hasPacket && (
              <button
                className="tw-btn-primary"
                style={{ fontSize: 12, padding: "7px 14px" }}
                onClick={onExpand}
              >
                {expanded ? "Collapse" : "Action Steps"}
              </button>
            )}
            <button
              className="tw-btn-outline"
              style={{ fontSize: 12, padding: "7px 14px", opacity: resolving ? 0.6 : 1 }}
              onClick={onResolve}
              disabled={resolving}
            >
              {resolving ? "…" : "Resolve"}
            </button>
          </div>
        )}

        {resolved && event.resolved_at && (
          <span style={{ fontSize: 11, color: "#4a6b50", flexShrink: 0, marginTop: 4 }}>
            Resolved {relativeTime(event.resolved_at)}
          </span>
        )}
      </div>

      {/* Expanded action packet */}
      {expanded && packet && !resolved && (
        <ActionPacketDetail packet={packet} />
      )}
    </div>
  )
}

// ── Action packet detail ──────────────────────────────────────────────────────

function ActionPacketDetail({ packet }: { packet: ActionPacket }) {
  return (
    <div style={{ borderTop: "1px solid #1e3d28", paddingTop: 16, animation: "fadeIn 0.25s ease" }}>
      {packet.urgency && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(255, 107, 157, 0.06)", border: "1px solid rgba(255,107,157,0.15)", borderRadius: 8, fontSize: 13, color: "#ff8fb1", lineHeight: 1.5 }}>
          🔔 {packet.urgency}
        </div>
      )}

      {packet.actions && packet.actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#a3c4a8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Action Steps</div>
          {packet.actions.map((action, idx) => (
            <div key={idx} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,107,157,0.12)", border: "1px solid rgba(255,107,157,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#ff6b9d", flexShrink: 0 }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", marginBottom: 3 }}>{action.title}</div>
                {action.description && (
                  <div style={{ fontSize: 13, color: "#a3c4a8", lineHeight: 1.6, marginBottom: 6 }}>{action.description}</div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {action.deadline && (
                    <span style={{ fontSize: 11, background: "rgba(250,204,21,0.1)", color: "#facc15", border: "1px solid rgba(250,204,21,0.2)", padding: "3px 10px", borderRadius: 20 }}>
                      📅 Due: {action.deadline}
                    </span>
                  )}
                  {action.office && (
                    <span style={{ fontSize: 11, background: "#1e3d28", color: "#a3c4a8", padding: "3px 10px", borderRadius: 20 }}>
                      🏢 {action.office}
                    </span>
                  )}
                  {action.url && (
                    <a
                      href={action.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tw-btn-primary"
                      style={{ fontSize: 11, padding: "4px 12px", textDecoration: "none", borderRadius: 20 }}
                    >
                      Open →
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {packet.citations && packet.citations.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #1e3d28" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#4a6b50", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Policy Sources</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {packet.citations.map((cite, i) => (
              <div key={i} style={{ fontSize: 12, color: "#4a6b50" }}>· {cite}</div>
            ))}
          </div>
        </div>
      )}
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
