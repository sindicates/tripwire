"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Upload, X, FileText, Sparkles, CheckCircle } from "lucide-react"

// ── Constants ─────────────────────────────────────────────────────────────────

const YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"] as const
const AID_STATUSES = [
  "Pell Grant",
  "Subsidized Loans",
  "Unsubsidized Loans",
  "Scholarships Only",
  "Work-Study",
  "Mixed Aid",
  "No Financial Aid",
] as const
const HOUSING_OPTIONS = [
  "On-Campus Dorms",
  "Off-Campus with Family",
  "Off-Campus Apartment",
  "Commuter",
] as const

const EMPTY_FORM = {
  display_name: "",
  school: "",
  year: "",
  major: "",
  credits_completed: "",
  current_classes: "",
  financial_aid_status: "",
  work_hours_per_week: "",
  housing_status: "",
  gpa: "",
  graduation_goal: "",
  unmet_financial_need: "",
}

const DOC_HINTS = [
  { icon: "📄", label: "Unofficial Transcript", fields: "GPA · credits · major · class standing" },
  { icon: "💰", label: "Financial Aid Award Letter", fields: "Aid type · award amounts" },
  { icon: "📅", label: "Class Schedule", fields: "Current semester courses" },
  { icon: "🎓", label: "Degree Audit", fields: "Credits required · graduation goal" },
  { icon: "📋", label: "FAFSA SAR", fields: "EFC · unmet financial need" },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"

const inputHighlightClass =
  "w-full rounded-lg border-2 border-emerald-400 bg-emerald-50 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"

const selectClass =
  "w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"

const selectHighlightClass =
  "w-full rounded-lg border-2 border-emerald-400 bg-emerald-50 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children, filled }: { label: string; children: React.ReactNode; filled?: boolean }) {
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground text-sm">Loading…</div></main>}>
      <OnboardingContent />
    </Suspense>
  )
}

function OnboardingContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const verified     = searchParams.get("verified") === "true"

  const [saving,    setSaving]    = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [isEdit,    setIsEdit]    = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [filled,    setFilled]    = useState<Set<keyof typeof EMPTY_FORM>>(new Set())
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(verified)

  // Upload state
  const [files,       setFiles]       = useState<File[]>([])
  const [extracting,  setExtracting]  = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractDone, setExtractDone] = useState(false)
  const [dragging,    setDragging]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push("/login"); return }

        const { data } = await supabase
          .from("students")
          .select("*")
          .eq("user_id", user.id)
          .single()

        if (data) {
          setIsEdit(true)
          setForm({
            display_name:          data.display_name ?? "",
            school:                data.school ?? "",
            year:                  data.year ?? "",
            major:                 data.major ?? "",
            credits_completed:     data.credits_completed?.toString() ?? "",
            current_classes:       (data.current_classes ?? []).join("\n"),
            financial_aid_status:  data.financial_aid_status ?? "",
            work_hours_per_week:   data.work_hours_per_week?.toString() ?? "",
            housing_status:        data.housing_status ?? "",
            gpa:                   data.gpa?.toString() ?? "",
            graduation_goal:       data.graduation_goal ?? "",
            unmet_financial_need:  data.unmet_financial_need?.toString() ?? "",
          })
        }
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [router])

  function set(field: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      // clear highlight when user manually edits
      setFilled(prev => { const n = new Set(prev); n.delete(field); return n })
    }
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
    setExtractDone(false)
    setExtractError(null)
  }, [])

  function removeFile(name: string) {
    setFiles(prev => prev.filter(f => f.name !== name))
    setExtractDone(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  // ── Extraction ──────────────────────────────────────────────────────────────

  async function extract() {
    if (!files.length || extracting) return
    setExtracting(true)
    setExtractError(null)
    setExtractDone(false)

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
        const str = String(value)
        setForm(prev => ({ ...prev, [field]: str }))
        newFilled.add(field)
      }

      if (data.student_name)        apply("display_name",         data.student_name)
      if (data.school)              apply("school",               data.school)
      if (data.year)                apply("year",                 data.year)
      if (data.major)               apply("major",                data.major)
      if (data.credits_completed)   apply("credits_completed",    data.credits_completed)
      if (data.gpa)                 apply("gpa",                  data.gpa)
      if (data.financial_aid_status) apply("financial_aid_status", data.financial_aid_status)
      if (data.graduation_goal)     apply("graduation_goal",      data.graduation_goal)
      if (data.unmet_financial_need) apply("unmet_financial_need", data.unmet_financial_need)
      if (Array.isArray(data.current_classes) && data.current_classes.length) {
        apply("current_classes", data.current_classes.join("\n"))
      }

      setFilled(newFilled)
      setExtractDone(true)
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed")
    } finally {
      setExtracting(false)
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) { router.push("/login"); return }

    const classes = form.current_classes.split("\n").map(c => c.trim()).filter(Boolean)

    const { error: dbError } = await supabase.from("students").upsert({
      user_id: user.id,
      email: user.email,
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

    if (dbError) { setError(dbError.message); setSaving(false); return }
    router.push("/dashboard")
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="mx-auto max-w-2xl">

        {/* Email verified banner */}
        {showVerifiedBanner && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
              <span className="text-sm font-medium text-emerald-800">Email verified — welcome to Sherpa!</span>
            </div>
            <button onClick={() => setShowVerifiedBanner(false)} className="text-emerald-500 hover:text-emerald-700 transition flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {isEdit ? "Edit your profile" : "Set up your profile"}
          </h1>
          <p className="mt-2 text-muted-foreground max-w-md mx-auto">
            {isEdit
              ? "Update your academic info — changes save immediately."
              : "Upload your documents and we'll fill this in for you, or enter it manually below."}
          </p>
        </div>

        {/* ── Document upload card ── */}
        {!isEdit && (
          <div className="bg-white rounded-2xl border border-border shadow-sm p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Auto-fill from documents</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Upload any of the documents below — Sherpa reads them with AI and fills in your profile instantly.
            </p>

            {/* Document type hints */}
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

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload size={22} className={dragging ? "text-primary" : "text-muted-foreground"} />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG, WebP — up to 5 files</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={e => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map(f => (
                  <li key={f.name} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-foreground truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeFile(f.name) }}
                      className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Extract button / status */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={extract}
                  disabled={extracting}
                  className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 px-4 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {extracting ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Reading documents…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      {extractDone ? "Re-extract" : "Extract & auto-fill"}
                    </>
                  )}
                </button>

                {extractDone && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                    <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                    <p className="text-xs text-emerald-700">
                      {filled.size} field{filled.size !== 1 ? "s" : ""} filled — review below and save when ready.
                    </p>
                  </div>
                )}

                {extractError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    {extractError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Profile form ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">

            <Field label="Display Name" filled={filled.has("display_name")}>
              <input
                type="text"
                value={form.display_name}
                onChange={set("display_name")}
                className={filled.has("display_name") ? inputHighlightClass : inputClass}
                placeholder="e.g. Alex Johnson"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="School" filled={filled.has("school")}>
                <input
                  type="text"
                  value={form.school}
                  onChange={set("school")}
                  className={filled.has("school") ? inputHighlightClass : inputClass}
                  placeholder="e.g. UC Berkeley"
                />
              </Field>
              <Field label="Year" filled={filled.has("year")}>
                <select
                  value={form.year}
                  onChange={set("year")}
                  className={filled.has("year") ? selectHighlightClass : selectClass}
                >
                  <option value="">Select year</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Major" filled={filled.has("major")}>
                <input
                  type="text"
                  value={form.major}
                  onChange={set("major")}
                  className={filled.has("major") ? inputHighlightClass : inputClass}
                  placeholder="e.g. Computer Science"
                />
              </Field>
              <Field label="Credits completed" filled={filled.has("credits_completed")}>
                <input
                  type="number"
                  min={0}
                  value={form.credits_completed}
                  onChange={set("credits_completed")}
                  className={filled.has("credits_completed") ? inputHighlightClass : inputClass}
                  placeholder="e.g. 60"
                />
              </Field>
            </div>

            <Field label="Current classes (one per line)" filled={filled.has("current_classes")}>
              <textarea
                rows={4}
                value={form.current_classes}
                onChange={set("current_classes")}
                className={(filled.has("current_classes") ? inputHighlightClass : inputClass) + " resize-none"}
                placeholder={"CS 61B: Data Structures\nMATH 53: Multivariable Calculus\nENG 1A: Expository Writing"}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="GPA" filled={filled.has("gpa")}>
                <input
                  type="number"
                  min={0}
                  max={4}
                  step={0.01}
                  value={form.gpa}
                  onChange={set("gpa")}
                  className={filled.has("gpa") ? inputHighlightClass : inputClass}
                  placeholder="e.g. 3.45"
                />
              </Field>
              <Field label="Financial aid status" filled={filled.has("financial_aid_status")}>
                <select
                  value={form.financial_aid_status}
                  onChange={set("financial_aid_status")}
                  className={filled.has("financial_aid_status") ? selectHighlightClass : selectClass}
                >
                  <option value="">Select status</option>
                  {AID_STATUSES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Housing status" filled={filled.has("housing_status")}>
                <select
                  value={form.housing_status}
                  onChange={set("housing_status")}
                  className={filled.has("housing_status") ? selectHighlightClass : selectClass}
                >
                  <option value="">Select housing</option>
                  {HOUSING_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
              <Field label="Work hours per week" filled={filled.has("work_hours_per_week")}>
                <input
                  type="number"
                  min={0}
                  value={form.work_hours_per_week}
                  onChange={set("work_hours_per_week")}
                  className={filled.has("work_hours_per_week") ? inputHighlightClass : inputClass}
                  placeholder="e.g. 20"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Graduation goal" filled={filled.has("graduation_goal")}>
                <input
                  type="text"
                  value={form.graduation_goal}
                  onChange={set("graduation_goal")}
                  className={filled.has("graduation_goal") ? inputHighlightClass : inputClass}
                  placeholder="e.g. Spring 2027"
                />
              </Field>
              <Field label="Unmet financial need ($)" filled={filled.has("unmet_financial_need")}>
                <input
                  type="number"
                  min={0}
                  value={form.unmet_financial_need}
                  onChange={set("unmet_financial_need")}
                  className={filled.has("unmet_financial_need") ? inputHighlightClass : inputClass}
                  placeholder="e.g. 8000"
                />
              </Field>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 px-4 text-sm font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? "Saving…" : isEdit ? "Save changes" : "Save profile"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-lg border border-border text-muted-foreground py-2.5 px-4 text-sm font-medium hover:bg-muted transition"
              >
                {isEdit ? "Cancel" : "Skip for now"}
              </button>
            </div>

          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          You can update your profile at any time from the dashboard.
        </p>
      </div>
    </main>
  )
}
