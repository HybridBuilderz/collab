# AGENTS.md — Agent & Developer Guide

This document defines the architecture, workflows, conventions, and operational guidelines for AI agents and developers working on the **Colab Ollama Remote Inference & Chatbot** project.

---

## 📌 Project Overview

This project provides a zero-dependency local chatbot environment (Web UI + Terminal CLI) that connects to a remote **Ollama** instance hosted on **Google Colab**, bridged via encrypted **Cloudflare Tunnels** and controlled programmatically via the **Google Colab MCP Server**.

---

## 🏗️ Architecture & Component Map

```
┌────────────────────────────────────────────────────────┐
│                   Google Colab Runtime                 │
│  • Ollama Daemon (0.0.0.0:11434)                       │
│  • Models: qwen2.5-coder:1.5b, qwen2.5-coder:7b        │
│  • Cloudflare Tunnel (cloudflared)                     │
└───────────────────────────┬────────────────────────────┘
                            │ Public HTTPS Tunnel
                            ▼
┌────────────────────────────────────────────────────────┐
│               Local Multi-Threaded Server              │
│                  (app.py - Port 5000)                  │
│  • ThreadingHTTPServer (Non-blocking concurrent reqs) │
│  • Reverse Proxy (/api/proxy/chat, /api/proxy/tags)   │
│  • Persistent Configuration (config.json)              │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌──────────────────────────┐ ┌──────────────────────────┐
│         Web UI           │ │       Terminal CLI       │
│  • Real-time Streaming   │ │  • colab_chat_cli.py     │
│  • Syntax Highlighting   │ │  • Fast interactive      │
│  • Abort / Stop Control  │ │    terminal streaming    │
│  • Dynamic Model Switcher│ └──────────────────────────┘
└──────────────────────────┘
```

---

## 📂 Key Files & Directories

| File / Folder | Purpose |
| :--- | :--- |
| [`app.py`](file:///C:/Users/Jewel%20Builder/colab-ollama-chat/app.py) | Main multi-threaded local web server and single-page application UI. |
| [`colab_chat_cli.py`](file:///C:/Users/Jewel%20Builder/colab-ollama-chat/colab_chat_cli.py) | Terminal-based interactive chatbot client. |
| [`config.json`](file:///C:/Users/Jewel%20Builder/colab-ollama-chat/config.json) | Central persistent store for active Colab tunnel URLs. |
| [`start_web_chat.bat`](file:///C:/Users/Jewel%20Builder/colab-ollama-chat/start_web_chat.bat) | Windows 1-click batch launcher for Web UI. |
| [`start_cli_chat.bat`](file:///C:/Users/Jewel%20Builder/colab-ollama-chat/start_cli_chat.bat) | Windows 1-click batch launcher for Terminal CLI. |
| [`README.md`](file:///C:/Users/Jewel%20Builder/colab-ollama-chat/README.md) | User documentation and setup overview. |

---

## 🛠️ Developer & Agent Workflows

### 1. Starting the Application
* **Web UI:**
  ```powershell
  cd "C:\Users\Jewel Builder\colab-ollama-chat"
  python app.py
  # Access at http://localhost:5000
  ```
* **CLI:**
  ```powershell
  cd "C:\Users\Jewel Builder\colab-ollama-chat"
  python colab_chat_cli.py
  ```

### 2. Updating Colab Server URL
When a Colab runtime is restarted and generates a new tunnel URL:
* **Through Web UI:** Click **⚙️ Config** in the top navigation, paste the new URL, and click **Save & Connect**.
* **Through CLI:** Type `/url https://<new-tunnel>.trycloudflare.com`.
* **Programmatically:** Update [`config.json`](file:///C:/Users/Jewel%20Builder/colab-ollama-chat/config.json) or set `$env:COLAB_OLLAMA_URL`.

### 3. Managing Remote Models in Colab
Execute directly inside the Colab notebook:
* **Pull a new model:** `!ollama pull <model_name>` (e.g. `qwen2.5-coder:1.5b`, `llama3.2`, `deepseek-r1:8b`)
* **List installed models:** `!ollama list`
* **Delete a model:** `!ollama rm <model_name>`

---

## 🔒 Constraints & Guardrails for AI Agents

1. **Zero External Dependencies:**
   * The local client application MUST run using only Python standard libraries (`http.server`, `urllib.request`, `socketserver`, `json`, `os`, `sys`). Do NOT introduce dependencies on `flask`, `fastapi`, or `requests` unless explicitly requested.

2. **Concurrency & Thread Safety:**
   * Always use `http.server.ThreadingHTTPServer` (or `socketserver.ThreadingTCPServer` with `daemon_threads = True`). Never regress to a single-threaded server that could block on token streams.

3. **Stream Buffering Integrity:**
   * Ollama yields newline-delimited JSON (`x-ndjson`). Both backend proxies and frontend clients must maintain line buffers (`streamBuffer`) to prevent JSON parse errors when network packets fragment across token boundaries.

4. **Hardware Performance Awareness:**
   * On Colab CPU/TPU runtimes, recommend lightweight models (`1.5b` to `3b`) to avoid CPU thread locking.
   * For larger models (`7b`+), recommend NVIDIA GPU runtimes (**T4 / L4 / A100**).
