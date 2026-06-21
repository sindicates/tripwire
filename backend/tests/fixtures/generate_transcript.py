from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

OUTPUT = "yale_bad_transcript.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    leftMargin=0.9*inch,
    rightMargin=0.9*inch,
    topMargin=0.8*inch,
    bottomMargin=0.8*inch,
)

YALE_BLUE = colors.HexColor("#00356B")
DARK = colors.HexColor("#1a1a1a")
MID = colors.HexColor("#444444")
LIGHT = colors.HexColor("#f5f5f5")
RED = colors.HexColor("#b00020")
WARN = colors.HexColor("#c05000")

styles = getSampleStyleSheet()

h1 = ParagraphStyle("h1", fontSize=16, fontName="Helvetica-Bold", textColor=YALE_BLUE, alignment=TA_CENTER, spaceAfter=2)
h2 = ParagraphStyle("h2", fontSize=10, fontName="Helvetica-Bold", textColor=YALE_BLUE, alignment=TA_CENTER, spaceAfter=6)
section = ParagraphStyle("section", fontSize=9, fontName="Helvetica-Bold", textColor=YALE_BLUE, spaceBefore=10, spaceAfter=4)
body = ParagraphStyle("body", fontSize=8, fontName="Helvetica", textColor=DARK, spaceAfter=2, leading=12)
small = ParagraphStyle("small", fontSize=7, fontName="Helvetica", textColor=MID, spaceAfter=2, leading=10)
note = ParagraphStyle("note", fontSize=7.5, fontName="Helvetica-Oblique", textColor=WARN, spaceAfter=4, leading=11)
warn_style = ParagraphStyle("warn", fontSize=8, fontName="Helvetica-Bold", textColor=RED, spaceAfter=2)

def hr():
    return HRFlowable(width="100%", thickness=0.5, color=YALE_BLUE, spaceAfter=6, spaceBefore=4)

def course_table(rows, term_summary):
    col_widths = [1.15*inch, 3.3*inch, 0.7*inch, 0.55*inch]
    header = [["Course", "Title", "Credits", "Grade"]]
    data = header + rows
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), YALE_BLUE),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 7.5),
        ("FONTNAME",   (0,1), (-1,-1), "Helvetica"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
        ("GRID",       (0,0), (-1,-1), 0.25, colors.HexColor("#cccccc")),
        ("ALIGN",      (2,0), (-1,-1), "CENTER"),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("LEFTPADDING",   (0,0), (-1,-1), 5),
    ]))
    return [t, Paragraph(term_summary, small)]

def summary_table(rows):
    col_widths = [3.0*inch, 2.0*inch]
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("FONTNAME",   (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",   (0,0), (-1,-1), 8),
        ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, LIGHT]),
        ("GRID",       (0,0), (-1,-1), 0.25, colors.HexColor("#cccccc")),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("TEXTCOLOR",  (1,0), (1,-1), DARK),
    ]))
    return t

story = []

# Header
story.append(Paragraph("YALE UNIVERSITY", h1))
story.append(Paragraph("Office of the University Registrar", h2))
story.append(Paragraph("246 Church Street, New Haven, CT 06511 | registrar.yale.edu", h2))
story.append(hr())

story.append(Paragraph("OFFICIAL ACADEMIC TRANSCRIPT", ParagraphStyle("ot", fontSize=11, fontName="Helvetica-Bold", textColor=YALE_BLUE, alignment=TA_CENTER, spaceAfter=8)))

# Student info
story.append(Paragraph("STUDENT INFORMATION", section))
info = [
    ["Name:", "Jordan M. Calloway", "Student ID:", "20219874"],
    ["Date of Birth:", "09/14/2003", "Yale Net ID:", "jmc347"],
    ["Program:", "Bachelor of Science — Economics", "College:", "Morse College"],
    ["Class Year:", "2025 (entered Fall 2021)", "Enrollment Status:", "Academic Warning (Spring 2024)"],
]
info_t = Table(info, colWidths=[1.0*inch, 2.5*inch, 1.0*inch, 2.1*inch])
info_t.setStyle(TableStyle([
    ("FONTNAME",   (0,0), (-1,-1), "Helvetica"),
    ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTNAME",   (2,0), (2,-1), "Helvetica-Bold"),
    ("FONTSIZE",   (0,0), (-1,-1), 8),
    ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 3),
    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ("LEFTPADDING",   (0,0), (-1,-1), 4),
]))
story.append(info_t)
story.append(Spacer(1, 6))
story.append(hr())

# Grading scale
story.append(Paragraph("GRADING SCALE", section))
story.append(Paragraph(
    "A (4.0)  A– (3.7)  B+ (3.3)  B (3.0)  B– (2.7)  C+ (2.3)  C (2.0)  C– (1.7)  "
    "D+ (1.3)  D (1.0)  F (0.0)  |  W = Withdrawal  ·  WF = Withdrawal Failing  ·  INC = Incomplete",
    small))
story.append(hr())

# ── FALL 2021 ──
story.append(Paragraph("FALL 2021", section))
rows_f21 = [
    ["ECON 108",  "Introduction to Microeconomics",               "1.0", "B"],
    ["MATH 112",  "Calculus of Functions of One Variable",         "1.0", "C+"],
    ["ENGL 114",  "Writing Seminar",                               "1.0", "B+"],
    ["PSYC 110",  "Introduction to Psychology",                    "1.0", "B–"],
    ["HIST 101",  "The Modern World",                              "1.0", "C"],
]
story += course_table(rows_f21,
    "Term Credits Attempted: 5.0   Earned: 5.0   Term GPA: 2.74   |   "
    "Cumulative Attempted: 5.0   Earned: 5.0   Cumulative GPA: 2.74")
story.append(Spacer(1, 6))

# ── SPRING 2022 ──
story.append(Paragraph("SPRING 2022", section))
rows_s22 = [
    ["ECON 115",  "Introduction to Macroeconomics",                "1.0", "C+"],
    ["MATH 115",  "Calculus of Functions of Several Variables",    "1.0", "D+"],
    ["STAT 100",  "Introductory Statistics",                       "1.0", "C"],
    ["SOCY 151",  "Foundations of Sociology",                      "1.0", "B–"],
    ["ECON 121",  "Microeconomic Theory",                          "1.0", "W"],
]
story += course_table(rows_s22,
    "Term Credits Attempted: 5.0   Earned: 4.0   Term GPA: 1.98   |   "
    "Cumulative Attempted: 10.0   Earned: 9.0   Cumulative GPA: 2.37")
story.append(Paragraph("Dean's Note: Student placed on Academic Probation Review — Spring 2022 term GPA below 2.0.", note))

# ── FALL 2022 ──
story.append(Paragraph("FALL 2022", section))
rows_f22 = [
    ["ECON 121",  "Microeconomic Theory (repeat)",                 "1.0", "C"],
    ["MATH 120",  "Linear Algebra",                                "1.0", "C–"],
    ["ECON 125",  "Intermediate Macroeconomics",                   "1.0", "D+"],
    ["CPSC 100",  "Introduction to Computing and Programming",     "1.0", "C+"],
    ["ECON 131",  "Data Analysis for Economics",                   "1.0", "INC*"],
]
story += course_table(rows_f22,
    "Term Credits Attempted: 5.0   Earned: 4.0   Term GPA: 1.87   |   "
    "Cumulative Attempted: 15.0   Earned: 13.0   Cumulative GPA: 2.16")
story.append(Paragraph("*INC in ECON 131 converted to F (0.0) on 02/15/2023 — instructor deadline passed.", note))

# ── SPRING 2023 ──
story.append(Paragraph("SPRING 2023", section))
rows_s23 = [
    ["ECON 131",  "Data Analysis for Economics (repeat)",          "1.0", "C"],
    ["ECON 252",  "Behavioral Economics",                          "1.0", "B–"],
    ["MGMT 130",  "Corporate Finance",                             "1.0", "D"],
    ["MATH 222",  "Linear Algebra & Matrix Theory",                "1.0", "WF"],
    ["ECON 241",  "Labor Economics",                               "1.0", "C–"],
]
story += course_table(rows_s23,
    "Term Credits Attempted: 5.0   Earned: 4.0   Term GPA: 1.90   |   "
    "Cumulative Attempted: 20.0   Earned: 17.0   Cumulative GPA: 2.07")
story.append(Paragraph(
    "Dean's Note: Second Academic Warning issued. Student referred to residential dean. "
    "SAP pace: 85.0% (17/20). Aid eligibility under review.", note))

# ── FALL 2023 ──
story.append(Paragraph("FALL 2023", section))
rows_f23 = [
    ["ECON 290",  "Research Methods in Economics",                 "1.0", "C–"],
    ["MGMT 130",  "Corporate Finance (repeat)",                    "1.0", "D+"],
    ["ECON 301",  "Advanced Microeconomic Theory",                 "1.0", "F"],
    ["SOCY 265",  "Race, Class, and Inequality",                   "1.0", "B"],
    ["HIST 202",  "U.S. Economic History",                         "1.0", "C+"],
]
story += course_table(rows_f23,
    "Term Credits Attempted: 5.0   Earned: 4.0   Term GPA: 1.74   |   "
    "Cumulative Attempted: 25.0   Earned: 21.0   Cumulative GPA: 1.97")
story.append(Paragraph(
    "Dean's Note: Cumulative GPA fell below 2.0. Student placed on Academic Probation (formal). "
    "Scholarship review initiated. Required to meet with academic dean within 10 business days.", note))

# ── SPRING 2024 ──
story.append(Paragraph("SPRING 2024", section))
rows_s24 = [
    ["ECON 301",  "Advanced Microeconomic Theory (repeat)",        "1.0", "C"],
    ["ECON 360",  "International Trade",                           "1.0", "C+"],
    ["ECON 310",  "Econometrics",                                  "1.0", "D+"],
    ["PSYC 360",  "Decision Making Under Uncertainty",             "1.0", "B–"],
    ["ECON 399",  "Senior Essay Research",                         "0.5", "INC*"],
]
story += course_table(rows_s24,
    "Term Credits Attempted: 4.5   Earned: 4.0   Term GPA: 2.04   |   "
    "Cumulative Attempted: 29.5   Earned: 25.0   Cumulative GPA: 1.99")
story.append(Paragraph("*INC in ECON 399 pending resolution — deadline 08/30/2024.", note))

story.append(hr())

# ── ACADEMIC STANDING SUMMARY ──
story.append(Paragraph("ACADEMIC STANDING SUMMARY (as of Spring 2024)", section))
summary_rows = [
    ["Cumulative GPA",               "1.99  ← BELOW 2.0 minimum"],
    ["Cumulative Credits Earned",    "25.0"],
    ["Cumulative Credits Attempted", "29.5"],
    ["SAP Completion Pace",          "84.7%  ← BELOW 86.67% required"],
    ["Credits Required for Degree",  "36.0"],
    ["Credits Remaining",            "11.0"],
    ["Projected Graduation",         "Spring 2026 (one year behind)"],
    ["Financial Aid Status",         "SUSPENDED — SAP Appeal required"],
    ["SAP Appeal Deadline",          "07/15/2024  ← CRITICAL"],
    ["FAFSA Renewal Deadline",       "06/30/2024  ← NOT YET COMPLETED"],
    ["Academic Status",              "Academic Probation (active)"],
    ["Probation Clearance Deadline", "End of Fall 2024 (GPA must reach ≥ 2.0)"],
]
story.append(summary_table(summary_rows))
story.append(Spacer(1, 10))

story.append(Paragraph(
    "This is an official transcript of Yale University. Any alteration invalidates this document. "
    "Issued: 2024-06-15   |   Registrar: Dr. Margaret Fitch, Yale University",
    ParagraphStyle("footer", fontSize=7, fontName="Helvetica-Oblique", textColor=MID, alignment=TA_CENTER)))

doc.build(story)
print(f"Generated: {OUTPUT}")
