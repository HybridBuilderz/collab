# 🦙 Google Colab Ollama Chatbot

A fast, lightweight local chatbot application (Web UI & CLI) connected directly to your remote **Google Colab Ollama** instance.

---

## 🌟 Features

- **Real-Time Streaming**: Live word-by-word token streaming from the remote Colab GPU/CPU.
- **Auto-Discovery**: Dynamically detects available models on the Colab server.
- **Zero External Dependencies**: Powered purely by standard Python libraries (no `pip install` required).
- **Configurable Server URL**: Easily update the Cloudflare / Ngrok tunnel URL through the Web UI or CLI command without restarting.
- **Dual Interface**: Includes both a modern dark-mode Web UI and a fast Terminal CLI.

---

## 🚀 Quick Start

### Option 1: Web Interface
Double-click `start_web_chat.bat` or run:
```powershell
python app.py
```
Open **[http://localhost:5000](http://localhost:5000)** in your browser.

### Option 2: Terminal CLI
Double-click `start_cli_chat.bat` or run:
```powershell
python colab_chat_cli.py
```

---

## ⚙️ Updating the Colab Server URL

Whenever you start a new Colab session, update the tunnel URL using either:
1. **Web UI**: Click the **⚙️ Config** button in the top right.
2. **CLI**: Type `/url https://<new-tunnel-url>.trycloudflare.com`.
3. **Environment Variable**: Set `$env:COLAB_OLLAMA_URL="https://..."`.
