import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT = `You are extracting student academic profile information from a college document (transcript, financial aid letter, class schedule, degree audit, or FAFSA SAR).

Extract every field you can confidently identify from this document:

- student_name: Full legal name
- school: University or college name (full name, e.g. "University of Nevada, Reno")
- year: Academic standing — must be exactly one of: Freshman, Sophomore, Junior, Senior, Graduate
- major: Declared major or degree program (e.g. "Computer Science")
- credits_completed: Total credit hours completed so far (integer)
- current_classes: Array of current semester course names with numbers, e.g. ["CS 446: Machine Learning", "MATH 330: Linear Algebra"]
- gpa: Cumulative GPA as a decimal (0.00–4.00)
- financial_aid_status: Must be exactly one of: Pell Grant, Subsidized Loans, Unsubsidized Loans, Scholarships Only, Work-Study, Mixed Aid, No Financial Aid. If multiple aid types are present, use "Mixed Aid".
- graduation_goal: Expected graduation semester and year as a string, e.g. "Spring 2027"
- unmet_financial_need: Dollar amount of unmet financial need as an integer (e.g. 8000)

Rules:
- Return ONLY a valid JSON object containing fields you found. No markdown, no explanation.
- Omit any field you cannot find or are not confident about. Do not guess or hallucinate values.
- For year/standing: Freshman = 0–29 credits, Sophomore = 30–59, Junior = 60–89, Senior = 90+, Graduate = grad student.
- If you see a cumulative GPA, use that (not semester GPA).

Example output:
{"school":"University of Nevada, Reno","student_name":"Jhan Doe","gpa":3.45,"credits_completed":62,"major":"Computer Science","year":"Junior","graduation_goal":"Spring 2026"}`

type SupportedImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp"
const IMAGE_TYPES: SupportedImageType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"]

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const files = formData.getAll("files") as File[]
  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 })
  }

  const merged: Record<string, unknown> = {}

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString("base64")
    const mime = file.type

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let contentBlock: any

    if (mime === "application/pdf") {
      contentBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      }
    } else if (IMAGE_TYPES.includes(mime as SupportedImageType)) {
      contentBlock = {
        type: "image",
        source: { type: "base64", media_type: mime as SupportedImageType, data: base64 },
      }
    } else {
      continue // skip unsupported types silently
    }

    try {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: PROMPT }] as any }],
      })

      const text = msg.content.find(b => b.type === "text")?.text ?? ""
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        Object.assign(merged, parsed)
      }
    } catch (err) {
      console.error(`Failed to parse ${file.name}:`, err)
    }
  }

  return NextResponse.json(merged)
}
