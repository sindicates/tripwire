'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileText, ListChecks, LucideIcon } from 'lucide-react'

export default function LandingPage() {
  const router = useRouter()
  const leftMtnRef  = useRef<HTMLDivElement>(null)
  const rightMtnRef = useRef<HTMLDivElement>(null)

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

    function handleScroll() {
      const p = Math.max(0, Math.min(window.scrollY / (window.innerHeight * 0.75), 1))
      if (leftMtnRef.current)  leftMtnRef.current.style.transform  = `translateX(${-p * 280}px)`
      if (rightMtnRef.current) rightMtnRef.current.style.transform = `translateX(${p * 280}px)`
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <>
      {/* ── NAVBAR ── */}
      <nav style={{
        background: '#1e3824',
        height: '54px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 36px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
          <img src="/logo.png" width={42} height={42} alt="Sherpa" style={{ objectFit: 'contain' }} />
          <span className="nav-brand">Sherpa</span>
        </Link>

        <div style={{ display: 'flex', gap: '28px' }}>
          {([['About', 'why-sherpa'], ['How it works', 'how-it-works']] as const).map(([label, id]) => (
            <button
              key={label}
              onClick={() => {
                const el = document.getElementById(id)
                if (!el) return
                const top = el.getBoundingClientRect().top + window.scrollY - 58
                window.scrollTo({ top, behavior: 'smooth' })
              }}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'Satoshi, sans-serif',
                fontWeight: 400,
                fontSize: '14px',
                color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                padding: 0,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            >{label}</button>
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
          background: 'linear-gradient(180deg, #1e3824 0%, #2e5a3c 20%, #3a7050 35%, rgba(30,56,36,0.28) 50%, rgba(249,250,251,0.92) 63%, #f9fafb 72%)',
        }} />

        {/* Left mountain — peak on the outer LEFT, inner slope faces center */}
        <div ref={leftMtnRef} style={{ position: 'absolute', left: 0, top: '-2%', width: '50%', height: '106%', willChange: 'transform', pointerEvents: 'none' }}>
          <svg viewBox="0 0 720 900" width="100%" height="100%" preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg">
            {/* Distant haze range — different silhouette from right mountain */}
            <path d="M-80,900 L40,660 L145,420 L320,182 L488,20 L620,900Z" fill="#2d6038" opacity="0.22"/>
            {/* f1: outer left face — large lit polygon (sun from above-left) */}
            <path d="M100,12 L62,68 L-80,340 L-80,900 L245,900 L260,80 L100,12Z" fill="#3a7044"/>
            {/* f2: peak A upper bevel — brightest facet */}
            <path d="M100,12 L64,58 L100,34 L136,58 L100,12Z" fill="#4d9058" opacity="0.92"/>
            {/* f4: Peak B — widened left shoulder so snow cap sits on mountain */}
            <path d="M260,80 L172,126 L188,900 L310,900 L310,126 L260,80Z" fill="#2d6038" opacity="0.88"/>
            {/* f6: Peak C — widened both sides, heavier right */}
            <path d="M398,156 L340,206 L268,900 L362,900 L446,224 L398,156Z" fill="#2a5a34" opacity="0.82"/>
            {/* f7: inner valley slope — shadow face (updated vertices to match wider f4/f6) */}
            <path d="M100,12 L136,58 L310,126 L446,224 L496,448 L576,678 L638,900 L362,900 L282,678 L202,448 L132,258 L100,12Z" fill="#1e3c28" opacity="0.88"/>
            {/* f8: deep valley shadow — steepest inner face */}
            <path d="M398,156 L446,224 L496,448 L576,678 L638,900 L502,900 L422,618 L358,378 L398,156Z" fill="#132c1a" opacity="0.92"/>
            {/* Lower outer fill */}
            <path d="M172,126 L-80,900 L188,900Z" fill="#264e2e" opacity="0.52"/>
            {/* Snow A: outer left face — runs deeper, jagged lower edge */}
            <path d="M100,12 L58,66 L36,108 L58,98 L48,122 L70,106 L90,92 L100,12Z" fill="rgba(252,254,252,0.91)"/>
            {/* Snow A: inner valley face — shorter, cool shadow tone */}
            <path d="M100,12 L90,92 L138,102 L136,58 L100,12Z" fill="rgba(232,246,255,0.84)"/>
            {/* Snow A: bright peak tip */}
            <path d="M100,12 L80,44 L100,26 L118,40 L100,12Z" fill="rgba(255,255,255,0.99)"/>
            {/* Snow A: detached cornice on outer face */}
            <path d="M48,104 L34,120 L54,116 L60,100 L48,104Z" fill="rgba(255,255,255,0.62)"/>
            {/* Snow A–B ridge bevel — asymmetric, left-heavy */}
            <path d="M136,58 L116,94 L130,80 L140,88 L158,78 L168,96 L136,58Z" fill="rgba(248,254,250,0.72)"/>
            {/* Snow B: left heavier, ragged right edge */}
            <path d="M260,80 L226,132 L210,162 L228,148 L218,168 L248,150 L260,124 L274,132 L294,148 L260,80Z" fill="rgba(248,253,250,0.83)"/>
            {/* Snow B: tip */}
            <path d="M260,80 L248,102 L260,90 L274,100 L260,80Z" fill="rgba(255,255,255,0.96)"/>
            {/* Snow C: irregular, extends more to right */}
            <path d="M398,156 L376,202 L362,228 L382,218 L390,234 L404,212 L418,226 L436,212 L420,202 L398,156Z" fill="rgba(235,250,240,0.74)"/>
            {/* Snow C: tip */}
            <path d="M398,156 L388,176 L398,166 L410,174 L398,156Z" fill="rgba(255,255,255,0.90)"/>
            {/* Foreground scree */}
            <path d="M-80,900 L52,847 L150,872 L252,844 L352,868 L452,840 L552,864 L638,900Z" fill="#0d1e10" opacity="0.58"/>
          </svg>
        </div>

        {/* Right mountain — peak on the outer RIGHT, inner slope faces center */}
        <div ref={rightMtnRef} style={{ position: 'absolute', right: 0, top: '-2%', width: '50%', height: '106%', willChange: 'transform', pointerEvents: 'none' }}>
          <svg viewBox="0 0 720 900" width="100%" height="100%" preserveAspectRatio="xMaxYMin meet" xmlns="http://www.w3.org/2000/svg">
            {/* Distant haze range — different silhouette from left mountain */}
            <path d="M800,900 L678,590 L548,360 L385,148 L238,28 L112,900Z" fill="#2d6038" opacity="0.22"/>
            {/* f1: outer right face — lit */}
            <path d="M620,12 L658,68 L800,340 L800,900 L475,900 L460,80 L620,12Z" fill="#3a7044"/>
            {/* f2: peak A upper bevel */}
            <path d="M620,12 L656,58 L620,34 L584,58 L620,12Z" fill="#4d9058" opacity="0.92"/>
            {/* f4: Peak B — widened right shoulder (asymmetric: left mountain widens left) */}
            <path d="M460,80 L430,126 L414,900 L532,900 L548,126 L460,80Z" fill="#2d6038" opacity="0.88"/>
            {/* f6: Peak C — widened left shoulder (asymmetric: left mountain widens right) */}
            <path d="M322,156 L276,206 L204,900 L358,900 L380,226 L322,156Z" fill="#2a5a34" opacity="0.82"/>
            {/* f7: inner valley slope — shadow (updated vertices to match wider f4/f6) */}
            <path d="M620,12 L584,58 L430,126 L380,226 L224,448 L144,678 L82,900 L358,900 L438,678 L518,448 L588,258 L620,12Z" fill="#1e3c28" opacity="0.88"/>
            {/* f8: deep valley shadow */}
            <path d="M322,156 L380,226 L224,448 L144,678 L82,900 L218,900 L298,618 L362,378 L322,156Z" fill="#132c1a" opacity="0.92"/>
            {/* Lower outer fill */}
            <path d="M548,126 L800,900 L532,900Z" fill="#264e2e" opacity="0.52"/>
            {/* Snow A: outer right face — runs deeper, jagged lower edge */}
            <path d="M620,12 L662,66 L684,108 L662,98 L672,122 L650,106 L630,92 L620,12Z" fill="rgba(252,254,252,0.91)"/>
            {/* Snow A: inner valley face — shorter, cool shadow tone */}
            <path d="M620,12 L630,92 L582,102 L584,58 L620,12Z" fill="rgba(232,246,255,0.84)"/>
            {/* Snow A: bright peak tip */}
            <path d="M620,12 L640,44 L620,26 L602,40 L620,12Z" fill="rgba(255,255,255,0.99)"/>
            {/* Snow A: detached cornice on outer face */}
            <path d="M672,104 L686,120 L666,116 L660,100 L672,104Z" fill="rgba(255,255,255,0.62)"/>
            {/* Snow A–B ridge bevel — asymmetric, right-heavy */}
            <path d="M584,58 L604,94 L590,80 L580,88 L562,78 L552,96 L584,58Z" fill="rgba(248,254,250,0.72)"/>
            {/* Snow B: right heavier, ragged left edge */}
            <path d="M460,80 L494,132 L510,162 L492,148 L502,168 L472,150 L460,124 L446,132 L426,148 L460,80Z" fill="rgba(248,253,250,0.83)"/>
            {/* Snow B: tip */}
            <path d="M460,80 L472,102 L460,90 L446,100 L460,80Z" fill="rgba(255,255,255,0.96)"/>
            {/* Snow C: irregular, extends more to left */}
            <path d="M322,156 L344,202 L358,228 L338,218 L330,234 L316,212 L302,226 L284,212 L300,202 L322,156Z" fill="rgba(235,250,240,0.74)"/>
            {/* Snow C: tip */}
            <path d="M322,156 L332,176 L322,166 L310,174 L322,156Z" fill="rgba(255,255,255,0.90)"/>
            {/* Foreground scree */}
            <path d="M800,900 L668,847 L570,872 L468,844 L368,868 L268,840 L168,864 L82,900Z" fill="#0d1e10" opacity="0.58"/>
          </svg>
        </div>

        {/* Fade to body */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 22%, rgba(249,250,251,0.55) 46%, #f9fafb 63%)', pointerEvents: 'none' }} />

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
            Welcome to<br />
            <em style={{ color: '#86efac', fontStyle: 'italic' }}>Sherpa.</em>
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
            Sherpa monitors your GPA, aid standing, and graduation pace — and tells you exactly what to do before the deadline passes.
          </p>

          <div style={{ display: 'flex', gap: '9px', animation: 'fadeUp 0.65s cubic-bezier(0.22,1,0.36,1) 0.42s both' }}>
            <button
              onClick={() => router.push('/register')}
              style={{
                background: 'linear-gradient(135deg, #b5b0a8, #2d6030)',
                color: '#111e14',
                fontFamily: 'Satoshi, sans-serif',
                fontWeight: 700,
                fontSize: '13px',
                borderRadius: '4px',
                padding: '10px 20px',
                border: 'none',
                cursor: 'pointer',
                transition: 'filter 0.15s, transform 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
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
      <section id="why-sherpa" style={{ background: '#f9fafb', padding: '52px 36px', position: 'relative', zIndex: 1, marginTop: '-60px' }}>
        <div style={{ maxWidth: '840px', margin: '0 auto' }}>

          <p className="reveal" style={{
            fontFamily: 'Merriweather, serif',
            fontWeight: 400,
            fontStyle: 'italic',
            fontSize: '11px',
            color: '#b5b0a8',
            margin: '0 0 12px',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}>
            Why it matters
          </p>

          <h2 className="reveal stagger-1" style={{
            fontFamily: 'Merriweather, serif',
            fontWeight: 700,
            fontSize: '22px',
            color: '#1e3824',
            maxWidth: '500px',
            lineHeight: 1.28,
            margin: '0 0 20px',
          }}>
            Nobody is watching your aid status for you.
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
            Financial aid has a lot of moving parts — SAP reviews, FAFSA renewal windows, credit minimums, add/drop deadlines. Advisors are stretched thin and school portals aren&apos;t built to warn you in advance. Sherpa fills that gap. It monitors the things that affect your enrollment and funding, and tells you what to do while you still have time to do it.
          </p>

          {/* Quote block */}
          <blockquote className="reveal stagger-2" style={{
            background: '#f0fdf4',
            borderLeft: '3px solid #1e3824',
            borderRadius: '0 4px 4px 0',
            padding: '18px 20px',
            margin: '0 0 32px',
          }}>
            <p style={{
              fontFamily: 'Merriweather, serif',
              fontWeight: 400,
              fontStyle: 'italic',
              fontSize: '14px',
              color: '#1e3824',
              lineHeight: 1.7,
              margin: '0 0 10px',
            }}>
              &ldquo;I didn&apos;t find out my aid was on hold until I tried to register for spring. I had no idea my completion rate had dropped below the threshold.&rdquo;
            </p>
            <p style={{
              fontFamily: 'Satoshi, sans-serif',
              fontWeight: 400,
              fontSize: '11.5px',
              color: '#6b7280',
              margin: 0,
            }}>
              — Community college student, 2024
            </p>
          </blockquote>

          {/* Feature cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '14px',
            marginBottom: '36px',
          }}>
            <FeatureCard
              iconBg="#dcfce7"
              iconColor="#1ba84e"
              Icon={AlertTriangle}
              title="Early warnings, not last-minute alerts"
              desc="You'll know about GPA risks, SAP reviews, and FAFSA deadlines weeks in advance — not the day before."
              delayClass="stagger-1"
            />
            <FeatureCard
              iconBg="#f3f4f6"
              iconColor="#9aafa0"
              Icon={FileText}
              title="Based on your school's actual policies"
              desc="Alerts are built from your school's own financial aid and registrar documents, not general guidance."
              delayClass="stagger-2"
            />
            <FeatureCard
              iconBg="#f0fdf4"
              iconColor="#1e3824"
              Icon={ListChecks}
              title="Specific enough to act on"
              desc="Every alert tells you the form, the office, and the deadline. You don't have to figure out the next step yourself."
              delayClass="stagger-3"
            />
          </div>

          {/* Stats strip */}
          <div className="reveal-scale" style={{
            background: '#1e3824',
            borderRadius: '4px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}>
            {[
              { num: '$3.7B', label: "in federal aid goes unclaimed each year, largely because students missed a filing window or didn't know they qualified.", border: true },
              { num: '40%', label: "of first-generation students don't complete their degree.", border: true },
              { num: '1 in 4', label: 'students have lost aid due to a missed deadline or paperwork gap.', border: false },
            ].map(({ num, label, border }) => (
              <div key={num} style={{
                padding: '28px 32px',
                textAlign: 'center',
                borderRight: border ? '1px solid rgba(255,255,255,0.09)' : 'none',
              }}>
                <p style={{
                  fontFamily: 'Merriweather, serif',
                  fontWeight: 900,
                  fontSize: '34px',
                  color: '#b5b0a8',
                  margin: '0 0 6px',
                  whiteSpace: 'nowrap',
                }}>{num}</p>
                <p style={{
                  fontFamily: 'Satoshi, sans-serif',
                  fontWeight: 400,
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.45)',
                  lineHeight: 1.55,
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
            color: '#b5b0a8',
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
            color: '#1e3824',
            lineHeight: 1.28,
            margin: '0 0 32px',
          }}>
            Set it up once. Runs on its own after that.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              {
                n: '1',
                title: 'Connect your school',
                desc: 'Search from over 6,000 institutions. Sherpa pulls in the relevant policies from your financial aid and registrar offices.',
                delay: 'stagger-1',
                last: false,
              },
              {
                n: '2',
                title: 'Enter your academic details',
                desc: 'Your GPA, credits, aid package, and graduation goal. You can also upload your degree audit for more precise tracking.',
                delay: 'stagger-2',
                last: false,
              },
              {
                n: '3',
                title: 'Stay informed automatically',
                desc: 'Sherpa checks your status each night. If something needs attention, you get a clear alert — including the specific form, deadline, and where to submit it.',
                delay: 'stagger-3',
                last: false,
              },
              {
                n: '4',
                title: 'Get answers when you have questions',
                desc: "Ask anything about your school's policies in plain language.",
                delay: 'stagger-4',
                last: true,
              },
            ].map(({ n, title, desc, delay, last }) => (
              <div key={n} className={`reveal-left ${delay}`} style={{
                display: 'flex',
                gap: '20px',
                padding: '24px 0',
                borderBottom: last ? 'none' : '1px solid #f3f4f6',
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '4px',
                  background: '#1e3824',
                  color: '#fff',
                  fontFamily: 'Merriweather, serif',
                  fontWeight: 700,
                  fontSize: '13.5px',
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
                    fontSize: '16px',
                    color: '#111827',
                    margin: '0 0 6px',
                  }}>{title}</p>
                  <p style={{
                    fontFamily: 'Satoshi, sans-serif',
                    fontWeight: 400,
                    fontSize: '14px',
                    color: '#9ca3af',
                    lineHeight: 1.65,
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
        background: '#1e3824',
        padding: '22px 36px 16px',
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
              background: '#b5b0a8',
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
            onMouseEnter={(e) => (e.currentTarget.style.background = '#8a8680')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#b5b0a8')}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            Connect your school — it&apos;s free
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#1e3824',
        padding: '8px 36px 4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ opacity: 0.6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo.png" width={24} height={24} alt="Sherpa" style={{ objectFit: 'contain' }} />
          <span className="nav-brand" style={{ fontSize: '13px' }}>Sherpa</span>
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
          borderRadius: '6px',
          padding: '24px',
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
          width: '44px',
          height: '44px',
          borderRadius: '6px',
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}>
          <Icon size={20} color={iconColor} />
        </div>
        <p style={{
          fontFamily: 'Merriweather, serif',
          fontWeight: 700,
          fontSize: '15px',
          color: '#111827',
          margin: '0 0 8px',
          lineHeight: 1.4,
        }}>{title}</p>
        <p style={{
          fontFamily: 'Satoshi, sans-serif',
          fontWeight: 400,
          fontSize: '13.5px',
          color: '#9ca3af',
          lineHeight: 1.6,
          margin: 0,
        }}>{desc}</p>
      </div>
    </div>
  )
}
