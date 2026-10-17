"""
PhyVolt AI - Digital Battery Passport Service (Python)
Generates tamper-evident diagnostic records and SHA-256 hashes
"""

import hashlib
import json
from datetime import datetime, timezone


def create_passport(battery, test, result, telemetry_json):
    raw_hash = hashlib.sha256(telemetry_json.encode("utf-8")).hexdigest()

    passport = {
        "passport_id": "PBP-" + test["test_id"],
        "battery": battery,
        "test": test,
        "result": result,
        "raw_data_sha256": raw_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "record_type": "tamper_evident_diagnostic_record",
        "system": "PhyVolt AI",
        "version": "0.1.0"
    }

    return passport
