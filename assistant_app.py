#!/usr/bin/env python3
"""Assistente pessoal local funcionando sem dependências externas."""

from __future__ import annotations

import base64
import binascii
import hmac
import json
import os
import re
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = Path(os.environ.get("JARVIS_DATA_FILE", str(BASE_DIR / "data" / "personal_assistant.json")))


def make_id(prefix: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"{prefix}-{timestamp}"


def default_data() -> dict:
    now = datetime.now()
    return {
        "tasks": [
            {
                "id": "task-1",
                "title": "Responder e-mails importantes",
                "category": "Trabalho",
                "due_date": now.strftime("%Y-%m-%d"),
                "done": False,
            },
            {
                "id": "task-2",
                "title": "Organizar agenda da semana",
                "category": "Pessoal",
                "due_date": (now).strftime("%Y-%m-%d"),
                "done": False,
            },
        ],
        "notes": [
            {
                "id": "note-1",
                "title": "Ideias do dia",
                "content": "- Revisar metas de produtividade\n- Agendar reunião de alinhamento\n- Separar 30 minutos para planejamento.",
            }
        ],
        "reminders": [
            {"id": "reminder-1", "text": "Ligar para a cliente sobre o projeto", "time": "09:00"},
            {"id": "reminder-2", "text": "Hora de pausar e hidratar", "time": "15:30"},
        ],
    }


def ensure_data_file() -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(default_data(), ensure_ascii=False, indent=2), encoding="utf-8")


def load_data() -> dict:
    ensure_data_file()
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_data(data: dict) -> None:
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_message_for_task(message: str) -> str | None:
    match = re.search(r"(?:adicionar|criar|nova) tarefa(?:s)?\s*(.*)", message.lower())
    if match:
        title = match.group(1).strip()
        return title.replace("?", "").strip() or None
    match = re.search(r"tarefa\s*(?::\s*|-)\s*(.+)", message.lower())
    if match:
        return match.group(1).strip()
    return None


def parse_message_for_note(message: str) -> str | None:
    match = re.search(r"(?:adicionar|criar|nova) nota(?:s)?\s*(.*)", message.lower())
    if match:
        title = match.group(1).strip()
        return title.replace("?", "").strip() or None
    match = re.search(r"nota\s*(?::\s*|-)\s*(.+)", message.lower())
    if match:
        return match.group(1).strip()
    return None


def parse_message_for_reminder(message: str) -> str | None:
    match = re.search(r"(?:adicionar|criar|novo) lembrete\s*(.*)", message.lower())
    if match:
        text = match.group(1).strip()
        return text.replace("?", "").strip() or None
    match = re.search(r"lembrete\s*(?::\s*|-)\s*(.+)", message.lower())
    if match:
        return match.group(1).strip()
    return None


def process_command(message: str) -> dict | None:
    text = (message or "").strip()
    if not text:
        return {"reply": "Posso ajudar com tarefas, lembretes e notas. Experimente: 'adicionar tarefa revisar proposta'."}

    lower = text.lower()
    if "hora" in lower:
        return {"reply": f"Agora são {datetime.now().strftime('%H:%M')}"}
    if "data" in lower:
        return {"reply": f"Hoje é {datetime.now().strftime('%d/%m/%Y')}"}

    task_title = parse_message_for_task(text)
    if task_title:
        data = load_data()
        task = {
            "id": make_id("task"),
            "title": task_title.title(),
            "category": "Assistente",
            "due_date": datetime.now().strftime("%Y-%m-%d"),
            "done": False,
        }
        data["tasks"].append(task)
        save_data(data)
        return {"reply": f"Tarefa adicionada: {task['title']}.", "data": task}

    note_title = parse_message_for_note(text)
    if note_title:
        data = load_data()
        note = {"id": make_id("note"), "title": note_title.title(), "content": note_title}
        data["notes"].append(note)
        save_data(data)
        return {"reply": f"Nota salva: {note['title']}.", "data": note}

    reminder_text = parse_message_for_reminder(text)
    if reminder_text:
        data = load_data()
        reminder = {"id": make_id("reminder"), "text": reminder_text.title(), "time": datetime.now().strftime("%H:%M")}
        data["reminders"].append(reminder)
        save_data(data)
        return {"reply": f"Lembrete registrado: {reminder['text']}.", "data": reminder}

    if "tarefas" in lower or "lista" in lower:
        data = load_data()
        tasks = data.get("tasks", [])
        if not tasks:
            return {"reply": "Você ainda não tem tarefas."}
        items = "\n".join(f"- {t['title']} ({'concluída' if t.get('done') else 'pendente'})" for t in tasks[:5])
        return {"reply": f"Suas tarefas:\n{items}"}

    if "nota" in lower:
        data = load_data()
        notes = data.get("notes", [])
        if not notes:
            return {"reply": "Você ainda não tem notas."}
        items = "\n".join(f"- {n['title']}" for n in notes[:5])
        return {"reply": f"Suas notas:\n{items}"}

    if "lembrete" in lower:
        data = load_data()
        reminders = data.get("reminders", [])
        if not reminders:
            return {"reply": "Você ainda não tem lembretes."}
        items = "\n".join(f"- {r['text']} às {r['time']}" for r in reminders[:5])
        return {"reply": f"Seus lembretes:\n{items}"}

    return None


class AIConfigurationError(Exception):
    pass


class AIServiceError(Exception):
    pass


def ai_settings() -> tuple[str, str, str]:
    provider = os.environ.get("JARVIS_PROVIDER", "openai").strip().lower()
    if provider == "ollama":
        return (
            provider,
            os.environ.get("OLLAMA_MODEL", "qwen2.5:7b"),
            os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1").rstrip("/"),
        )
    if provider == "openai":
        return (
            provider,
            os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            "https://api.openai.com/v1",
        )
    if provider == "groq":
        return (
            provider,
            os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
            "https://api.groq.com/openai/v1",
        )
    raise AIConfigurationError("JARVIS_PROVIDER deve ser 'openai', 'ollama' ou 'groq'.")


def ask_ai(message: str, history: list) -> str:
    provider, model, base_url = ai_settings()
    key_variable = {"openai": "OPENAI_API_KEY", "groq": "GROQ_API_KEY"}.get(provider)
    api_key = os.environ.get(key_variable, "") if key_variable else "ollama"
    if key_variable and not api_key:
        raise AIConfigurationError(
            f"A conversa com IA não está configurada. Defina {key_variable} ou selecione outro provedor."
        )

    data = load_data()
    context = {
        "tarefas": data.get("tasks", []),
        "notas": data.get("notes", []),
        "lembretes": data.get("reminders", []),
        "data_atual": datetime.now().strftime("%d/%m/%Y"),
        "hora_atual": datetime.now().strftime("%H:%M"),
    }
    messages = [
        {
            "role": "system",
            "content": (
                "Você é JARVIS, um assistente pessoal avançado, confiável e proativo. "
                "Responda em português do Brasil, adaptando o nível de detalhe ao pedido. "
                "Organize problemas complexos em etapas, explique premissas e destaque incertezas. "
                "Use o contexto pessoal fornecido quando for relevante. O aplicativo executa apenas "
                "comandos reconhecidos para tarefas, notas e lembretes; nunca afirme que realizou "
                "ações no computador, enviou mensagens ou acessou serviços externos. Se uma solicitação "
                "exigir uma capacidade que você não tem, informe isso e sugira uma alternativa. "
                "Contexto atual (dados pessoais do usuário): "
                + json.dumps(context, ensure_ascii=False)
            ),
        }
    ]
    if isinstance(history, list):
        for item in history[-10:]:
            if not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}:
                continue
            content = item.get("content")
            if isinstance(content, str) and content.strip():
                messages.append({"role": item["role"], "content": content[:4000]})
    messages.append({"role": "user", "content": message[:4000]})

    body = json.dumps(
        {
            "model": model,
            "messages": messages,
            "temperature": 0.7,
        }
    ).encode("utf-8")
    request = Request(
        f"{base_url}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=120 if provider == "ollama" else 30) as response:
            result = json.loads(response.read().decode("utf-8"))
        reply = result["choices"][0]["message"]["content"]
    except HTTPError as error:
        try:
            details = json.loads(error.read().decode("utf-8")).get("error", {}).get("message")
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            details = None
        message_text = f"Serviço de IA ({provider}) retornou HTTP {error.code}."
        if details:
            message_text += f" {details}"
        raise AIServiceError(message_text) from error
    except (URLError, TimeoutError) as error:
        if provider == "ollama":
            raise AIServiceError(
                "Não foi possível conectar ao Ollama. Confira se ele está iniciado, "
                "se OLLAMA_BASE_URL está correto e se o modelo foi baixado."
            ) from error
        raise AIServiceError("Não foi possível conectar ao serviço de IA.") from error
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise AIServiceError("O serviço de IA retornou uma resposta inválida.") from error

    if not isinstance(reply, str) or not reply.strip():
        raise AIServiceError("O serviço de IA retornou uma resposta vazia.")
    return reply.strip()


class AssistantHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def _authorize(self) -> bool:
        password = os.environ.get("JARVIS_PASSWORD")
        if not password:
            return True

        username = os.environ.get("JARVIS_USERNAME", "jarvis")
        header = self.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        try:
            decoded = base64.b64decode(token, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError, ValueError):
            decoded = ""
        supplied_username, separator, supplied_password = decoded.partition(":")
        authenticated = (
            scheme.lower() == "basic"
            and bool(separator)
            and hmac.compare_digest(supplied_username, username)
            and hmac.compare_digest(supplied_password, password)
        )
        if not authenticated:
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="JARVIS", charset="UTF-8"')
            self.send_header("Content-Length", "0")
            self.end_headers()
        return authenticated

    def do_GET(self):
        if not self._authorize():
            return
        path = urlparse(self.path).path
        if path == "/api/status":
            try:
                provider, model, _ = ai_settings()
                key_variable = {"openai": "OPENAI_API_KEY", "groq": "GROQ_API_KEY"}.get(provider)
                configured = not key_variable or bool(os.environ.get(key_variable))
            except AIConfigurationError:
                provider, model, configured = "inválido", "", False
            self.send_json({"provider": provider, "model": model, "configured": configured})
            return
        if path == "/api/tasks":
            self.send_json(load_data().get("tasks", []))
            return
        if path == "/api/notes":
            self.send_json(load_data().get("notes", []))
            return
        if path == "/api/reminders":
            self.send_json(load_data().get("reminders", []))
            return
        if path == "/api/overview":
            data = load_data()
            tasks = data.get("tasks", [])
            pending = sum(1 for item in tasks if not item.get("done"))
            self.send_json(
                {
                    "task_count": len(tasks),
                    "pending_tasks": pending,
                    "note_count": len(data.get("notes", [])),
                    "reminder_count": len(data.get("reminders", [])),
                    "current_time": datetime.now().strftime("%H:%M"),
                    "today": datetime.now().strftime("%d/%m/%Y"),
                }
            )
            return
        super().do_GET()

    def do_POST(self):
        if not self._authorize():
            return
        path = urlparse(self.path).path
        payload = self._read_json_body()

        if path == "/api/tasks":
            data = load_data()
            task = {
                "id": make_id("task"),
                "title": payload.get("title", "Nova tarefa").strip() or "Nova tarefa",
                "category": payload.get("category", "Pessoal"),
                "due_date": payload.get("due_date", datetime.now().strftime("%Y-%m-%d")),
                "done": bool(payload.get("done", False)),
            }
            data["tasks"].append(task)
            save_data(data)
            self.send_json(task, status=201)
            return

        if path == "/api/notes":
            data = load_data()
            note = {
                "id": make_id("note"),
                "title": payload.get("title", "Nova nota").strip() or "Nova nota",
                "content": payload.get("content", "").strip() or "Sem conteúdo",
            }
            data["notes"].append(note)
            save_data(data)
            self.send_json(note, status=201)
            return

        if path == "/api/reminders":
            data = load_data()
            reminder = {
                "id": make_id("reminder"),
                "text": payload.get("text", "Novo lembrete").strip() or "Novo lembrete",
                "time": payload.get("time", datetime.now().strftime("%H:%M")),
            }
            data["reminders"].append(reminder)
            save_data(data)
            self.send_json(reminder, status=201)
            return

        if path == "/api/chat":
            message = payload.get("message", "")
            command_result = process_command(message)
            if command_result is not None:
                self.send_json(command_result)
                return
            try:
                reply = ask_ai(message, payload.get("history", []))
                self.send_json({"reply": reply})
            except AIConfigurationError as error:
                self.send_json({"error": str(error)}, status=503)
            except AIServiceError as error:
                self.send_json({"error": str(error)}, status=502)
            return

        self.send_error(404)

    def do_PATCH(self):
        if not self._authorize():
            return
        path = urlparse(self.path).path
        if not path.startswith("/api/tasks/"):
            self.send_error(404)
            return
        payload = self._read_json_body()
        task_id = path.rsplit("/", 1)[-1]
        data = load_data()
        for task in data["tasks"]:
            if task["id"] == task_id:
                if "done" in payload:
                    task["done"] = bool(payload["done"])
                if "title" in payload:
                    task["title"] = payload["title"]
                if "category" in payload:
                    task["category"] = payload["category"]
                save_data(data)
                self.send_json(task)
                return
        self.send_error(404, "Tarefa não encontrada")

    def do_DELETE(self):
        if not self._authorize():
            return
        path = urlparse(self.path).path
        if path.startswith("/api/tasks/"):
            task_id = path.rsplit("/", 1)[-1]
            data = load_data()
            data["tasks"] = [item for item in data["tasks"] if item["id"] != task_id]
            save_data(data)
            self.send_json({"deleted": task_id})
            return
        if path.startswith("/api/notes/"):
            note_id = path.rsplit("/", 1)[-1]
            data = load_data()
            data["notes"] = [item for item in data["notes"] if item["id"] != note_id]
            save_data(data)
            self.send_json({"deleted": note_id})
            return
        if path.startswith("/api/reminders/"):
            reminder_id = path.rsplit("/", 1)[-1]
            data = load_data()
            data["reminders"] = [item for item in data["reminders"] if item["id"] != reminder_id]
            save_data(data)
            self.send_json({"deleted": reminder_id})
            return
        self.send_error(404)

    def _read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return {}
        body = self.rfile.read(length) if length > 0 else b""
        if not body:
            return {}
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(host: str | None = None, port: int | None = None):
    host = host or os.environ.get("JARVIS_HOST", "127.0.0.1")
    port = port or int(os.environ.get("PORT", os.environ.get("JARVIS_PORT", "8000")))
    if host not in {"127.0.0.1", "localhost", "::1"} and not os.environ.get("JARVIS_PASSWORD"):
        raise RuntimeError("Defina JARVIS_PASSWORD antes de expor o JARVIS em uma rede pública.")
    ensure_data_file()
    server = ThreadingHTTPServer((host, port), AssistantHandler)
    print(f"Assistente pessoal em http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
