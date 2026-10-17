"""
PhyVolt AI - Streamlit Dashboard
Battery health, safety, and circularity intelligence
"""

import streamlit as st
import pandas as pd
import requests
import json
import time

st.set_page_config(
    page_title="PhyVolt AI - Battery Intelligence",
    page_icon="🔋",
    layout="wide"
)

st.markdown("""
<style>
.main { background-color: #070d18; }
.block-container { padding-top: 1.5rem; }
.metric-card {
    background-color: #0d1b2e;
    border: 1px solid #1e293b;
    padding: 1rem;
    border-radius: 8px;
}
</style>
""", unsafe_allow_html=True)

st.title("🔋 PhyVolt AI")
st.caption("Retired EV Battery Circularity, Pulse Diagnostics & Tamper-Evident Passport")

API_URL = "http://localhost:3000/api"

with st.sidebar:
    st.header("Hardware Rig")
    st.success("● ONLINE: PV-DEV-001")
    st.caption("Rig Alpha - Bench Chamber 1")
    st.write("Firmware: `v1.4` | Cal: `v0.1`")
    st.divider()
    st.subheader("Role Selection")
    role = st.selectbox("Active Role", ["Operator", "Reviewer", "Administrator"])
    st.divider()
    st.subheader("Data Source")
    mode = st.radio("Telemetry Mode", ["Live Hardware (ESP32)", "Demo Dataset"])

col1, col2, col3, col4 = st.columns(4)
col1.metric("Devices Online", "2", delta="Nominal")
col2.metric("Tests Today", "14", delta="+3")
col3.metric("Second-Life Candidates", "8", delta="57%")
col4.metric("Quarantine Alerts", "1", delta="Isolated")

st.divider()

tabs = st.tabs(["📊 Live Pulse Monitor", "📋 Battery Intake", "🛡️ Safety Pre-Check", "⚖️ Decision Center", "📜 Digital Passport"])

with tabs[0]:
    st.subheader("Active Pulse Test: TEST-HLTH-001")
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Voltage", "3.242 V")
    m2.metric("Current", "0.84 A")
    m3.metric("Temperature", "26.1 °C")
    m4.metric("Safety Engine", "PASS")

    # Sample chart
    df_sample = pd.DataFrame({
        "time_s": list(range(30)),
        "voltage": [3.34 - (0.1 if 10 <= i <= 20 else 0.0) for i in range(30)],
        "current": [0.85 if 10 <= i <= 20 else 0.0 for i in range(30)]
    })
    st.line_chart(df_sample.set_index("time_s"))

with tabs[3]:
    st.subheader("Operational Circularity Routing")
    st.info("Safety-first decision logic overrides electrochemical SoH whenever thermal or off-gas anomalies are detected.")
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.success("SECOND-LIFE (8)")
        st.caption("BESS Stationary Storage")
    with c2:
        st.warning("REFURBISHMENT (4)")
        st.caption("Module Rebalancing")
    with c3:
        st.info("RECYCLING (2)")
        st.caption("Hydrometallurgy")
    with c4:
        st.error("QUARANTINE (1)")
        st.caption("Hazardous Isolation")
