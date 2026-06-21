"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  LayoutDashboard,
  AlertTriangle,
  MessageSquare,
  ListChecks,
  Settings,
  Compass,
  UserCircle,
  LogOut,
  type LucideIcon,
} from "lucide-react"

type NavId = "dashboard" | "risk-feed" | "advisor" | "actions" | "timeline" | "settings"

const NAV_ITEMS: { id: NavId; Icon: LucideIcon; label: string }[] = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard" },
  { id: "risk-feed", Icon: AlertTriangle,   label: "Risk Feed" },
  { id: "advisor",   Icon: MessageSquare,   label: "Ask Advisor" },
  { id: "actions",   Icon: ListChecks,      label: "Action Center" },
  { id: "timeline",  Icon: Compass,         label: "Timeline" },
  { id: "settings",  Icon: Settings,        label: "Settings" },
]

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<{ display_name: string | null; school: string | null; year: string | null } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      const { data } = await supabase
        .from("students")
        .select("display_name, school, year")
        .eq("user_id", user.id)
        .single()
      if (data) setProfile(data)
    }
    load()
  }, [router])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  function handleNav(id: NavId) {
    if (id === "dashboard")  router.push("/dashboard")
    else if (id === "advisor")  router.push("/chat")
    else if (id === "actions")  router.push("/actions")
    else if (id === "timeline") router.push("/deadline-radar")
    else if (id === "risk-feed") router.push("/deadline-radar")
  }

  const name = profile?.display_name || "—"
  const initials = name === "—" ? "—" : name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const subtitle = [profile?.school, profile?.year].filter(Boolean).join(" · ") || "—"

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(180deg, #2e5a3c 0%, #8faaa4 60%)", backgroundAttachment: "fixed", color: "#ffffff", fontFamily: "'Satoshi', sans-serif" }}>

      {/* Sidebar */}
      <aside style={{ width: 220, minWidth: 220, background: "#1e3824", borderRight: "1px solid #2a5636", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flexShrink: 0 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 6, padding: "28px 20px 32px", textDecoration: "none" }}>
          <img src="/logo.png" width={52} height={52} alt="Sherpa" style={{ objectFit: "contain" }} />
          <span className="nav-brand">Sherpa</span>
        </a>
        <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => handleNav(id)}
              className={`tw-nav-link${id === "settings" ? " active" : ""}`}
            >
              <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #2a5636", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #b5b0a8, #2d6030)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 12, color: "#111e14", flexShrink: 0, letterSpacing: "0.03em" }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <div style={{ fontSize: 11, color: "#9aafa0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
            </div>
          </div>
          <button className="tw-btn-ghost" onClick={signOut} style={{ fontSize: 12, textAlign: "left", padding: "4px 0", color: "#9aafa0" }}>Sign out →</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", padding: "36px 44px", minWidth: 0 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Merriweather', serif", fontWeight: 700, fontSize: 28, margin: "0 0 6px", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
            Settings
          </h1>
          <p style={{ color: "#9aafa0", margin: 0, fontSize: 14 }}>Manage your account and preferences.</p>
        </div>

        {/* Section: Account */}
        <div style={{ marginBottom: 10, paddingBottom: 8 }}>
          <p style={{ fontFamily: "'Satoshi', sans-serif", fontWeight: 700, fontSize: 11, color: "#9aafa0", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Account</p>

          <div className="tw-card" style={{ borderRadius: 14, overflow: "hidden", padding: 0 }}>
            <button
              onClick={() => router.push("/onboarding")}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", background: "none", border: "none", color: "#ffffff", cursor: "pointer", textAlign: "left", borderBottom: "1px solid #1e3828" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(181,176,168,0.05)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "none" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(181,176,168,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <UserCircle size={18} color="#b5b0a8" strokeWidth={1.5} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Edit Profile</div>
                  <div style={{ fontSize: 12, color: "#9aafa0" }}>Update your school, GPA, credits, and financial aid info</div>
                </div>
              </div>
              <span style={{ color: "#9aafa0", fontSize: 16, flexShrink: 0, marginLeft: 12 }}>→</span>
            </button>

            <button
              onClick={signOut}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", background: "none", border: "none", color: "#ffffff", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(181,176,168,0.05)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "none" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(181,176,168,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <LogOut size={18} color="#b5b0a8" strokeWidth={1.5} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Sign Out</div>
                  <div style={{ fontSize: 12, color: "#9aafa0" }}>Sign out of your Sherpa account</div>
                </div>
              </div>
              <span style={{ color: "#9aafa0", fontSize: 16, flexShrink: 0, marginLeft: 12 }}>→</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
