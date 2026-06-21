'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileText, ListChecks, LucideIcon } from 'lucide-react'

export default function LandingPage() {
  const router = useRouter()

  useEffect(() => {
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-scale')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, root: null }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/* ── NAVBAR ── */}
      <nav style={{
        background: '#117a3d',
        height: '54px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 36px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span className="nav-brand">Tripwire</span>
        </Link>

        <div style={{ display: 'flex', gap: '28px' }}>
          {(['How it works', 'Risk types', 'About'] as const).map((link) => (
            <a
              key={link}
              href="#"
              style={{
                fontFamily: 'Satoshi, sans-serif',
                fontWeight: 400,
                fontSize: '14px',
                color: 'rgba(255,255,255,0.6)',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            >{link}</a>
          ))}
        </div>

        <button
          onClick={() => router.push('/login')}
          style={{
            background: 'transparent',
            border: '1.5px solid rgba(255,255,255,0.4)',
            borderRadius: '4px',
            color: '#fff',
            fontFamily: 'Satoshi, sans-serif',
            fontWeight: 500,
            fontSize: '13px',
            padding: '7px 16px',
            cursor: 'pointer',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'
            e.currentTarget.style.background = 'transparent'
          }}
        >Sign in</button>
      </nav>

      {/* ── HERO ── */}
      <section style={{ height: '100vh', position: 'relative', overflow: 'hidden' }}>
        {/* Base gradient */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #117a3d 0%, #1a9649 22%, #21a659 38%, rgba(22,105,56,0.4) 58%, rgba(249,250,251,0.88) 80%, #f9fafb 100%)',
        }} />

        {/* SVG data visualization */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          viewBox="0 0 1200 490"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="200" cy="480" rx="280" ry="50" fill="#0e562c" opacity="0.5" />
          <ellipse cx="700" cy="490" rx="400" ry="60" fill="#0c4a23" opacity="0.4" />
          <ellipse cx="1100" cy="475" rx="220" ry="40" fill="#117a3d" opacity="0.35" />

          <polyline
            points="80,430 350,300 600,190 850,110 1100,55"
            fill="none"
            stroke="#f9a8d4"
            strokeWidth="1.5"
            strokeDasharray="6,5"
            opacity="0.7"
          />

          <circle cx="350" cy="300" r="5" fill="#f9a8d4" opacity="0.9" />

          <circle cx="600" cy="190" r="22" fill="none" stroke="#f9a8d4" strokeWidth="0.8" opacity="0.2" />
          <circle cx="600" cy="190" r="13" fill="none" stroke="#f9a8d4" strokeWidth="1" opacity="0.4" />
          <circle cx="600" cy="190" r="5" fill="#f9a8d4" opacity="0.9" />

          <circle cx="850" cy="110" r="5" fill="#f9a8d4" opacity="0.9" />

          <g transform="translate(110, 72)">
            <rect width="164" height="102" rx="3" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <rect x="10" y="12" width="52" height="8" rx="2" fill="#f9a8d4" opacity="0.7" />
            <rect x="10" y="30" width="124" height="5" rx="1.5" fill="rgba(255,255,255,0.18)" />
            <rect x="10" y="42" width="94" height="5" rx="1.5" fill="rgba(255,255,255,0.12)" />
            <rect x="10" y="54" width="108" height="5" rx="1.5" fill="rgba(255,255,255,0.12)" />
            <rect x="10" y="74" width="50" height="16" rx="2" fill="#f9a8d4" opacity="0.6" />
          </g>

          <g transform="translate(878, 195)">
            <rect width="158" height="96" rx="3" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <rect x="10" y="12" width="62" height="8" rx="2" fill="#f9a8d4" opacity="0.65" />
            <rect x="10" y="30" width="118" height="5" rx="1.5" fill="rgba(255,255,255,0.18)" />
            <rect x="10" y="42" width="88" height="5" rx="1.5" fill="rgba(255,255,255,0.12)" />
            <rect x="10" y="54" width="102" height="5" rx="1.5" fill="rgba(255,255,255,0.12)" />
            <rect x="10" y="70" width="46" height="15" rx="2" fill="#f9a8d4" opacity="0.6" />
          </g>
        </svg>

        {/* Fade-to-body overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 40%, rgba(249,250,251,0.7) 72%, #f9fafb 100%)',
        }} />

        {/* Hero content — CSS fadeUp keyframe, fires on load */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          paddingTop: '14vh',
          paddingLeft: '24px',
          paddingRight: '24px',
        }}>
          <p style={{
            fontFamily: 'Satoshi, sans-serif',
            fontWeight: 500,
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '1.1px',
            color: 'rgba(255,255,255,0.55)',
            margin: '0 0 20px',
            animation: 'fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.10s both',
          }}>
            Academic risk intelligence
          </p>

          <h1 style={{
            fontFamily: 'Merriweather, serif',
            fontWeight: 900,
            fontSize: '56px',
            color: '#fff',
            lineHeight: 1.12,
            margin: '0 0 22px',
            animation: 'fadeUp 0.65s cubic-bezier(0.22,1,0.36,1) 0.20s both',
          }}>
            Know before<br />
            it <em style={{ color: '#86efac', fontStyle: 'italic' }}>costs you.</em>
          </h1>

          <p style={{
            fontFamily: 'Satoshi, sans-serif',
            fontWeight: 400,
            fontSize: '16px',
            color: 'rgba(255,255,255,0.78)',
            maxWidth: '430px',
            lineHeight: 1.65,
            margin: '0 0 30px',
            animation: 'fadeUp 0.65s cubic-bezier(0.22,1,0.36,1) 0.32s both',
          }}>
            Tripwire monitors your GPA, aid standing, and graduation pace — and tells you exactly what to do before the deadline passes.
          </p>

          <div style={{ display: 'flex', gap: '9px', animation: 'fadeUp 0.65s cubic-bezier(0.22,1,0.36,1) 0.42s both' }}>
            <button
              onClick={() => router.push('/register')}
              style={{
                background: '#f9a8d4',
                color: '#fff',
                fontFamily: 'Satoshi, sans-serif',
                fontWeight: 700,
                fontSize: '13px',
                borderRadius: '4px',
                padding: '10px 20px',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s, transform 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#e8619f')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#f9a8d4')}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              Connect your school
            </button>

            <button
              onClick={() => console.log('TODO: scroll-to-how-it-works')}
              style={{
                background: 'rgba(255,255,255,0.9)',
                border: '1.5px solid #111827',
                color: '#111827',
                fontFamily: 'Satoshi, sans-serif',
                fontWeight: 600,
                fontSize: '13px',
                borderRadius: '4px',
                padding: '9px 17px',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fff'
                e.currentTarget.style.borderColor = '#000'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.9)'
                e.currentTarget.style.borderColor = '#111827'
              }}
            >
              See how it works
            </button>
          </div>
        </div>
      </section>

      {/* ── WHY TRIPWIRE ── */}
      <section style={{ background: '#f9fafb', padding: '52px 36px' }}>
        <div style={{ maxWidth: '840px', margin: '0 auto' }}>

          <p className="reveal" style={{
            fontFamily: 'Merriweather, serif',
            fontWeight: 400,
            fontStyle: 'italic',
            fontSize: '11px',
            color: '#f9a8d4',
            margin: '0 0 12px',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}>
            Why Tripwire
          </p>

          <h2 className="reveal stagger-1" style={{
            fontFamily: 'Merriweather, serif',
            fontWeight: 700,
            fontSize: '22px',
            color: '#117a3d',
            maxWidth: '500px',
            lineHeight: 1.28,
            margin: '0 0 20px',
          }}>
            Most students don&apos;t lose aid because they stopped trying.
          </h2>

          <p className="reveal stagger-2" style={{
            fontFamily: 'Satoshi, sans-serif',
            fontWeight: 400,
            fontSize: '14px',
            color: '#6b7280',
            maxWidth: '560px',
            lineHeight: 1.75,
            margin: '0 0 32px',
          }}>
            They lose it because nobody told them the deadline was two weeks away, or the credit math wasn&apos;t adding up. Advising offices are overbooked, school portals bury the information, and no one is watching your trajectory in real time. Tripwire does.
          </p>

          {/* Quote block */}
          <blockquote className="reveal stagger-2" style={{
            background: '#f0fdf4',
            borderLeft: '3px solid #117a3d',
            borderRadius: '0 4px 4px 0',
            padding: '18px 20px',
            margin: '0 0 32px',
          }}>
            <p style={{
              fontFamily: 'Merriweather, serif',
              fontWeight: 400,
              fontStyle: 'italic',
              fontSize: '14px',
              color: '#117a3d',
              lineHeight: 1.7,
              margin: '0 0 10px',
            }}>
              &ldquo;I didn&apos;t know my SAP status had slipped until my aid was already paused. By then it was too late to appeal for that semester.&rdquo;
            </p>
            <p style={{
              fontFamily: 'Satoshi, sans-serif',
              fontWeight: 400,
              fontSize: '11.5px',
              color: '#6b7280',
              margin: 0,
            }}>
              — First-gen student, community college, 2024
            </p>
          </blockquote>

          {/* Feature cards — wrapper handles reveal, inner div handles hover */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginBottom: '32px',
          }}>
            <FeatureCard
              iconBg="#dcfce7"
              iconColor="#1ba84e"
              Icon={AlertTriangle}
              title="Risk detection before it's too late"
              desc="GPA drops, SAP failures, FAFSA windows — flagged weeks ahead with clear urgency levels."
              delayClass="stagger-1"
            />
            <FeatureCard
              iconBg="#fce7f3"
              iconColor="#be185d"
              Icon={FileText}
              title="Grounded in your school's actual rules"
              desc="Every alert cites official financial aid and registrar documents. No guessing."
              delayClass="stagger-2"
            />
            <FeatureCard
              iconBg="#f0fdf4"
              iconColor="#117a3d"
              Icon={ListChecks}
              title="Exact next steps, not vague suggestions"
              desc='Each risk comes with the specific form, deadline, and office — not "contact your advisor."'
              delayClass="stagger-3"
            />
          </div>

          {/* Stats strip */}
          <div className="reveal-scale" style={{
            background: '#117a3d',
            borderRadius: '4px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}>
            {[
              { num: '$3.7B', label: 'in Pell Grant aid goes unclaimed each year', border: true },
              { num: '40%', label: "of first-gen students don't finish their degree", border: true },
              { num: '1 in 4', label: 'students lose aid for missing a single deadline', border: false },
            ].map(({ num, label, border }) => (
              <div key={num} style={{
                padding: '20px 22px',
                textAlign: 'center',
                borderRight: border ? '1px solid rgba(255,255,255,0.09)' : 'none',
              }}>
                <p style={{
                  fontFamily: 'Merriweather, serif',
                  fontWeight: 900,
                  fontSize: '26px',
                  color: '#f9a8d4',
                  margin: '0 0 4px',
                }}>{num}</p>
                <p style={{
                  fontFamily: 'Satoshi, sans-serif',
                  fontWeight: 400,
                  fontSize: '11.5px',
                  color: 'rgba(255,255,255,0.45)',
                  lineHeight: 1.5,
                  margin: 0,
                }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{
        background: '#fff',
        padding: '52px 36px',
        borderTop: '1px solid #e5e7eb',
      }}>
        <div style={{ maxWidth: '840px', margin: '0 auto' }}>

          <p className="reveal" style={{
            fontFamily: 'Merriweather, serif',
            fontWeight: 400,
            fontStyle: 'italic',
            fontSize: '11px',
            color: '#f9a8d4',
            margin: '0 0 12px',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}>
            How it works
          </p>

          <h2 className="reveal stagger-1" style={{
            fontFamily: 'Merriweather, serif',
            fontWeight: 700,
            fontSize: '22px',
            color: '#117a3d',
            lineHeight: 1.28,
            margin: '0 0 32px',
          }}>
            Set up in minutes. Monitors you all semester.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              {
                n: '1',
                title: 'Connect your school',
                desc: 'Search 6,000+ institutions. Tripwire ingests your financial aid, registrar, and advising documents.',
                delay: 'stagger-1',
                last: false,
              },
              {
                n: '2',
                title: 'Enter your academic profile',
                desc: 'GPA, credits, aid package, and graduation target. Upload your degree audit for full trajectory analysis.',
                delay: 'stagger-2',
                last: false,
              },
              {
                n: '3',
                title: 'Get alerts before risks become problems',
                desc: 'Nightly scans surface risks with exact action steps — the form, the deadline, the office.',
                delay: 'stagger-3',
                last: false,
              },
              {
                n: '4',
                title: 'Ask your policy advisor anything',
                desc: '"Can I drop this class without losing aid?" Answers grounded in your school\'s actual rules.',
                delay: 'stagger-4',
                last: true,
              },
            ].map(({ n, title, desc, delay, last }) => (
              <div key={n} className={`reveal-left ${delay}`} style={{
                display: 'flex',
                gap: '16px',
                padding: '16px 0',
                borderBottom: last ? 'none' : '1px solid #f3f4f6',
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '3px',
                  background: '#117a3d',
                  color: '#fff',
                  fontFamily: 'Merriweather, serif',
                  fontWeight: 700,
                  fontSize: '10.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '1px',
                }}>{n}</div>
                <div>
                  <p style={{
                    fontFamily: 'Merriweather, serif',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    color: '#111827',
                    margin: '0 0 4px',
                  }}>{title}</p>
                  <p style={{
                    fontFamily: 'Satoshi, sans-serif',
                    fontWeight: 400,
                    fontSize: '12.5px',
                    color: '#9ca3af',
                    lineHeight: 1.6,
                    margin: 0,
                  }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background: '#117a3d',
        padding: '52px 36px',
        textAlign: 'center',
      }}>
        <h2 className="reveal" style={{
          fontFamily: 'Merriweather, serif',
          fontWeight: 900,
          fontSize: '24px',
          color: '#fff',
          lineHeight: 1.2,
          margin: '0 0 14px',
        }}>
          Don&apos;t find out you lost aid<br />
          after the <em style={{ color: '#86efac', fontStyle: 'italic' }}>semester ends.</em>
        </h2>

        <p className="reveal stagger-1" style={{
          fontFamily: 'Satoshi, sans-serif',
          fontWeight: 400,
          fontSize: '14px',
          color: 'rgba(255,255,255,0.55)',
          margin: '0 0 26px',
        }}>
          Two minutes to set up. Monitors your standing all semester long.
        </p>

        <div className="reveal stagger-2">
          <button
            onClick={() => router.push('/register')}
            style={{
              background: '#f9a8d4',
              color: '#fff',
              fontFamily: 'Satoshi, sans-serif',
              fontWeight: 700,
              fontSize: '13px',
              borderRadius: '4px',
              padding: '10px 22px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s, transform 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#e8619f')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#f9a8d4')}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            Connect your school — it&apos;s free
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#117a3d',
        padding: '16px 36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ opacity: 0.5 }}>
          <span style={{
            fontFamily: 'Satoshi, sans-serif',
            fontWeight: 700,
            fontSize: '13px',
            background: 'linear-gradient(to right, #117a3d, #f9a8d4)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.4px',
          }}>Tripwire</span>
        </div>
        <p style={{
          fontFamily: 'Satoshi, sans-serif',
          fontWeight: 400,
          fontSize: '11px',
          color: 'rgba(255,255,255,0.18)',
          margin: 0,
        }}>
          Built at UC Berkeley AI Hackathon 2026
        </p>
      </footer>
    </>
  )
}

/* FeatureCard uses a reveal-wrapper outer div so the IntersectionObserver
   opacity/transform transition never conflicts with the inner hover transition. */
function FeatureCard({
  iconBg,
  iconColor,
  Icon,
  title,
  desc,
  delayClass,
}: {
  iconBg: string
  iconColor: string
  Icon: LucideIcon
  title: string
  desc: string
  delayClass: string
}) {
  return (
    <div className={`reveal ${delayClass}`}>
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '4px',
          padding: '16px',
          height: '100%',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s, transform 0.15s',
          cursor: 'default',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#c6f6d5'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e5e7eb'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '4px',
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px',
        }}>
          <Icon size={16} color={iconColor} />
        </div>
        <p style={{
          fontFamily: 'Merriweather, serif',
          fontWeight: 700,
          fontSize: '12px',
          color: '#111827',
          margin: '0 0 6px',
          lineHeight: 1.4,
        }}>{title}</p>
        <p style={{
          fontFamily: 'Satoshi, sans-serif',
          fontWeight: 400,
          fontSize: '12px',
          color: '#9ca3af',
          lineHeight: 1.55,
          margin: 0,
        }}>{desc}</p>
      </div>
    </div>
  )
}
