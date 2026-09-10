# 🛡️ System Control Center - Frontend Dashboard

Welcome to the frontend repository of the **System Control Center**, a powerful, real-time web dashboard designed for secure remote device management. This dashboard allows administrators to connect to remote nodes, dispatch encrypted commands, and stream live media (screen, camera, and audio) using a highly optimized WebRTC pipeline.

**Live Preview:** [Systems Control Panel](#) *(Insert actual link if deployed)*

---

## ✨ Key Features

*   **Real-Time Device Registry:** Monitor online/offline status, IP addresses, and telemetry data of all connected agents.
*   **4-Slot WebRTC Media Pipeline:**
    *   🖥️ **Slot 0:** High-definition desktop screen capture.
    *   📷 **Slot 1:** Remote webcam video feed.
    *   🎤 **Slot 2:** Remote environmental audio (Node Microphone).
    *   🔊 **Slot 3:** 2-Way Talkback (Admin microphone to remote node).
*   **Encrypted Command Dispatch:** Securely send commands to remote nodes with End-to-End Encryption (E2EE) and authorization locks.
*   **Robust NAT Traversal:** Built-in STUN/TURN server integration (via Metered) to bypass strict firewalls and symmetric NATs on mobile networks.
*   **Media Hardware Safeguards:** Auto-cleanup and state management to prevent remote hardware locking/hanging.

---

## 🛠️ Technologies Used

### Frontend (Dashboard)
*   **HTML5 & CSS3:** Structured layout styled with **Tailwind CSS** for a responsive, modern UI.
*   **Vanilla JavaScript (ES6+):** Lightweight, dependency-free DOM manipulation and state management.
*   **WebRTC API:** Utilizes `RTCPeerConnection` and `navigator.mediaDevices` for peer-to-peer, low-latency media streaming.
*   **Socket.IO Client:** For real-time signaling, connection state management, and command relay.

### Backend Infrastructure
*   **Node.js & Express:** Serves the static SPA and handles RESTful API routes.
*   **MySQL:** Database for storing node registries, admin credentials, and audit logs.
*   **Socket.IO Server:** Acts as the secure signaling relay bridging the dashboard and the remote agents.

---

## 💻 About the System Agent (Electron)

The **System Agent** is the counterpart to this dashboard. It is a headless, auto-launching desktop application built with **Electron** that runs silently in the background of target machines.

*   **Silent Execution:** Runs completely hidden without interrupting the remote user.
*   **Hardware Access:** Bypasses OS-level permission prompts to seamlessly capture the desktop (`desktopCapturer`), webcam, and microphone when requested by the admin dashboard.
*   **WebRTC Node:** Receives the WebRTC offer from the dashboard, binds the local media streams to the predefined transceiver slots, and transmits them back over a secure P2P connection.

---

## 🚀 Getting Started

Follow these steps to clone, install, and run the complete System Control Center on your local machine.

### 1. Clone the Repository
```bash
git clone https://github.com/Verma1235/system-control-center.git
cd system-control-center
```

### 2. Install Dependencies
Make sure you have [Node.js](https://nodejs.org/) (v22 or higher) installed.
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory based on the `.env.example` structure. You must configure:
*   Database credentials (MySQL)
*   JWT and Provisioning Secrets
*   Admin Username & Password
*   Metered API credentials (for TURN servers)

### 4. Run the Server
To start the server and serve the frontend dashboard:
```bash
npm run dev
# OR for production
npm start
```
The dashboard will be available at `http://localhost:3000` (or your configured port).

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Verma1235/system-control-center/issues).
