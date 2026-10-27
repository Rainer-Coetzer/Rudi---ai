# 🎙️ Rudi Agent — Autonomous Local Intelligence

> **"At your service, Sir."** — A premium, high-performance autonomous desktop assistant inspired by J.A.R.V.I.S., running entirely on localized hardware.

![Rudi Overview](https://img.shields.io/badge/Status-Hardened-cyan?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-Tauri_|_React_|_Ollama-blue?style=for-the-badge)
![Autonomy](https://img.shields.io/badge/Autonomy-Protocol_Aware-gold?style=for-the-badge)

---

## 📖 Short Description
Rudi is an advanced desktop orchestrator that bridges the gap between local LLMs (Gemma 4 via Ollama) and native OS automation. It features a hardware-accelerated 3D neural sphere, real-time voice synthesis, and an autonomous tool-chaining core designed for professional software engineering and system management.

## 🚀 Overview
Rudi is built for users who demand privacy without compromising on power. Unlike cloud-based assistants, Rudi operates 100% locally, utilizing a customized Gemma 4 model for cognitive processing and a Tauri (Rust) shell with a Node tool sidecar for deep OS integration. The system is architected for low-latency interactions, featuring dynamic GPU detection (AMD/Intel/NVIDIA) and a modular service-oriented hook system.

## ✨ Features
- **🤖 Autonomous Tool Chaining**: Proactive objective-driven execution with safety-aware permission levels.
- **🌐 Cognitive Local Core**: Deep integration with Ollama for state-of-the-art local inference.
- **🌌 3D Neural Sphere**: A GLSL-powered particle visualization that reacts in real-time to audio amplitude (TTS/Mic) and system states.
- **🎙️ Neural TTS & STT**: Low-latency voice interaction pipeline via `edge-tts-universal` and local Whisper-WASM processing.
- **📚 Skill Protocol**: An evolving library of learned behaviors and system-wide "lessons" stored in an atomic knowledge vault.
- **🛡️ Safety First**: Granular autonomy levels (Observe, Assist, Autonomous) with predictive safety blocking for destructive commands.

## 🛠️ Tech Stack
| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Framer Motion, TailwindCSS 4 |
| **3D Engine** | Three.js, React Three Fiber, GLSL Shaders |
| **Native Shell** | Tauri 2 (Rust), Node.js tool sidecar |
| **Intelligence** | Ollama (Gemma 4:e2b), @xenova/transformers |
| **Styling** | Vanilla CSS, Glassmorphism Design System |

## ⚙️ Installation
1. **Prerequisites**:
   - Install [Ollama](https://ollama.com/) and pull the required model: `ollama pull gemma4:e2b`.
   - Node.js (v22+ recommended).
   - Rust toolchain ([rustup](https://rustup.rs/)) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) (WebView2 ships with Windows 10/11).
2. **Clone & Setup**:
   ```bash
   git clone https://github.com/Rainer-Coetzer/rudi-agent.git
   cd rudi-agent
   npm install
   ```
3. **Backend dependencies** (the backend keeps its own `node_modules`):
   ```bash
   npm install --prefix backend
   ```
   For Claude access, put `ANTHROPIC_API_KEY=...` in `backend/.env` (dev) or in `.env` inside the data folder (installed app).
4. **Run in Development** (desktop app, with hot reload):
   ```bash
   npm run app:dev
   ```
   The shell starts the Express backend (`backend/server.js`, `http://127.0.0.1:3001/api/health`) and stops it when the app closes; if something already answers on that port it is left alone. `npm run dev` still serves the UI alone in a browser, without native tools; run `npm start --prefix backend` alongside it if you need the API there.
5. **Package** (NSIS installer, bundles the Node runtime for the sidecar and backend):
   ```bash
   npm run app:build
   ```
   This reinstalls `backend/node_modules` with production deps only and ships the backend as a resource folder.

### Configuration
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `RUDI_BACKEND_PORT` | `3001` | Port the shell starts the backend on; the UI follows it. |
| `RUDI_USER_DATA` | `%APPDATA%\rudi-agent` | Data folder shared by the sidecar and backend (settings, logs, `knowledge_base.json`, `.env`). A knowledge base from the old `%APPDATA%\rudi-app` folder is copied here on first run; the original is kept. |
| `RUDI_MODELS_DIR` | Ollama's own (`OLLAMA_MODELS` or `~\.ollama\models`) | Where Ollama stores Rudi's models. `D:\Rudi\models` is still used if it exists. |

## 🎮 Usage
- **Wake Word**: Rudi listens for "Rudi" or "Hey Rudi" to initiate active listening (Local Whisper).
- **Command Entry**: Command the agent via voice or the specialized command bar.
- **Autonomy Toggle**: Switch between `Observe` (Suggestions), `Assist` (Standard), and `Autonomous` (Hands-free) modes.
- **Undo**: Use the global Undo capability to roll back native file operations.

## 📁 Project Structure
```text
rudi-agent/
├── backend/            # Express API (chat, TTS, knowledge), spawned by the shell
│   ├── routes/         # Chat, Voice, Knowledge, and System status APIs
│   └── resourceManager # Hardware-agnostic (AMD/NVIDIA) VRAM detection
├── src-tauri/          # Rust shell: windows, ghost hotkey, awareness, Ollama bootstrap
├── sidecar/            # Node tool layer, spawned by the shell (stdio JSON protocol)
│   ├── handlers/       # File, Shell, and System tool handlers
│   ├── plugins/        # Drop-in JS/Python tool plugins
│   └── logger.ts       # Centralized activity logging
├── src/                # React Frontend
│   ├── components/     # UI Components (RudiSphere, Command Center)
│   ├── hooks/          # Modular hooks (useVoice, useRudi, useHealth)
│   ├── workers/        # Local Whisper STT Workers (WASM)
│   └── utils/          # Safety protocols & Configuration
├── public/             # Static assets
└── package.json        # Vite + Tauri scripts
```

## 🛡️ Security Considerations
- **Sandboxed Execution**: Native tools are validated against a strict `TOOL_WHITELIST` before IPC dispatch.
- **Autonomous Safety**: High-permission tools (e.g., `git push`, `delete_file`) always require explicit user confirmation regardless of mode.
- **Dynamic Resource Scoring**: Pre-inference hardware checks ensure the system never crashes due to memory pressure.

## 🤝 Contributing
Contributions are welcome. Please ensure that all new UI components adhere to the established "Premium Glass" design system and that any new native tools include appropriate safety-validation logic in `src/utils/safety.ts`.

## 📄 License
MIT License. See `LICENSE` for details.

---
*"The system is optimal, Sir."*
