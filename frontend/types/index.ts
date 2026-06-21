export enum RiskType {
  GPA_DROP = "gpa_drop",
  CREDIT_DEFICIT = "credit_deficit",
  AID_RISK = "aid_risk",
  DEADLINE_MISS = "deadline_miss",
  ACADEMIC_PROBATION = "academic_probation",
  SATISFACTORY_ACADEMIC_PROGRESS = "satisfactory_academic_progress",
}

export enum Severity {
  INFO = "info",
  WARN = "warn",
  URGENT = "urgent",
}

export enum Channel {
  EMAIL = "email",
  SMS = "sms",
  IN_APP = "in-app",
}

export interface School {
  id: string
  name: string
  ipeds_id: string | null
  scorecard_id: string | null
  doc_ingestion_status: string
  last_ingested_at: string | null
}

export interface StudentProfile {
  id: string
  user_id: string
  email: string
  school: string | null
  year: "Freshman" | "Sophomore" | "Junior" | "Senior" | "Graduate" | null
  major: string | null
  credits_completed: number | null
  current_classes: string[] | null
  financial_aid_status: string | null
  work_hours_per_week: number | null
  housing_status: string | null
  gpa_range: string | null
  graduation_goal: string | null
  unmet_financial_need: number | null
  onboarding_complete: boolean
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  email: string
  school_id: string
  major: string | null
  enrollment_year: number | null
  gpa: number | null
  credits_completed: number | null
  credits_required: number | null
  aid_package_json: Record<string, unknown> | null
  degree_audit_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
  school?: School
}

export interface Document {
  id: string
  school_id: string
  url: string
  title: string | null
  doc_type: string | null
  raw_text: string | null
  chunk_count: number
  last_fetched_at: string | null
}

export interface DocChunk {
  id: string
  document_id: string
  school_id: string
  chunk_text: string
  embedding: number[] | null
  section_heading: string | null
  page_url: string | null
  fetched_at: string | null
}

export interface ActionItem {
  title: string
  description: string
  url?: string
  deadline?: string
  office?: string
  estimated_minutes?: number
  email_template?: { subject: string; body: string }
  phone_script?: string
}

export interface ActionPacket {
  title: string
  description: string
  urgency?: string
  actions: ActionItem[]
  citations?: string[]
}

export interface RiskEvent {
  id: string
  student_id: string
  risk_type: RiskType | string
  severity: Severity
  predicted_at: string
  resolved_at: string | null
  context_json: Record<string, unknown> | null
  action_packet_json: ActionPacket | null
}

export interface Alert {
  id: string
  student_id: string
  risk_event_id: string
  channel: Channel
  sent_at: string
  opened_at: string | null
}
