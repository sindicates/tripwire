"use client"

import { useState, useEffect } from "react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export default function TestPage() {
  // Config & State
  const [token, setToken] = useState<string>("")
  const [activeStudent, setActiveStudent] = useState<any>(null)
  const [schools, setSchools] = useState<any[]>([])
  const [logs, setLogs] = useState<string[]>([])

  // Form Inputs
  const [schoolForm, setSchoolForm] = useState({ name: "", ipeds_id: "", scorecard_id: "" })
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", school_id: "" })
  const [loginForm, setLoginForm] = useState({ email: "", password: "" })
  const [profileForm, setProfileForm] = useState({ gpa: "", credits_completed: "", credits_required: "", major: "" })
  
  // Data lists
  const [riskEvents, setRiskEvents] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])

  // Log Helper
  const addLog = (message: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString()
    const logText = `[${timestamp}] ${message}${data ? "\n" + JSON.stringify(data, null, 2) : ""}`
    setLogs((prev) => [logText, ...prev])
  }

  // Load Initial Data
  useEffect(() => {
    const savedToken = localStorage.getItem("test_token")
    if (savedToken) {
      setToken(savedToken)
      addLog("Loaded token from localStorage")
    }
    fetchSchools()
  }, [])

  // Auto-fetch profile when token changes
  useEffect(() => {
    if (token) {
      localStorage.setItem("test_token", token)
      fetchProfile()
    } else {
      localStorage.removeItem("test_token")
      setActiveStudent(null)
      setRiskEvents([])
      setAlerts([])
    }
  }, [token])

  // Fetch lists when active student changes
  useEffect(() => {
    if (activeStudent) {
      fetchRiskEvents()
      fetchAlerts()
    }
  }, [activeStudent])

  // --- API CALLS ---

  const fetchSchools = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/schools/`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSchools(data)
      addLog("Fetched schools list", data)
    } catch (err: any) {
      addLog("Failed to fetch schools", err.message)
    }
  }

  const createSchool = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`${API_BASE}/api/v1/schools/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schoolForm),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      addLog("Created school", data)
      fetchSchools()
      setSchoolForm({ name: "", ipeds_id: "", scorecard_id: "" })
    } catch (err: any) {
      addLog("Failed to create school", err.message)
    }
  }

  const registerStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      addLog("Student registered successfully", data)
      if (data.access_token) {
        setToken(data.access_token)
      }
    } catch (err: any) {
      addLog("Registration failed", err.message)
    }
  }

  const loginStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body = new URLSearchParams()
      body.append("username", loginForm.email)
      body.append("password", loginForm.password)

      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      addLog("Logged in successfully", data)
      if (data.access_token) {
        setToken(data.access_token)
      }
    } catch (err: any) {
      addLog("Login failed", err.message)
    }
  }

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/students/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setToken("") // clear bad token
        throw new Error(await res.text())
      }
      const data = await res.json()
      setActiveStudent(data)
      setProfileForm({
        gpa: data.gpa?.toString() || "",
        credits_completed: data.credits_completed?.toString() || "",
        credits_required: data.credits_required?.toString() || "",
        major: data.major || "",
      })
      addLog("Fetched active student profile", data)
    } catch (err: any) {
      addLog("Failed to fetch student profile", err.message)
    }
  }

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        gpa: profileForm.gpa ? parseFloat(profileForm.gpa) : null,
        credits_completed: profileForm.credits_completed ? parseInt(profileForm.credits_completed) : null,
        credits_required: profileForm.credits_required ? parseInt(profileForm.credits_required) : null,
        major: profileForm.major || null,
      }
      const res = await fetch(`${API_BASE}/api/v1/students/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      addLog("Updated student profile", data)
      setActiveStudent(data)
    } catch (err: any) {
      addLog("Failed to update profile", err.message)
    }
  }

  const triggerScan = async () => {
    if (!activeStudent) return
    try {
      addLog(`Triggering risk evaluation scan for student: ${activeStudent.id}...`)
      const res = await fetch(`${API_BASE}/api/v1/students/${activeStudent.id}/scan`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      addLog("Evaluation scan complete. Resulting risk events generated:", data)
      fetchRiskEvents()
      fetchAlerts()
    } catch (err: any) {
      addLog("Scan failed", err.message)
    }
  }

  const fetchRiskEvents = async () => {
    if (!activeStudent) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/students/${activeStudent.id}/risk-events`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setRiskEvents(data)
      addLog("Fetched active student risk events", data)
    } catch (err: any) {
      addLog("Failed to fetch risk events", err.message)
    }
  }

  const resolveEvent = async (eventId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/risk-events/${eventId}/resolve`, {
        method: "PUT",
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      addLog("Resolved risk event", data)
      fetchRiskEvents()
    } catch (err: any) {
      addLog("Failed to resolve event", err.message)
    }
  }

  const fetchAlerts = async () => {
    if (!activeStudent) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/students/${activeStudent.id}/alerts`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAlerts(data)
      addLog("Fetched active student alerts", data)
    } catch (err: any) {
      addLog("Failed to fetch alerts", err.message)
    }
  }

  const openAlert = async (alertId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/alerts/${alertId}/open`, {
        method: "PUT",
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      addLog("Opened alert", data)
      fetchAlerts()
    } catch (err: any) {
      addLog("Failed to open alert", err.message)
    }
  }

  return (
    <div className="p-6 font-mono text-xs bg-slate-900 text-slate-200 min-h-screen">
      <header className="border-b border-slate-700 pb-4 mb-6">
        <h1 className="text-xl font-bold text-emerald-400">Tripwire API Debug Consol</h1>
        <p className="text-slate-400">Environment: {API_BASE}</p>
        {token ? (
          <div className="mt-2 flex items-center gap-4 bg-slate-800 p-2 rounded">
            <span>JWT Active: <span className="text-amber-400 font-semibold">{token.substring(0, 15)}...</span></span>
            <button 
              onClick={() => setToken("")} 
              className="px-2 py-0.5 bg-red-800 hover:bg-red-700 rounded text-[10px]"
            >
              LOGOUT / CLEAR TOKEN
            </button>
          </div>
        ) : (
          <div className="mt-2 text-rose-400 bg-rose-950/30 p-2 rounded">
            No active student session. Please login or register.
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: SETUP & AUTH */}
        <div className="space-y-6">
          {/* Schools */}
          <div className="border border-slate-700 rounded p-4 bg-slate-950">
            <h2 className="text-sm font-bold text-blue-400 mb-3 border-b border-slate-800 pb-1">1. Schools Manager</h2>
            <form onSubmit={createSchool} className="space-y-2 mb-4">
              <input
                type="text"
                placeholder="School Name"
                value={schoolForm.name}
                onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              />
              <input
                type="text"
                placeholder="IPEDS ID (optional)"
                value={schoolForm.ipeds_id}
                onChange={(e) => setSchoolForm({ ...schoolForm, ipeds_id: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              />
              <input
                type="text"
                placeholder="Scorecard ID (optional)"
                value={schoolForm.scorecard_id}
                onChange={(e) => setSchoolForm({ ...schoolForm, scorecard_id: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              />
              <button type="submit" className="w-full bg-blue-700 hover:bg-blue-600 p-1.5 font-bold rounded">
                + Create School
              </button>
            </form>
            <div>
              <p className="font-bold text-slate-400 mb-1">Existing Schools ({schools.length}):</p>
              <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-900 p-1 border border-slate-800 rounded">
                {schools.map((s) => (
                  <div key={s.id} className="p-1 hover:bg-slate-800 rounded flex justify-between border-b border-slate-800">
                    <span className="text-slate-300 font-semibold">{s.name}</span>
                    <span className="text-slate-500 font-mono text-[9px]">{s.id.substring(0, 8)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Auth Registration */}
          <div className="border border-slate-700 rounded p-4 bg-slate-950">
            <h2 className="text-sm font-bold text-blue-400 mb-3 border-b border-slate-800 pb-1">2. Register Student</h2>
            <form onSubmit={registerStudent} className="space-y-2">
              <input
                type="email"
                placeholder="Email Address"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              />
              <input
                type="password"
                placeholder="Password"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              />
              <select
                value={registerForm.school_id}
                onChange={(e) => setRegisterForm({ ...registerForm, school_id: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              >
                <option value="">-- Select School --</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.id.substring(0, 8)})</option>
                ))}
              </select>
              <button type="submit" className="w-full bg-blue-700 hover:bg-blue-600 p-1.5 font-bold rounded">
                Register Student
              </button>
            </form>
          </div>

          {/* Auth Login */}
          <div className="border border-slate-700 rounded p-4 bg-slate-950">
            <h2 className="text-sm font-bold text-blue-400 mb-3 border-b border-slate-800 pb-1">3. Student Login</h2>
            <form onSubmit={loginStudent} className="space-y-2">
              <input
                type="email"
                placeholder="Email Address"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
              />
              <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-600 p-1.5 font-bold rounded">
                Login
              </button>
            </form>
          </div>
        </div>

        {/* CENTER COLUMN: ACTIVE STUDENT PROFILE & SCANS */}
        <div className="space-y-6">
          <div className="border border-slate-700 rounded p-4 bg-slate-950">
            <h2 className="text-sm font-bold text-amber-400 mb-3 border-b border-slate-800 pb-1">4. Student Profile</h2>
            {activeStudent ? (
              <div className="space-y-4">
                <div className="bg-slate-900 p-2 rounded space-y-1">
                  <p><span className="text-slate-500">ID:</span> <span className="text-slate-300 font-mono text-[10px]">{activeStudent.id}</span></p>
                  <p><span className="text-slate-500">Email:</span> <span className="text-slate-300 font-semibold">{activeStudent.email}</span></p>
                  <p><span className="text-slate-500">School ID:</span> <span className="text-slate-300 font-mono text-[10px]">{activeStudent.school_id}</span></p>
                </div>

                <form onSubmit={updateProfile} className="space-y-2 border-t border-slate-800 pt-3">
                  <p className="font-bold text-slate-400">Update Risk Variables:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block">GPA</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 2.5"
                        value={profileForm.gpa}
                        onChange={(e) => setProfileForm({ ...profileForm, gpa: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Major</label>
                      <input
                        type="text"
                        placeholder="e.g. History"
                        value={profileForm.major}
                        onChange={(e) => setProfileForm({ ...profileForm, major: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Completed Credits</label>
                      <input
                        type="number"
                        placeholder="e.g. 45"
                        value={profileForm.credits_completed}
                        onChange={(e) => setProfileForm({ ...profileForm, credits_completed: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Required Credits</label>
                      <input
                        type="number"
                        placeholder="e.g. 120"
                        value={profileForm.credits_required}
                        onChange={(e) => setProfileForm({ ...profileForm, credits_required: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded"
                      />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-amber-700 hover:bg-amber-600 p-1.5 font-bold rounded">
                    Save Variables
                  </button>
                </form>

                <div className="border-t border-slate-800 pt-3">
                  <p className="font-bold text-slate-400 mb-2">5. Trigger Actions:</p>
                  <button 
                    onClick={triggerScan}
                    className="w-full bg-violet-700 hover:bg-violet-600 p-2 font-bold rounded text-white flex items-center justify-center gap-2"
                  >
                    ⚡ TRIGGER RISK ENGINE SCAN
                  </button>
                  <p className="text-[9px] text-slate-500 mt-1">Evaluates rules: gpa_drop, credit_deficit, etc. and fires risk events.</p>
                </div>
              </div>
            ) : (
              <p className="text-slate-500">Log in or Register above to view student variables.</p>
            )}
          </div>

          {/* Alerts Feed */}
          <div className="border border-slate-700 rounded p-4 bg-slate-950">
            <h2 className="text-sm font-bold text-purple-400 mb-3 border-b border-slate-800 pb-1">6. Recent Alerts ({alerts.length})</h2>
            {activeStudent ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alerts.length === 0 ? (
                  <p className="text-slate-500">No alerts dispatched.</p>
                ) : (
                  alerts.map((a) => (
                    <div key={a.id} className="p-2 bg-slate-900 border border-slate-800 rounded space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="text-violet-400">CHANNEL: {a.channel}</span>
                        <span className="text-slate-500 font-mono text-[9px]">{a.id.substring(0, 8)}</span>
                      </div>
                      <p><span className="text-slate-500">Sent:</span> {new Date(a.sent_at).toLocaleTimeString()}</p>
                      <p><span className="text-slate-500">Opened:</span> {a.opened_at ? <span className="text-emerald-400">{new Date(a.opened_at).toLocaleTimeString()}</span> : <span className="text-amber-500 font-semibold">UNOPENED</span>}</p>
                      {!a.opened_at && (
                        <button 
                          onClick={() => openAlert(a.id)}
                          className="mt-1 w-full bg-slate-800 hover:bg-slate-700 py-0.5 rounded text-[10px] text-slate-300"
                        >
                          Mark Opened
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="text-slate-500">Select student to view alerts.</p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: RISK EVENTS FEED */}
        <div className="space-y-6">
          <div className="border border-slate-700 rounded p-4 bg-slate-950 min-h-[300px]">
            <h2 className="text-sm font-bold text-rose-400 mb-3 border-b border-slate-800 pb-1">7. Active Risk Events ({riskEvents.length})</h2>
            {activeStudent ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {riskEvents.length === 0 ? (
                  <p className="text-slate-500">No risk events found. Try dropping GPA or credit pace and triggering a scan!</p>
                ) : (
                  riskEvents.map((ev) => (
                    <div key={ev.id} className={`p-3 rounded border space-y-1 bg-slate-900 ${
                      ev.severity === 'urgent' ? 'border-red-800' : ev.severity === 'warn' ? 'border-amber-800' : 'border-blue-800'
                    }`}>
                      <div className="flex justify-between items-start">
                        <span className={`px-1 rounded text-[9px] font-bold ${
                          ev.severity === 'urgent' ? 'bg-red-950 text-red-400' : ev.severity === 'warn' ? 'bg-amber-950 text-amber-400' : 'bg-blue-950 text-blue-400'
                        }`}>
                          {ev.severity.toUpperCase()}
                        </span>
                        <span className="text-slate-500 font-mono text-[9px]">{ev.id.substring(0, 8)}</span>
                      </div>
                      <p><span className="text-slate-400 font-bold">{ev.risk_type}</span></p>
                      <p className="text-slate-400 text-[10px]">{new Date(ev.predicted_at).toLocaleString()}</p>
                      
                      {ev.context_json && (
                        <div className="mt-1">
                          <p className="text-slate-500 text-[9px] font-bold">Context Evidence:</p>
                          <pre className="text-[9px] bg-slate-950 p-1 rounded overflow-x-auto text-slate-400">
                            {JSON.stringify(ev.context_json, null, 2)}
                          </pre>
                        </div>
                      )}

                      {ev.resolved_at ? (
                        <p className="text-emerald-400 font-bold text-[10px] mt-2">✓ Resolved at {new Date(ev.resolved_at).toLocaleTimeString()}</p>
                      ) : (
                        <button 
                          onClick={() => resolveEvent(ev.id)}
                          className="mt-2 w-full bg-rose-950 hover:bg-rose-900 text-rose-300 py-1 rounded text-[10px] font-semibold border border-rose-800"
                        >
                          Mark Resolved (Close Loop)
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="text-slate-500">Select student to view risk events.</p>
            )}
          </div>
        </div>
      </div>

      {/* LOWER LOGGER PANEL */}
      <footer className="mt-8 border-t border-slate-800 pt-4">
        <div className="flex justify-between items-center mb-2">
          <p className="font-bold text-slate-400 text-sm">HTTP Transaction & Output Logs</p>
          <button 
            onClick={() => setLogs([])} 
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-[10px]"
          >
            Clear Console
          </button>
        </div>
        <div className="bg-slate-950 p-4 rounded border border-slate-800 max-h-72 overflow-y-auto space-y-2">
          {logs.length === 0 ? (
            <p className="text-slate-600">Console empty. Perform API requests to see transactions.</p>
          ) : (
            logs.map((log, idx) => (
              <pre key={idx} className="whitespace-pre-wrap text-slate-300 border-b border-slate-900 pb-2 font-mono text-[10px] leading-relaxed">
                {log}
              </pre>
            ))
          )}
        </div>
      </footer>
    </div>
  )
}
