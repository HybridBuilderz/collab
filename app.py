import http.server
import socketserver
import urllib.request
import urllib.error
import json
import os
import sys

PORT = 5000
DEFAULT_COLAB_URL = "https://cas-freelance-integrity-homework.trycloudflare.com"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "colab_url" in data and data["colab_url"]:
                    return {"colab_url": data["colab_url"]}
        except Exception:
            pass
    return {"colab_url": os.environ.get("COLAB_OLLAMA_URL", DEFAULT_COLAB_URL)}

def save_config(new_config):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(new_config, f, indent=2)
    except Exception as e:
        print(f"Error saving config: {e}")

CONFIG = load_config()

HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Colab Ollama AI Chatbot</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <style>
        :root {
            --bg-main: #0b0f19;
            --bg-card: #151c2c;
            --bg-chat: #080c14;
            --border-color: #26334d;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent: #3b82f6;
            --accent-hover: #2563eb;
            --user-bubble: #1d4ed8;
            --bot-bubble: #172033;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
            background-color: var(--bg-main);
            color: var(--text-primary);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            overflow: hidden;
        }

        .app-container {
            width: 100%;
            max-width: 1050px;
            height: 96vh;
            background: var(--bg-card);
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
            display: flex;
            flex-direction: column;
            border: 1px solid var(--border-color);
            overflow: hidden;
        }

        /* Header */
        .header {
            padding: 14px 24px;
            background: #0f1523;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        .header-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header-title h1 {
            font-size: 1.15rem;
            font-weight: 600;
            letter-spacing: -0.01em;
        }

        .status-container {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.76rem;
            padding: 3px 9px;
            border-radius: 20px;
            background: rgba(34, 197, 94, 0.15);
            color: #4ade80;
            border: 1px solid rgba(34, 197, 94, 0.3);
            width: fit-content;
        }

        .host-display {
            font-size: 0.75rem;
            color: #60a5fa;
            font-family: Consolas, Monaco, monospace;
            cursor: pointer;
            text-decoration: underline;
            max-width: 380px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .host-display:hover {
            color: #93c5fd;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 8px #22c55e;
        }

        .status-dot.offline {
            background: #ef4444;
            box-shadow: 0 0 8px #ef4444;
        }

        .status-dot.loading {
            background: #eab308;
            box-shadow: 0 0 8px #eab308;
        }

        .header-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        select, input[type="text"] {
            background: #0b0f19;
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 0.88rem;
            outline: none;
            transition: border 0.2s;
        }

        select:focus, input[type="text"]:focus {
            border-color: var(--accent);
        }

        .btn {
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 14px;
            font-size: 0.88rem;
            cursor: pointer;
            transition: all 0.15s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
        }

        .btn:hover {
            background: var(--accent-hover);
        }

        .btn-secondary {
            background: #1e293b;
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
            background: #334155;
        }

        .btn-danger {
            background: #dc2626;
        }

        .btn-danger:hover {
            background: #b91c1c;
        }

        /* Chat messages */
        .chat-container {
            flex: 1;
            background: var(--bg-chat);
            padding: 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 18px;
            scroll-behavior: smooth;
        }

        .message {
            display: flex;
            gap: 12px;
            max-width: 88%;
            animation: fadeIn 0.25s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
            align-self: flex-end;
            flex-direction: row-reverse;
        }

        .avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.1rem;
            flex-shrink: 0;
        }

        .avatar.user {
            background: #2563eb;
        }

        .avatar.bot {
            background: #7c3aed;
        }

        .bubble {
            padding: 14px 18px;
            border-radius: 14px;
            font-size: 0.94rem;
            line-height: 1.65;
            word-break: break-word;
        }

        .message.user .bubble {
            background: var(--user-bubble);
            color: #ffffff;
            border-bottom-right-radius: 4px;
        }

        .message.bot .bubble {
            background: var(--bot-bubble);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-bottom-left-radius: 4px;
        }

        .bubble pre {
            background: #090d16;
            padding: 14px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid var(--border-color);
        }

        .bubble code {
            font-family: Consolas, Monaco, "Courier New", Courier, monospace;
            font-size: 0.88rem;
        }

        .bubble p:not(:last-child) {
            margin-bottom: 8px;
        }

        /* Typing Dots */
        .typing-dots span {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #94a3b8;
            margin: 0 2px;
            animation: bounce 1.4s infinite ease-in-out both;
        }
        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1.0); }
        }

        /* Input Bar */
        .input-bar {
            padding: 16px 24px;
            background: #0f1523;
            border-top: 1px solid var(--border-color);
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .input-bar textarea {
            flex: 1;
            background: #080c14;
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 12px 16px;
            font-size: 0.95rem;
            resize: none;
            height: 48px;
            max-height: 140px;
            outline: none;
            transition: border 0.2s;
        }

        .input-bar textarea:focus {
            border-color: var(--accent);
        }

        /* Modal */
        .modal-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.75);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 100;
            backdrop-filter: blur(2px);
        }

        .modal {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 520px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }

        .modal h2 {
            margin-bottom: 14px;
            font-size: 1.2rem;
        }

        .modal-body {
            margin-bottom: 20px;
        }

        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
    </style>
</head>
<body>

<div class="app-container">
    <!-- Header -->
    <div class="header">
        <div class="header-title">
            <span style="font-size: 1.7rem;">🦙</span>
            <div class="status-container">
                <h1>Colab Ollama Client</h1>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div id="statusBadge" class="status-badge">
                        <span class="status-dot loading"></span>
                        <span id="statusText">Connecting...</span>
                    </div>
                    <span id="hostLabel" class="host-display" onclick="openConfigModal()" title="Click to change server URL"></span>
                </div>
            </div>
        </div>

        <div class="header-controls">
            <select id="modelSelect">
                <option value="qwen2.5-coder:7b">qwen2.5-coder:7b</option>
            </select>
            <button class="btn btn-secondary" onclick="openConfigModal()" title="Change Server URL">⚙️ Config</button>
            <button class="btn btn-secondary" onclick="clearChat()" title="Clear Chat">🧹 Clear</button>
        </div>
    </div>

    <!-- Chat Area -->
    <div class="chat-container" id="chatBox">
        <div class="message bot">
            <div class="avatar bot">🤖</div>
            <div class="bubble">
                <strong>Welcome!</strong> Local client connected to Google Colab.<br><br>
                Model <code>qwen2.5-coder:7b</code> is ready. Ask any programming or AI questions!
            </div>
        </div>
    </div>

    <!-- Input Bar -->
    <div class="input-bar">
        <textarea id="userInput" placeholder="Type your message here... (Press Enter to send, Shift+Enter for newline)" rows="1"></textarea>
        <button id="actionBtn" class="btn" onclick="handleAction()">Send 🚀</button>
    </div>
</div>

<!-- Configuration Modal -->
<div class="modal-overlay" id="configModal">
    <div class="modal">
        <h2>⚙️ Server Configuration</h2>
        <div class="modal-body">
            <label style="font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 6px;">Google Colab Host URL:</label>
            <input type="text" id="colabUrlInput" style="width: 100%;" placeholder="https://xxxx.trycloudflare.com">
            <p style="font-size: 0.78rem; color: #64748b; margin-top: 8px;">Changes are automatically saved to <code>config.json</code>.</p>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeConfigModal()">Cancel</button>
            <button class="btn" onclick="saveConfig()">Save & Connect</button>
        </div>
    </div>
</div>

<script>
    let chatHistory = [];
    let currentServerUrl = "";
    let isGenerating = false;
    let currentAbortController = null;

    async function init() {
        try {
            const res = await fetch("/api/config");
            const data = await res.json();
            currentServerUrl = data.colab_url;
            document.getElementById("colabUrlInput").value = currentServerUrl;
            document.getElementById("hostLabel").textContent = "Host: " + currentServerUrl;
            await loadModels();
        } catch (e) {
            updateStatus(false, "Local Proxy Offline");
        }
    }

    async function loadModels() {
        updateStatus(null, "Checking models...");
        try {
            const res = await fetch("/api/proxy/tags");
            if (!res.ok) throw new Error("Could not fetch models");
            const data = await res.json();
            const select = document.getElementById("modelSelect");
            select.innerHTML = "";
            
            if (data.models && data.models.length > 0) {
                data.models.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.name;
                    opt.textContent = m.name;
                    select.appendChild(opt);
                });
                updateStatus(true, "Connected (" + data.models.length + " model" + (data.models.length > 1 ? "s" : "") + ")");
            } else {
                updateStatus(true, "Connected (0 models)");
            }
        } catch (e) {
            updateStatus(false, "Colab Tunnel Unreachable");
        }
    }

    function updateStatus(isOnline, text) {
        const badge = document.getElementById("statusBadge");
        const statusText = document.getElementById("statusText");
        const dot = badge.querySelector(".status-dot");
        
        statusText.textContent = text;
        if (isOnline === true) {
            dot.className = "status-dot";
            badge.style.background = "rgba(34, 197, 94, 0.15)";
            badge.style.color = "#4ade80";
        } else if (isOnline === false) {
            dot.className = "status-dot offline";
            badge.style.background = "rgba(239, 68, 68, 0.15)";
            badge.style.color = "#f87171";
        } else {
            dot.className = "status-dot loading";
            badge.style.background = "rgba(234, 179, 8, 0.15)";
            badge.style.color = "#facc15";
        }
    }

    function appendMessage(role, text) {
        const chatBox = document.getElementById("chatBox");
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${role}`;
        
        const avatar = document.createElement("div");
        avatar.className = `avatar ${role}`;
        avatar.textContent = role === "user" ? "👤" : "🤖";
        
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = text ? marked.parse(text) : '<span class="typing-dots"><span></span><span></span><span></span></span>';
        
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatBox.appendChild(msgDiv);
        
        chatBox.scrollTop = chatBox.scrollHeight;
        document.querySelectorAll('pre code').forEach((el) => {
            hljs.highlightElement(el);
        });

        return bubble;
    }

    function handleAction() {
        if (isGenerating) {
            stopGeneration();
        } else {
            sendMessage();
        }
    }

    function stopGeneration() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        isGenerating = false;
        setButtonState(false);
    }

    function setButtonState(generating) {
        const btn = document.getElementById("actionBtn");
        if (generating) {
            btn.textContent = "Stop ⏹️";
            btn.className = "btn btn-danger";
        } else {
            btn.textContent = "Send 🚀";
            btn.className = "btn";
        }
    }

    async function sendMessage() {
        if (isGenerating) return;
        const input = document.getElementById("userInput");
        const text = input.value.trim();
        if (!text) return;
        
        input.value = "";
        input.style.height = "48px";
        
        appendMessage("user", text);
        chatHistory.push({ role: "user", content: text });
        
        const model = document.getElementById("modelSelect").value;
        isGenerating = true;
        setButtonState(true);
        
        const botBubble = appendMessage("bot", "");
        let accumulatedResponse = "";
        currentAbortController = new AbortController();
        
        try {
            const response = await fetch("/api/proxy/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model,
                    messages: chatHistory,
                    stream: true
                }),
                signal: currentAbortController.signal
            });
            
            if (!response.ok) {
                throw new Error("Colab server returned HTTP " + response.status);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let streamBuffer = "";
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                streamBuffer += decoder.decode(value, { stream: true });
                const lines = streamBuffer.split("\\n");
                streamBuffer = lines.pop();
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (parsed.message && parsed.message.content) {
                            accumulatedResponse += parsed.message.content;
                            botBubble.innerHTML = marked.parse(accumulatedResponse);
                            document.getElementById("chatBox").scrollTop = document.getElementById("chatBox").scrollHeight;
                        }
                    } catch (err) {}
                }
            }

            if (streamBuffer.trim()) {
                try {
                    const parsed = JSON.parse(streamBuffer.trim());
                    if (parsed.message && parsed.message.content) {
                        accumulatedResponse += parsed.message.content;
                        botBubble.innerHTML = marked.parse(accumulatedResponse);
                    }
                } catch (err) {}
            }
            
            if (accumulatedResponse) {
                chatHistory.push({ role: "assistant", content: accumulatedResponse });
            } else {
                botBubble.innerHTML = "<span style='color: #94a3b8;'>(Empty response received)</span>";
            }
            
            document.querySelectorAll('pre code').forEach((el) => {
                hljs.highlightElement(el);
            });
            
        } catch (e) {
            if (e.name === "AbortError") {
                botBubble.innerHTML += " <span style='color: #eab308; font-size: 0.85rem;'>[Generation stopped]</span>";
            } else {
                botBubble.innerHTML = `<span style="color: #f87171;">❌ Connection Error: ${e.message}</span>`;
            }
        } finally {
            isGenerating = false;
            currentAbortController = null;
            setButtonState(false);
            document.getElementById("userInput").focus();
        }
    }

    function clearChat() {
        chatHistory = [];
        const chatBox = document.getElementById("chatBox");
        chatBox.innerHTML = `
            <div class="message bot">
                <div class="avatar bot">🤖</div>
                <div class="bubble">
                    Conversation history cleared. How can I assist you now?
                </div>
            </div>
        `;
    }

    function openConfigModal() {
        document.getElementById("configModal").style.display = "flex";
    }

    function closeConfigModal() {
        document.getElementById("configModal").style.display = "none";
    }

    async function saveConfig() {
        const newUrl = document.getElementById("colabUrlInput").value.trim();
        if (newUrl) {
            try {
                await fetch("/api/config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ colab_url: newUrl })
                });
                currentServerUrl = newUrl;
                document.getElementById("hostLabel").textContent = "Host: " + currentServerUrl;
                closeConfigModal();
                await loadModels();
            } catch (e) {
                alert("Failed to save config: " + e.message);
            }
        }
    }

    document.getElementById("userInput").addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    init();
</script>
</body>
</html>
"""

class ColabChatbotHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode("utf-8"))
            return

        if self.path == "/api/config":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(CONFIG).encode("utf-8"))
            return

        if self.path == "/api/proxy/tags":
            target_url = f"{CONFIG['colab_url'].rstrip('/')}/api/tags"
            try:
                req = urllib.request.Request(target_url, headers={"User-Agent": "ColabOllamaWebClient/1.0"})
                with urllib.request.urlopen(req, timeout=10) as response:
                    content = response.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(content)
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        if self.path == "/api/config":
            try:
                data = json.loads(body.decode("utf-8"))
                if "colab_url" in data and data["colab_url"]:
                    CONFIG["colab_url"] = data["colab_url"]
                    save_config(CONFIG)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "config": CONFIG}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
            return

        if self.path == "/api/proxy/chat":
            target_url = f"{CONFIG['colab_url'].rstrip('/')}/api/chat"
            try:
                req = urllib.request.Request(
                    target_url,
                    data=body,
                    headers={"Content-Type": "application/json", "User-Agent": "ColabOllamaWebClient/1.0"}
                )
                with urllib.request.urlopen(req, timeout=120) as response:
                    self.send_response(200)
                    self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()

                    try:
                        for line in response:
                            if not line:
                                continue
                            chunk_len = f"{len(line):X}\r\n".encode("utf-8")
                            self.wfile.write(chunk_len + line + b"\r\n")
                            self.wfile.flush()

                        self.wfile.write(b"0\r\n\r\n")
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        # Client disconnected or stopped generation
                        pass

            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

def run_server():
    # Multi-threaded HTTP server so concurrent requests and streams never block each other
    httpd = http.server.ThreadingHTTPServer(("", PORT), ColabChatbotHandler)
    httpd.daemon_threads = True
    print("=" * 60)
    print("🚀 Colab Ollama Multi-Threaded Web Chatbot is running!")
    print(f"👉 Local Web UI: http://localhost:{PORT}")
    print(f"🔗 Connected to Colab: {CONFIG['colab_url']}")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")

if __name__ == "__main__":
    run_server()
