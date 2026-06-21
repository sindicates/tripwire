"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Upload, X, FileText, Sparkles, CheckCircle, ArrowLeft } from "lucide-react"

// ── Constants ──────────────────────────────────────────────────────────────────

const YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"] as const
const AID_STATUSES = [
  "Pell Grant", "Subsidized Loans", "Unsubsidized Loans",
  "Scholarships Only", "Work-Study", "Mixed Aid", "No Financial Aid",
] as const
const HOUSING_OPTIONS = [
  "On-Campus Dorms", "Off-Campus with Family", "Off-Campus Apartment", "Commuter",
] as const

const EMPTY_FORM = {
  display_name: "", school: "", year: "", major: "",
  credits_completed: "", current_classes: "", financial_aid_status: "",
  work_hours_per_week: "", housing_status: "", gpa: "",
  graduation_goal: "", unmet_financial_need: "",
}

const DOC_HINTS = [
  { icon: "📄", label: "Unofficial Transcript",      fields: "GPA · credits · major · class standing" },
  { icon: "💰", label: "Financial Aid Award Letter", fields: "Aid type · award amounts" },
  { icon: "📅", label: "Class Schedule",             fields: "Current semester courses" },
  { icon: "🎓", label: "Degree Audit",               fields: "Credits required · graduation goal" },
  { icon: "📋", label: "FAFSA SAR",                  fields: "EFC · unmet financial need" },
]

type StepId =
  | "upload" | "loading" | "saving"
  | "name" | "school" | "year" | "major" | "credits" | "gpa"
  | "classes" | "aid" | "work" | "housing" | "graduation" | "need"

const MANUAL_STEPS: StepId[] = [
  "name", "school", "year", "major", "credits", "gpa",
  "classes", "aid", "work", "housing", "graduation", "need",
]

// Edit-mode CSS helpers
const iCls = "w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
const iHi  = "w-full rounded-lg border-2 border-emerald-400 bg-emerald-50 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
const sCls = "w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
const sHi  = "w-full rounded-lg border-2 border-emerald-400 bg-emerald-50 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"

function EditField({ label, children, filled }: { label: string; children: React.ReactNode; filled?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="block text-sm font-medium text-foreground">{label}</label>
        {filled && <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />}
      </div>
      {children}
    </div>
  )
}

// ── Loading screen ─────────────────────────────────────────────────────────────

function LoadingScreen({ msg, duration, onDone }: { msg: string; duration: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [duration, onDone])

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0f1a10 0%, #152219 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 28, fontFamily: "'Satoshi', sans-serif",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: "2.5px solid rgba(181,176,168,0.12)",
        borderTopColor: "#b5b0a8",
        animation: "sherpa-spin 0.9s linear infinite",
      }} />
      <p style={{
        fontFamily: "'Merriweather', serif", fontSize: 20, fontWeight: 700,
        color: "#ffffff", margin: 0, textAlign: "center", maxWidth: 300, lineHeight: 1.5,
      }}>{msg}</p>
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%", background: "#b5b0a8",
            animation: `sherpa-pulse 1.4s ease-in-out ${i * 0.22}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Upload step ────────────────────────────────────────────────────────────────

function UploadStep({ files, dragging, extracting, extractError, fileInputRef, addFiles, removeFile, extract, onSkip, setDragging }: {
  files: File[]
  dragging: boolean
  extracting: boolean
  extractError: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  addFiles: (f: FileList | File[]) => void
  removeFile: (name: string) => void
  extract: () => void
  onSkip: () => void
  setDragging: (v: boolean) => void
}) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #1e3824 0%, #0f1a10 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "36px 24px", fontFamily: "'Satoshi', sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 520 }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 48, marginLeft: -28 }}>
          <img src="/logo.png" width={96} height={96} alt="Sherpa" style={{ objectFit: "contain" }} />
          <span style={{
            fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 16,
            background: "linear-gradient(to right, #c8d5cb, #b5b0a8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            marginLeft: -16,
          }}>Sherpa</span>
        </div>

        <h1 style={{ fontFamily: "'Merriweather', serif", fontWeight: 900, fontSize: 36, color: "#ffffff", margin: "0 0 10px", lineHeight: 1.15 }}>
          Let&apos;s get you set up
        </h1>
        <p style={{ fontSize: 15, color: "#9aafa0", margin: "0 0 32px", lineHeight: 1.6 }}>
          Upload your academic documents and Sherpa will fill in your profile automatically.
        </p>

        {/* Doc type hints */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {DOC_HINTS.map(h => (
            <div key={h.label} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10, padding: "10px 12px",
            }}>
              <span style={{ fontSize: 16, lineHeight: 1, marginTop: 1 }}>{h.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#ffffff", marginBottom: 1 }}>{h.label}</div>
                <div style={{ fontSize: 11, color: "#9aafa0" }}>{h.fields}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "#b5b0a8" : "rgba(255,255,255,0.14)"}`,
            borderRadius: 14, padding: "28px 24px", textAlign: "center", cursor: "pointer",
            background: dragging ? "rgba(181,176,168,0.05)" : "rgba(255,255,255,0.02)",
            transition: "all 0.15s", marginBottom: 12,
          }}
        >
          <Upload size={24} color={dragging ? "#b5b0a8" : "#9aafa0"} style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 14, fontWeight: 500, color: "#ffffff", margin: "0 0 4px" }}>Drop files here or click to browse</p>
          <p style={{ fontSize: 12, color: "#9aafa0", margin: 0 }}>PDF, JPG, PNG, WebP — up to 5 files</p>
          <input ref={fileInputRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" multiple className="sr-only"
            onChange={e => e.target.files && addFiles(e.target.files)} />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {files.map(f => (
              <li key={f.name} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <FileText size={14} color="#9aafa0" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: "#9aafa0", flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button type="button" onClick={e => { e.stopPropagation(); removeFile(f.name) }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#9aafa0", padding: 0 }}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Extract button */}
        {files.length > 0 && (
          <button
            type="button" onClick={extract} disabled={extracting}
            style={{
              width: "100%",
              background: extracting ? "rgba(181,176,168,0.35)" : "linear-gradient(135deg, #b5b0a8, #2d6030)",
              border: "none", borderRadius: 10, color: "#111e14",
              fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 14,
              padding: "14px 20px", cursor: extracting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              marginBottom: 8, transition: "opacity 0.15s",
            }}
          >
            {extracting ? (
              <>
                <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(17,30,20,0.25)", borderTopColor: "#111e14", animation: "sherpa-spin 0.9s linear infinite" }} />
                Reading documents…
              </>
            ) : (
              <><Sparkles size={14} /> Extract &amp; auto-fill</>
            )}
          </button>
        )}

        {extractError && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#fca5a5", marginBottom: 8 }}>
            {extractError}
          </div>
        )}

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          <span style={{ fontSize: 12, color: "#9aafa0" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        </div>

        <button
          type="button" onClick={onSkip}
          style={{
            width: "100%", background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#9aafa0",
            fontFamily: "'Satoshi', sans-serif", fontWeight: 500, fontSize: 14,
            padding: "12px 20px", cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)" }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#9aafa0"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)" }}
        >
          Fill in manually instead
        </button>
      </div>
    </div>
  )
}

// ── Wizard field step ──────────────────────────────────────────────────────────

function WizardStep({ step, form, setFieldValue, progressPct, manualStepIdx, totalSteps, onNext, onBack }: {
  step: StepId
  form: typeof EMPTY_FORM
  setFieldValue: (field: keyof typeof EMPTY_FORM, val: string) => void
  progressPct: number
  manualStepIdx: number
  totalSteps: number
  onNext: () => void
  onBack: () => void
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.06)",
    border: "2px solid rgba(255,255,255,0.12)", borderRadius: 12,
    padding: "18px 20px", fontSize: 20, color: "#ffffff",
    fontFamily: "'Satoshi', sans-serif", fontWeight: 500,
    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
  }

  function onFocus(e: React.FocusEvent<HTMLElement>) { (e.target as HTMLElement).style.borderColor = "#b5b0a8" }
  function onBlur(e: React.FocusEvent<HTMLElement>)  { (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)" }

  function renderOptions(options: readonly string[], field: keyof typeof EMPTY_FORM) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {options.map(opt => {
          const active = form[field] === opt
          return (
            <button key={opt} type="button" onClick={() => setFieldValue(field, opt)} style={{
              padding: "14px 16px", borderRadius: 10,
              border: `2px solid ${active ? "#b5b0a8" : "rgba(255,255,255,0.1)"}`,
              background: active ? "rgba(181,176,168,0.15)" : "rgba(255,255,255,0.03)",
              color: active ? "#ffffff" : "rgba(255,255,255,0.55)",
              fontFamily: "'Satoshi', sans-serif", fontWeight: active ? 600 : 400,
              fontSize: 14, cursor: "pointer", transition: "all 0.15s", textAlign: "left",
            }}>{opt}</button>
          )
        })}
      </div>
    )
  }

  let title = ""
  let subtitle = ""
  let inputEl: React.ReactNode = null
  let field: keyof typeof EMPTY_FORM = "display_name"

  switch (step) {
    case "name":
      title = "What should we\ncall you?"
      subtitle = "This is how you'll appear in your dashboard."
      field = "display_name"
      inputEl = <input autoFocus type="text" value={form.display_name} onChange={e => setFieldValue("display_name", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="Alex Johnson" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    case "school":
      title = "Where do you\ngo to school?"
      subtitle = "We'll use this to find your institution's policies."
      field = "school"
      inputEl = <input autoFocus type="text" value={form.school} onChange={e => setFieldValue("school", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="UC Berkeley" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    case "year":
      title = "What year are you?"
      subtitle = "Your class standing helps us calibrate your timeline."
      inputEl = renderOptions(YEARS, "year")
      break
    case "major":
      title = "What's your major?"
      subtitle = "This helps us track degree requirements."
      field = "major"
      inputEl = <input autoFocus type="text" value={form.major} onChange={e => setFieldValue("major", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="Computer Science" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    case "credits":
      title = "How many credits\nhave you completed?"
      subtitle = "Check your unofficial transcript if unsure."
      field = "credits_completed"
      inputEl = <input autoFocus type="number" min={0} value={form.credits_completed} onChange={e => setFieldValue("credits_completed", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="60" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    case "gpa":
      title = "What's your\ncurrent GPA?"
      subtitle = "Your GPA is central to monitoring aid eligibility."
      field = "gpa"
      inputEl = <input autoFocus type="number" min={0} max={4} step={0.01} value={form.gpa} onChange={e => setFieldValue("gpa", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="3.45" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    case "classes":
      title = "What classes are you\ntaking this semester?"
      subtitle = "Enter one course per line."
      inputEl = (
        <textarea autoFocus value={form.current_classes} onChange={e => setFieldValue("current_classes", e.target.value)}
          placeholder={"CS 61B: Data Structures\nMATH 53: Multivariable Calculus\nENG 1A: Expository Writing"}
          rows={5} style={{ ...inputStyle, resize: "none", lineHeight: 1.6, fontSize: 16 }}
          onFocus={onFocus} onBlur={onBlur} />
      )
      break
    case "aid":
      title = "What's your financial\naid situation?"
      subtitle = "Pick what best describes your package."
      inputEl = renderOptions(AID_STATUSES, "financial_aid_status")
      break
    case "work":
      title = "How many hours a\nweek do you work?"
      subtitle = "Enter 0 if you don't currently work."
      field = "work_hours_per_week"
      inputEl = <input autoFocus type="number" min={0} value={form.work_hours_per_week} onChange={e => setFieldValue("work_hours_per_week", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="20" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    case "housing":
      title = "Where do you live?"
      subtitle = "Your housing affects your cost of attendance."
      inputEl = renderOptions(HOUSING_OPTIONS, "housing_status")
      break
    case "graduation":
      title = "When do you plan\nto graduate?"
      subtitle = "Give your best estimate — you can update this anytime."
      field = "graduation_goal"
      inputEl = <input autoFocus type="text" value={form.graduation_goal} onChange={e => setFieldValue("graduation_goal", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="Spring 2027" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    case "need":
      title = "What's your unmet\nfinancial need?"
      subtitle = "The gap between cost of attendance and your aid. Enter 0 if unsure."
      field = "unmet_financial_need"
      inputEl = <input autoFocus type="number" min={0} value={form.unmet_financial_need} onChange={e => setFieldValue("unmet_financial_need", e.target.value)} onKeyDown={e => { if (e.key === "Enter") onNext() }} placeholder="8000" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      break
    default:
      return null
  }

  void field

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(160deg, #1e3824 0%, #0f1a10 100%)",
      display: "flex", flexDirection: "column", fontFamily: "'Satoshi', sans-serif",
    }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(to right, #b5b0a8, #2d6030)", transition: "width 0.4s ease" }} />
      </div>

      {/* Back */}
      <div style={{ padding: "20px 32px 0", flexShrink: 0 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "#9aafa0", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: 0,
          fontFamily: "'Satoshi', sans-serif",
        }}
          onMouseEnter={e => { e.currentTarget.style.color = "#ffffff" }}
          onMouseLeave={e => { e.currentTarget.style.color = "#9aafa0" }}
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      {/* Centered content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9aafa0", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 16px" }}>
            {manualStepIdx + 1} of {totalSteps}
          </p>

          <h1 style={{
            fontFamily: "'Merriweather', serif", fontWeight: 900, fontSize: 40,
            color: "#ffffff", margin: "0 0 10px", lineHeight: 1.18, whiteSpace: "pre-line",
          }}>{title}</h1>

          {subtitle && (
            <p style={{ fontSize: 14, color: "#9aafa0", margin: "0 0 28px", lineHeight: 1.6 }}>{subtitle}</p>
          )}

          <div style={{ marginBottom: 24 }}>{inputEl}</div>

          <button type="button" onClick={onNext} style={{
            width: "100%", background: "linear-gradient(135deg, #b5b0a8, #2d6030)",
            border: "none", borderRadius: 10, color: "#111e14",
            fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 15,
            padding: "15px 20px", cursor: "pointer", transition: "opacity 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.88" }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1" }}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0f1a10", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9aafa0", fontSize: 14, fontFamily: "'Satoshi', sans-serif" }}>Loading…</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}

function OnboardingContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const verified     = searchParams.get("verified") === "true"

  const [pageLoading, setPageLoading] = useState(true)
  const [isEdit,      setIsEdit]      = useState(false)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [filled,      setFilled]      = useState<Set<keyof typeof EMPTY_FORM>>(new Set())
  const [saving,      setSaving]      = useState(false)
  const [editError,   setEditError]   = useState<string | null>(null)
  const [showBanner,  setShowBanner]  = useState(verified)

  // Wizard
  const [step,          setStep]          = useState<StepId>("upload")
  const [loadingMsg,    setLoadingMsg]    = useState("")
  const [loadingDur,    setLoadingDur]    = useState(2000)
  const [afterLoad,     setAfterLoad]     = useState<StepId>("name")
  const [manualIdx,     setManualIdx]     = useState(0)

  // Upload
  const [files,        setFiles]        = useState<File[]>([])
  const [dragging,     setDragging]     = useState(false)
  const [extracting,   setExtracting]   = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEdit) {
      document.documentElement.style.background = "#0f1a10"
      document.body.style.background = "#0f1a10"
    }
    return () => {
      document.documentElement.style.background = ""
      document.body.style.background = ""
    }
  }, [isEdit])

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push("/login"); return }

        const { data } = await supabase.from("students").select("*").eq("user_id", user.id).single()
        if (data) {
          setIsEdit(true)
          setForm({
            display_name:         data.display_name ?? "",
            school:               data.school ?? "",
            year:                 data.year ?? "",
            major:                data.major ?? "",
            credits_completed:    data.credits_completed?.toString() ?? "",
            current_classes:      (data.current_classes ?? []).join("\n"),
            financial_aid_status: data.financial_aid_status ?? "",
            work_hours_per_week:  data.work_hours_per_week?.toString() ?? "",
            housing_status:       data.housing_status ?? "",
            gpa:                  data.gpa?.toString() ?? "",
            graduation_goal:      data.graduation_goal ?? "",
            unmet_financial_need: data.unmet_financial_need?.toString() ?? "",
          })
        }
      } finally {
        setPageLoading(false)
      }
    }
    loadProfile()
  }, [router])

  function setFieldValue(f: keyof typeof EMPTY_FORM, val: string) {
    setForm(prev => ({ ...prev, [f]: val }))
    setFilled(prev => { const n = new Set(prev); n.delete(f); return n })
  }

  function setField(f: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFieldValue(f, e.target.value)
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function startManual(idx = 0) {
    setManualIdx(idx)
    setStep(MANUAL_STEPS[idx])
  }

  function nextStep() {
    const nextIdx = manualIdx + 1
    if (nextIdx >= MANUAL_STEPS.length) {
      setLoadingMsg("Evaluating Risk…")
      setLoadingDur(2800)
      setAfterLoad("saving")
      setStep("loading")
    } else {
      setManualIdx(nextIdx)
      setStep(MANUAL_STEPS[nextIdx])
    }
  }

  function prevStep() {
    const prevIdx = manualIdx - 1
    if (prevIdx < 0) { setStep("upload"); setManualIdx(0) }
    else { setManualIdx(prevIdx); setStep(MANUAL_STEPS[prevIdx]) }
  }

  // ── File handling ───────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const allowed = Array.from(incoming).filter(f =>
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.type)
    )
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...allowed.filter(f => !names.has(f.name))]
    })
    setExtractError(null)
  }, [])

  function removeFile(name: string) { setFiles(prev => prev.filter(f => f.name !== name)) }

  // ── Extraction ──────────────────────────────────────────────────────────────

  async function extract() {
    if (!files.length || extracting) return
    setExtracting(true)
    setExtractError(null)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append("files", f))
      const res = await fetch("/api/parse-document", { method: "POST", body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      const newFilled = new Set<keyof typeof EMPTY_FORM>()
      const apply = (field: keyof typeof EMPTY_FORM, value: unknown) => {
        if (value == null || value === "") return
        setForm(prev => ({ ...prev, [field]: String(value) }))
        newFilled.add(field)
      }
      if (data.student_name)         apply("display_name",         data.student_name)
      if (data.school)               apply("school",               data.school)
      if (data.year)                 apply("year",                 data.year)
      if (data.major)                apply("major",                data.major)
      if (data.credits_completed)    apply("credits_completed",    data.credits_completed)
      if (data.gpa)                  apply("gpa",                  data.gpa)
      if (data.financial_aid_status) apply("financial_aid_status", data.financial_aid_status)
      if (data.graduation_goal)      apply("graduation_goal",      data.graduation_goal)
      if (data.unmet_financial_need) apply("unmet_financial_need", data.unmet_financial_need)
      if (Array.isArray(data.current_classes) && data.current_classes.length)
        apply("current_classes", data.current_classes.join("\n"))
      setFilled(newFilled)
      setExtracting(false)
      setManualIdx(0)
      setStep("name")
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed")
      setExtracting(false)
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) { router.push("/login"); return }
    const classes = form.current_classes.split("\n").map(c => c.trim()).filter(Boolean)
    const { error: dbError } = await supabase.from("students").upsert({
      user_id: user.id, email: user.email,
      display_name:         form.display_name || null,
      school:               form.school || null,
      year:                 form.year || null,
      major:                form.major || null,
      credits_completed:    form.credits_completed ? parseInt(form.credits_completed) : null,
      current_classes:      classes.length ? classes : null,
      financial_aid_status: form.financial_aid_status || null,
      work_hours_per_week:  form.work_hours_per_week ? parseInt(form.work_hours_per_week) : null,
      housing_status:       form.housing_status || null,
      gpa:                  form.gpa ? parseFloat(form.gpa) : null,
      graduation_goal:      form.graduation_goal || null,
      unmet_financial_need: form.unmet_financial_need ? parseInt(form.unmet_financial_need) : null,
      onboarding_complete:  true,
      updated_at:           new Date().toISOString(),
    }, { onConflict: "user_id" })
    if (dbError) { setEditError(dbError.message); setSaving(false); return }
    router.push("/dashboard")
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f1a10", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9aafa0", fontSize: 14, fontFamily: "'Satoshi', sans-serif" }}>Loading…</div>
      </div>
    )
  }

  // ── Edit mode: show the original compact form ───────────────────────────────
  if (isEdit) {
    return (
      <main className="min-h-screen bg-background py-12 px-4">
        <div className="mx-auto max-w-2xl">
          {showBanner && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                <span className="text-sm font-medium text-emerald-800">Email verified — welcome to Sherpa!</span>
              </div>
              <button onClick={() => setShowBanner(false)} className="text-emerald-500 hover:text-emerald-700 transition flex-shrink-0"><X size={14} /></button>
            </div>
          )}

          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-foreground">Edit your profile</h1>
            <p className="mt-2 text-muted-foreground max-w-md mx-auto">Upload new documents to update your profile automatically, or edit your info below.</p>
          </div>

          {/* Doc upload card */}
          <div className="bg-white rounded-2xl border border-border shadow-sm p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Auto-fill from documents</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Upload any of the documents below — Sherpa reads them with AI and fills in your profile instantly.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {DOC_HINTS.map(h => (
                <div key={h.label} className="flex items-start gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5">
                  <span className="text-base leading-none mt-0.5">{h.icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-foreground">{h.label}</div>
                    <div className="text-xs text-muted-foreground">{h.fields}</div>
                  </div>
                </div>
              ))}
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            >
              <Upload size={22} className={dragging ? "text-primary" : "text-muted-foreground"} />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG, WebP — up to 5 files</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={e => e.target.files && addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map(f => (
                  <li key={f.name} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-foreground truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button type="button" onClick={e => { e.stopPropagation(); removeFile(f.name) }} className="text-muted-foreground hover:text-foreground transition flex-shrink-0"><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <button type="button" onClick={extract} disabled={extracting}
                  className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 px-4 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
                  {extracting ? (<><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Reading documents…</>) : (<><Sparkles size={14} />Extract &amp; auto-fill</>)}
                </button>
                {extractError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{extractError}</div>}
              </div>
            )}
          </div>

          {/* Profile form */}
          <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
            <form onSubmit={async e => { e.preventDefault(); setEditError(null); await save() }} className="space-y-6">
              <EditField label="Display Name" filled={filled.has("display_name")}>
                <input type="text" value={form.display_name} onChange={setField("display_name")} className={filled.has("display_name") ? iHi : iCls} placeholder="e.g. Alex Johnson" />
              </EditField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <EditField label="School" filled={filled.has("school")}><input type="text" value={form.school} onChange={setField("school")} className={filled.has("school") ? iHi : iCls} placeholder="e.g. UC Berkeley" /></EditField>
                <EditField label="Year" filled={filled.has("year")}>
                  <select value={form.year} onChange={setField("year")} className={filled.has("year") ? sHi : sCls}>
                    <option value="">Select year</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </EditField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <EditField label="Major" filled={filled.has("major")}><input type="text" value={form.major} onChange={setField("major")} className={filled.has("major") ? iHi : iCls} placeholder="e.g. Computer Science" /></EditField>
                <EditField label="Credits completed" filled={filled.has("credits_completed")}><input type="number" min={0} value={form.credits_completed} onChange={setField("credits_completed")} className={filled.has("credits_completed") ? iHi : iCls} placeholder="e.g. 60" /></EditField>
              </div>
              <EditField label="Current classes (one per line)" filled={filled.has("current_classes")}>
                <textarea rows={4} value={form.current_classes} onChange={setField("current_classes")} className={(filled.has("current_classes") ? iHi : iCls) + " resize-none"} placeholder={"CS 61B: Data Structures\nMATH 53: Multivariable Calculus"} />
              </EditField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <EditField label="GPA" filled={filled.has("gpa")}><input type="number" min={0} max={4} step={0.01} value={form.gpa} onChange={setField("gpa")} className={filled.has("gpa") ? iHi : iCls} placeholder="e.g. 3.45" /></EditField>
                <EditField label="Financial aid status" filled={filled.has("financial_aid_status")}>
                  <select value={form.financial_aid_status} onChange={setField("financial_aid_status")} className={filled.has("financial_aid_status") ? sHi : sCls}>
                    <option value="">Select status</option>
                    {AID_STATUSES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </EditField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <EditField label="Housing status" filled={filled.has("housing_status")}>
                  <select value={form.housing_status} onChange={setField("housing_status")} className={filled.has("housing_status") ? sHi : sCls}>
                    <option value="">Select housing</option>
                    {HOUSING_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </EditField>
                <EditField label="Work hours per week" filled={filled.has("work_hours_per_week")}><input type="number" min={0} value={form.work_hours_per_week} onChange={setField("work_hours_per_week")} className={filled.has("work_hours_per_week") ? iHi : iCls} placeholder="e.g. 20" /></EditField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <EditField label="Graduation goal" filled={filled.has("graduation_goal")}><input type="text" value={form.graduation_goal} onChange={setField("graduation_goal")} className={filled.has("graduation_goal") ? iHi : iCls} placeholder="e.g. Spring 2027" /></EditField>
                <EditField label="Unmet financial need ($)" filled={filled.has("unmet_financial_need")}><input type="number" min={0} value={form.unmet_financial_need} onChange={setField("unmet_financial_need")} className={filled.has("unmet_financial_need") ? iHi : iCls} placeholder="e.g. 8000" /></EditField>
              </div>
              {editError && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{editError}</div>}
              <div className="flex items-center gap-4 pt-2">
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 px-4 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button type="button" onClick={() => router.push("/dashboard")} className="rounded-lg border border-border text-muted-foreground py-2.5 px-4 text-sm font-medium hover:bg-muted transition">Cancel</button>
              </div>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">You can update your profile at any time from the dashboard.</p>
        </div>
      </main>
    )
  }

  // ── Wizard: loading screen ──────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <LoadingScreen
        msg={loadingMsg}
        duration={loadingDur}
        onDone={() => {
          if (afterLoad === "saving") {
            setSaving(true)
            save()
          } else {
            setStep(afterLoad)
          }
        }}
      />
    )
  }

  // ── Wizard: saving screen ───────────────────────────────────────────────────
  if (saving) {
    return <LoadingScreen msg="Setting up your Sherpa account…" duration={99999} onDone={() => {}} />
  }

  // ── Wizard: upload step ─────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <UploadStep
        files={files} dragging={dragging} extracting={extracting}
        extractError={extractError} fileInputRef={fileInputRef}
        addFiles={addFiles} removeFile={removeFile} extract={extract}
        onSkip={() => startManual(0)} setDragging={setDragging}
      />
    )
  }

  // ── Wizard: field steps ─────────────────────────────────────────────────────
  const progressPct = ((manualIdx + 1) / MANUAL_STEPS.length) * 100

  return (
    <WizardStep
      key={step}
      step={step}
      form={form}
      setFieldValue={setFieldValue}
      progressPct={progressPct}
      manualStepIdx={manualIdx}
      totalSteps={MANUAL_STEPS.length}
      onNext={nextStep}
      onBack={prevStep}
    />
  )
}
