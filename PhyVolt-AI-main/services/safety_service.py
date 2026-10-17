"""
PhyVolt AI - Python Safety Service
Implements multi-layer limits, overcurrent, thermal runaway, and gas-sensor screening
"""

def evaluate_safety(packet):
    reasons = []
    temp = float(packet.get("temperature_cell_c", 25.0))
    voltage = float(packet.get("voltage_v", 3.2))
    current = abs(float(packet.get("current_a", 0.0)))
    h2 = float(packet.get("h2_raw", 0.0))
    co = float(packet.get("co_raw", 0.0))

    if temp > 45.0:
        reasons.append(f"Cell temperature {temp:.1f}°C exceeds safety demo limit (45°C)")
    if temp < 0.0:
        reasons.append(f"Cell temperature {temp:.1f}°C below safe testing threshold (0°C)")

    if voltage < 2.0 or voltage > 4.35:
        reasons.append(f"Cell voltage {voltage:.3f}V outside safe operational envelope (2.0V–4.35V)")

    if current > 2.2:
        reasons.append(f"Current {current:.2f}A exceeds load bench limit (2.2A)")

    if h2 > 0.07 or co > 0.08:
        reasons.append("Off-gassing alert: Hydrogen or Carbon Monoxide spike detected inside chamber")

    if reasons:
        return {
            "status": "QUARANTINE" if (temp > 50 or h2 > 0.07) else "ABORT",
            "action": "STOP",
            "reasons": reasons
        }

    if temp > 40.0 or current > 1.8:
        return {
            "status": "WARNING",
            "action": "WARN",
            "reasons": ["Operating parameters approaching advisory threshold"]
        }

    return {
        "status": "PASS",
        "action": "CONTINUE",
        "reasons": []
    }
