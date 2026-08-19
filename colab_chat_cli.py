import urllib.request
import json
import sys
import os

DEFAULT_COLAB_URL = "https://cas-freelance-integrity-homework.trycloudflare.com"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

def get_base_url():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
                if "colab_url" in data and data["colab_url"]:
                    return data["colab_url"]
        except Exception:
            pass
    return os.environ.get("COLAB_OLLAMA_URL", DEFAULT_COLAB_URL)

def save_base_url(url):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump({"colab_url": url}, f, indent=2)
    except Exception as e:
        print(f"Failed to save URL to config.json: {e}")

def get_models(base_url):
    try:
        url = f"{base_url.rstrip('/')}/api/tags"
        req = urllib.request.Request(url, headers={"User-Agent": "OllamaColabClient/1.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            return [m["name"] for m in data.get("models", [])]
    except Exception as e:
        print(f"\n⚠️  Warning: Could not fetch models from {base_url}: {e}")
        return []

def stream_chat(base_url, model, messages):
    url = f"{base_url.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "OllamaColabClient/1.0"}
    )
    
    full_response = ""
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            for line in response:
                raw = line.decode("utf-8", errors="replace").strip()
                if not raw:
                    continue
                try:
                    chunk = json.loads(raw)
                    message_chunk = chunk.get("message", {}).get("content", "")
                    sys.stdout.write(message_chunk)
                    sys.stdout.flush()
                    full_response += message_chunk
                    if chunk.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue
        print()
    except Exception as e:
        print(f"\n❌ Error during generation: {e}")
        full_response = None
        
    return full_response

def main():
    colab_url = get_base_url()
    print("=" * 65)
    print("🦙 Colab-Ollama Terminal Chatbot")
    print("=" * 65)
    print(f"Connecting to remote server: {colab_url}")
    
    models = get_models(colab_url)
    if not models:
        print("⚠️  No models detected automatically. Using default 'qwen2.5-coder:7b'")
        current_model = "qwen2.5-coder:7b"
    else:
        print(f"Available models on Colab: {', '.join(models)}")
        current_model = models[0]
        
    print(f"Active model: {current_model}")
    print("Commands:")
    print("  /models        - List available models")
    print("  /model <name>  - Change active model")
    print("  /url <new_url> - Change Colab server URL (persisted to config.json)")
    print("  /clear         - Clear conversation history")
    print("  /exit          - Exit chat")
    print("-" * 65)
    
    messages = []
    
    while True:
        try:
            user_input = input("\n👤 You: ").strip()
            if not user_input:
                continue
                
            if user_input.lower() in ["/exit", "/quit", "exit", "quit"]:
                print("👋 Goodbye!")
                break
                
            if user_input.lower() == "/clear":
                messages.clear()
                print("🧹 Conversation history cleared.")
                continue
                
            if user_input.lower() == "/models":
                models = get_models(colab_url)
                print(f"Available models: {', '.join(models) if models else 'None'}")
                continue
                
            if user_input.lower().startswith("/model "):
                new_model = user_input.split(" ", 1)[1].strip()
                current_model = new_model
                print(f"Switched model to: {current_model}")
                continue
                
            if user_input.lower().startswith("/url "):
                colab_url = user_input.split(" ", 1)[1].strip()
                save_base_url(colab_url)
                print(f"Switched & saved Colab URL: {colab_url}")
                models = get_models(colab_url)
                if models:
                    current_model = models[0]
                    print(f"Using model: {current_model}")
                continue
                
            messages.append({"role": "user", "content": user_input})
            print(f"\n🤖 Colab ({current_model}): ", end="", flush=True)
            
            assistant_reply = stream_chat(colab_url, current_model, messages)
            if assistant_reply:
                messages.append({"role": "assistant", "content": assistant_reply})
            else:
                messages.pop()
                
        except KeyboardInterrupt:
            print("\n👋 Exiting...")
            break
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()
