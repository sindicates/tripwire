"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function SettingsPage() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a1a0f", color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
      <aside style={{ width: 220, minWidth: 220, background: "#0d1f13", borderRight: "1px solid #1e3d28", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "28px 20px 32px" }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, color: "#ff6b9d", letterSpacing: "-0.5px" }}>Tripwire</span>
        </div>
        <nav style={{ flex: 1, padding: "0 10px" }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "none", border: "none", color: "#a3c4a8", cursor: "pointer", fontSize: 14, textAlign: "left" }}
          >
            <span>🏠</span> Dashboard
          </button>
          <button
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,107,157,0.1)", border: "none", color: "#ff6b9d", cursor: "pointer", fontSize: 14, fontWeight: 600, textAlign: "left" }}
          >
            <span>⚙️</span> Settings
          </button>
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e3d28" }}>
          <button onClick={signOut} style={{ background: "none", border: "none", color: "#a3c4a8", fontSize: 12, cursor: "pointer", padding: "4px 0" }}>Sign out →</button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: "36px 44px", overflowY: "auto" }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 30, margin: "0 0 8px", letterSpacing: "-0.5px" }}>Settings</h1>
        <p style={{ color: "#a3c4a8", margin: "0 0 36px", fontSize: 15 }}>Manage your account and preferences.</p>

        <section>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, margin: "0 0 14px", color: "#a3c4a8", textTransform: "uppercase", letterSpacing: "0.07em", fontSize: 11 }}>Account</h2>
          <div style={{ background: "#0d1f13", border: "1px solid #1e3d28", borderRadius: 14, overflow: "hidden" }}>
            <button
              onClick={() => router.push("/onboarding")}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: "none", border: "none", color: "#ffffff", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,107,157,0.05)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none" }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>Edit Profile</div>
                <div style={{ fontSize: 13, color: "#a3c4a8" }}>Update your school, GPA, credits, and financial aid info</div>
              </div>
              <span style={{ color: "#a3c4a8", fontSize: 18, flexShrink: 0 }}>→</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
