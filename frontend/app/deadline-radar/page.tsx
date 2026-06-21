"use client"

import { useState } from "react"

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
  dueDate: string            // "YYYY-MM-DD"
  urgency: UrgencyLevel
  actionLabel?: string
  actionUrl?: string
  relevantToProfile: boolean
  sourceDoc?: string
}

// ── Seeded data ───────────────────────────────────────────────────────────────
// Swap for: const deadlines = await fetch("/api/deadlines").then(r => r.json())

const SEEDED_DEADLINES: Deadline[] = [
  { id: 1,  category: "financial-aid", urgency: "urgent",  dueDate: "2026-09-05", relevantToProfile: false, title: "SAP Appeal Deadline",          description: "If your Satisfactory Academic Progress was flagged last semester, this is the last day to submit a formal appeal with a documented academic plan. Approved appeals restore your financial aid eligibility.", actionLabel: "Download appeal form", sourceDoc: "Financial Aid Office – SAP Policy" },
  { id: 2,  category: "academic",      urgency: "warning", dueDate: "2026-09-12", relevantToProfile: true,  title: "Add / Drop Deadline",           description: "Last day to add a new course or drop one without a 'W' on your transcript. After this date, withdrawals are recorded and may count against your SAP completion ratio.", sourceDoc: "Registrar – Academic Calendar 2026–27" },
  { id: 3,  category: "academic",      urgency: "warning", dueDate: "2026-10-31", relevantToProfile: true,  title: "Withdrawal Deadline",           description: "Last day to withdraw from a course with a 'W' grade instead of an 'F'. Withdrawals still count toward your SAP pace calculation — more than one may put your aid at risk.", sourceDoc: "Registrar – Academic Calendar 2026–27" },
  { id: 4,  category: "registration",  urgency: "warning", dueDate: "2026-11-04", relevantToProfile: true,  title: "Spring Registration Opens",     description: "Priority registration begins. Your window is assigned by credit count — register on day one to secure seats in high-demand courses. MATH 285 and CS 446 are already over 70% full.", actionLabel: "View schedule", sourceDoc: "Registrar – Academic Calendar 2026–27" },
  { id: 5,  category: "housing",       urgency: "warning", dueDate: "2026-11-15", relevantToProfile: true,  title: "Spring Housing Application",    description: "On-campus housing applications for spring semester are due by this date. Late applications go on a waitlist. If you lose your housing assignment you may also lose any housing-tied scholarship funds.", actionLabel: "Apply for housing", sourceDoc: "Residential Life – Spring 2027 Housing Guide" },
  { id: 6,  category: "financial-aid", urgency: "urgent",  dueDate: "2026-12-01", relevantToProfile: true,  title: "CSS Profile Deadline",          description: "Required for institutional aid from your school and some private scholarships. Separate from FAFSA. Missing it means losing access to school-funded grants that don't roll over.", actionLabel: "Open CSS Profile", actionUrl: "https://cssprofile.collegeboard.org", sourceDoc: "Financial Aid Office – CSS Profile Instructions" },
  { id: 7,  category: "financial-aid", urgency: "urgent",  dueDate: "2027-01-01", relevantToProfile: true,  title: "FAFSA Renewal",                 description: "Your FAFSA for the upcoming academic year must be submitted by this date to remain eligible for federal aid. Missing it doesn't just delay your aid — it can cancel it entirely for the semester.", actionLabel: "Open FAFSA", actionUrl: "https://studentaid.gov", sourceDoc: "Financial Aid Office – Annual Deadlines (Fall 2026)" },
  { id: 8,  category: "scholarship",   urgency: "warning", dueDate: "2027-02-01", relevantToProfile: true,  title: "Dean's Merit Scholarship Renewal", description: "You must maintain a 3.5 GPA and submit a one-page reflection essay to renew your merit award for next year. This covers $4,200 annually — missing it is not recoverable mid-year.", actionLabel: "Submit renewal", sourceDoc: "Scholarship Office – Renewal Requirements 2026" },
  { id: 9,  category: "registration",  urgency: "warning", dueDate: "2027-02-01", relevantToProfile: false, title: "Graduation Application",         description: "Students graduating in May must submit a formal graduation application by this date. Late applications are processed the following semester, delaying your diploma and employer background checks.", actionLabel: "Apply to graduate", sourceDoc: "Registrar – Graduation Procedures" },
  { id: 10, category: "internship",    urgency: "info",    dueDate: "2027-02-15", relevantToProfile: true,  title: "Summer Research Funding",       description: "The Undergraduate Research Office awards up to $3,500 in summer funding for faculty-mentored projects. Applications require a faculty sponsor and a one-page project proposal.", actionLabel: "View requirements", sourceDoc: "Undergraduate Research Office – Summer 2027 Awards" },
  { id: 11, category: "scholarship",   urgency: "info",    dueDate: "2027-03-01", relevantToProfile: true,  title: "Gates Last Dollar Award",       description: "The Gates Last Dollar Award covers unmet financial need for eligible first-gen students near graduation. Strong candidate match based on your profile. Application is 3 short essays.", actionLabel: "Start application", sourceDoc: "Scholarship Office – External Awards Bulletin" },
  { id: 12, category: "academic",      urgency: "info",    dueDate: "2027-05-01", relevantToProfile: false, title: "Major Declaration Deadline",    description: "Students must declare a major by the end of their sophomore year. Undeclared students are restricted from registering for upper-division courses and may lose priority advising access.", actionLabel: "Declare major", sourceDoc: "Academic Advising – Degree Requirements Handbook" },
]

// ── Layout constants ──────────────────────────────────────────────────────────

const TL_W      = 1300
const L_PAD     = 90
const R_PAD     = 90
const USABLE    = TL_W - L_PAD - R_PAD
const SPINE_Y   = 320
const CARD_W    = 148
const CARD_H    = 94    // tall enough for 2-line titles
const GAP       = 22    // spine → card gap
const STACK_GAP = 10    // card → next level card gap
const DOT_R     = 6

// ── Layout algorithm ──────────────────────────────────────────────────────────

interface LayoutItem extends Deadline {
  x: number
  above: boolean
  level: number  // 0 = closest to spine, 1 = stacked further
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

// Visual color is per-category so cards are identifiable at a glance
const CAT: Record<DeadlineCategory, { color: string; bg: string; label: string }> = {
  "financial-aid": { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  label: "Financial Aid" },
  "registration":  { color: "#fb923c", bg: "rgba(251,146,60,0.12)",  label: "Registration"  },
  "housing":       { color: "#c084fc", bg: "rgba(192,132,252,0.12)", label: "Housing"        },
  "scholarship":   { color: "#facc15", bg: "rgba(250,204,21,0.12)",  label: "Scholarship"   },
  "academic":      { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  label: "Academic"       },
  "internship":    { color: "#22d3ee", bg: "rgba(34,211,238,0.12)",  label: "Internship"    },
}

// Urgency badge shown inside detail panel only
const URGENCY_BADGE: Record<UrgencyLevel, { label: string; color: string }> = {
  urgent:  { label: "Urgent",  color: "#ffadc8" },
  warning: { label: "Warning", color: "#facc15" },
  info:    { label: "Info",    color: "#4ade80" },
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeadlineRadarPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [enabledCats, setEnabledCats] = useState<Set<DeadlineCategory>>(
    new Set(Object.keys(CAT) as DeadlineCategory[])
  )

  function toggleCat(cat: DeadlineCategory) {
    setEnabledCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
    // deselect if the selected item's category is being hidden
    if (selected && selected.category === cat && enabledCats.has(cat)) {
      setSelectedId(null)
    }
  }

  const sorted  = [...SEEDED_DEADLINES].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  )
  const layout       = computeLayout(sorted)
  const visibleLayout = layout.filter(d => enabledCats.has(d.category))
  const months  = getMonthMarkers(sorted)
  const selected = visibleLayout.find(d => d.id === selectedId) ?? null

  // height of inner timeline container
  const TL_H = SPINE_Y + GAP + CARD_H + STACK_GAP + CARD_H + 28  // enough for two levels below

  const NAV_ITEMS = [
    { icon: "🏠", label: "Dashboard"     },
    { icon: "⚠️", label: "Risk Feed"     },
    { icon: "📡", label: "Deadline Radar", active: true },
    { icon: "💬", label: "Ask Advisor"   },
    { icon: "🎯", label: "Action Center" },
    { icon: "📊", label: "My Progress"   },
    { icon: "⚙️", label: "Settings"      },
  ]

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a1a0f", color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside className="tw-sidebar" style={{ width: 220, minWidth: 220, background: "#0d1f13", borderRight: "1px solid #1e3d28", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flexShrink: 0 }}>
        <div className="tw-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 8, padding: "28px 20px 32px" }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>⚡</span>
          <span className="tw-sidebar-logo-text" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, color: "#ffadc8", letterSpacing: "-0.5px" }}>Tripwire</span>
        </div>
        <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(item => (
            <div key={item.label} className={`tw-nav-link${item.active ? " active" : ""}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "default" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              <span className="tw-sidebar-label">{item.label}</span>
            </div>
          ))}
        </nav>
        <div className="tw-sidebar-user" style={{ padding: "16px 20px", borderTop: "1px solid #1e3d28", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #ffadc8, #ffc4d6)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>—</div>
            <div className="tw-sidebar-user-text" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>My Account</div>
              <div style={{ fontSize: 11, color: "#a3c4a8" }}>Tripwire</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

      {/* ── Page title ── */}
      <div style={{ padding: "36px 44px 0" }}>
        <h1 style={{ fontFamily: "Merriweather, serif", fontWeight: 900, fontSize: 26, margin: "0 0 6px", letterSpacing: "-0.5px" }}>
          Upcoming Deadlines
        </h1>
        <p style={{ fontFamily: "Satoshi, sans-serif", fontSize: 13, color: "#a3c4a8", margin: "0 0 24px" }}>
          From official school sources. Click any event for details.
        </p>

        {/* ── Category filter ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 0, borderBottom: "1px solid #1e3d28", paddingBottom: 14 }}>
          {(Object.keys(CAT) as DeadlineCategory[]).map(cat => {
            const C = CAT[cat]
            const active = enabledCats.has(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 0", marginRight: 24,
                  background: "none", border: "none",
                  cursor: "pointer", transition: "opacity 0.15s",
                  opacity: active ? 1 : 0.3,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 1, background: C.color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontFamily: "Satoshi, sans-serif", fontSize: 12, fontWeight: 600, color: active ? C.color : "#4a6a52", whiteSpace: "nowrap" }}>
                  {C.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ padding: "28px 0 0", overflowX: "auto" }}>
        <div style={{ position: "relative", width: TL_W, height: TL_H, minWidth: TL_W }}>

          {/* Month grid lines + labels */}
          {months.map(m => (
            <div key={m.label} style={{ position: "absolute", left: m.x, top: 0, bottom: 0 }}>
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: m.isYearStart ? 2 : 1,
                height: "100%",
                background: m.isYearStart ? "#4a6a52" : "#1e3d28",
                opacity: m.isYearStart ? 1 : 0.5,
              }} />
              <span style={{
                position: "absolute", top: 8, left: 4,
                fontFamily: "Satoshi, sans-serif",
                fontSize: m.isYearStart ? 12 : 10,
                color: m.isYearStart ? "#a3c4a8" : "#4a6a52",
                fontWeight: m.isYearStart ? 700 : 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
              }}>
                {m.label}
              </span>
            </div>
          ))}

          {/* Spine */}
          <div style={{ position: "absolute", top: SPINE_Y, left: L_PAD - 20, right: R_PAD - 20, height: 1, background: "#2a4a34" }} />

          {/* Start + end labels */}
          <span style={{ position: "absolute", top: SPINE_Y + 8, left: L_PAD - 20, fontFamily: "Satoshi, sans-serif", fontSize: 10, color: "#4a6a52" }}>
            {new Date(sorted[0].dueDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </span>
          <span style={{ position: "absolute", top: SPINE_Y + 8, right: R_PAD - 20, fontFamily: "Satoshi, sans-serif", fontSize: 10, color: "#4a6a52" }}>
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
                {/* Dot — small square rotated 45° */}
                <div style={{
                  position: "absolute",
                  left: d.x - DOT_R, top: SPINE_Y - DOT_R,
                  width: DOT_R * 2, height: DOT_R * 2,
                  transform: "rotate(45deg)",
                  background: isSel ? C.color : "#0a1a0f",
                  border: `2px solid ${C.color}`,
                  zIndex: 2,
                  transition: "background 0.15s",
                }} />

                {/* Connector */}
                <div style={{
                  position: "absolute",
                  left: d.x,
                  top: Math.min(cY1, cY2),
                  width: 1,
                  height: Math.abs(cY2 - cY1),
                  background: isSel ? C.color : "#1e3d28",
                  transition: "background 0.15s",
                }} />

                {/* Card */}
                <div
                  onClick={() => setSelectedId(isSel ? null : d.id)}
                  style={{
                    position: "absolute",
                    left: d.x - CARD_W / 2,
                    top,
                    width: CARD_W,
                    height: CARD_H,
                    background: isSel ? C.bg : "transparent",
                    border: `1px solid ${isSel ? C.color : "#1e3d28"}`,
                    borderLeft: `3px solid ${C.color}`,
                    borderRadius: 2,
                    padding: "10px 11px",
                    cursor: "pointer",
                    overflow: "hidden",
                    transition: "border-color 0.15s, background 0.15s",
                    zIndex: 3,
                    boxSizing: "border-box",
                  }}
                  onMouseEnter={e => {
                    if (!isSel) {
                      const el = e.currentTarget as HTMLDivElement
                      el.style.borderColor = C.color
                      el.style.background = C.bg
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSel) {
                      const el = e.currentTarget as HTMLDivElement
                      el.style.borderColor = "#1e3d28"
                      el.style.background = "transparent"
                    }
                  }}
                >
                  <div style={{ fontFamily: "Satoshi, sans-serif", fontSize: 9, fontWeight: 700, color: C.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                    {C.label}
                  </div>
                  <div style={{ fontFamily: "Merriweather, serif", fontWeight: 700, fontSize: 11, color: "#ffffff", lineHeight: 1.35, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {d.title}
                  </div>
                  <div style={{ fontFamily: "Satoshi, sans-serif", fontSize: 10, color: "#a3c4a8" }}>
                    {(() => { const days = daysUntil(d.dueDate); return days < 0 ? "Past" : days === 0 ? "Today" : `${days}d` })()}
                    {" · "}{new Date(d.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Detail section ── */}
      {selected && (() => {
        const C    = CAT[selected.category]
        const days = daysUntil(selected.dueDate)
        return (
          <div style={{ borderTop: `1px solid #1e3d28`, padding: "32px 44px 52px" }}>
            {/* eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontFamily: "Satoshi, sans-serif", fontSize: 11, fontWeight: 700, color: C.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {C.label}
              </span>
              <span style={{ color: "#1e3d28" }}>·</span>
              <span style={{ fontFamily: "Satoshi, sans-serif", fontSize: 11, color: URGENCY_BADGE[selected.urgency].color }}>
                {URGENCY_BADGE[selected.urgency].label}
              </span>
              <span style={{ color: "#1e3d28" }}>·</span>
              <span style={{ fontFamily: "Satoshi, sans-serif", fontSize: 11, color: "#4a6a52" }}>
                {days < 0 ? "Past" : days === 0 ? "Due today" : `${days} days away`} — {formatDate(selected.dueDate)}
              </span>
              {!selected.relevantToProfile && (
                <>
                  <span style={{ color: "#1e3d28" }}>·</span>
                  <span style={{ fontFamily: "Satoshi, sans-serif", fontSize: 11, color: "#4a6a52", fontStyle: "italic" }}>may not apply to you</span>
                </>
              )}
              <button
                onClick={() => setSelectedId(null)}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "#4a6a52", fontSize: 11, fontFamily: "Satoshi, sans-serif", cursor: "pointer", padding: 0 }}
              >dismiss ✕</button>
            </div>

            <h2 style={{ fontFamily: "Merriweather, serif", fontWeight: 700, fontSize: 22, margin: "0 0 12px", color: "#ffffff", letterSpacing: "-0.3px" }}>
              {selected.title}
            </h2>
            <p style={{ fontFamily: "Satoshi, sans-serif", fontSize: 14, color: "#a3c4a8", lineHeight: 1.8, margin: "0 0 20px", maxWidth: 640 }}>
              {selected.description}
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              {selected.actionLabel && (
                <a
                  href={selected.actionUrl ?? "#"}
                  target={selected.actionUrl ? "_blank" : undefined}
                  rel="noreferrer"
                  style={{ fontFamily: "Satoshi, sans-serif", fontWeight: 700, fontSize: 13, color: C.color, textDecoration: "none" }}
                >
                  {selected.actionLabel} →
                </a>
              )}
              {selected.sourceDoc && (
                <span style={{ fontFamily: "Satoshi, sans-serif", fontSize: 11, color: "#4a6a52" }}>
                  Source: {selected.sourceDoc}
                </span>
              )}
            </div>
          </div>
        )
      })()}
      </div> {/* end main */}
    </div>
  )
}
