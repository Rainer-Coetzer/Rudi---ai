# 🎙️ Rudi Agent — Autonomous Local Intelligence

> **"At your service, Sir."** — A premium, high-performance autonomous desktop assistant inspired by J.A.R.V.I.S., running entirely on localized hardware.

![Rudi Overview](https://img.shields.io/badge/Status-Hardened-cyan?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-Electron_|_React_|_Ollama-blue?style=for-the-badge)
![Autonomy](https://img.shields.io/badge/Autonomy-Protocol_Aware-gold?style=for-the-badge)

---

## 📖 Short Description
Rudi is an advanced desktop orchestrator that bridges the gap between local LLMs (Gemma 4 via Ollama) and native OS automation. It features a hardware-accelerated 3D neural sphere, real-time voice synthesis, and an autonomous tool-chaining core designed for professional software engineering and system management.

## 🚀 Overview
Rudi is built for users who demand privacy without compromising on power. Unlike cloud-based assistants, Rudi operates 100% locally, utilizing a customized Gemma 4 model for cognitive processing and Electron's native bridges for deep OS integration. The system is architected for low-latency interactions, featuring an O(1) chat reconciliation engine and a modular service-oriented hook system.

## ✨ Features
- **🤖 Autonomous Tool Chaining**: Proactive objective-driven execution with safety-aware permission levels.
- **🌐 Cognitive Local Core**: Deep integration with Ollama for state-of-the-art local inference.
- **🌌 3D Neural Sphere**: A GLSL-powered particle visualization that reacts in real-time to audio amplitude and system states.
- **🎙️ Neural TTS & STT**: Low-latency voice interaction pipeline with buffer pooling for stutter-free playback.
- **📚 Skill Protocol**: An evolving library of learned behaviors and system-wide "lessons" stored in an atomic knowledge vault.
- **🛡️ Safety First**: Granular autonomy levels (Observe, Assist, Autonomous) with predictive safety blocking for destructive commands.

## 🛠️ Tech Stack
| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Framer Motion, TailwindCSS 4 |
| **3D Engine** | Three.js, React Three Fiber, GLSL Shaders |
| **Native Bridge** | Electron, Node.js, IPC Bus |
| **Intelligence** | Ollama (Gemma 4), @xenova/transformers |
| **Styling** | Vanilla CSS, Glassmorphism Design System |

## ⚙️ Installation
1. **Prerequisites**:
   - Install [Ollama](https://ollama.com/) and pull the required model: `ollama pull gemma4`.
   - Node.js (v20+ recommended).
2. **Clone & Setup**:
   ```bash
   git clone https://github.com/your-username/rudi-agent.git
   cd rudi-agent/rudi-app
   npm install
   ```
3. **Run in Development**:
   ```bash
   npm run dev
   ```

## 🎮 Usage
- **Wake Word**: Rudi listens for "Rudi" or "Hey Rudi" to initiate active listening.
- **Command Entry**: Command the agent via voice or the specialized command bar.
- **Autonomy Toggle**: Switch between `Observe` (Suggestions only), `Assist` (Standard), and `Autonomous` (Hands-free) modes via the bottom UI panel.
- **Undo**: Use the global Undo capability to roll back native file operations.

## 📁 Project Structure
```text
rudi-app/
├── backend/            # Express services for Ingestion/TTS
├── electron/           # Main process logic & Tool Handlers
├── src/
│   ├── components/     # UI Components (RudiSphere, ChatPanel)
│   ├── hooks/          # Modular service hooks (useAudio, useHealth)
│   ├── types/          # Global type definitions
│   └── utils/          # Config & Personality logic
└── public/             # Static assets
```

## 🛡️ Security Considerations
- **Sandboxed Execution**: Native tools are validated against a strict whitelist before IPC dispatch.
- **Path Traversal Protection**: Atomic file operations (`knowledgeStore.js`) utilize sanitized paths to prevent unauthorized disk access.
- **Local Data**: No conversation logs or telemetry ever leave the local machine.

## ⚡ Performance Considerations
- **O(1) Rendering**: Chat lists use memoized item components to prevent global re-renders during token streaming.
- **GC Management**: Persistent `Uint8Array` buffer pooling in the audio pipeline eliminates Garbage Collection spikes.
- **GPU Acceleration**: 60fps animations are handled via the vertex shader (GPU side) rather than the React reconciliation loop.

## 🗺️ Roadmap
- [ ] **Multi-Agent Swarm**: Coordination between multiple local models for complex task solving.
- [ ] **Vector Memory**: Transitioning the Knowledge Vault to a local vector DB for semantic search.
- [ ] **Global Hotkeys**: System-wide HUD for invisible control.
- [ ] **Plugin Ecosystem**: Third-party tool extensions for productivity apps.

## 🤝 Contributing
Contributions are welcome. Please ensure that all new UI components adhere to the established "Premium Glass" design system and that any new native tools include appropriate safety-validation logic.

## 📄 License
MIT License. See `LICENSE` for details.

## 👤 Author
Developed and Maintained by **Rainer & Rudi Contributors**.

---
*"The system is optimal, Sir."*
