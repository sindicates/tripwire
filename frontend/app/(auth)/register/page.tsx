"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Mail } from "lucide-react"

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function RegisterPage() {
  const [email,         setEmail]         = useState("")
  const [password,      setPassword]      = useState("")
  const [confirm,       setConfirm]       = useState("")
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailSent,     setEmailSent]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) { setError("Passwords do not match."); return }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding&verified=true`,
      },
    })

    if (error) { setError(error.message); setLoading(false); return }

    setEmailSent(true)
    setLoading(false)
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding&verified=true` },
    })
  }

  // ── Check your email screen ────────────────────────────────────────────────
  if (emailSent) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-5">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Check your email</h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-1">We sent a verification link to</p>
          <p className="font-semibold text-foreground text-sm mb-5">{email}</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Click the link in the email to verify your account and get started with Sherpa.
          </p>
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Didn&apos;t get it? Check your spam folder or{" "}
              <button
                onClick={() => { setEmailSent(false); setError(null) }}
                className="text-primary font-medium hover:underline"
              >
                try again
              </button>
              .
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Register form ──────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary mb-4">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-foreground">Create your account</h1>
        <p className="mt-2 text-muted-foreground">Start monitoring your academic trajectory</p>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
        <button
          type="button" onClick={handleGoogle} disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-border bg-white py-2.5 px-4 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <GoogleIcon />
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email address</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              placeholder="you@university.edu" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <input id="password" type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              placeholder="At least 6 characters" />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1.5">Confirm password</label>
            <input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              placeholder="••••••••" />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 px-4 text-sm font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
