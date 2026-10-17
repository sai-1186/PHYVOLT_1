"""
PhyVolt AI - Flask Backend API Server
Standalone Python reference implementation for ESP32 bench testing, SQLite storage,
and Streamlit dashboard communication.
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import json
import hashlib
import uuid
import os
import logging

# ML model inference
from services.ml_inference_service import predict_full, get_model_status, models_available

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

DB_PATH = "phyvolt.db"
EXPORT_DIR = Path("data/exports")
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    connection = get_db()
    connection.executescript("""
    CREATE TABLE IF NOT EXISTS batteries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battery_id TEXT UNIQUE NOT NULL,
        cell_id TEXT NOT NULL,
        chemistry TEXT,
        format TEXT,
        nominal_voltage REAL,
        nominal_capacity_ah REAL,
        manufacturer TEXT,
        source TEXT,
        physical_condition TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id TEXT UNIQUE NOT NULL,
        battery_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        protocol_id TEXT NOT NULL,
        status TEXT NOT NULL,
        safety_status TEXT,
        started_at TEXT,
        completed_at TEXT,
        abort_reason TEXT,
        model_version TEXT,
        calibration_version TEXT
    );

    CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        voltage_v REAL NOT NULL,
        current_a REAL NOT NULL,
        temperature_cell_c REAL NOT NULL,
        temperature_box_c REAL,
        co_raw REAL,
        h2_raw REAL,
        voc_raw REAL,
        load_state INTEGER,
        sequence INTEGER,
        received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id TEXT UNIQUE NOT NULL,
        soh_low REAL,
        soh_high REAL,
        power_class TEXT,
        anomaly_score REAL,
        confidence REAL,
        safety_status TEXT,
        recommendation TEXT,
        explanation TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS passports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        passport_id TEXT UNIQUE NOT NULL,
        test_id TEXT NOT NULL,
        raw_data_hash TEXT NOT NULL,
        passport_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        event_data TEXT,
        created_at TEXT NOT NULL
    );
    """)
    connection.commit()
    connection.close()


@app.route("/api/health", methods=["GET"])
def health():
    ml_status = get_model_status()
    return jsonify({
        "status": "online",
        "service": "PhyVolt AI",
        "version": "0.2.0",
        "time": utc_now(),
        "ml_models": ml_status
    })


@app.route("/api/models/status", methods=["GET"])
def model_status():
    """Return current ML model loading status."""
    return jsonify({
        "success": True,
        **get_model_status()
    })


@app.route("/api/predict", methods=["POST"])
def predict():
    """
    Run ML inference on pulse-test features.

    Expects JSON body with:
      - estimated_resistance_mohm or pulse_resistance_mohm: float
      - voltage_drop_V: float
      - initial_soc_pct: float
      - ambient_temperature_C: float
      - pulse_current_A: float
      - rated_capacity_Ah: float
      - recovery_ratio: float
      - v_relax_1s, v_relax_10s, v_relax_60s: float
      - chemistry: str (NMC, NCA, LFP)

    Returns grade prediction, SoH estimate, and recommendation.
    """
    if not request.is_json:
        return jsonify({"success": False, "error": "Expected JSON payload"}), 415

    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "Empty request body"}), 400

    result = predict_full(data)
    return jsonify(result), 200 if result.get("success") else 422


@app.route("/api/batteries", methods=["POST"])
def create_battery():
    data = request.get_json() or {}
    required = ["battery_id", "cell_id"]
    missing = [key for key in required if key not in data]

    if missing:
        return jsonify({"success": False, "missing": missing}), 400

    connection = get_db()
    try:
        connection.execute("""
        INSERT INTO batteries (
            battery_id, cell_id, chemistry, format,
            nominal_voltage, nominal_capacity_ah,
            manufacturer, source, physical_condition, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data["battery_id"],
            data["cell_id"],
            data.get("chemistry", "LFP"),
            data.get("format", "cylindrical"),
            data.get("nominal_voltage", 3.2),
            data.get("nominal_capacity_ah", 10.0),
            data.get("manufacturer", "Unknown"),
            data.get("source", "EV Dismantler"),
            data.get("physical_condition", "appears_normal"),
            utc_now()
        ))
        connection.commit()
    except sqlite3.IntegrityError:
        connection.close()
        return jsonify({"success": False, "error": "Battery ID already exists"}), 409

    connection.close()
    return jsonify({"success": True, "battery_id": data["battery_id"]}), 201


@app.route("/api/tests", methods=["POST"])
def create_test():
    data = request.get_json() or {}
    test_id = data.get("test_id") or ("TEST-" + uuid.uuid4().hex[:8].upper())

    connection = get_db()
    connection.execute("""
    INSERT INTO tests (
        test_id, battery_id, device_id,
        operator_id, protocol_id, status,
        safety_status, model_version, calibration_version, started_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        test_id,
        data.get("battery_id", "BAT-0001"),
        data.get("device_id", "PV-DEV-001"),
        data.get("operator_id", "OP-001"),
        data.get("protocol_id", "single_cell_pulse_v1"),
        "CREATED",
        "PASS",
        "baseline-v0.1",
        "calibration-v0.1",
        utc_now()
    ))
    connection.commit()
    connection.close()

    return jsonify({"success": True, "test_id": test_id}), 201


@app.route("/api/telemetry", methods=["POST"])
def receive_telemetry():
    if not request.is_json:
        return jsonify({"success": False, "error": "Expected JSON payload"}), 415

    data = request.get_json()
    required = ["test_id", "timestamp_ms", "voltage_v", "current_a", "temperature_cell_c"]
    missing = [key for key in required if key not in data]
    if missing:
        return jsonify({"success": False, "missing": missing}), 400

    temperature = float(data["temperature_cell_c"])
    voltage = float(data["voltage_v"])
    current = abs(float(data["current_a"]))

    safety_status = "PASS"
    action = "CONTINUE"
    reasons = []

    if temperature > 45.0:
        safety_status = "ABORT"
        action = "STOP"
        reasons.append("Cell temperature exceeded 45.0°C safety ceiling")
    elif temperature < 0.0:
        safety_status = "ABORT"
        action = "STOP"
        reasons.append("Cell temperature sub-zero abort")

    if voltage < 2.0 or voltage > 4.3:
        safety_status = "ABORT"
        action = "STOP"
        reasons.append(f"Cell voltage {voltage}V outside safe test band (2.0V - 4.3V)")

    if current > 2.2:
        safety_status = "ABORT"
        action = "STOP"
        reasons.append(f"Load current {current}A exceeded hardware limit (2.2A)")

    connection = get_db()
    connection.execute("""
    INSERT INTO telemetry (
        test_id, timestamp_ms, voltage_v,
        current_a, temperature_cell_c,
        temperature_box_c, co_raw, h2_raw,
        voc_raw, load_state, sequence,
        received_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["test_id"],
        data["timestamp_ms"],
        voltage,
        data["current_a"],
        temperature,
        data.get("temperature_box_c", temperature - 1.0),
        data.get("co_raw", 0.012),
        data.get("h2_raw", 0.008),
        data.get("voc_raw", 0.04),
        int(bool(data.get("load_state", False))),
        data.get("sequence", 0),
        utc_now()
    ))

    if safety_status == "ABORT":
        connection.execute("""
        UPDATE tests
        SET status = ?, safety_status = ?, abort_reason = ?, completed_at = ?
        WHERE test_id = ?
        """, ("ABORTED", "ABORT", "; ".join(reasons), utc_now(), data["test_id"]))

    connection.commit()
    connection.close()

    return jsonify({
        "success": True,
        "action": action,
        "safety_status": safety_status,
        "reasons": reasons
    })


@app.route("/api/tests/<test_id>/status", methods=["GET"])
def get_status(test_id):
    connection = get_db()
    cur = connection.cursor()
    cur.execute("SELECT * FROM tests WHERE test_id = ?", (test_id,))
    row = cur.fetchone()
    if not row:
        connection.close()
        return jsonify({"success": False, "error": "Test not found"}), 404

    cur.execute("SELECT COUNT(*) FROM telemetry WHERE test_id = ?", (test_id,))
    count = cur.fetchone()[0]
    connection.close()

    return jsonify({
        "success": True,
        "test_id": test_id,
        "status": row["status"],
        "safety_status": row["safety_status"],
        "telemetry_count": count
    })


@app.route("/api/tests/<test_id>/start", methods=["POST"])
def start_test(test_id):
    connection = get_db()
    connection.execute("UPDATE tests SET status = 'BASELINE', started_at = ? WHERE test_id = ?", (utc_now(), test_id))
    connection.commit()
    connection.close()
    return jsonify({"success": True, "test_id": test_id, "status": "BASELINE"})


@app.route("/api/tests/<test_id>/stop", methods=["POST"])
def stop_test(test_id):
    connection = get_db()
    connection.execute("UPDATE tests SET status = 'COMPLETE', completed_at = ? WHERE test_id = ?", (utc_now(), test_id))
    connection.commit()
    connection.close()
    return jsonify({"success": True, "test_id": test_id, "status": "COMPLETE"})


@app.route("/api/tests/<test_id>/telemetry", methods=["GET"])
def get_telemetry(test_id):
    connection = get_db()
    cur = connection.cursor()
    cur.execute("SELECT * FROM telemetry WHERE test_id = ? ORDER BY timestamp_ms ASC", (test_id,))
    rows = [dict(row) for row in cur.fetchall()]
    connection.close()
    return jsonify({"success": True, "count": len(rows), "data": rows})


@app.route("/api/tests/<test_id>/result", methods=["GET"])
def get_result(test_id):
    connection = get_db()
    cur = connection.cursor()

    # Check for stored result first
    cur.execute("SELECT * FROM results WHERE test_id = ?", (test_id,))
    row = cur.fetchone()
    if row:
        connection.close()
        return jsonify({"success": True, "data": dict(row)})

    # Try ML inference on stored telemetry
    if models_available():
        cur.execute("SELECT * FROM telemetry WHERE test_id = ? ORDER BY timestamp_ms ASC", (test_id,))
        telemetry_rows = [dict(r) for r in cur.fetchall()]

        # Look up battery chemistry
        cur.execute("SELECT t.battery_id FROM tests t WHERE t.test_id = ?", (test_id,))
        test_row = cur.fetchone()
        chemistry = "NMC"  # default
        if test_row:
            cur.execute("SELECT chemistry FROM batteries WHERE battery_id = ?", (test_row["battery_id"],))
            bat_row = cur.fetchone()
            if bat_row:
                chemistry = bat_row["chemistry"] or "NMC"

        connection.close()

        if telemetry_rows:
            # Extract features from telemetry for ML prediction
            try:
                from services.feature_service import extract_features
                import pandas as pd
                df = pd.DataFrame(telemetry_rows)
                features = extract_features(df)

                ml_input = {
                    "estimated_resistance_mohm": features.get("pulse_resistance", 0.045) * 1000.0,
                    "voltage_drop_V": features.get("voltage_drop", 0.0),
                    "initial_soc_pct": 50.0,
                    "ambient_temperature_C": features.get("max_temperature", 25.0),
                    "pulse_current_A": 1.0,
                    "rated_capacity_Ah": 3.0,
                    "recovery_ratio": features.get("recovery_ratio", 0.8),
                    "v_relax_1s": features.get("v_after", 3.5),
                    "v_relax_10s": features.get("v_after", 3.5),
                    "v_relax_60s": features.get("v_after", 3.5),
                    "chemistry": chemistry,
                }
                ml_result = predict_full(ml_input)
                if ml_result.get("success"):
                    return jsonify({
                        "success": True,
                        "prediction_source": "ml_model",
                        "data": {
                            "test_id": test_id,
                            "soh_low": ml_result["soh"]["soh_range"]["low"],
                            "soh_high": ml_result["soh"]["soh_range"]["high"],
                            "soh_mid": ml_result["soh"]["predicted_soh_pct"],
                            "predicted_grade": ml_result["grade"]["predicted_grade"],
                            "grade_confidence": ml_result["grade"]["confidence"],
                            "grade_probabilities": ml_result["grade"]["probabilities"],
                            "recommendation": ml_result["recommendation"],
                            "explanation": ml_result["explanation"],
                            "safety_status": "PASS",
                            "model_warning": ml_result.get("model_warning"),
                        }
                    })
            except Exception as e:
                logger.warning("ML inference failed for test %s: %s", test_id, e)
    else:
        connection.close()

    # Fallback: hardcoded demo result (clearly labeled)
    return jsonify({
        "success": True,
        "prediction_source": "hardcoded_demo_fallback",
        "data": {
            "test_id": test_id,
            "soh_low": 72.0,
            "soh_high": 78.0,
            "power_class": "MEDIUM",
            "anomaly_score": 0.08,
            "confidence": 0.86,
            "safety_status": "PASS",
            "recommendation": "SECOND_LIFE_SCREENING",
            "explanation": ["DEMO FALLBACK — ML models not used. Pulse response within prototype model range.", "Stable voltage recovery"],
            "model_warning": "This is a hardcoded demo result. ML models were not used for this prediction."
        }
    })


@app.route("/api/tests/<test_id>/passport", methods=["POST", "GET"])
def handle_passport(test_id):
    connection = get_db()
    cur = connection.cursor()
    cur.execute("SELECT * FROM passports WHERE test_id = ?", (test_id,))
    row = cur.fetchone()

    if request.method == "GET" and row:
        connection.close()
        return jsonify({"success": True, "data": json.loads(row["passport_json"])})

    # Generate or return passport
    cur.execute("SELECT * FROM telemetry WHERE test_id = ? ORDER BY timestamp_ms ASC", (test_id,))
    telemetry_rows = [dict(r) for r in cur.fetchall()]
    raw_json = json.dumps(telemetry_rows)
    raw_hash = hashlib.sha256(raw_json.encode("utf-8")).hexdigest()

    cur.execute("SELECT * FROM tests WHERE test_id = ?", (test_id,))
    test_row = cur.fetchone()
    cur.execute("SELECT * FROM batteries WHERE battery_id = ?", (test_row["battery_id"] if test_row else "BAT-0001",))
    bat_row = cur.fetchone()

    passport_obj = {
        "passport_id": f"PBP-{test_id}",
        "test_id": test_id,
        "battery": dict(bat_row) if bat_row else {"battery_id": "BAT-0001", "chemistry": "LFP"},
        "raw_data_sha256": raw_hash,
        "record_type": "tamper_evident_diagnostic_record",
        "system": "PhyVolt AI",
        "created_at": utc_now()
    }

    if not row:
        cur.execute("""
        INSERT INTO passports (passport_id, test_id, raw_data_hash, passport_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """, (passport_obj["passport_id"], test_id, raw_hash, json.dumps(passport_obj), utc_now()))
        connection.commit()

    connection.close()
    return jsonify({"success": True, "data": passport_obj})


@app.route("/api/tests/<test_id>/report", methods=["GET"])
def get_report(test_id):
    connection = get_db()
    cur = connection.cursor()
    cur.execute("SELECT * FROM tests WHERE test_id = ?", (test_id,))
    test_row = cur.fetchone()
    connection.close()

    battery_id = test_row["battery_id"] if test_row else "BAT-0001"
    safety_status = test_row["safety_status"] if test_row else "PASS"
    ml_status = get_model_status()

    report = {
        "title": "PhyVolt AI Diagnostic Report",
        "test_id": test_id,
        "battery_id": battery_id,
        "safety_status": safety_status,
        "ml_models_active": ml_status["models_loaded"],
        "disclaimer": (
            "This report is a screening result based on SYNTHETIC-trained ML models. "
            "NOT a safety certification. Model performance on real hardware is UNVALIDATED. "
            "Final reuse must follow facility procedures."
        ),
    }

    # Try to generate ML-backed report
    if models_available():
        report["prediction_source"] = "ml_model"
        report["recommendation"] = "See /api/tests/<test_id>/result for ML predictions"
    else:
        report["prediction_source"] = "hardcoded_demo_fallback"
        report["recommendation"] = "SECOND_LIFE_SCREENING"
        report["soh_range"] = {"low": 72.0, "high": 78.0}

    return jsonify({"success": True, "report": report})


if __name__ == "__main__":
    initialize_database()
    print("🔋 PhyVolt AI Flask API running on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False)
