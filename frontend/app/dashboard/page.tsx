"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function DashboardPage() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <button
            onClick={signOut}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition"
          >
            Sign out
          </button>
        </div>
        {/* Risk overview cards */}
        {/* Recent alerts feed */}
        {/* GPA / credits progress */}
      </div>
    </main>
  )
}
