# PHASE 6 REPORT — TYRE DEGRADATION INDEX (TDI) ENGINE

**Project**: TYRETRACE — Physics-Informed Tyre Degradation Intelligence  
**Phase**: 6 — Deterministic Tyre Degradation Index (TDI) Engine  
**Status**: COMPLETED & VALIDATED  
**Date**: 2026-09-08  

---

## 1. Executive Summary

Phase 6 implements the deterministic, explainable **Tyre Degradation Index (TDI)** engine for TYRETRACE. The engine translates qualified residuals and confounder evaluations from Phase 5 into an inferred degradation severity index:

$$\text{TDI} \in [0, 100]$$

In accordance with strict scientific boundaries:
- **No deep learning, LSTM, or black-box neural networks** were implemented.
- **No unmeasured telemetry signals were fabricated** (tyre temperature, pressure, slip angle, slip ratio, vertical wheel load, and corner-specific measurements remain explicitly `None`/`UNAVAILABLE`).
- **TDI is an inferred index**, not physical tread depth, remaining tyre life in millimetres, physical rubber loss, failure probability, or guaranteed failure prediction.
- All weights and state thresholds are explicitly labelled: `MODEL PARAMETER — DEMO ASSUMPTION`.

---

## 2. Core Architectural Separation

The TYRETRACE pipeline enforces strict physical separation between three core variables:

| Variable | Engine Source | Physical / Operational Definition | Range |
| :--- | :--- | :--- | :--- |
| **Raw Residual** ($r_{ax}$) | Phase 4 Residual Engine | Discrepancy between actual vehicle longitudinal acceleration and first-principles physics twin prediction ($a_{x,\text{actual}} - a_{x,\text{expected}}$). | $(-\infty, +\infty)\text{ m/s}^2$ |
| **Tyre Evidence Quality** ($Q_{\text{tyre}}$) | Phase 5 Confounder Engine | Observational suitability of the current telemetry sample for tyre wear inference, penalizing aero, braking, transient, and data anomalies. | $[0.0, 1.0]$ |
| **Tyre Degradation Index** ($\text{TDI}$) | Phase 6 TDI Engine | Inferred degradation severity index synthesizing residual magnitude, persistence, trend trajectory, tyre age, and evidence quality. | $[0.0, 100.0]$ |

> [!IMPORTANT]
> These three variables are never collapsed into a single metric. A large residual does not imply degradation if confounders are dominant; conversely, high evidence quality does not imply degradation if residuals are zero.

---

## 3. Mathematical Formulation of TDI

The TDI calculation is entirely transparent, deterministic, and modular.

### 3.1 Normalized Component Scores $[0.0, 1.0]$

| Component | Variable | Mathematical Definition | Thresholds & Parameters | Label |
| :--- | :--- | :--- | :--- | :--- |
| **A. Residual Severity** | $S_{\text{res}}$ | $\min\left(1.0, \frac{\|r_{ax}\|}{S_{\text{thresh}}}\right)$ | $S_{\text{thresh}} = 3.0\text{ m/s}^2$ | Robust scaling threshold |
| **B. Persistence** | $S_{\text{pers}}$ | $\text{ratio of frames exceeding } \tau_{\text{res}} \text{ in window}$ | Rolling window ratio in $[0, 1]$ | Feature from Phase 4/5 |
| **C. Degradation Trend** | $S_{\text{trend}}$ | $\min\left(1.0, \frac{\max(0.0, \text{slope})}{0.5}\right) \times C_{\text{trend}}$ | Minimum 5 samples; non-positive slope = 0 | MODEL PARAMETER — DEMO ASSUMPTION |
| **D. Tyre Age** | $S_{\text{age}}$ | Discrete age mapping from FastF1 `TyreLife` (laps) | NEW (0–3): 0.0<br>EARLY (4–10): 0.2<br>MID (11–20): 0.5<br>LATE (21–30): 0.8<br>EXTREME (>30): 1.0<br>UNKNOWN: 0.0 | MODEL PARAMETER — DEMO ASSUMPTION |
| **E. Evidence Quality** | $S_{\text{ev}}$ | Direct pass-through of `tyre_evidence_quality` | Phase 5 output in $[0, 1]$ | Normalized telemetry suitability |
| **F. Confounder Penalty** | $S_{\text{conf}}$ | Direct pass-through of `non_tyre_explanation_score` | Phase 5 output in $[0, 1]$ | Confounder explanatory weight |

### 3.2 Evidence Weighting & Confounder Attenuation

$$\text{Raw Evidence} = w_1 S_{\text{res}} + w_2 S_{\text{pers}} + w_3 S_{\text{trend}} + w_4 S_{\text{age}} + w_5 S_{\text{ev}}$$

Where component weights sum to 1.00:
- $w_1 (\text{Residual Severity}) = 0.25$
- $w_2 (\text{Persistence}) = 0.25$
- $w_3 (\text{Trend}) = 0.15$
- $w_4 (\text{Tyre Age}) = 0.20$
- $w_5 (\text{Evidence Quality}) = 0.15$

**Confounder Attenuation**:
$$\text{Qualified Score} = \text{Raw Evidence} \times \left(1.0 - 0.70 \times S_{\text{conf}}\right)$$

**Clamping to TDI**:
$$\text{TDI} = \text{clamp}(100 \times \text{Qualified Score}, 0.0, 100.0)$$

### 3.3 Confidence Metric $[0.0, 1.0]$

Confidence measures operational reliability and observation suitability:

$$\text{Confidence} = S_{\text{ev}} \times \left(1.0 - 0.5 \times S_{\text{conf}}\right) \times F_{\text{samples}} \times F_{\text{age}}$$

Where:
- $F_{\text{samples}} = \min\left(1.0, \frac{N}{N_{\min}}\right)$ ($N_{\min} = 10$)
- $F_{\text{age}} = 1.0$ if tyre age is known, $0.8$ if unknown.

---

## 4. Degradation States & Trajectory Trends

### 4.1 Degradation States

| State | TDI Range | Engineering Interpretation |
| :--- | :--- | :--- |
| `HEALTHY_LOW_EVIDENCE` | $0.0 \le \text{TDI} \le 20.0$ | Operating near nominal baseline; no substantial wear discrepancy. |
| `EARLY_DEGRADATION` | $20.0 < \text{TDI} \le 40.0$ | Emerging discrepancies; early stint progression. |
| `MODERATE_DEGRADATION` | $40.0 < \text{TDI} \le 60.0$ | Persistent performance shortfall; noticeable pace degradation. |
| `HIGH_DEGRADATION` | $60.0 < \text{TDI} \le 80.0$ | Severe traction/braking deficit; pit window approaching. |
| `SEVERE_DEGRADATION` | $80.0 < \text{TDI} \le 100.0$ | Extreme performance drop-off or thermal/mechanical failure cliff. |

### 4.2 Trajectory Trends

- `STABLE`: Rolling smoothed trajectory change within $[-0.25, +0.25]$ points/step.
- `RISING`: Trajectory slope $> +0.25$ points/step over recent window.
- `FALLING`: Trajectory slope $< -0.25$ points/step over recent window.
- `SPIKE`: Transient single-frame deviation $\ge 25.0$ points above rolling median (damped by trajectory tracker).
- `UNKNOWN`: Window contains fewer than 5 samples.

---

## 5. Real Data Validation: 2023 Monza Qualifying (Max Verstappen)

The full pipeline was run on the official 2023 Italian Grand Prix Qualifying Lap 20 dataset:
$$\text{Telemetry} \longrightarrow \text{Residual Engine} \longrightarrow \text{Confounder Engine} \longrightarrow \text{TDI Engine}$$

### Session Summary Results

| Metric | Measured / Computed Value |
| :--- | :--- |
| **Total Frames** | 603 frames |
| **Total Laps** | 1 lap (Lap 20, Pole lap) |
| **Average TDI** | **5.60** |
| **Minimum TDI** | **0.00** |
| **Maximum TDI** | **15.88** |
| **Final TDI** | **4.97** |
| **Session Trend** | `STABLE` |
| **Overall Degradation State** | `HEALTHY_LOW_EVIDENCE` (100.0% of frames) |
| **Overall Confidence** | **0.221** |
| **Tyre Age Range** | (2 laps, 2 laps) — New Softs |
| **Average Evidence Quality** | 0.315 |
| **Average Non-Tyre Score** | 0.623 |

### Degradation State Breakdown

```
HEALTHY_LOW_EVIDENCE:  603 frames (100.0%)
EARLY_DEGRADATION   :    0 frames (  0.0%)
MODERATE_DEGRADATION:    0 frames (  0.0%)
HIGH_DEGRADATION    :    0 frames (  0.0%)
SEVERE_DEGRADATION  :    0 frames (  0.0%)
```

### Trajectory Trend Breakdown

```
STABLE :  519 frames ( 86.1%)
RISING :   48 frames (  8.0%)
FALLING:   32 frames (  5.3%)
UNKNOWN:    4 frames (  0.7%)
```

### Scientific Takeaway from Monza Validation

The validation confirms that the Phase 6 engine behaves with physical integrity:
1. On a fresh, 2-lap-old Soft tyre under qualifying conditions, the average TDI was **5.60 / 100**, correctly staying in `HEALTHY_LOW_EVIDENCE`.
2. The engine resisted false-positive degradation alerts despite high speeds ($>340\text{ km/h}$) and DRS activations.
3. Because non-tyre explanations were high (0.623) and tyre age was minimal (2 laps), the system reported an overall confidence of **0.221**, properly flagging uncertainty rather than false certainty.

---

## 6. Dynamic Explainability Output Sample

Frame #50 (straight line acceleration with DRS open):

```json
{
  "timestamp": 4452.111,
  "lap": 20,
  "distance_m": 644.47,
  "tdi": 5.12,
  "state": "HEALTHY_LOW_EVIDENCE",
  "confidence": 0.195,
  "trend": "STABLE",
  "components": {
    "residual_severity": 0.2777,
    "persistence": 0.0,
    "degradation_trend": 0.0,
    "tyre_age": 0.0,
    "evidence_quality": 0.3,
    "confounder_penalty": 0.7,
    "raw_evidence_score": 0.1144,
    "qualified_score": 0.0584
  },
  "raw_residual": -0.833,
  "tyre_evidence_quality": 0.3,
  "non_tyre_explanation_score": 0.7,
  "tyre_age_laps": 2,
  "compound": "SOFT",
  "stint": 7,
  "performance_impact_score": null,
  "evidence": [
    "No significant degradation evidence detected"
  ],
  "counter_evidence": [
    "Non-tyre confounder score (0.70) strongly attenuates degradation confidence",
    "Confounder active: DRS_ACTIVE",
    "Confounder active: HIGH_THROTTLE",
    "Confounder active: HIGH_SPEED",
    "Low tyre evidence quality (0.30) limits observation reliability",
    "Tyre set is fresh (2 laps old), reducing degradation likelihood"
  ],
  "provenance": "INFERRED / MODELLED"
}
```

---

## 7. Mandatory Scientific Limitations

The TYRETRACE engineering policy requires the following 12 limitations to be explicitly documented:

1. **TDI is an inferred index**: TDI is an intelligence indicator in $[0, 100]$ representing evidence of performance divergence, not a direct physical measurement.
2. **TDI is not tread depth**: TDI does not measure remaining rubber millimeters or physical wear depth.
3. **TDI is not a probability**: TDI is not a statistical failure probability or risk percentage.
4. **TDI is not physically calibrated yet**: Numerical thresholds are based on domain mechanics and require empirical tyre rig testing for absolute calibration.
5. **Demo weights are engineering assumptions**: The weights ($w_1=0.25, w_2=0.25, w_3=0.15, w_4=0.20, w_5=0.15$) are demo baseline assumptions (`MODEL PARAMETER — DEMO ASSUMPTION`).
6. **TyreLife is tyre age, not physical wear**: FastF1 `TyreLife` reflects elapsed laps, not actual mechanical or thermal rubber state.
7. **FastF1 telemetry omissions**: FastF1 does not record tyre pressure, surface/carcass temperature, wheel angular speed, or slip angles.
8. **Individual corner degradation is unavailable**: FastF1 does not provide per-corner telemetry; degradation cannot be partitioned between FL, FR, RL, and RR without multi-channel telemetry.
9. **Single-lap qualifying constraint**: Qualifying laps cannot demonstrate multi-lap tyre-age degradation trajectories; confidence must remain constrained.
10. **Residuals contain unmodelled vehicle dynamics**: Residuals reflect aero deflection, track grip shifts, and powertrain torque clipping in addition to tyre grip.
11. **Causal tyre attribution requires multi-lap validation**: Isolating tyre wear from setup or track evolution requires long-stint race data.
12. **Real deployment requires physical calibration**: Deployment in competition requires telemetry calibration against real tyre degradation logs and physical sensor benches.

---

## 8. Verification & Test Suite

All 74 unit and integration tests across Phases 1 through 6 pass deterministically without network dependencies:

```bash
.venv/bin/pytest -v
============================== 74 passed in 0.58s ==============================
```

The 20 dedicated Phase 6 tests verify:
1. Zero residual handling
2. Low residual handling
3. Persistent residual escalation
4. Increasing residual slope tracking
5. Decreasing residual handling
6. High confounder attenuation
7. Low confounder score preservation
8. New tyre handling
9. Old tyre score contribution
10. Missing tyre age fallback
11. Poor evidence quality dampening
12. High evidence quality handling
13. TDI clamping $[0.0, 100.0]$
14. Confidence calculation
15. Trajectory trend classification and spike suppression
16. Deterministic repeatability
17. Insufficient data handling
18. Dynamic explanation generation
19. Session aggregation
20. Lap aggregation
