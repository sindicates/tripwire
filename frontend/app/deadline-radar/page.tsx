"use client"

import { useState, useEffect, useMemo } from "react"
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
  /** true = came from student's own degree_audit_json or risk event action packet */
  isPersonal?: boolean
  /** true = date is estimated from academic calendar templates, not a real policy date */
  isEstimated?: boolean
}

interface SemesterDates {
  semesterEnd: string
  nextSemStart: string
  addDropDeadline: string
  finalsFAFSA: string
}

type DeadlineTemplate = Omit<Deadline, "id" | "dueDate"> & {
  daysFromNow?: number
  anchorKey?: keyof SemesterDates
}

type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "timeline" | "settings"
type IconComponent = React.ComponentType<LucideProps>
interface NavItem { id: NavId; Icon: IconComponent; label: string }

interface Profile {
  display_name: string | null
  school: string | null
  year: string | null
}

interface BackendStudent {
  id: string
  school_id: string | null
  gpa: number | null
  credits_completed: number | null
  credits_attempted: number | null
  credits_required: number | null
  degree_audit_json: {
    credits_this_semester?: number
    deadlines?: RawDeadline[]
  } | null
}

interface RawDeadline {
  name: string
  date: string
  source_url?: string
  timezone?: string
  category?: DeadlineCategory
  description?: string
  action_label?: string
  action_url?: string
}

interface RiskActionStep {
  title?: string
  label?: string
  url: string | null
  deadline: string | null
}

interface RiskEvent {
  id: string
  risk_type: string
  severity: "info" | "warn" | "high" | "urgent"
  predicted_at: string
  resolved_at: string | null
  action_packet_json: {
    title: string
    description: string
    urgency: string
    actions: RiskActionStep[]
    citations: string[]
  } | null
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard"     },
  { id: "risk-feed", Icon: AlertTriangle,   label: "Risk Feed"     },
  { id: "advisor",   Icon: MessageSquare,   label: "Ask Advisor"   },
  { id: "actions",   Icon: ListChecks,      label: "Action Center" },
  { id: "timeline",  Icon: Compass,         label: "Timeline"      },
  { id: "settings",  Icon: Settings,        label: "Settings"      },
]

// ── Institutional fallback deadlines ──────────────────────────────────────────
//
// Used when a student has no degree_audit_json.deadlines yet, or to supplement
// personal deadlines. Each entry is keyed by the school's backend name (lowercase).

const INSTITUTIONAL_DEADLINES: Record<string, Omit<Deadline, "id">[]> = {
  "university of california, berkeley": [
    {
      category: "financial-aid", urgency: "urgent", dueDate: "2026-03-02",
      relevantToProfile: true,
      title: "FAFSA CA Priority Deadline",
      description: "To be considered for on-time financial aid at UC Berkeley, students must complete the FAFSA by the California priority deadline. Missing it does not disqualify you, but late filers may receive reduced aid packages.",
      actionLabel: "Open FAFSA", actionUrl: "https://studentaid.gov",
      sourceDoc: "UC Berkeley Financial Aid & Scholarships — FAFSA Completion Overview",
    },
    {
      category: "academic", urgency: "warning", dueDate: "2026-08-28",
      relevantToProfile: true,
      title: "Fall 2026 Add / Drop Deadline",
      description: "Last day to add or drop a course without a 'W' appearing on your transcript. After this date, drops are recorded as withdrawals and count against your SAP completion ratio.",
      sourceDoc: "UC Berkeley Registrar — Academic Calendar 2026-27",
    },
    {
      category: "academic", urgency: "info", dueDate: "2026-08-19",
      relevantToProfile: true,
      title: "Fall 2026 Instruction Begins",
      description: "First day of instruction for Fall 2026 semester. Ensure all enrollment changes are finalized before classes begin.",
      sourceDoc: "UC Berkeley Registrar — Academic Calendar 2026-27",
    },
  ],
  "university of nevada, reno": [
    {
      category: "academic", urgency: "warning", dueDate: "2026-08-28",
      relevantToProfile: true,
      title: "Fall 2026 Add / Swap Deadline",
      description: "The final day to add or swap classes without instructor permission. Adding or swapping after this date requires instructor permission, with a final hard deadline of September 2, 2026.",
      sourceDoc: "UNR Registrar — Academic Calendar Fall 2026",
    },
    {
      category: "financial-aid", urgency: "urgent", dueDate: "2027-03-01",
      relevantToProfile: true,
      title: "FAFSA Renewal Deadline",
      description: "File your FAFSA renewal to maintain eligibility for federal and institutional aid for the upcoming academic year. Priority deadline to ensure your full award package.",
      actionLabel: "Open FAFSA", actionUrl: "https://studentaid.gov",
      sourceDoc: "UNR Financial Aid Office — SAP Policy",
    },
  ],
  "university of pennsylvania": [
    {
      category: "financial-aid", urgency: "urgent", dueDate: "2026-12-01",
      relevantToProfile: true,
      title: "CSS Profile Deadline",
      description: "Required for institutional aid from Penn and some private scholarships. Separate from FAFSA. Missing it means losing access to school-funded grants that don't roll over.",
      actionLabel: "Open CSS Profile", actionUrl: "https://cssprofile.collegeboard.org",
      sourceDoc: "Penn Student Financial Services — Satisfactory Academic Progress",
    },
    {
      category: "financial-aid", urgency: "urgent", dueDate: "2027-01-15",
      relevantToProfile: true,
      title: "FAFSA Priority Deadline",
      description: "Submit your FAFSA for the upcoming year by this date to be considered for all need-based Penn grants.",
      actionLabel: "Open FAFSA", actionUrl: "https://studentaid.gov",
      sourceDoc: "Penn Student Financial Services — Annual Deadlines",
    },
  ],
  "case western reserve university": [
    {
      category: "financial-aid", urgency: "urgent", dueDate: "2026-12-01",
      relevantToProfile: true,
      title: "CSS Profile Deadline",
      description: "Required for CWRU institutional aid. File by this date to be considered for all need-based grant programs.",
      actionLabel: "Open CSS Profile", actionUrl: "https://cssprofile.collegeboard.org",
      sourceDoc: "CWRU Student Financial Aid — SAP Policy",
    },
    {
      category: "financial-aid", urgency: "urgent", dueDate: "2027-03-01",
      relevantToProfile: true,
      title: "FAFSA Priority Deadline",
      description: "CWRU uses this date to determine priority consideration for federal, state, and institutional need-based aid. Late filers may have unmet need gaps.",
      actionLabel: "Open FAFSA", actionUrl: "https://studentaid.gov",
      sourceDoc: "CWRU Student Financial Aid — Annual Deadlines",
    },
  ],
}

// Generic fallbacks used for schools not in the map above
const GENERIC_FALLBACKS: Omit<Deadline, "id">[] = [
  {
    category: "financial-aid", urgency: "urgent", dueDate: "2027-03-01",
    relevantToProfile: true,
    title: "FAFSA Priority Deadline",
    description: "Submit your FAFSA for the upcoming year by your school's priority deadline to maximize your financial aid award.",
    actionLabel: "Open FAFSA", actionUrl: "https://studentaid.gov",
    sourceDoc: "Federal Student Aid",
  },
  {
    category: "financial-aid", urgency: "warning", dueDate: "2026-09-05",
    relevantToProfile: false,
    title: "SAP Appeal Deadline",
    description: "If your Satisfactory Academic Progress was flagged, this is the typical deadline to submit a formal appeal with a documented academic plan. Check your school's Financial Aid Office for the exact date.",
    sourceDoc: "Federal SAP Requirements (34 CFR § 668.34)",
  },
  {
    category: "academic", urgency: "warning", dueDate: "2026-09-12",
    relevantToProfile: true,
    title: "Add / Drop Deadline",
    description: "Last day to add a new course or drop one without a 'W' on your transcript. After this date, withdrawals count against your SAP completion ratio.",
    sourceDoc: "Registrar — Academic Calendar",
  },
]

// ── Semester date anchors ─────────────────────────────────────────────────────

function getSemesterDates(): SemesterDates {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth() + 1  // 1-12
  let semesterEnd: string
  let nextSemStart: string

  if (m >= 8 && m <= 12) {
    semesterEnd  = `${y}-12-12`
    nextSemStart = `${y + 1}-01-15`
  } else if (m >= 1 && m <= 5) {
    semesterEnd  = `${y}-05-08`
    nextSemStart = `${y}-08-20`
  } else {
    // Summer (June–July)
    semesterEnd  = `${y}-07-25`
    nextSemStart = `${y}-08-20`
  }

  const nextStart = new Date(nextSemStart)
  nextStart.setDate(nextStart.getDate() + 14)
  const addDropDeadline = nextStart.toISOString().slice(0, 10)

  // FAFSA priority: next March 1 (if past March, bump to next year)
  const fafsaYear  = m >= 4 ? y + 1 : y
  const finalsFAFSA = `${fafsaYear}-03-01`

  return { semesterEnd, nextSemStart, addDropDeadline, finalsFAFSA }
}

// ── Risk-contextual deadline templates ────────────────────────────────────────

const RISK_DEADLINE_TEMPLATES: Record<string, DeadlineTemplate[]> = {
  gpa_drop: [
    {
      category: "academic", urgency: "urgent", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "Academic Recovery Advisor Meeting",
      description: "Schedule a meeting with your academic advisor to build a GPA recovery plan before grades finalize. Most schools allow a grade-replacement repeat — ask whether you need to file a form.",
      daysFromNow: 7,
      sourceDoc: "[Estimated] Common academic calendar — verify with your school",
    },
    {
      category: "academic", urgency: "warning", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "Grade Replacement Form Deadline",
      description: "If your school offers grade replacement (course repeat policy), the form is typically due by the end of the term in which the repeat is taken. File before the semester ends.",
      anchorKey: "semesterEnd",
      sourceDoc: "[Estimated] Common academic calendar — verify with your school",
    },
  ],
  satisfactory_academic_progress: [
    {
      category: "academic", urgency: "urgent", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "Schedule Academic Plan Meeting",
      description: "SAP appeals require a signed academic plan from your advisor. Book this meeting immediately — advisor calendars fill fast before appeal deadlines.",
      daysFromNow: 7,
      sourceDoc: "[Estimated] Common academic calendar — verify with your school",
    },
    {
      category: "financial-aid", urgency: "urgent", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "SAP Appeal Form Submission",
      description: "File your Satisfactory Academic Progress appeal with the Financial Aid Office. Include a mitigating circumstances statement and a signed academic plan. Missing this window typically means waiting a full term for reinstatement.",
      daysFromNow: 21,
      sourceDoc: "[Estimated] Federal SAP Requirements (34 CFR § 668.34) — verify exact date with your school",
    },
  ],
  credit_deficit: [
    {
      category: "registration", urgency: "urgent", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "Add Courses Before Add/Drop Closes",
      description: "You may be able to add credits before the add/drop deadline to improve your completion pace ratio. Each added credit that you complete counts toward the 67% SAP pace requirement.",
      anchorKey: "addDropDeadline",
      sourceDoc: "[Estimated] Common academic calendar — verify with your Registrar",
    },
    {
      category: "financial-aid", urgency: "warning", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "SAP Pace Appeal Deadline",
      description: "If your cumulative completion rate is below the 67% SAP pace threshold, file a SAP appeal with your Financial Aid Office before the next disbursement cycle.",
      daysFromNow: 30,
      sourceDoc: "[Estimated] Federal SAP Requirements — verify exact date with your school",
    },
  ],
  aid_risk: [
    {
      category: "financial-aid", urgency: "urgent", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "Financial Aid Appeal Submission",
      description: "File a combined financial aid appeal addressing both GPA and pace issues. Include documentation of mitigating circumstances (medical, family, employment). Aid offices typically process appeals within 2–3 weeks.",
      daysFromNow: 14,
      sourceDoc: "[Estimated] Common financial aid policy — verify deadline with your school",
    },
    {
      category: "financial-aid", urgency: "warning", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "FAFSA Priority Renewal",
      description: "Renew your FAFSA by your school's priority deadline to preserve eligibility for all federal and institutional aid. Late filers risk losing grant funds that don't roll over.",
      anchorKey: "finalsFAFSA",
      sourceDoc: "[Estimated] Federal Student Aid — verify your school's priority date",
    },
  ],
  academic_probation: [
    {
      category: "academic", urgency: "urgent", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "Academic Probation Appeal Deadline",
      description: "Submit your formal probation appeal with a mitigating circumstances letter and a signed academic improvement plan. Missing this date typically results in academic suspension for the following term.",
      daysFromNow: 14,
      sourceDoc: "[Estimated] Common academic policy — verify exact date with your school's Registrar",
    },
    {
      category: "academic", urgency: "warning", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "End-of-Probation GPA Checkpoint",
      description: "You must meet your school's minimum GPA by the end of this semester to exit probation and avoid suspension. Schedule an academic recovery plan meeting with your advisor now.",
      anchorKey: "semesterEnd",
      sourceDoc: "[Estimated] Common academic policy — verify with your Registrar",
    },
  ],
  enrollment_drop: [
    {
      category: "registration", urgency: "urgent", relevantToProfile: true, isEstimated: true, isPersonal: true,
      title: "Add Courses to Restore Full-Time Status",
      description: "Most financial aid programs require full-time enrollment (12+ credits). Add courses before the add/drop deadline to maintain aid eligibility for this semester.",
      anchorKey: "addDropDeadline",
      sourceDoc: "[Estimated] Common academic calendar — verify with your school's Registrar",
    },
  ],
}

// ── Helpers: category inference ───────────────────────────────────────────────

const RISK_TO_CAT: Record<string, DeadlineCategory> = {
  gpa_drop:                        "academic",
  academic_probation:              "academic",
  satisfactory_academic_progress:  "financial-aid",
  credit_deficit:                  "financial-aid",
  aid_risk:                        "financial-aid",
  enrollment_drop:                 "registration",
  deadline_miss:                   "academic",
}

const KEYWORD_TO_CAT: [string[], DeadlineCategory][] = [
  [["fafsa", "css profile", "financial aid", "scholarship", "aid", "grant", "sap", "appeal"], "financial-aid"],
  [["registration", "add", "drop", "swap", "enroll", "graduation", "graduate", "withdraw"], "registration"],
  [["housing", "residential", "dormitory", "dorm"], "housing"],
  [["merit", "scholarship", "award", "renewal"], "scholarship"],
  [["academic", "instruction", "exam", "final", "midterm", "semester", "calendar", "class"], "academic"],
  [["internship", "research", "co-op", "career", "summer", "funding", "fellowship"], "internship"],
]

function inferCategory(title: string, description?: string): DeadlineCategory {
  const text = `${title} ${description ?? ""}`.toLowerCase()
  for (const [keywords, cat] of KEYWORD_TO_CAT) {
    if (keywords.some(k => text.includes(k))) return cat
  }
  return "academic"
}

function inferUrgency(dueDate: string): UrgencyLevel {
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return "info"    // past
  if (days < 14) return "urgent"
  if (days < 60) return "warning"
  return "info"
}

function buildRiskDeadlines(
  riskEvents: RiskEvent[],
  semDates: SemesterDates,
  existingTitles: Set<string>,
): Omit<Deadline, "id">[] {
  const out: Omit<Deadline, "id">[] = []
  const seen = new Set<string>(existingTitles)

  for (const event of riskEvents) {
    if (event.resolved_at) continue
    const templates = RISK_DEADLINE_TEMPLATES[event.risk_type]
    if (!templates) continue

    for (const t of templates) {
      if (seen.has(t.title)) continue
      seen.add(t.title)

      let dueDate: string
      if (t.anchorKey) {
        dueDate = semDates[t.anchorKey]
      } else if (t.daysFromNow !== undefined) {
        const d = new Date()
        d.setDate(d.getDate() + t.daysFromNow)
        dueDate = d.toISOString().slice(0, 10)
      } else {
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { daysFromNow: _d, anchorKey: _a, ...rest } = t
      out.push({ ...rest, dueDate, urgency: inferUrgency(dueDate) })
    }
  }

  return out
}

// ── Build deadline list from backend data + school fallbacks ──────────────────

function buildDeadlines(
  student: BackendStudent | null,
  schoolName: string | null,
  riskEvents: RiskEvent[],
): Deadline[] {
  let id = 1
  const result: Deadline[] = []

  // 1. Student's personal deadlines from degree_audit_json
  if (student?.degree_audit_json?.deadlines?.length) {
    for (const raw of student.degree_audit_json.deadlines) {
      result.push({
        id: id++,
        category: raw.category ?? inferCategory(raw.name, raw.description),
        title: raw.name,
        description: raw.description ?? "Deadline from your academic record. Click to see full details.",
        dueDate: raw.date,
        urgency: inferUrgency(raw.date),
        actionLabel: raw.action_label,
        actionUrl: raw.action_url,
        relevantToProfile: true,
        sourceDoc: raw.source_url,
        isPersonal: true,
      })
    }
  }

  // 2. RAG-sourced deadlines from risk event action packets
  for (const event of riskEvents) {
    if (event.resolved_at) continue
    const pkt = event.action_packet_json
    if (!pkt) continue
    const cat = RISK_TO_CAT[event.risk_type] ?? inferCategory(pkt.title)
    for (const action of pkt.actions) {
      const dateStr = action.deadline
      if (!dateStr || isNaN(new Date(dateStr).getTime())) continue
      const title = action.title ?? action.label ?? pkt.title
      result.push({
        id: id++,
        category: cat,
        title,
        description: pkt.description,
        dueDate: dateStr,
        urgency: inferUrgency(dateStr),
        actionLabel: action.url ? "Take Action" : undefined,
        actionUrl: action.url ?? undefined,
        relevantToProfile: true,
        sourceDoc: pkt.citations?.[0] ?? "Sherpa Risk Analysis",
        isPersonal: true,
      })
    }
  }

  // 2b. Risk-contextual estimated deadlines (de-duped against real titles above)
  const semDates = getSemesterDates()
  const existingTitles = new Set(result.map(d => d.title))
  for (const est of buildRiskDeadlines(riskEvents, semDates, existingTitles)) {
    result.push({ ...est, id: id++ })
  }

  // 3. Institutional fallbacks — only for categories not already covered by live data
  const liveCategories = new Set(result.map(d => d.category))
  const key = (schoolName ?? "").toLowerCase().trim()
  const institutionalList = INSTITUTIONAL_DEADLINES[key] ?? GENERIC_FALLBACKS

  const personalKeys = new Set(result.map(d => `${d.title}|${d.dueDate}`))
  for (const inst of institutionalList) {
    if (liveCategories.has(inst.category)) continue  // skip if RAG already covers this category
    if (!personalKeys.has(`${inst.title}|${inst.dueDate}`)) {
      result.push({ ...inst, id: id++ })
    }
  }

  // Sort ascending
  result.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  return result
}

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
  if (sorted.length === 0) return []
  const minMs = new Date(sorted[0].dueDate).getTime()
  const maxMs = new Date(sorted[sorted.length - 1].dueDate).getTime()
  const range = maxMs - minMs || 1  // avoid div-by-zero when all on same day
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
  if (sorted.length === 0) return []
  const minMs  = new Date(sorted[0].dueDate).getTime()
  const maxMs  = new Date(sorted[sorted.length - 1].dueDate).getTime()
  const range  = maxMs - minMs || 1
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
    <img src="/logo.png" width={size} height={size} alt="Sherpa" style={{ objectFit: "contain" }} />
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ onNavClick, profile }: { onNavClick: (id: NavId) => void; profile: Profile }) {
  const name     = profile.display_name || "—"
  const initials = name === "—" ? "—" : name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const subtitle = [profile.school, profile.year].filter(Boolean).join(" · ") || "—"

  return (
    <div className="tw-sidebar-wrapper">
      <aside className="tw-sidebar">
        <div className="tw-sidebar-content-wrapper">
          <div style={{ width: 240, display: "flex", flexDirection: "column", minHeight: "100%", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <a href="/" className="tw-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 20px 32px", textDecoration: "none" }}>
                <SherpaLogo size={44} />
                <span className="sidebar-brand tw-sidebar-logo-text">Sherpa</span>
              </a>
              <nav style={{ padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeadlineRadarPage() {
  const router = useRouter()
  const [profile,         setProfile]        = useState<Profile>({ display_name: null, school: null, year: null })
  const [backendStudent,  setBackendStudent]  = useState<BackendStudent | null>(null)
  const [backendStatus,   setBackendStatus]   = useState<"loading" | "ok" | "offline">("loading")
  const [riskEvents,      setRiskEvents]      = useState<RiskEvent[]>([])
  const [selectedId,      setSelectedId]      = useState<number | null>(null)
  const [enabledCats,     setEnabledCats]     = useState<Set<DeadlineCategory>>(
    new Set(Object.keys(CAT) as DeadlineCategory[])
  )

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      // Load Supabase profile (display_name, school, year)
      const { data: sbData } = await supabase
        .from("students")
        .select("display_name, school, year")
        .eq("user_id", user.id)
        .single()
      if (sbData) setProfile(sbData as Profile)

      // Load backend student (includes degree_audit_json)
      try {
        const res = await fetch(`${API_BASE}/api/v1/students/by-supabase/${user.id}`)
        if (res.ok) {
          const student: BackendStudent = await res.json()
          setBackendStudent(student)
          setBackendStatus("ok")

          // Fetch risk events so RAG-produced deadlines appear on the timeline
          try {
            const reRes = await fetch(`${API_BASE}/api/v1/risk-events/?student_id=${student.id}`)
            if (reRes.ok) {
              const events: RiskEvent[] = await reRes.json()
              setRiskEvents(events)
            }
          } catch {
            // non-fatal — timeline falls back to institutional data
          }
        } else {
          setBackendStatus("ok")  // backend reachable but no student record yet — still show fallbacks
        }
      } catch {
        setBackendStatus("offline")
      }
    }
    init()
  }, [router])

  function handleNavClick(id: NavId) {
    if (id === "dashboard") router.push("/dashboard")
    else if (id === "advisor") router.push("/chat")
    else if (id === "actions") router.push("/actions")
    else if (id === "risk-feed") router.push("/dashboard")
    else if (id === "settings") router.push("/settings")
  }

  function toggleCat(cat: DeadlineCategory) {
    setEnabledCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
    if (selected && selected.category === cat && enabledCats.has(cat)) setSelectedId(null)
  }

  // ── Deadline computation ────────────────────────────────────────────────────
  // Memoised so it only recomputes when the student or Supabase profile changes.
  const allDeadlines = useMemo(
    () => buildDeadlines(backendStudent, profile.school, riskEvents),
    [backendStudent, profile.school, riskEvents]
  )

  const sorted        = allDeadlines
  const layout        = computeLayout(sorted)
  const visibleLayout = layout.filter(d => enabledCats.has(d.category))
  const months        = getMonthMarkers(sorted)
  const selected      = visibleLayout.find(d => d.id === selectedId) ?? null
  const TL_H          = SPINE_Y + GAP + CARD_H + STACK_GAP + CARD_H + 28
  const personalCount = allDeadlines.filter(d => d.isPersonal).length

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(180deg, #2e5a3c 0%, #8faaa4 60%)", backgroundAttachment: "fixed", color: "#ffffff", fontFamily: "'Satoshi', sans-serif" }}>

      <Sidebar onNavClick={handleNavClick} profile={profile} />

      <main style={{ flex: 1, overflowY: "auto", padding: "36px 44px", minWidth: 0 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 28, margin: "0 0 6px", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
            Upcoming Deadlines
          </h1>
          <p style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 14, color: "#9aafa0", margin: 0 }}>
            {backendStatus === "loading" && "Loading your deadlines…"}
            {backendStatus === "offline" && "Showing general institutional deadlines — connect the backend for personalised ones."}
            {backendStatus === "ok" && personalCount > 0
              ? `${personalCount} deadline${personalCount !== 1 ? "s" : ""} from your risk profile · institutional fallbacks shown below.`
              : backendStatus === "ok" && "Showing institutional deadlines. Run a risk scan to surface personalised action deadlines."}
          </p>
        </div>

        {/* Loading skeleton */}
        {backendStatus === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 60, borderRadius: 8, background: "rgba(42,86,54,0.3)", animation: "pulse 1.5s ease infinite", opacity: 0.5 }} />
            ))}
          </div>
        )}

        {/* Timeline card */}
        {backendStatus !== "loading" && sorted.length > 0 && (
          <div className="tw-card" style={{ borderRadius: 8, overflow: "hidden", padding: 0 }}>

            {/* Category filter */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 0, borderBottom: "1px solid #2a5636", padding: "16px 24px" }}>
              {(Object.keys(CAT) as DeadlineCategory[]).map(cat => {
                const C = CAT[cat]
                const active = enabledCats.has(cat)
                const count  = allDeadlines.filter(d => d.category === cat).length
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCat(cat)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", marginRight: 24, background: "none", border: "none", cursor: "pointer", transition: "opacity 0.15s", opacity: active ? 1 : 0.3 }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 1, background: C.color, display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 12, fontWeight: 600, color: active ? C.color : "#4a6a52", whiteSpace: "nowrap" }}>
                      {C.label}
                      {count > 0 && <span style={{ marginLeft: 4, opacity: 0.6 }}>({count})</span>}
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
                      {/* Diamond dot — filled gold for personal deadlines */}
                      <div style={{ position: "absolute", left: d.x - DOT_R, top: SPINE_Y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, transform: "rotate(45deg)", background: isSel ? C.color : d.isPersonal ? C.color : TL_BG, border: `2px solid ${C.color}`, zIndex: 2, transition: "background 0.15s" }} />

                      {/* Connector */}
                      <div style={{ position: "absolute", left: d.x, top: Math.min(cY1, cY2), width: 1, height: Math.abs(cY2 - cY1), background: isSel ? C.color : "#2a5636", transition: "background 0.15s" }} />

                      {/* Card */}
                      <div
                        onClick={() => setSelectedId(isSel ? null : d.id)}
                        style={{ position: "absolute", left: d.x - CARD_W / 2, top, width: CARD_W, height: CARD_H, background: isSel ? C.bg : "transparent", border: `1px solid ${isSel ? C.color : "#2a5636"}`, borderLeft: `3px solid ${C.color}`, borderRadius: 2, padding: "10px 11px", cursor: "pointer", overflow: "hidden", transition: "border-color 0.15s, background 0.15s", zIndex: 3, boxSizing: "border-box" }}
                        onMouseEnter={e => { if (!isSel) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = C.color; el.style.background = C.bg } }}
                        onMouseLeave={e => { if (!isSel) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "#2a5636"; el.style.background = "transparent" } }}
                      >
                        <div style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 9, fontWeight: 700, color: C.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                          {C.label}
                          {d.isEstimated
                            ? <span style={{ background: "rgba(120,120,120,0.18)", borderRadius: 2, padding: "1px 4px", fontSize: 8, color: "#888" }}>[est.]</span>
                            : d.isPersonal
                              ? <span style={{ background: "rgba(181,176,168,0.2)", borderRadius: 2, padding: "1px 4px", fontSize: 8, color: "#b5b0a8" }}>yours</span>
                              : null}
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
                    {selected.isEstimated ? (
                      <span style={{ fontSize: 10, background: "rgba(120,120,120,0.12)", color: "#888", borderRadius: 4, padding: "2px 8px", border: "1px solid rgba(120,120,120,0.2)" }}>
                        Estimated — verify with your school
                      </span>
                    ) : selected.isPersonal ? (
                      <span style={{ fontSize: 10, background: "rgba(181,176,168,0.15)", color: "#b5b0a8", borderRadius: 4, padding: "2px 8px", border: "1px solid rgba(181,176,168,0.2)" }}>
                        From your academic record
                      </span>
                    ) : null}
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
                    <button
                      onClick={() => window.location.href = `/chat?q=Help me understand the ${encodeURIComponent(selected.title)} deadline`}
                      style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 12, fontWeight: 600, color: "#ffffff", background: "rgba(42,86,54,0.3)", border: "1px solid rgba(42,86,54,0.6)", borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}
                    >
                      Ask Advisor
                    </button>
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
        )}

        {/* Empty state when backend is offline */}
        {backendStatus === "offline" && sorted.length === 0 && (
          <div style={{ border: "1px dashed #2a5636", borderRadius: 10, padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#9aafa0", marginBottom: 8 }}>Could not reach the backend to load your deadlines.</div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#4a6a52" }}>cd backend && uvicorn app.main:app --reload</div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.5 } 50% { opacity: 0.2 } }
      `}</style>
    </div>
  )
}
