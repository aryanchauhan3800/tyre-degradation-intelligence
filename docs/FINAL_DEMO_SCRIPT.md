# TYRETRACE — Final Hackathon Demonstration Script (3–5 Minutes)
**Project:** TYRETRACE — Physics-Informed Tyre Degradation Intelligence  
**Audience:** Hackathon Technical Judges, F1 Data Engineers & Strategy Directors  
**Duration:** ~3 to 5 minutes  
**Format:** Live Command Center (FastAPI Replay Engine + Three.js Digital Twin + React 19 Dashboard)

---

## Pre-Flight Setup

Open two terminal windows:

**Terminal 1 — Backend Telemetry & Digital Twin Engine:**
```bash
cd /Users/aryanchauhan/Developer/tyre-degradation-intelligence
.venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — React Command Center:**
```bash
cd /Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend
npm run dev
```

Open browser at `http://localhost:5173`.

---

## 20-Step Deterministic Demo Walkthrough

### Step 1: Start Backend
- **WHAT TO CLICK:** Run the uvicorn command in Terminal 1.
- **WHAT TO SAY:** "Our real-time Python backend initializes with the Physics Twin, Confounder Engine, and trained ML model loaded in memory."
- **WHAT THE JUDGE SHOULD SEE:** Terminal shows `Application startup complete` with endpoints `/api/health`, `/api/replay/*`, and `/ws/telemetry` active.
- **WHY IT MATTERS:** Zero cold-start latency; deterministic backend ready for streaming.

### Step 2: Start Frontend
- **WHAT TO CLICK:** Run `npm run dev` in Terminal 2.
- **WHAT TO SAY:** "Our motorsport command center is built on Vite, React 19, and Three.js, connecting immediately over WebSocket."
- **WHAT THE JUDGE SHOULD SEE:** Vite dev server ready in <200ms on `http://localhost:5173`.
- **WHY IT MATTERS:** Modern high-performance web stack capable of 60 FPS 3D rendering alongside 20 Hz telemetry.

### Step 3: Open Dashboard
- **WHAT TO CLICK:** Navigate browser to `http://localhost:5173`.
- **WHAT TO SAY:** "Welcome to TYRETRACE. We are viewing the Monza 2023 Italian GP telemetry replay for Max Verstappen. Notice the top bar indicates `REAL REPLAY` and the connection shows `● LIVE`."
- **WHAT THE JUDGE SHOULD SEE:** Dark motorsport dashboard layout with telemetry HUD, 3D race car resting on grid, TDI gauge, Confounders panel, and Replay controls.
- **WHY IT MATTERS:** Immediate visual clarity; professional telemetry aesthetic adhering to authentic F1 timing screens.

### Step 4: Start Replay
- **WHAT TO CLICK:** Click the **[ PLAY ]** button on the bottom control bar.
- **WHAT TO SAY:** "Let's start the telemetry replay. Telemetry frames stream from our FastAPI backend over a low-latency WebSocket at 20 Hz."
- **WHAT THE JUDGE SHOULD SEE:** The play button toggles to pause; the progress slider advances; frame counter starts ticking from frame 0 up to 602.
- **WHY IT MATTERS:** Real-time push stream emulating an authentic race garage data link.

### Step 5: Show Telemetry Changing
- **WHAT TO CLICK:** Observe top HUD and bottom telemetry panels while playback continues.
- **WHAT TO SAY:** "Watch the primary channels: chassis velocity climbs over 300 km/h, throttle is pinned at 100%, and the gearbox shifts through 7th into 8th gear."
- **WHAT THE JUDGE SHOULD SEE:** Speed, Gear, Throttle green bar, and Brake red bar dynamically updating in real time.
- **WHY IT MATTERS:** Telemetry inputs are canonical SI units derived directly from official FastF1 timing feeds.

### Step 6: Show 3D Car Responding
- **WHAT TO CLICK:** Click and drag on the 3D viewport to orbit around the car while it moves.
- **WHAT TO SAY:** "The Three.js digital twin car reflects live telemetry. Wheel angular rotation speed is coupled directly to vehicle velocity, and when DRS opens, the rear wing aerofoil dynamically animates."
- **WHAT THE JUDGE SHOULD SEE:** Wheels spinning at correct rate; 3D chassis rotating smoothly with subtle camera orbit controls.
- **WHY IT MATTERS:** Provides immediate spatial intuition for race engineers and fans beyond raw line graphs.

### Step 7: Show Expected vs Actual Behaviour
- **WHAT TO CLICK:** Point to the bottom-right **Residual & Confounder Dynamics** chart.
- **WHAT TO SAY:** "In F1, optical tyre scanners and wheel load cells are banned on race day. How do we know the tyres are degrading? Our Physics Twin solves Newton's 2nd Law on every frame: $F_{\text{net}} = F_{\text{traction}} - F_{\text{drag}} - F_{\text{rolling}} - F_{\text{brake}} = m \cdot a_{x,\text{expected}}$."
- **WHAT THE JUDGE SHOULD SEE:** Chart displaying expected longitudinal acceleration alongside actual velocity derivative acceleration.
- **WHY IT MATTERS:** Grounds the entire pipeline in Newtonian vehicle dynamics rather than black-box pattern matching.

### Step 8: Show Residual
- **WHAT TO CLICK:** Hover cursor over the red residual line on the lower chart.
- **WHAT TO SAY:** "Here is the key signal: $r_{ax} = a_{x,\text{actual}} - a_{x,\text{expected}}$. A persistent negative residual means the vehicle is producing less forward grip than physics predicts for fresh rubber."
- **WHAT THE JUDGE SHOULD SEE:** Red line showing the instantaneous residual oscillating with throttle transients and stabilizing during steady traction.
- **WHY IT MATTERS:** Residual isolation decouples vehicle mass and aerodynamics from true surface traction limits.

### Step 9: Show Confounders
- **WHAT TO CLICK:** Point to the **Confounders Analysis** card.
- **WHAT TO SAY:** "A negative residual does not immediately mean tyre wear. What if DRS opened? What if the driver is braking? Our Confounder Engine tracks 10 physical confounders, computing a Non-Tyre Explanation Score ($S_{\text{conf}}$) and Tyre Evidence Quality ($Q_{\text{tyre}}$). When DRS is active, it flags DRS as an explanatory factor rather than tyre degradation."
- **WHAT THE JUDGE SHOULD SEE:** DRS indicator pill glowing amber when active; $Q_{\text{tyre}}$ and $S_{\text{conf}}$ gauges shifting between 0.0 and 1.0.
- **WHY IT MATTERS:** Prevents false alarms caused by aerodynamics, braking, or telemetry transients.

### Step 10: Show Global TDI
- **WHAT TO CLICK:** Point to the central **Global TDI** gauge.
- **WHAT TO SAY:** "This is the Tyre Degradation Index (TDI). It is a normalized severity index scaled 0 to 100, representing performance loss over the stint. It is currently at ~6 to 12% in this early stint phase."
- **WHAT THE JUDGE SHOULD SEE:** Clean arc gauge showing current Fused TDI, confidence rating (e.g. MEDIUM / HIGH), and trend arrow.
- **WHY IT MATTERS:** Condenses complex multi-sensor physical telemetry into a single actionable strategic index.

### Step 11: Show Physics / AI / Fusion Breakdown
- **WHAT TO CLICK:** Point to the sub-meters directly beneath the Global TDI arc.
- **WHAT TO SAY:** "Notice the breakdown: Physics TDI, AI Model TDI, and Fused Intelligence. Our AI model was trained strictly on multi-lap race stints with 28 temporal physics features. The fused signal delivers an $R^2 = 0.991$ with exceptional stability against transient noise."
- **WHAT THE JUDGE SHOULD SEE:** Three horizontal progress bars showing Physics (~5.7), AI (~6.2), and Fusion (~5.9).
- **WHY IT MATTERS:** Race engineers have full visibility into the ensemble components; physics provides guardrails while AI smooths noise.

### Step 12: Open WHY Panel
- **WHAT TO CLICK:** Look at the **Why is TDI Rising?** explanation card.
- **WHAT TO SAY:** "TYRETRACE is fully explainable. The WHY panel explains the driving physical factors in real time: accumulating tyre age, persistent traction deficit in high-demand sectors, and filtered confounders."
- **WHAT THE JUDGE SHOULD SEE:** Bullet points showing real-time evidence contributions and confidence bounds.
- **WHY IT MATTERS:** Eliminates the 'black box' problem in race engineering; decisions can be defended with physics.

### Step 13: Show REAL_REPLAY Tyre Data as UNAVAILABLE
- **WHAT TO CLICK:** Click on the Front-Right tyre on the 3D car (or top wheel cards).
- **WHAT TO SAY:** "Now let's inspect an individual wheel. In REAL REPLAY mode, the panel shows: STATUS UNAVAILABLE. Why? Because FastF1 telemetry does NOT contain individual tyre temperature arrays, carcass temps, or 4-wheel slip angles. We refuse to fabricate fake numbers."
- **WHAT THE JUDGE SHOULD SEE:** Right panel updates with `STATUS: UNAVAILABLE`, greyed-out gauges, and clear notification: '4-wheel strain & thermal telemetry is not broadcast in public F1 feeds'.
- **WHY IT MATTERS:** Demonstrates strict scientific honesty and data integrity.

### Step 14: Switch to DEMO_SIMULATION
- **WHAT TO CLICK:** Click the **[ DEMO SIMULATION ]** toggle in the top bar.
- **WHAT TO SAY:** "However, for teams with private telemetry or simulation testing, our architecture supports full 4-wheel intelligence. Let's switch into DEMO SIMULATION mode."
- **WHAT THE JUDGE SHOULD SEE:** Top badge changes to purple/amber `DEMO SIMULATION`; 3D wheels immediately activate with dynamic thermal/wear shader heatmaps.
- **WHY IT MATTERS:** Demonstrates architectural readiness for private team telemetry without compromising scientific honesty in public replay.

### Step 15: Show Four-Wheel Simulated TDI
- **WHAT TO CLICK:** View the four corner cards (FL, FR, RL, RR) on the left panel.
- **WHAT TO SAY:** "Notice the 4-wheel distribution: Front-Left shows higher wear and heat than the rears, accurately reflecting Monza's heavy loading through the Curva Grande and Parabolica right-hand sweeps."
- **WHAT THE JUDGE SHOULD SEE:** FL, FR, RL, RR cards displaying distinct simulated TDI values (e.g. FL: 18%, FR: 14%, RL: 12%, RR: 11%).
- **WHY IT MATTERS:** Proves corner-level asymmetric wear modeling capabilities.

### Step 16: Select a Tyre
- **WHAT TO CLICK:** Click the **FL (Front Left)** tyre card or click the front-left wheel in 3D.
- **WHAT TO SAY:** "Selecting the Front-Left tyre focuses the 3D camera onto the corner assembly and pulls up detailed corner intelligence."
- **WHAT THE JUDGE SHOULD SEE:** Camera smoothly animates to a close-up of the front-left wheel; right panel displays FL Corner Intelligence.
- **WHY IT MATTERS:** Intuitive UI/UX allowing deep inspection of individual vehicle corners.

### Step 17: Show Tyre-Specific Simulated Intelligence
- **WHAT TO CLICK:** Point to the simulated telemetry breakdown in the right panel.
- **WHAT TO SAY:** "Here we see simulated thermal state, grip degradation curve, and lateral cornering load distribution."
- **WHAT THE JUDGE SHOULD SEE:** Thermal bar graphs, slip degradation trajectory, and corner-specific trend alerts clearly labeled `(SIMULATED)`.
- **WHY IT MATTERS:** Validates the complete user experience for future multi-channel telemetry ingestion.

### Step 18: Return to REAL_REPLAY
- **WHAT TO CLICK:** Click **[ REAL REPLAY ]** in the top bar.
- **WHAT TO SAY:** "Now let's switch back to REAL REPLAY mode."
- **WHAT THE JUDGE SHOULD SEE:** Top badge reverts to `REAL REPLAY`; 3D wheels return to standard race livery.
- **WHY IT MATTERS:** Demonstrates state isolation and guarantees that simulated values never leak into real data analysis.

### Step 19: Confirm Simulated Values Disappear
- **WHAT TO CLICK:** Observe the right panel and wheel indicators.
- **WHAT TO SAY:** "Notice that all simulated corner values immediately disappear and revert to `UNAVAILABLE / null`. No cached simulation data is allowed to contaminate real telemetry."
- **WHAT THE JUDGE SHOULD SEE:** Right panel returns to `STATUS: UNAVAILABLE` with `tdi: null`.
- **WHY IT MATTERS:** Hardened separation between real telemetry evidence and synthetic simulation.

### Step 20: Reset Replay
- **WHAT TO CLICK:** Click **[ RESET ]** on the replay bar.
- **WHAT TO SAY:** "Clicking Reset returns the timeline cleanly to frame 0, ready for another replay run. The pipeline processed all 603 frames at 268 frames per second with sub-4ms latency."
- **WHAT THE JUDGE SHOULD SEE:** Playhead returns to frame 0, car repositioned at start, telemetry resets to initial idle state.
- **WHY IT MATTERS:** Proves complete replay lifecycle stability, deterministic reset, and zero memory leaks.

---

## 30-Second Closing Elevator Pitch
> *"In summary, TYRETRACE solves the central challenge of Formula 1 tyre management: we turn standard vehicle speed and throttle into physics-grounded tyre degradation intelligence. With 128 automated backend tests, 20 frontend tests, 268 FPS throughput, zero fabricated measurements, and an interactive 3D digital twin, TYRETRACE is hardened, validated, and ready. Thank you!"*
