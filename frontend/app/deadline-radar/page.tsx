"use client"

import { useState, useEffect } from "react"
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

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeadlineCategory =
  | "financial-aid" | "registration" | "housing"
  | "scholarship"   | "academic"     | "internship"

export type UrgencyLevel = "urgent" | "warning" | "info"

export interface Deadline {
  id: number
  category: DeadlineCategory
  title: string
  description: string
  dueDate: string
  urgency: UrgencyLevel
  actionLabel?: string
  actionUrl?: string
  relevantToProfile: boolean
  sourceDoc?: string
}

type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "timeline" | "settings"
type IconComponent = React.ComponentType<LucideProps>
interface NavItem { id: NavId; Icon: IconComponent; label: string }

interface Profile {
  display_name: string | null
  school: string | null
  year: string | null
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard"     },
  { id: "risk-feed", Icon: AlertTriangle,   label: "Risk Feed"     },
  { id: "advisor",   Icon: MessageSquare,   label: "Ask Advisor"   },
  { id: "actions",   Icon: ListChecks,      label: "Action Center" },
  { id: "timeline",  Icon: Compass,         label: "Timeline"      },
  { id: "settings",  Icon: Settings,        label: "Settings"      },
]

// ── Seeded data ───────────────────────────────────────────────────────────────

const SEEDED_DEADLINES: Deadline[] = [
  { id: 1,  category: "financial-aid", urgency: "urgent",  dueDate: "2026-09-05", relevantToProfile: false, title: "SAP Appeal Deadline",             description: "If your Satisfactory Academic Progress was flagged last semester, this is the last day to submit a formal appeal with a documented academic plan. Approved appeals restore your financial aid eligibility.", actionLabel: "Download appeal form", sourceDoc: "Financial Aid Office – SAP Policy" },
  { id: 2,  category: "academic",      urgency: "warning", dueDate: "2026-09-12", relevantToProfile: true,  title: "Add / Drop Deadline",              description: "Last day to add a new course or drop one without a 'W' on your transcript. After this date, withdrawals are recorded and may count against your SAP completion ratio.", sourceDoc: "Registrar – Academic Calendar 2026–27" },
  { id: 3,  category: "academic",      urgency: "warning", dueDate: "2026-10-31", relevantToProfile: true,  title: "Withdrawal Deadline",              description: "Last day to withdraw from a course with a 'W' grade instead of an 'F'. Withdrawals still count toward your SAP pace calculation — more than one may put your aid at risk.", sourceDoc: "Registrar – Academic Calendar 2026–27" },
  { id: 4,  category: "registration",  urgency: "warning", dueDate: "2026-11-04", relevantToProfile: true,  title: "Spring Registration Opens",        description: "Priority registration begins. Your window is assigned by credit count — register on day one to secure seats in high-demand courses. MATH 285 and CS 446 are already over 70% full.", actionLabel: "View schedule", sourceDoc: "Registrar – Academic Calendar 2026–27" },
  { id: 5,  category: "housing",       urgency: "warning", dueDate: "2026-11-15", relevantToProfile: true,  title: "Spring Housing Application",       description: "On-campus housing applications for spring semester are due by this date. Late applications go on a waitlist. If you lose your housing assignment you may also lose any housing-tied scholarship funds.", actionLabel: "Apply for housing", sourceDoc: "Residential Life – Spring 2027 Housing Guide" },
  { id: 6,  category: "financial-aid", urgency: "urgent",  dueDate: "2026-12-01", relevantToProfile: true,  title: "CSS Profile Deadline",             description: "Required for institutional aid from your school and some private scholarships. Separate from FAFSA. Missing it means losing access to school-funded grants that don't roll over.", actionLabel: "Open CSS Profile", actionUrl: "https://cssprofile.collegeboard.org", sourceDoc: "Financial Aid Office – CSS Profile Instructions" },
  { id: 7,  category: "financial-aid", urgency: "urgent",  dueDate: "2027-01-01", relevantToProfile: true,  title: "FAFSA Renewal",                    description: "Your FAFSA for the upcoming academic year must be submitted by this date to remain eligible for federal aid. Missing it doesn't just delay your aid — it can cancel it entirely for the semester.", actionLabel: "Open FAFSA", actionUrl: "https://studentaid.gov", sourceDoc: "Financial Aid Office – Annual Deadlines (Fall 2026)" },
  { id: 8,  category: "scholarship",   urgency: "warning", dueDate: "2027-02-01", relevantToProfile: true,  title: "Dean's Merit Scholarship Renewal", description: "You must maintain a 3.5 GPA and submit a one-page reflection essay to renew your merit award for next year. This covers $4,200 annually — missing it is not recoverable mid-year.", actionLabel: "Submit renewal", sourceDoc: "Scholarship Office – Renewal Requirements 2026" },
  { id: 9,  category: "registration",  urgency: "warning", dueDate: "2027-02-01", relevantToProfile: false, title: "Graduation Application",            description: "Students graduating in May must submit a formal graduation application by this date. Late applications are processed the following semester, delaying your diploma and employer background checks.", actionLabel: "Apply to graduate", sourceDoc: "Registrar – Graduation Procedures" },
  { id: 10, category: "internship",    urgency: "info",    dueDate: "2027-02-15", relevantToProfile: true,  title: "Summer Research Funding",          description: "The Undergraduate Research Office awards up to $3,500 in summer funding for faculty-mentored projects. Applications require a faculty sponsor and a one-page project proposal.", actionLabel: "View requirements", sourceDoc: "Undergraduate Research Office – Summer 2027 Awards" },
  { id: 11, category: "scholarship",   urgency: "info",    dueDate: "2027-03-01", relevantToProfile: true,  title: "Gates Last Dollar Award",          description: "The Gates Last Dollar Award covers unmet financial need for eligible first-gen students near graduation. Strong candidate match based on your profile. Application is 3 short essays.", actionLabel: "Start application", sourceDoc: "Scholarship Office – External Awards Bulletin" },
  { id: 12, category: "academic",      urgency: "info",    dueDate: "2027-05-01", relevantToProfile: false, title: "Major Declaration Deadline",       description: "Students must declare a major by the end of their sophomore year. Undeclared students are restricted from registering for upper-division courses and may lose priority advising access.", actionLabel: "Declare major", sourceDoc: "Academic Advising – Degree Requirements Handbook" },
]

// ── Layout constants ──────────────────────────────────────────────────────────

const TL_W      = 1300
const L_PAD     = 90
const R_PAD     = 90
const USABLE    = TL_W - L_PAD - R_PAD
const SPINE_Y   = 320
const CARD_W    = 148
const CARD_H    = 94
const GAP       = 22
const STACK_GAP = 10
const DOT_R     = 6
const TL_BG     = "rgba(18, 38, 24, 0.95)"

// ── Category + urgency config ─────────────────────────────────────────────────

const CAT: Record<DeadlineCategory, { color: string; bg: string; label: string }> = {
  "financial-aid": { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  label: "Financial Aid" },
  "registration":  { color: "#fb923c", bg: "rgba(251,146,60,0.12)",  label: "Registration"  },
  "housing":       { color: "#c084fc", bg: "rgba(192,132,252,0.12)", label: "Housing"       },
  "scholarship":   { color: "#facc15", bg: "rgba(250,204,21,0.12)",  label: "Scholarship"   },
  "academic":      { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  label: "Academic"      },
  "internship":    { color: "#22d3ee", bg: "rgba(34,211,238,0.12)",  label: "Internship"    },
}

const URGENCY_BADGE: Record<UrgencyLevel, { label: string; color: string }> = {
  urgent:  { label: "Urgent",  color: "#b5b0a8" },
  warning: { label: "Warning", color: "#facc15" },
  info:    { label: "Info",    color: "#4ade80" },
}

// ── Layout algorithm ──────────────────────────────────────────────────────────

interface LayoutItem extends Deadline {
  x: number
  above: boolean
  level: number
}

function computeLayout(sorted: Deadline[]): LayoutItem[] {
  const minMs = new Date(sorted[0].dueDate).getTime()
  const maxMs = new Date(sorted[sorted.length - 1].dueDate).getTime()
  const range  = maxMs - minMs
  const placed: { x: number; above: boolean; level: number }[] = []

  return sorted.map((d, i) => {
    const x = L_PAD + ((new Date(d.dueDate).getTime() - minMs) / range) * USABLE
    const preferAbove = i % 2 === 0
    const attempts = [
      { above: preferAbove,  level: 0 },
      { above: !preferAbove, level: 0 },
      { above: preferAbove,  level: 1 },
      { above: !preferAbove, level: 1 },
    ]
    let chosen = attempts[attempts.length - 1]
    for (const attempt of attempts) {
      const conflict = placed.some(
        p => p.above === attempt.above && p.level === attempt.level && Math.abs(p.x - x) < CARD_W + 10
      )
      if (!conflict) { chosen = attempt; break }
    }
    placed.push({ x, above: chosen.above, level: chosen.level })
    return { ...d, x, above: chosen.above, level: chosen.level }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.ceil((new Date(iso).getTime() - today.getTime()) / 86_400_000)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function cardTop(above: boolean, level: number): number {
  if (above) {
    const base = SPINE_Y - GAP - CARD_H
    return level === 0 ? base : base - STACK_GAP - CARD_H
  } else {
    const base = SPINE_Y + GAP
    return level === 0 ? base : base + CARD_H + STACK_GAP
  }
}

function connectorY1(above: boolean, level: number) {
  return above ? cardTop(above, level) + CARD_H : SPINE_Y + DOT_R
}
function connectorY2(above: boolean, level: number) {
  return above ? SPINE_Y - DOT_R : cardTop(above, level)
}

function getMonthMarkers(sorted: Deadline[]) {
  const minMs  = new Date(sorted[0].dueDate).getTime()
  const maxMs  = new Date(sorted[sorted.length - 1].dueDate).getTime()
  const range  = maxMs - minMs
  const marks: { label: string; x: number; isYearStart: boolean }[] = []
  const cur = new Date(sorted[0].dueDate)
  cur.setDate(1); cur.setMonth(cur.getMonth() + 1)
  while (cur.getTime() <= maxMs) {
    const isYearStart = cur.getMonth() === 0
    marks.push({
      label: isYearStart
        ? cur.toLocaleDateString("en-US", { year: "numeric" })
        : cur.toLocaleDateString("en-US", { month: "short" }),
      x: L_PAD + ((cur.getTime() - minMs) / range) * USABLE,
      isYearStart,
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return marks
}

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

function Sidebar({ onNavClick, profile }: { onNavClick: (id: NavId) => void; profile: Profile }) {
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
            className={`tw-nav-link${id === "timeline" ? " active" : ""}`}
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
        <button
          className="tw-btn-ghost tw-sidebar-label"
          onClick={() => onNavClick("dashboard")}
          style={{ fontSize: 12, textAlign: "left", padding: "4px 0", color: "#9aafa0" }}
        >
          ← Back to dashboard
        </button>
      </div>
    </aside>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeadlineRadarPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>({ display_name: null, school: null, year: null })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [enabledCats, setEnabledCats] = useState<Set<DeadlineCategory>>(
    new Set(Object.keys(CAT) as DeadlineCategory[])
  )

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      const { data } = await supabase
        .from("students")
        .select("display_name, school, year")
        .eq("user_id", user.id)
        .single()
      if (data) setProfile(data as Profile)
    }
    loadProfile()
  }, [router])

  function handleNavClick(id: NavId) {
    if (id === "dashboard") router.push("/dashboard")
    else if (id === "advisor") router.push("/chat")
    else if (id === "actions") router.push("/actions")
    else if (id === "risk-feed") router.push("/dashboard")
  }

  function toggleCat(cat: DeadlineCategory) {
    setEnabledCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
    if (selected && selected.category === cat && enabledCats.has(cat)) setSelectedId(null)
  }

  const sorted       = [...SEEDED_DEADLINES].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  const layout       = computeLayout(sorted)
  const visibleLayout = layout.filter(d => enabledCats.has(d.category))
  const months       = getMonthMarkers(sorted)
  const selected     = visibleLayout.find(d => d.id === selectedId) ?? null
  const TL_H         = SPINE_Y + GAP + CARD_H + STACK_GAP + CARD_H + 28

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(180deg, #2e5a3c 0%, #c8d4d0 60%)", backgroundAttachment: "fixed", color: "#ffffff", fontFamily: "'Satoshi', sans-serif" }}>

      <Sidebar onNavClick={handleNavClick} profile={profile} />

      <main style={{ flex: 1, overflowY: "auto", padding: "36px 44px", minWidth: 0 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 28, margin: "0 0 6px", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
            Upcoming Deadlines
          </h1>
          <p style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 14, color: "#9aafa0", margin: 0 }}>
            From official school sources. Click any event for details.
          </p>
        </div>

        {/* Timeline card */}
        <div className="tw-card" style={{ borderRadius: 8, overflow: "hidden", padding: 0 }}>

          {/* Category filter */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 0, borderBottom: "1px solid #2a5636", padding: "16px 24px" }}>
            {(Object.keys(CAT) as DeadlineCategory[]).map(cat => {
              const C = CAT[cat]
              const active = enabledCats.has(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", marginRight: 24, background: "none", border: "none", cursor: "pointer", transition: "opacity 0.15s", opacity: active ? 1 : 0.3 }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: C.color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 12, fontWeight: 600, color: active ? C.color : "#4a6a52", whiteSpace: "nowrap" }}>
                    {C.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Timeline canvas */}
          <div style={{ overflowX: "auto", background: TL_BG }}>
            <div style={{ position: "relative", width: TL_W, height: TL_H, minWidth: TL_W }}>

              {/* Month grid lines */}
              {months.map(m => (
                <div key={m.label} style={{ position: "absolute", left: m.x, top: 0, bottom: 0 }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: m.isYearStart ? 2 : 1, height: "100%", background: m.isYearStart ? "#4a6a52" : "#2a5636", opacity: m.isYearStart ? 1 : 0.5 }} />
                  <span style={{ position: "absolute", top: 8, left: 4, fontFamily: "'Satoshi', sans-serif", fontSize: m.isYearStart ? 12 : 10, color: m.isYearStart ? "#9aafa0" : "#4a6a52", fontWeight: m.isYearStart ? 700 : 600, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                    {m.label}
                  </span>
                </div>
              ))}

              {/* Spine */}
              <div style={{ position: "absolute", top: SPINE_Y, left: L_PAD - 20, right: R_PAD - 20, height: 1, background: "#2a5636" }} />

              {/* Start / end labels */}
              <span style={{ position: "absolute", top: SPINE_Y + 8, left: L_PAD - 20, fontFamily: "'Satoshi', sans-serif", fontSize: 10, color: "#4a6a52" }}>
                {new Date(sorted[0].dueDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
              <span style={{ position: "absolute", top: SPINE_Y + 8, right: R_PAD - 20, fontFamily: "'Satoshi', sans-serif", fontSize: 10, color: "#4a6a52" }}>
                {new Date(sorted[sorted.length - 1].dueDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>

              {/* Items */}
              {visibleLayout.map(d => {
                const C   = CAT[d.category]
                const top = cardTop(d.above, d.level)
                const cY1 = connectorY1(d.above, d.level)
                const cY2 = connectorY2(d.above, d.level)
                const isSel = d.id === selectedId

                return (
                  <div key={d.id}>
                    {/* Diamond dot */}
                    <div style={{ position: "absolute", left: d.x - DOT_R, top: SPINE_Y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, transform: "rotate(45deg)", background: isSel ? C.color : TL_BG, border: `2px solid ${C.color}`, zIndex: 2, transition: "background 0.15s" }} />

                    {/* Connector */}
                    <div style={{ position: "absolute", left: d.x, top: Math.min(cY1, cY2), width: 1, height: Math.abs(cY2 - cY1), background: isSel ? C.color : "#2a5636", transition: "background 0.15s" }} />

                    {/* Card */}
                    <div
                      onClick={() => setSelectedId(isSel ? null : d.id)}
                      style={{ position: "absolute", left: d.x - CARD_W / 2, top, width: CARD_W, height: CARD_H, background: isSel ? C.bg : "transparent", border: `1px solid ${isSel ? C.color : "#2a5636"}`, borderLeft: `3px solid ${C.color}`, borderRadius: 2, padding: "10px 11px", cursor: "pointer", overflow: "hidden", transition: "border-color 0.15s, background 0.15s", zIndex: 3, boxSizing: "border-box" }}
                      onMouseEnter={e => { if (!isSel) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = C.color; el.style.background = C.bg } }}
                      onMouseLeave={e => { if (!isSel) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "#2a5636"; el.style.background = "transparent" } }}
                    >
                      <div style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 9, fontWeight: 700, color: C.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                        {C.label}
                      </div>
                      <div style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 11, color: "#ffffff", lineHeight: 1.35, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {d.title}
                      </div>
                      <div style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 10, color: "#9aafa0" }}>
                        {(() => { const days = daysUntil(d.dueDate); return days < 0 ? "Past" : days === 0 ? "Today" : `${days}d` })()}
                        {" · "}{new Date(d.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detail section */}
          {selected && (() => {
            const C    = CAT[selected.category]
            const days = daysUntil(selected.dueDate)
            return (
              <div style={{ borderTop: "1px solid #2a5636", padding: "28px 24px 32px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 11, fontWeight: 700, color: C.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {C.label}
                  </span>
                  <span style={{ color: "#2a5636" }}>·</span>
                  <span style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 11, color: URGENCY_BADGE[selected.urgency].color }}>
                    {URGENCY_BADGE[selected.urgency].label}
                  </span>
                  <span style={{ color: "#2a5636" }}>·</span>
                  <span style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 11, color: "#9aafa0" }}>
                    {days < 0 ? "Past" : days === 0 ? "Due today" : `${days} days away`} — {formatDate(selected.dueDate)}
                  </span>
                  {!selected.relevantToProfile && (
                    <>
                      <span style={{ color: "#2a5636" }}>·</span>
                      <span style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 11, color: "#4a6a52", fontStyle: "italic" }}>may not apply to you</span>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedId(null)}
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "#9aafa0", fontSize: 11, fontFamily: "'Satoshi', sans-serif", cursor: "pointer", padding: 0 }}
                  >
                    dismiss ✕
                  </button>
                </div>

                <h2 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 22, margin: "0 0 12px", color: "#ffffff", letterSpacing: "-0.3px" }}>
                  {selected.title}
                </h2>
                <p style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 14, color: "#9aafa0", lineHeight: 1.8, margin: "0 0 20px", maxWidth: 640 }}>
                  {selected.description}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  {selected.actionLabel && (
                    <a
                      href={selected.actionUrl ?? "#"}
                      target={selected.actionUrl ? "_blank" : undefined}
                      rel="noreferrer"
                      style={{ fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 13, color: C.color, textDecoration: "none" }}
                    >
                      {selected.actionLabel} →
                    </a>
                  )}
                  {selected.sourceDoc && (
                    <span style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 11, color: "#4a6a52" }}>
                      Source: {selected.sourceDoc}
                    </span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </main>
    </div>
  )
}
