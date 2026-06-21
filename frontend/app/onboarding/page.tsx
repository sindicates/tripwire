"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  "w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"

const selectClass =
  "w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"

export default function OnboardingPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEdit, setIsEdit] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

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
            display_name: data.display_name ?? "",
            school: data.school ?? "",
            year: data.year ?? "",
            major: data.major ?? "",
            credits_completed: data.credits_completed?.toString() ?? "",
            current_classes: (data.current_classes ?? []).join("\n"),
            financial_aid_status: data.financial_aid_status ?? "",
            work_hours_per_week: data.work_hours_per_week?.toString() ?? "",
            housing_status: data.housing_status ?? "",
            gpa: data.gpa?.toString() ?? "",
            graduation_goal: data.graduation_goal ?? "",
            unmet_financial_need: data.unmet_financial_need?.toString() ?? "",
          })
        }
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [router])

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) { router.push("/login"); return }

    const classes = form.current_classes
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean)

    const { error: dbError } = await supabase.from("students").upsert({
      user_id: user.id,
      email: user.email,
      display_name: form.display_name || null,
      school: form.school || null,
      year: form.year || null,
      major: form.major || null,
      credits_completed: form.credits_completed ? parseInt(form.credits_completed) : null,
      current_classes: classes.length ? classes : null,
      financial_aid_status: form.financial_aid_status || null,
      work_hours_per_week: form.work_hours_per_week ? parseInt(form.work_hours_per_week) : null,
      housing_status: form.housing_status || null,
      gpa: form.gpa ? parseFloat(form.gpa) : null,
      graduation_goal: form.graduation_goal || null,
      unmet_financial_need: form.unmet_financial_need ? parseInt(form.unmet_financial_need) : null,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    router.push("/dashboard")
  }

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
        <div className="mb-10 text-center">
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
              : "Tell us about your academic situation so Tripwire can monitor your trajectory and catch risks early."}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">

            <Field label="Display Name">
              <input type="text" value={form.display_name} onChange={set("display_name")} className={inputClass} placeholder="e.g. Alex Johnson" />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="School">
                <input type="text" value={form.school} onChange={set("school")} className={inputClass} placeholder="e.g. UC Berkeley" />
              </Field>
              <Field label="Year">
                <select value={form.year} onChange={set("year")} className={selectClass}>
                  <option value="">Select year</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Major">
                <input type="text" value={form.major} onChange={set("major")} className={inputClass} placeholder="e.g. Computer Science" />
              </Field>
              <Field label="Credits completed">
                <input type="number" min={0} value={form.credits_completed} onChange={set("credits_completed")} className={inputClass} placeholder="e.g. 60" />
              </Field>
            </div>

            <Field label="Current classes (one per line)">
              <textarea
                rows={4}
                value={form.current_classes}
                onChange={set("current_classes")}
                className={inputClass + " resize-none"}
                placeholder={"CS 61B: Data Structures\nMATH 53: Multivariable Calculus\nENG 1A: Expository Writing"}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="GPA">
                <input type="number" min={0} max={4} step={0.01} value={form.gpa} onChange={set("gpa")} className={inputClass} placeholder="e.g. 3.45" />
              </Field>
              <Field label="Financial aid status">
                <select value={form.financial_aid_status} onChange={set("financial_aid_status")} className={selectClass}>
                  <option value="">Select status</option>
                  {AID_STATUSES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Housing status">
                <select value={form.housing_status} onChange={set("housing_status")} className={selectClass}>
                  <option value="">Select housing</option>
                  {HOUSING_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
              <Field label="Work hours per week">
                <input type="number" min={0} value={form.work_hours_per_week} onChange={set("work_hours_per_week")} className={inputClass} placeholder="e.g. 20" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Graduation goal">
                <input type="text" value={form.graduation_goal} onChange={set("graduation_goal")} className={inputClass} placeholder="e.g. Spring 2027" />
              </Field>
              <Field label="Unmet financial need ($)">
                <input type="number" min={0} value={form.unmet_financial_need} onChange={set("unmet_financial_need")} className={inputClass} placeholder="e.g. 8000" />
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
