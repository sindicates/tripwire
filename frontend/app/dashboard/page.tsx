"use client"

import { useState, useEffect, useCallback } from "react"

// ── Types (shaped from GET /api/v1/risk-events) ──────────────────────────────

type Severity = "info" | "warn" | "high" | "urgent"

interface ActionPacket {
  title: string
  description: string
  urgency: string
  actions: { label: string; url: string | null; deadline: string | null }[]
  citations: string[]
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

// ── Risk score ───────────────────────────────────────────────────────────────

const SEVERITY_BASE: Record<Severity, number> = {
  info: 15,
  warn: 40,
  high: 65,
  urgent: 85,
}

function computeRiskScore(events: RiskEvent[]): { score: number; label: string } {
  const active = events.filter(ev => ev.resolved_at == null)
  if (active.length === 0) {
    return { score: 0, label: "No active risks" }
  }
  const worst = active.reduce((a, b) =>
    (SEVERITY_BASE[b.severity] ?? SEVERITY_BASE.warn) > (SEVERITY_BASE[a.severity] ?? SEVERITY_BASE.warn) ? b : a
  )
  const maxBase = SEVERITY_BASE[worst.severity] ?? SEVERITY_BASE.warn
  const extraCount = active.length - 1
  const score = Math.min(100, maxBase + extraCount * 5)
  const riskName = worst.risk_type.replace(/_/g, " ")
  const label = extraCount > 0
    ? `Driven by ${riskName} (${worst.severity}) + ${extraCount} other active risk${extraCount > 1 ? "s" : ""}`
    : `Driven by ${riskName} (${worst.severity})`
  return { score, label }
}

// ── Config ────────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// Stub description written by build_action_packet when Claude is unreachable.
const STUB_DESC = "Action plan unavailable — AI service unreachable."

// ── Severity styling (real enum values only) ──────────────────────────────────

const CARD_RING: Record<Severity, string> = {
  info:   "border-blue-200   bg-blue-50",
  warn:   "border-amber-200  bg-amber-50",
  high:   "border-orange-200 bg-orange-50",
  urgent: "border-red-200    bg-red-50",
}

const BADGE: Record<Severity, string> = {
  info:   "bg-blue-100   text-blue-800",
  warn:   "bg-amber-100  text-amber-800",
  high:   "bg-orange-100 text-orange-800",
  urgent: "bg-red-100    text-red-800",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUrl(s: unknown): s is string {
  return typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://"))
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

// ── RiskScoreGauge ────────────────────────────────────────────────────────────

function RiskScoreGauge({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, score))
  const color =
    clamped >= 85 ? "#dc2626" :
    clamped >= 65 ? "#ea580c" :
    clamped >= 40 ? "#d97706" :
    "#2563eb"
  return (
    <div className="flex flex-col items-center gap-1 w-32 shrink-0">
      <svg viewBox="0 0 120 70" className="w-28">
        <path d="M10,60 A50,50 0 0 1 110,60" fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" pathLength="100" />
        <path d="M10,60 A50,50 0 0 1 110,60" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - clamped} />
        <text x="60" y="50" textAnchor="middle" className="text-2xl font-bold" fill="#111827">{clamped}</text>
      </svg>
      <p className="text-[11px] text-gray-500 text-center leading-tight">{label}</p>
    </div>
  )
}

// ── RiskCard ──────────────────────────────────────────────────────────────────

function RiskCard({ ev }: { ev: RiskEvent }) {
  const sev = (ev.severity ?? "warn") as Severity
  const packet = ev.action_packet_json
  const ctx = ev.context_json ?? {}
  const isStub = !packet || packet.description === STUB_DESC
  const source = ctx.source

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${CARD_RING[sev] ?? CARD_RING.warn}`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs text-gray-500">{fmt(ev.predicted_at)}</p>
          <h3 className="font-semibold text-base capitalize">
            {ev.risk_type.replace(/_/g, " ")}
          </h3>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${BADGE[sev] ?? BADGE.warn}`}>
          {sev}
        </span>
      </div>

      {/* Body: real action packet OR raw context fallback */}
      {isStub ? (
        <div className="text-sm space-y-1.5">
          <p className="font-medium text-gray-600 text-xs uppercase tracking-wide">Context</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {Object.entries(ctx)
              .filter(([k]) => k !== "source")
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-medium capitalize text-gray-600">{k.replace(/_/g, " ")}</dt>
                  <dd className="text-gray-800">{String(v)}</dd>
                </div>
              ))}
          </dl>
        </div>
      ) : (
        <div className="text-sm space-y-1.5">
          <p className="font-semibold text-gray-800">{packet.title}</p>
          <p className="text-gray-700 leading-relaxed">{packet.description}</p>
          {packet.actions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {packet.actions.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer"
                      className="underline text-blue-700 hover:text-blue-900">
                      {a.label}
                    </a>
                  ) : (
                    <span>{a.label}</span>
                  )}
                  {a.deadline && <span className="text-gray-500">· due {a.deadline}</span>}
                </li>
              ))}
            </ul>
          )}
          {packet.citations.length > 0 && (
            <p className="text-xs text-gray-500">
              {packet.citations.map((c, i) => (
                <a key={i} href={c} target="_blank" rel="noopener noreferrer"
                  className="underline mr-2">{c}</a>
              ))}
            </p>
          )}
        </div>
      )}

      {/* Source citation */}
      {source != null && (
        <div className="pt-2 border-t border-black/10 text-xs text-gray-500">
          <span className="font-medium">Source: </span>
          {isUrl(source) ? (
            <a href={source} target="_blank" rel="noopener noreferrer"
              className="underline break-all hover:text-gray-700">
              {source}
            </a>
          ) : (
            <span>{String(source)}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [events, setEvents]   = useState<RiskEvent[]>([])
  const [status, setStatus]   = useState<"loading" | "ok" | "error">("loading")
  const [studentId, setStudentId] = useState("")
  const [scanning, setScanning]   = useState(false)
  const [scanMsg, setScanMsg]     = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    setStatus("loading")
    try {
      const res = await fetch(`${API}/api/v1/risk-events`)
      if (!res.ok) throw new Error(String(res.status))
      setEvents(await res.json())
      setStatus("ok")
    } catch {
      setStatus("error")
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const id = studentId.trim()
    if (!id) return
    setScanning(true)
    setScanMsg(null)
    try {
      const res = await fetch(`${API}/api/v1/risk-events/scan/${id}`, { method: "POST" })
      if (res.status === 404) { setScanMsg("Student not found."); return }
      if (!res.ok) throw new Error(String(res.status))
      const fired: RiskEvent[] = await res.json()
      setScanMsg(fired.length ? `${fired.length} new event(s) fired.` : "No new events (cooldown may apply).")
      await fetchEvents()
    } catch {
      setScanMsg("Scan failed — backend unreachable.")
    } finally {
      setScanning(false)
    }
  }

  const byStudent = events.reduce<Record<string, RiskEvent[]>>((acc, ev) => {
    ;(acc[ev.student_id] ??= []).push(ev)
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* ── Header ── */}
        <h1 className="text-3xl font-bold text-gray-900">Risk Dashboard</h1>

        {/* ── Scan panel ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-lg text-gray-900">Trigger a risk scan</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Paste a student UUID to run rules and persist new events.
            </p>
          </div>
          <form onSubmit={handleScan} className="flex gap-3">
            <input
              type="text"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              placeholder="e.g. 19eed41d-9f1d-4824-9a4d-298c6eeac7e0 (Berkeley demo)"
              className="flex-1 rounded-lg border border-gray-300 px-3.5 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={scanning || !studentId.trim()}
              className="rounded-lg bg-green-700 text-white px-5 py-2 text-sm font-semibold
                         hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {scanning ? "Scanning…" : "Scan"}
            </button>
          </form>
          {scanMsg && (
            <p className="text-sm text-gray-600">{scanMsg}</p>
          )}
        </section>

        {/* ── Risk events ── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg text-gray-900">Risk Events</h2>
            {status === "ok" && (
              <span className="text-sm text-gray-400">({events.length})</span>
            )}
          </div>

          {status === "loading" && (
            <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
          )}

          {status === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              Backend unreachable — make sure the FastAPI server is running on{" "}
              <code className="font-mono">{API}</code>.
            </div>
          )}

          {status === "ok" && events.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
              No risk events yet — paste a student UUID above and click <strong>Scan</strong>.
            </div>
          )}

          {status === "ok" && events.length > 0 && (
            <div className="space-y-8">
              {Object.entries(byStudent).map(([sid, evs]) => (
                <div key={sid} className="space-y-3">
                  <div className="flex items-center gap-4">
                    <RiskScoreGauge score={computeRiskScore(evs).score} label={computeRiskScore(evs).label} />
                    <p className="text-xs font-mono text-gray-400">student {sid}</p>
                  </div>
                  {evs.map(ev => <RiskCard key={ev.id} ev={ev} />)}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
