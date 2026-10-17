# PhyVolt AI — Retired EV Battery Circularity & Diagnostic Intelligence

PhyVolt AI is a production-grade software platform designed for rapid screening, safety triage, electrochemical pulse diagnostics, circularity decision support, and verifiable Digital Battery Passport generation for retired electric vehicle (EV) lithium-ion batteries.

```
ESP32 (Wi-Fi 1Hz)
    ↓  HTTP POST JSON
Backend API (Express :3000 & Flask :5000)
    ↓
Append-Only Storage & Validation (SQLite)
    ↓
Feature Extraction (Apparent Impedance, Recovery Ratio, dT/dt, Gas Deltas)
    ↓
Safety Software Engine (PASS / WARNING / ABORT / QUARANTINE)
    ↓
Hybrid Diagnostic Inference (Baseline & PyBaMM ECM Research Layer)
    ↓
Circularity Decision Engine (Second-Life / Refurbishment / Recycling / Quarantine)
    ↓
Tamper-Evident Digital Battery Passport (SHA-256 Bitstream Hash)
    ↓
Professional Dark Industrial Dashboard
```

---

## 1. The 5 Core Operational Questions Answered

1. **What battery is being tested?**  
   Standardized intake logging with serial ID, cell barcode, chemistry (`LFP`, `NMC`, `NCA`, `LTO`), form factor (Cylindrical, Prismatic, Pouch), nominal voltage & capacity, manufacturer, and dismantling source.
2. **Is it safe enough to test?**  
   A mandatory **10-Point Pre-Test Safety Checklist** (swelling, electrolyte leakage, casing integrity, contact cleanliness, temperature equilibrium, polarity, safe OCV range, chamber interlocks, hardware E-Stop, and sensor baselines) that prevents compromised cells from ever entering the pulse circuit.
3. **What did the pulse test reveal?**  
   Diagnostic pulse parameters:
   - Apparent pulse impedance: $R_{\text{pulse}} = \frac{\Delta V}{\Delta I}$ (e.g. $23.8\text{ m}\Omega$)
   - Dynamic voltage recovery ratio after 1s, 10s, 60s
   - Thermal rise & rate of change: $\Delta T$ and $\frac{dT}{dt}$ against a strict $45.0^\circ\text{C}$ ceiling
   - Gas off-gassing array: screening for early hydrogen ($H_2$), carbon monoxide ($CO$), and $VOC$ venting.
4. **What should happen to the battery next?**  
   Transparent circularity routing across four operational pathways:
   - **Second-Life Screening**: eligible for stationary Battery Energy Storage Systems (BESS) or solar buffering.
   - **Refurbishment Review**: intermediate degradation routed to module rebalancing and cell regrouping.
   - **Recycling Review**: severe impedance growth / depleted active material routed to hydrometallurgical recovery.
   - **Safety Quarantine**: critical safety override for thermal runaway or gas venting. Zero reuse permitted.
5. **Can the test result be stored and audited?**  
   A **tamper-evident Digital Battery Passport** anchored by an immutable SHA-256 bitstream hash of the raw telemetry, verifiable in real time, with chain-of-custody tracking, QR code, and exportable reports supporting Extended Producer Responsibility (EPR) reporting under Battery Waste Management Rules.

---

## 2. System Architecture & Single Source of Truth

To ensure complete reliability, the application uses **Express on port 3000** as the primary single source of truth for both the ESP32 hardware and the React dashboard:

- **ESP32** connects to `POST http://<HOST_IP>:3000/api/telemetry`
- **React Frontend** communicates directly with `/api/*` on port 3000
- **Background Sync**: The dashboard continuously polls `/api/tests/:testId/telemetry` every 1.5 seconds, ensuring live oscilloscope graphs update in real time whenever telemetry is received from an ESP32 or curl test script.
- **Python Flask Backend (`app.py`)**: Provided as an identical, standalone reference implementation with SQLite tables for standalone Python deployments or Streamlit users.

---

## 3. Finite-State Test Workflow

The software executes a strict finite-state machine progression:

```text
CREATED → PRECHECK → READY → BASELINE → PULSE_TEST → RELAXATION → ANALYSIS → COMPLETE → PASSPORT_GENERATED
```

### Safety & Error States:
- `ABORTED`: Triggered by software overvoltage/undervoltage, overcurrent (>2.2A), or manual E-Stop.
- `QUARANTINED`: Triggered by physical swelling, electrolyte leakage, thermal runaway (>45°C), or $H_2$ venting.
- `SENSOR_FAILURE`: Missing timestamps, corrupt ADC readings, or disconnected thermocouple.
- `COMMUNICATION_FAILURE`: Sequence number gaps or dropped packets.

---

## 4. API Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health, online rigs count, active test count |
| `POST` | `/api/batteries` | Register a new retired EV battery or module |
| `GET` | `/api/batteries` | List all registered batteries |
| `POST` | `/api/tests` | Initialize a new diagnostic pulse test |
| `GET` | `/api/tests` | Query all active and completed tests |
| `POST` | `/api/telemetry` | **ESP32 Ingestion endpoint**: validates and stores 1Hz packets |
| `POST` | `/api/tests/:id/start` | Transition state machine to BASELINE / PULSE |
| `POST` | `/api/tests/:id/stop` | Complete test and trigger automatic feature extraction |
| `POST` | `/api/tests/:id/abort` | Emergency stop / safety abort cutoff |
| `GET` | `/api/tests/:id/status` | Current test status and latest readings |
| `GET` | `/api/tests/:id/telemetry` | Raw time-series telemetry array |
| `GET` | `/api/tests/:id/result` | Diagnostic result and SoH interval |
| `POST` | `/api/tests/:id/passport` | Generate sealed SHA-256 Digital Battery Passport |
| `GET` | `/api/tests/:id/report` | Complete structured report for audit or PDF printing |
| `POST` | `/api/decisions/review` | Reviewer sign-off and pathway approval |
| `POST` | `/api/demo/load` | Instant loader for pre-recorded demo datasets |

---

## 5. ESP32 JSON Contract & Local Safety Protection

Send HTTP POST requests with header `Content-Type: application/json` to `http://<SERVER_IP>:3000/api/telemetry`:

```json
{
  "device_id": "PV-DEV-001",
  "test_id": "TEST-HLTH-001",
  "timestamp_ms": 12000,
  "sequence": 24,
  "voltage_v": 3.242,
  "current_a": 0.84,
  "temperature_cell_c": 26.1,
  "temperature_box_c": 24.6,
  "co_raw": 0.012,
  "h2_raw": 0.008,
  "voc_raw": 0.042,
  "load_state": 1,
  "firmware_version": "phyvolt-esp32-v1.4",
  "calibration_version": "calibration-v0.1"
}
```

### Backend Safety Response:

```json
{
  "success": true,
  "action": "CONTINUE", // Or "STOP" / "EMERGENCY_QUARANTINE"
  "safety_status": "PASS", // "PASS" | "WARNING" | "ABORT" | "QUARANTINE"
  "reasons": []
}
```

### Autonomous Hardware Safety Protection
`ESP32_FIRMWARE.ino` includes an autonomous hardware watchdog:
1. If cell temperature exceeds 45°C, or voltage drops below 2.0V, or pulse duration exceeds 25 seconds, the ESP32 microcontroller **immediately de-energizes the relay (GPIO 18 LOW)** without waiting for network instructions.
2. If Wi-Fi disconnects, the ESP32 buffers up to 60 packets in local memory and flushes them upon reconnection.

---

## 6. Automated Integration Testing

Run the automated test suite to verify all 8 validation scenarios:

```bash
npm test
# or
npx tsx tests/test_api_integration.ts
```

### Verified Test Cases:
1. Normal telemetry packet ingestion (HTTP 200 / Status PASS)
2. Duplicate sequence rejection (HTTP 409 Conflict)
3. Missing required field rejection (HTTP 400 Bad Request)
4. High-temperature safety abort (>45°C -> Action STOP / Status ABORT)
5. Low-voltage cutoff (<2.0V -> Action STOP)
6. Excessive current cutoff (>2.2A -> Action STOP)
7. Full pulse test execution (10s baseline, 10s pulse, 10s relaxation)
8. Electrochemical feature extraction & baseline SoH inference
9. Tamper-evident Digital Battery Passport generation with 64-char SHA-256 digest
10. Report inspection endpoint verification

---

## 7. Model Modes & Research Layer

The system supports three clear operational modes:

1. **Demo Mode**: Loads pre-recorded scenarios (`healthy_cell`, `degraded_cell`, `quarantine_event`), explicitly badged as `DEMO DATA — NOT LIVE`.
2. **Baseline Model (`baseline-v0.1`)**: Operational screening model calculating apparent impedance and confidence intervals ($72\% - 78\%$).
3. **PyBaMM Research Layer**: Theoretical Equivalent Circuit Model (ECM) simulating expected voltage curves ($R_0 + R_{ct} \parallel C_{dl}$) and computing residual RMSE. Labeled honestly as a *research analytics layer*, not an unvalidated oracle.

---

## 8. Cryptographic Tamper-Evidence Demo

In the **Digital Battery Passport** view:
1. The raw telemetry bitstream is digested using SHA-256.
2. Clicking **"Verify Hash Integrity"** compares the live database bitstream with the sealed hash. Result: `● Seal Verified · Bitstream Untampered`.
3. Clicking **"Simulate Tamper Test"** alters 1 millivolt in the bitstream and re-evaluates. Result: `✖ Integrity Alert: Bitstream Mismatch!`.

---

## 9. Quickstart Guide

### Full-Stack Web Application (Node.js & Express + React)
```bash
npm install
npm run dev
# Server active on http://localhost:3000
```

### Standalone Python Flask Backend
```bash
pip install -r requirements.txt
python app.py
# Flask server active on http://localhost:5000
```

### Streamlit Dashboard
```bash
streamlit run dashboard/dashboard.py
```

---

## 10. Operational Scope & Limitations

- **Screening Scope**: Evaluates single cells or small series modules under a defined pulse protocol.
- **Chemistry Range**: Calibrated strictly for LFP, NMC, NCA, and LTO chemistries.
- **Confidence Bounds**: Outputs confidence-bounded SoH intervals (e.g. 74%–80%) rather than claiming false exact decimals.
- **Remaining Useful Life (RUL)**: Labeled *not_validated_single_pulse*. Exact cycle life requires longitudinal aging cycling.
- **Regulatory Framework**: Generates structured records supporting Extended Producer Responsibility (EPR) reporting under national Battery Waste Management Rules; does not claim unapproved automated CPCB portal submission.

---

## 11. PyBaMM Battery Simulation & Synthetic Dataset Generator

PhyVolt AI includes a physics-based simulation engine powered by **PyBaMM (Python Battery Mathematical Modelling)** and the Single Particle Model (SPM). This enables synthetic data generation, synthetic pulse testing, and testing of diagnostic algorithms without physical battery hardware.

> [!WARNING]
> **SYNTHETIC DATA NOTICE — NOT LIVE HARDWARE MEASUREMENTS**
> All outputs generated by this engine carry explicit `dataset_type: SYNTHETIC` and `data_source: PyBaMM simulation` metadata. Synthetic datasets are stored in `data/synthetic/` and must never be merged with live hardware tables without an explicit source discriminator.

### Supported Chemistries & Parameter Sets

| Chemistry | PyBaMM Parameter Set | Model | Support Status |
|-----------|----------------------|-------|----------------|
| **NMC** | `Chen2020` | Single Particle Model (SPM) | Fully Supported |
| **NCA** | `NCA_Kim2011` | Single Particle Model (SPM) | Fully Supported |
| **LFP** | `Prada2013` | Single Particle Model (SPM) | Fully Supported |
| **LTO** | — | — | *Unsupported in PyBaMM 26.x (refused with clear message)* |
| **LCO** | — | — | *Unsupported in PyBaMM 26.x (refused with clear message)* |
| **LMO** | — | — | *Unsupported in PyBaMM 26.x (refused with clear message)* |

### Diagnostic Pulse Protocol (SPM)

Simulations follow the standardized PhyVolt AI screening protocol:
1. **REST (30s)**: Open-circuit equilibrium ($I = 0\text{ A}$)
2. **PULSE DISCHARGE (120s)**: Constant discharge current ($1.0\text{ A}$ default, configurable $0.5\text{–}2.0\text{ A}$) at 1 Hz resolution (121 samples, $t=0\dots120\text{s}$)
3. **RELAXATION (120s)**: Voltage recovery stage ($I = 0\text{ A}$) to calculate recovery ratio after 1s, 10s, 60s, and 120s

### Running Simulations

#### 1. CLI Dataset Generator
Generate synthetic batches with random parameter sampling and validation:
```bash
# Quick 5-cell test run (NMC)
python scripts/generate_synthetic_dataset.py --num-cells 5

# Mixed-chemistry dataset (NMC, NCA, LFP)
python scripts/generate_synthetic_dataset.py --num-cells 30 --chemistry NMC NCA LFP --seed 42

# Full parameter customization
python scripts/generate_synthetic_dataset.py \
    --num-cells 10 \
    --chemistry NMC LFP \
    --soc-min 0.3 --soc-max 0.85 \
    --temp-min 20 --temp-max 30 \
    --current-min 0.8 --current-max 1.5 \
    --pulse-duration 120 \
    --output-dir data/synthetic
```

#### 2. Interactive Web Dashboard
Navigate to the **PyBaMM Simulation** tab in the web dashboard (`http://localhost:3000`):
- Configure chemistry, initial SoC, pulse current, temperature, and durations
- Interactive SVG oscilloscope displaying real-time REST, PULSE, and RELAX bands
- Automatic pulse resistance ($R_{\text{pulse}}$) and recovery metric computation
- Screening grade display with safety override status
- One-click CSV and JSON downloads

#### 3. API Endpoints
- `POST /api/simulation/run`: Execute a single PyBaMM pulse simulation via Python bridge
- `GET /api/simulation/supported-chemistries`: Query parameter set support matrix
- `GET /api/simulation/download/:filename`: Download synthetic CSV datasets (`cell-summary`, `pulse-timeseries`, `metadata`)

### Classification & Second-Life Grading Logic

Located in [services/classification_service.py](file:///c:/Users/saikiran/OneDrive/Desktop/PhyVolt-AI-main/PhyVolt-AI-main/services/classification_service.py) with thresholds defined in [config/simulation_config.json](file:///c:/Users/saikiran/OneDrive/Desktop/PhyVolt-AI-main/PhyVolt-AI-main/config/simulation_config.json):
- **SAFETY_QUARANTINE (Highest Priority)**: Triggered by physical defects (`swollen`, `corrosion`, `dented`, `leaking`) or voltage threshold violations ($<2.5\text{V}$ or $>4.35\text{V}$). Overrides all performance grades.
- **GRADE_A**: $R_{\text{pulse}} \le 35\text{ m}\Omega$, $\Delta V \le 0.080\text{V}$, recovery ratio $\ge 0.85$
- **GRADE_B**: $R_{\text{pulse}} \le 60\text{ m}\Omega$
- **GRADE_C**: $R_{\text{pulse}} \le 100\text{ m}\Omega$
- **RECYCLE_REVIEW**: $R_{\text{pulse}} > 100\text{ m}\Omega$

> [!NOTE]
> **Independent SoH Metric Note**: The Single Particle Model pulse simulation measures short-term dynamic response ($R_{\text{pulse}}$), not total capacity. `reference_soh_pct` is intentionally left unassigned in synthetic summaries to avoid false precision without a complete reference C-rate cycle.

### Automated Test Suite

Run the full PyBaMM test suite:
```bash
python tests/test_simulation.py
```
Tests cover chemistry support validation, rejection of unparameterized chemistries, pulse timing consistency, grade boundary conditions, safety quarantine override, and data quality checks (12/12 passing).

