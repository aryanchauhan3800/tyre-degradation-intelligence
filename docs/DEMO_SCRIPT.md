# TYRETRACE — Executive Command Center Demonstration Script
**Project:** TYRETRACE — Physics-Informed Tyre Degradation Intelligence  
**Target Audience:** F1 Race Engineers, Technical Directors, Software Judges  
**Target Duration:** 3 to 5 minutes  
**Mode:** Live Interactive Web Demonstration (FastAPI + Three.js + React)

---

## 0. Setup & Launch Instructions (Pre-Demo)

Open two terminal tabs:

**Terminal 1 — Real-Time API & Replay Gateway:**
```bash
cd /Users/aryanchauhan/Developer/tyre-degradation-intelligence
.venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — Command Center Frontend:**
```bash
cd /Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 1. Introduction & Mission Briefing (0:00 – 0:30)

> *"Welcome to TYRETRACE. In Formula 1, tyre degradation dictates race strategy, undercut windows, and track position. But teams face a fundamental physics dilemma: regulations ban real-time tyre tread depth, carcass temperature arrays, and wheel telemetry from being broadcast openly, and live telemetry feeds provide only chassis speed, throttle, brake, and engine RPM.*
>
> *TYRETRACE bridges this gap not with naive machine learning or guesswork, but through a multi-stage **Physics-Informed Digital Twin** that computes vehicle forces from first principles, extracts acceleration residuals, filters non-tyre confounders, and fuses deterministic physics with temporal AI."*

**Visual Action:**
- Point to the Top Bar: `2023 Italian GP — Race`, `Driver: VER`, `Data: REAL REPLAY`, `Connection: ● LIVE`.
- Point to the central 3D digital twin race car resting in the telemetry paddock.

---

## 2. Replay Initiation & Live Telemetry Stream (0:30 – 1:00)

> *"Let's initiate our live replay of Max Verstappen's stint at the 2023 Italian Grand Prix in Monza."*

**Visual Action:**
- Click **[ PLAY ]** on the bottom Replay Control Bar.
- Observe the timeline slider moving smoothly, telemetry frames streaming at 20 Hz via WebSocket (`/ws/telemetry`).
- Point out live telemetry readouts: Speed climbing past 310 km/h, Gear indicator shifting 7 $\to$ 8, throttle bar pinned at 100%, and 3D car wheels rotating coupled to instantaneous velocity.

---

## 3. The Digital Twin & Actual vs. Expected Residuals (1:00 – 1:45)

> *"How does TYRETRACE know the tyres are degrading if we cannot measure rubber thickness directly?*
>
> *On every telemetry frame, our **Physics Twin Engine** solves longitudinal vehicle dynamics:*
> $$\Sigma F_x = F_{\text{traction}} - F_{\text{drag}} - F_{\text{rolling}} - F_{\text{brake}} = m \cdot a_{x,\text{expected}}$$
> *Aerodynamic drag is computed dynamically with quadratic velocity scaling ($\frac{1}{2}\rho C_d A v^2$). When the driver applies 100% throttle out of Curva Parabolica, the engine expects a specific forward acceleration.*
>
> *Look at the bottom-right chart: **Residual & Confounder Dynamics**.*
> *The red curve is $r_{ax} = a_{x,\text{actual}} - a_{x,\text{expected}}$. A persistent deficit in longitudinal grip creates a persistent negative residual."*

---

## 4. Confounder Filtering & Evidence Quality (1:45 – 2:15)

> *"However, in motorsport, a negative residual does NOT always mean tyre wear. What if the driver opened DRS? What if they were hard on the brakes or hit a kerb transient?*
>
> *Look at the **Confounder Engine** panel in the center.*
> *Our deterministic rule engine monitors 10 physical confounders:*
> - **DRS:** Aerodynamic drag drastically drops, causing false acceleration spikes. Notice the 3D car's rear wing flap opens and DRS turns **ACTIVE** with amber illumination.
> - **BRAKING & TRANSIENTS:** High brake line pressure and rapid throttle releases attenuate the tyre wear signal.
>
> *The engine computes two calibrated scores:*
> - $S_{\text{conf}}$ (Non-Tyre Explanation): Quantifies how much of the residual is explainable by aerodynamics or braking.
> - $Q_{\text{tyre}}$ (Tyre Evidence Quality): High only when the car is in a clean traction or cornering regime where tyre grip is the dominant limiting factor."*

---

## 5. Global TDI: Physics, AI Baseline, and Fusion (2:15 – 3:00)

> *"Now look at the central hero card: **Global TDI Intelligence**.*
> *TYRETRACE produces three distinct indices:*
> 1. **Physics TDI:** A fully explainable, deterministic index derived from persistent residual magnitude and tyre age.
> 2. **AI Model TDI:** A Random Forest trained strictly on multi-lap race stints with temporal feature windows (28 physics-informed features, zero lap-overlap leakage).
> 3. **Fused Intelligence:** A balanced blend ($\alpha = 0.60$ Physics + $0.40$ AI) that delivers $R^2 = 0.991$ with exceptional stability against transient telemetry noise.
>
> *Notice the dynamic **'Why is TDI Rising?'** panel below.*
> *The system cites real-time evidence:*
> - $\checkmark$ Persistent negative residual across 5-second window
> - $\checkmark$ Tyre age accumulating in hard stint
> - $\checkmark$ High evidence quality ($Q_{\text{tyre}} > 0.70$)*"

---

## 6. Real-Data Integrity vs. Wheel-Level Interaction (3:00 – 3:45)

> *"Now let's inspect an individual wheel. Let's click on the Front Right tyre directly on the 3D car."*

**Visual Action:**
- Click on the **FR (Front Right)** tyre on the 3D model.
- Observe the camera smoothly animating from `CAMERA_OVERVIEW` to `CAMERA_TYRE_FR`.
- Point to the right-hand panel: **STATUS: UNAVAILABLE**.

> *"Notice what the dashboard displays: **UNAVAILABLE**.*
> *This is an essential scientific boundary of TYRETRACE. Commercial FastF1 telemetry simply does not have 4-wheel strain gauges or optical tread sensors. We refuse to fabricate fake numbers and pretend they came from Monza telemetry.*
>
> *However, our architecture is fully prepared for future 4-wheel telemetry. Let's switch to **DEMO SIMULATION** mode."*

**Visual Action:**
- Click **[ DEMO SIMULATION ]** in the Top Bar or on the prompt in the panel.
- Observe the 3D race car tyres instantly illuminate with thermal degradation heatmaps.
- Front Left (FL) shows elevated amber/red heat reflecting Monza's heavy continuous loading through Curva Grande and Parabolica.
- The right-hand panel updates with **CORNER TDI (SIMULATED)**, trend, confidence, and simulated corner evidence.
- Click **[ RESET CAM ]** to transition smoothly back to the full car overview.

---

## 7. Replay Scrubbing & Conclusion (3:45 – 4:30)

**Visual Action:**
- Click **[ 2x ]** or **[ 5x ]** to accelerate playback.
- Drag the timeline slider to scrub forward into Lap 24.
- Observe the TDI Trajectory chart zoom in and trace the progression of degradation into the moderate wear cliff.
- Click **[ PAUSE ]** to freeze a critical telemetry moment.

> *"In summary, TYRETRACE delivers:*
> 1. *Zero fabricated measurements — total transparency on data provenance.*
> 2. *Rigorous Newton force balances that make raw telemetry scientifically meaningful.*
> 3. *Confounder rejection that prevents aerodynamic changes from being mistaken for tyre wear.*
> 4. *A stunning, sub-millisecond, demo-ready 3D digital twin command center ready for team strategists and broadcast visualization.*
>
> *Thank you."*
