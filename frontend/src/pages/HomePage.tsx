/**
 * TGR × F1 — Cinematic Homepage
 *
 * THE DIGITAL COMMAND CENTER FOR F1 TYRE INTELLIGENCE
 *
 * 9 Sections:
 *  1. Loading overlay
 *  2. Hero — 3D car + typography + telemetry overlays
 *  3. Video — "WHY TDR?" engineering briefing
 *  4. Problem — "THE CAR IS SLOWER" visual equation
 *  5. Digital Twin — PhyEngine intro + residual signal
 *  6. System Health — 4-corner dashboard preview
 *  7. AI Prediction — degradation curve + temporal AI
 *  8. Race Strategy — pit window optimizer
 *  9. Final Hero — closing statement
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ActiveNavTab } from '../components/Navbar';
import type { FourWheelTyres, TelemetryFrame, TyreCorner } from '../types/telemetry';
import { HomeCarScene } from '../three/HomeCarScene';
import './HomePage.css';

/* ═══════════════════════════════════════════════════════════ */
/*  Props                                                      */
/* ═══════════════════════════════════════════════════════════ */

interface HomePageProps {
  onNavigate?: (tab: ActiveNavTab, subTab?: '3d' | 'image') => void;
  telemetry?: TelemetryFrame | null;
  fourWheelStates?: FourWheelTyres | null;
  selectedTyre?: TyreCorner;
  lap?: number;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Animated counter hook                                      */
/* ═══════════════════════════════════════════════════════════ */

function useAnimatedValue(target: number, duration = 2000, active = true): number {
  const [val, setVal] = useState(0);
  const ref = useRef({ start: 0, startVal: 0, raf: 0 });

  useEffect(() => {
    if (!active) return;
    const r = ref.current;
    r.start = performance.now();
    r.startVal = val;

    const step = (now: number) => {
      const elapsed = now - r.start;
      const t = Math.min(elapsed / duration, 1);
      const eased = t * t * (3 - 2 * t);
      setVal(Math.round(r.startVal + (target - r.startVal) * eased));
      if (t < 1) r.raf = requestAnimationFrame(step);
    };

    r.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(r.raf);
    // eslint-disable-next-line
  }, [target, active, duration]);

  return val;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Intersection Observer hook                                 */
/* ═══════════════════════════════════════════════════════════ */

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.2): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);

  return inView;
}

/* ═══════════════════════════════════════════════════════════ */
/*  HOMEPAGE COMPONENT                                         */
/* ═══════════════════════════════════════════════════════════ */

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  /* ── Refs ── */
  const heroCanvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HomeCarScene | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  /* Section refs for IntersectionObserver */
  const videoSecRef = useRef<HTMLDivElement>(null);
  const problemSecRef = useRef<HTMLDivElement>(null);
  const twinSecRef = useRef<HTMLDivElement>(null);
  const healthSecRef = useRef<HTMLDivElement>(null);
  const aiSecRef = useRef<HTMLDivElement>(null);
  const raceSecRef = useRef<HTMLDivElement>(null);
  const finalSecRef = useRef<HTMLDivElement>(null);

  /* ── State ── */
  const [loadPct, setLoadPct] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [systemReady, setSystemReady] = useState(false);
  const [introPhase, setIntroPhase] = useState(0); // 0=loading, 1=redline, 2=text, 3=telemetry, 4=done
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [equationStep, setEquationStep] = useState(0); // 0-6
  const [equationConfused, setEquationConfused] = useState(false);

  /* InView tracking */
  const videoInView = useInView(videoSecRef, 0.3);
  const problemInView = useInView(problemSecRef, 0.25);
  const twinInView = useInView(twinSecRef, 0.25);
  const healthInView = useInView(healthSecRef, 0.25);
  const aiInView = useInView(aiSecRef, 0.25);
  const raceInView = useInView(raceSecRef, 0.25);
  const finalInView = useInView(finalSecRef, 0.25);

  /* Animated telemetry values */
  const velocity = useAnimatedValue(312, 2500, introPhase >= 3);
  const tyreTemp = useAnimatedValue(108, 2200, introPhase >= 3);
  const grip = useAnimatedValue(87, 2000, introPhase >= 3);
  const wear = useAnimatedValue(21, 1800, introPhase >= 3);
  const tyreHealth = useAnimatedValue(79, 2300, introPhase >= 3);

  /* ═══════════════════════════════════════════════ */
  /*  3D Scene setup                                 */
  /* ═══════════════════════════════════════════════ */

  useEffect(() => {
    const container = heroCanvasRef.current;
    if (!container || sceneRef.current) return;

    const scene = new HomeCarScene(container, {
      onProgress: (pct) => setLoadPct(Math.round(pct)),
      onLoaded: () => setModelReady(true),
      onError: (msg) => {
        console.warn('HomeCarScene error:', msg);
        // Still let the page work without the model
        setModelReady(true);
      },
    });

    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  /* ═══════════════════════════════════════════════ */
  /*  Intro sequence orchestration                   */
  /* ═══════════════════════════════════════════════ */

  useEffect(() => {
    if (!modelReady) return;

    // "SYSTEM READY" flash
    const t0 = setTimeout(() => setSystemReady(true), 300);

    // Start intro after short delay
    const t1 = setTimeout(() => {
      setIntroPhase(1); // red line
      sceneRef.current?.startIntro();
    }, 1200);

    const t2 = setTimeout(() => setIntroPhase(2), 2200); // text
    const t3 = setTimeout(() => setIntroPhase(3), 3800); // telemetry
    const t4 = setTimeout(() => setIntroPhase(4), 5500); // done

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [modelReady]);

  /* ═══════════════════════════════════════════════ */
  /*  Problem equation sequencing                    */
  /* ═══════════════════════════════════════════════ */

  useEffect(() => {
    if (!problemInView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 6; i++) {
      timers.push(setTimeout(() => setEquationStep(i), i * 350));
    }
    timers.push(setTimeout(() => setEquationConfused(true), 3200));
    return () => timers.forEach(clearTimeout);
  }, [problemInView]);

  /* ═══════════════════════════════════════════════ */
  /*  Mouse tracking                                 */
  /* ═══════════════════════════════════════════════ */

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      sceneRef.current?.setMouse(nx, ny);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  /* ═══════════════════════════════════════════════ */
  /*  Scroll tracking                                */
  /* ═══════════════════════════════════════════════ */

  useEffect(() => {
    const handler = () => {
      const scrollY = window.scrollY;
      const heroH = window.innerHeight;
      const prog = Math.min(scrollY / heroH, 1);
      sceneRef.current?.setScrollProgress(prog);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  /* ═══════════════════════════════════════════════ */
  /*  Video play handler                             */
  /* ═══════════════════════════════════════════════ */

  const handlePlayVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().then(() => setVideoPlaying(true)).catch(() => {});
  }, []);

  const scrollToVideo = useCallback(() => {
    videoSecRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  /* ═══════════════════════════════════════════════ */
  /*  RENDER                                         */
  /* ═══════════════════════════════════════════════ */

  const factors = [
    { label: 'TYRE DEGRADATION', isTyre: true },
    { label: 'FUEL EFFECT', isTyre: false },
    { label: 'TRAFFIC', isTyre: false },
    { label: 'TRACK EVOLUTION', isTyre: false },
    { label: 'OTHER EFFECTS', isTyre: false },
  ];

  return (
    <div ref={pageRef} className="w-full bg-[#080808] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ════════════════════════════════════════════ */}
      {/*  1. LOADING OVERLAY                         */}
      {/* ════════════════════════════════════════════ */}

      <div className={`home-loading-overlay ${introPhase >= 1 ? 'loaded' : ''}`}>
        <div className="home-loading-label">
          {systemReady ? 'SYSTEM READY' : 'INITIALIZING DIGITAL TWIN'}
        </div>
        <div className="home-loading-bar-track">
          <div className="home-loading-bar-fill" style={{ width: `${loadPct}%` }} />
        </div>
        <div className="home-loading-pct">{loadPct}%</div>
        {systemReady && <div className="home-loading-ready">■ ONLINE</div>}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/*  2. HERO SECTION                            */}
      {/* ════════════════════════════════════════════ */}

      <section className="home-hero">
        {/* 3D Canvas */}
        <div ref={heroCanvasRef} className="home-hero-canvas" />

        {/* Red line intro */}
        <div className={`home-hero-redline ${introPhase >= 1 ? 'active' : ''}`} />

        {/* Hero text */}
        <div className="home-hero-content">
          <div className={`home-hero-text ${introPhase >= 2 ? 'visible' : ''}`}>
            <div className="home-hero-tag">TGR × F1 INTELLIGENCE</div>

            <h1 className="home-hero-heading">
              WHEN THE CAR<br />
              SLOWS DOWN,<br />
              <span className="red">WE FIND OUT WHY.</span>
            </h1>

            <div className="home-hero-sub">
              ISOLATE TRUE TYRE DEGRADATION.<br />
              PREDICT WHAT COMES NEXT.
            </div>

            <div className="home-hero-physics">
              PHYSICS <span className="plus">+</span> AI
            </div>

            <div className="home-hero-tdr">TYRE DEGRADATION INTELLIGENCE</div>

            <div className="home-cta-row">
              <button
                className="home-cta home-cta--primary"
                onClick={() => onNavigate?.('phyengine', '3d')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                EXPLORE THE DIGITAL TWIN
              </button>
              <button className="home-cta" onClick={scrollToVideo}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                WATCH THE SYSTEM
              </button>
            </div>
          </div>
        </div>

        {/* Telemetry overlays */}
        <div className={`home-telemetry-overlays ${introPhase >= 3 ? 'visible' : ''}`}>
          <div className="home-telem-item vel">
            <div className="home-telem-label">VELOCITY</div>
            <div className="home-telem-value">{velocity}<span className="home-telem-unit">KM/H</span></div>
          </div>
          <div className="home-telem-item temp">
            <div className="home-telem-label">TYRE TEMP</div>
            <div className="home-telem-value">{tyreTemp}<span className="home-telem-unit">°C</span></div>
          </div>
          <div className="home-telem-item grip">
            <div className="home-telem-label">GRIP</div>
            <div className="home-telem-value">{grip}<span className="home-telem-unit">%</span></div>
          </div>
          <div className="home-telem-item wear">
            <div className="home-telem-label">WEAR</div>
            <div className="home-telem-value">{wear}<span className="home-telem-unit">%</span></div>
          </div>
          <div className="home-telem-item health">
            <div className="home-telem-label">TYRE HEALTH</div>
            <div className="home-telem-value">{tyreHealth}<span className="home-telem-unit">%</span></div>
          </div>
        </div>

        {/* Bottom scroll indicator */}
        {introPhase >= 4 && (
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 opacity-40 animate-bounce"
            style={{ animationDuration: '2.5s' }}
          >
            <span className="font-mono text-[9px] tracking-[0.4em] text-white/50 uppercase">Scroll</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════ */}
      {/*  DIVIDER                                    */}
      {/* ════════════════════════════════════════════ */}
      <div className="home-divider" />

      {/* ════════════════════════════════════════════ */}
      {/*  3. VIDEO — "WHY TDR?"                      */}
      {/* ════════════════════════════════════════════ */}

      <section ref={videoSecRef} className="home-section">
        <div className="home-section-inner">
          <div className={`home-reveal ${videoInView ? 'in-view' : ''}`}>
            <div className="home-sec-label">PROJECT BRIEFING</div>
            <h2 className="home-sec-heading">WHY TDR?</h2>
            <p className="home-sec-sub">
              UNDERSTANDING THE ENGINEERING CHALLENGE BEHIND REAL-TIME TYRE DEGRADATION INTELLIGENCE
            </p>
          </div>

          <div className={`home-video-frame home-reveal ${videoInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.3s' }}>
            {/* Technical corner labels */}
            <span className="home-video-label tl">REC ● 001</span>
            <span className="home-video-label tr">TGR × F1</span>
            <span className="home-video-label bl">PROJECT EXPLANATION</span>
            <span className="home-video-label br">CLASSIFIED</span>

            {/* Scan line */}
            <div className="home-video-scanline" />

            <video
              ref={videoRef}
              src="/front.mp4"
              playsInline
              muted
              loop
              preload="metadata"
              style={{ display: 'block', width: '100%' }}
              onPlay={() => setVideoPlaying(true)}
            />

            {/* Play overlay (shown until video plays) */}
            {!videoPlaying && (
              <div className="home-video-play-overlay" onClick={handlePlayVideo}>
                <div className="home-play-btn">
                  <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                </div>
                <span className="home-play-label">PLAY PROJECT EXPLANATION</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="home-divider" />

      {/* ════════════════════════════════════════════ */}
      {/*  4. PROBLEM — "THE CAR IS SLOWER"           */}
      {/* ════════════════════════════════════════════ */}

      <section ref={problemSecRef} className="home-section">
        <div className="home-section-inner" style={{ textAlign: 'center' }}>
          <div className={`home-reveal ${problemInView ? 'in-view' : ''}`}>
            <div className="home-sec-label" style={{ justifyContent: 'center' }}>THE CHALLENGE</div>
            <h2 className="home-sec-heading" style={{ margin: '0 auto 8px' }}>
              THE CAR IS <span style={{ color: '#e10600' }}>SLOWER.</span>
            </h2>
            <p className="home-sec-sub" style={{ margin: '0 auto', textAlign: 'center' }}>
              BUT WHAT CAUSED IT?
            </p>
          </div>

          <div className="home-equation">
            <div className="home-eq-main">
              OBSERVED LAP TIME LOSS
            </div>

            <div className="home-eq-equals">=</div>

            <div className="home-eq-factors">
              {factors.map((f, i) => (
                <React.Fragment key={f.label}>
                  {i > 0 && <span className="home-eq-plus">+</span>}
                  <div
                    className={`home-eq-factor ${equationStep > i ? 'in-view' : ''} ${f.isTyre ? 'tyre' : ''} ${equationConfused && !f.isTyre ? 'confused' : ''}`}
                    style={{ transitionDelay: `${i * 0.15}s` }}
                  >
                    {f.label}
                  </div>
                </React.Fragment>
              ))}
            </div>

            <div className={`home-eq-question ${equationConfused ? 'in-view' : ''}`}>
              A SLOWER LAP ≠ TYRE DEGRADATION
            </div>
          </div>
        </div>
      </section>

      <div className="home-divider" />

      {/* ════════════════════════════════════════════ */}
      {/*  5. DIGITAL TWIN — "REMOVE WHAT WE KNOW"   */}
      {/* ════════════════════════════════════════════ */}

      <section ref={twinSecRef} className="home-section">
        <div className="home-section-inner" style={{ textAlign: 'center' }}>
          <div className={`home-reveal ${twinInView ? 'in-view' : ''}`}>
            <div className="home-sec-label" style={{ justifyContent: 'center' }}>PHYENGINE</div>
            <h2 className="home-sec-heading" style={{ margin: '0 auto 8px' }}>
              REMOVE WHAT WE <span style={{ color: '#e10600' }}>ALREADY KNOW.</span>
            </h2>
            <p className="home-sec-sub" style={{ margin: '0 auto', textAlign: 'center' }}>
              PHYSICS-BASED DIGITAL TWIN
            </p>
          </div>

          <div className={`home-twin-flow home-reveal ${twinInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.3s' }}>
            {/* Variables flowing into twin */}
            <div className="home-twin-row">
              {['FUEL', 'TRAFFIC', 'TRACK', 'TEMP', 'LOAD'].map((v) => (
                <div key={v} className="home-twin-box">{v}</div>
              ))}
            </div>

            <div className="home-twin-arrow">↓</div>

            <div className="home-twin-box highlight" style={{ minWidth: '200px' }}>
              PHYSICS ENGINE
            </div>

            <div className="home-twin-arrow">↓</div>

            {/* Equation */}
            <div className="home-twin-row">
              <div className="home-twin-box highlight">ACTUAL PERFORMANCE</div>
              <div className="home-twin-minus">−</div>
              <div className="home-twin-box highlight">EXPECTED PERFORMANCE</div>
            </div>

            <div className="home-twin-arrow">=</div>

            <div className="home-twin-box residual">
              RESIDUAL SIGNAL
            </div>
          </div>

          <div className="home-sec-cta">
            <button
              className="home-cta home-cta--primary"
              onClick={() => onNavigate?.('phyengine', '3d')}
            >
              OPEN PHYENGINE
            </button>
          </div>
        </div>
      </section>

      <div className="home-divider" />

      {/* ════════════════════════════════════════════ */}
      {/*  6. SYSTEM HEALTH — 4-CORNER PREVIEW        */}
      {/* ════════════════════════════════════════════ */}

      <section ref={healthSecRef} className="home-section">
        <div className="home-section-inner" style={{ textAlign: 'center' }}>
          <div className={`home-reveal ${healthInView ? 'in-view' : ''}`}>
            <div className="home-sec-label" style={{ justifyContent: 'center' }}>SYSTEM HEALTH</div>
            <h2 className="home-sec-heading" style={{ margin: '0 auto 8px' }}>
              KNOW THE TYRE.<br />
              <span style={{ color: '#e10600' }}>KNOW THE CAR.</span>
            </h2>
          </div>

          <div className={`home-health-grid home-reveal ${healthInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.3s' }}>
            {([
              { corner: 'FRONT LEFT', temp: '104°C', wear: '18%', grip: '91%', cliff: 'LAP 38' },
              { corner: 'FRONT RIGHT', temp: '108°C', wear: '21%', grip: '87%', cliff: 'LAP 35' },
              { corner: 'REAR LEFT', temp: '97°C', wear: '14%', grip: '93%', cliff: 'LAP 42' },
              { corner: 'REAR RIGHT', temp: '101°C', wear: '17%', grip: '89%', cliff: 'LAP 39' },
            ] as const).map((c) => (
              <div key={c.corner} className="home-health-card">
                <div className="home-health-corner">{c.corner}</div>
                <div className="home-health-metrics">
                  <div className="home-health-metric">
                    <span className="home-health-metric-label">SURFACE TEMP</span>
                    <span className="home-health-metric-value">{c.temp}</span>
                  </div>
                  <div className="home-health-metric">
                    <span className="home-health-metric-label">WEAR LEVEL</span>
                    <span className="home-health-metric-value">{c.wear}</span>
                  </div>
                  <div className="home-health-metric">
                    <span className="home-health-metric-label">AVAILABLE GRIP</span>
                    <span className="home-health-metric-value">{c.grip}</span>
                  </div>
                  <div className="home-health-metric">
                    <span className="home-health-metric-label">CLIFF HORIZON</span>
                    <span className="home-health-metric-value" style={{ color: '#e10600' }}>{c.cliff}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {healthInView && (
            <div className="home-health-badge" style={{ margin: '24px auto 0', display: 'inline-flex' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              4 CORNERS SYNCHRONIZED
            </div>
          )}

          <div className="flex flex-col items-center gap-2 mt-6">
            <div className="flex gap-6">
              <div className="text-center">
                <div className="font-mono text-[8px] tracking-[0.2em] text-[#555] uppercase">ESTIMATED CLIFF</div>
                <div className="font-mono text-lg font-bold text-[#e10600]">LAP 35</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[8px] tracking-[0.2em] text-[#555] uppercase">OPTIMAL PIT WINDOW</div>
                <div className="font-mono text-lg font-bold text-white">LAP 31 — 34</div>
              </div>
            </div>
          </div>

          <div className="home-sec-cta">
            <button
              className="home-cta home-cta--primary"
              onClick={() => onNavigate?.('health')}
            >
              VIEW SYSTEM HEALTH
            </button>
          </div>
        </div>
      </section>

      <div className="home-divider" />

      {/* ════════════════════════════════════════════ */}
      {/*  7. AI PREDICTION                           */}
      {/* ════════════════════════════════════════════ */}

      <section ref={aiSecRef} className="home-section">
        <div className="home-section-inner" style={{ textAlign: 'center' }}>
          <div className={`home-reveal ${aiInView ? 'in-view' : ''}`}>
            <div className="home-sec-label" style={{ justifyContent: 'center' }}>TEMPORAL AI</div>
            <h2 className="home-sec-heading" style={{ margin: '0 auto 8px' }}>
              WHAT HAPPENS <span style={{ color: '#e10600' }}>NEXT?</span>
            </h2>
            <p className="home-sec-sub" style={{ margin: '0 auto', textAlign: 'center' }}>
              THE RESIDUAL SIGNAL ENTERS A TEMPORAL AI SYSTEM
            </p>
          </div>

          {/* Lap flow */}
          <div className={`home-flow home-reveal ${aiInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.3s' }}>
            {['LAP 1', 'LAP 2', 'LAP 3', 'LAP 4', 'LAP 5'].map((l, i) => (
              <React.Fragment key={l}>
                {i > 0 && <span className="home-flow-arrow">→</span>}
                <div className="home-flow-node">{l}</div>
              </React.Fragment>
            ))}
            <span className="home-flow-arrow">→</span>
            <div className="home-flow-node active">AI</div>
          </div>

          {/* Degradation curve chart */}
          <div className={`home-chart-container home-reveal ${aiInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.5s' }}>
            <svg className="home-chart-svg" viewBox="0 0 800 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e10600" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#e10600" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid */}
              {[40, 80, 120, 160].map((y) => (
                <line key={y} x1="0" y1={y} x2="800" y2={y} className="home-chart-grid-line" />
              ))}

              {/* Prediction zone */}
              <rect x="500" y="0" width="300" height="200" className="home-chart-prediction-zone" />
              <text x="650" y="20" className="home-chart-axis-label" textAnchor="middle">PREDICTED</text>

              {/* Actual data (past) */}
              <path
                d="M0,180 C50,178 100,170 150,158 C200,145 250,130 300,118 C350,105 400,90 450,78 C500,68 500,68 500,68"
                className="home-chart-line"
              />

              {/* Area under actual */}
              <path
                d="M0,180 C50,178 100,170 150,158 C200,145 250,130 300,118 C350,105 400,90 450,78 C500,68 500,68 500,200 L0,200 Z"
                className="home-chart-area"
              />

              {/* Future prediction (dashed) */}
              <path
                d="M500,68 C550,58 600,45 650,35 C700,28 750,22 800,18"
                className="home-chart-line-future"
              />

              {/* Labels */}
              <text x="20" y="195" className="home-chart-axis-label">LAP 1</text>
              <text x="500" y="195" className="home-chart-axis-label">NOW</text>
              <text x="760" y="195" className="home-chart-axis-label">LAP 45</text>
              <text x="10" y="15" className="home-chart-axis-label">DEGRADATION</text>
            </svg>
          </div>

          {/* Prediction metrics */}
          <div className={`home-pred-metrics home-reveal ${aiInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.7s', margin: '30px auto 0' }}>
            <div className="home-pred-metric">
              <span className="home-pred-metric-label">CURRENT DEGRADATION</span>
              <span className="home-pred-metric-value red">0.042</span>
            </div>
            <div className="home-pred-metric">
              <span className="home-pred-metric-label">DEGRADATION RATE</span>
              <span className="home-pred-metric-value">0.008<span className="text-[10px] text-[#555] ml-1">/LAP</span></span>
            </div>
            <div className="home-pred-metric">
              <span className="home-pred-metric-label">EST. TYRE LIFE</span>
              <span className="home-pred-metric-value">14<span className="text-[10px] text-[#555] ml-1">LAPS</span></span>
            </div>
            <div className="home-pred-metric">
              <span className="home-pred-metric-label">CONFIDENCE</span>
              <span className="home-pred-metric-value" style={{ color: '#22c55e' }}>94%</span>
            </div>
          </div>

          <div className="home-sec-cta">
            <button
              className="home-cta home-cta--primary"
              onClick={() => onNavigate?.('info')}
            >
              EXPLORE RACE INSIGHTS
            </button>
          </div>
        </div>
      </section>

      <div className="home-divider" />

      {/* ════════════════════════════════════════════ */}
      {/*  8. RACE STRATEGY                           */}
      {/* ════════════════════════════════════════════ */}

      <section ref={raceSecRef} className="home-section">
        <div className="home-section-inner" style={{ textAlign: 'center' }}>
          <div className={`home-reveal ${raceInView ? 'in-view' : ''}`}>
            <div className="home-sec-label" style={{ justifyContent: 'center' }}>RACE DECISION</div>
            <h2 className="home-sec-heading" style={{ margin: '0 auto 8px' }}>
              OPTIMAL <span style={{ color: '#e10600' }}>PIT WINDOW</span>
            </h2>
          </div>

          {/* Timeline */}
          <div className={`home-timeline home-reveal ${raceInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.3s' }}>
            {[
              { lap: 20, optimal: false },
              { lap: 25, optimal: false },
              { lap: 30, optimal: false },
              { lap: 31, optimal: true },
              { lap: 32, optimal: true },
              { lap: 33, optimal: true },
              { lap: 34, optimal: true },
              { lap: 35, optimal: false },
              { lap: 40, optimal: false },
            ].map((item) => (
              <div key={item.lap} className="home-timeline-lap">
                <div className={`home-timeline-bar ${item.optimal ? 'optimal' : ''}`} />
                <span className={`home-timeline-label ${item.optimal ? 'optimal' : ''}`}>
                  L{item.lap}
                </span>
              </div>
            ))}
          </div>

          <div className="home-pit-window" style={{ alignItems: 'center' }}>
            <div className={`home-pit-badge home-reveal ${raceInView ? 'in-view' : ''}`}
                 style={{ transitionDelay: '0.6s' }}>
              OPTIMAL PIT WINDOW — LAP 31 — 34
            </div>
          </div>

          {/* DATA → PHYSICS → AI → DECISION flow */}
          <div className={`home-flow home-reveal ${raceInView ? 'in-view' : ''}`}
               style={{ transitionDelay: '0.8s', marginTop: '40px' }}>
            {['DATA', 'PHYSICS', 'AI', 'DECISION'].map((n, i) => (
              <React.Fragment key={n}>
                {i > 0 && <span className="home-flow-arrow">→</span>}
                <div className={`home-flow-node ${i === 3 ? 'active' : ''}`}>{n}</div>
              </React.Fragment>
            ))}
          </div>

          <div className="home-sec-cta">
            <button
              className="home-cta home-cta--primary"
              onClick={() => onNavigate?.('info')}
            >
              ENTER RACE INSIGHTS
            </button>
          </div>
        </div>
      </section>

      <div className="home-divider" />

      {/* ════════════════════════════════════════════ */}
      {/*  9. FINAL HERO                              */}
      {/* ════════════════════════════════════════════ */}

      <section ref={finalSecRef} className="home-final">
        {/* Motion streaks */}
        <div className="home-final-streaks">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="home-final-streak"
              style={{
                top: `${15 + i * 14}%`,
                width: `${30 + i * 8}%`,
                animationDelay: `${i * 1.3}s`,
                animationDuration: `${6 + i * 1.5}s`,
              }}
            />
          ))}
        </div>

        <div className={`home-reveal ${finalInView ? 'in-view' : ''}`}
             style={{ zIndex: 2, position: 'relative' }}>
          <h2 className="home-final-heading">
            FROM TELEMETRY<br />
            TO <span style={{ color: '#e10600' }}>RACE DECISION.</span>
          </h2>

          <div className="home-final-brand">TGR × F1</div>
          <div className="home-final-tdr">TYRE DEGRADATION INTELLIGENCE</div>

          <button
            className="home-cta home-cta--primary"
            onClick={() => onNavigate?.('info')}
          >
            ENTER RACE INSIGHTS
          </button>
        </div>

        {/* Logo at bottom */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-30 z-10">
          <img src="/logo.png" alt="TGR × F1" className="h-10 w-auto object-contain" />
        </div>
      </section>
    </div>
  );
};
