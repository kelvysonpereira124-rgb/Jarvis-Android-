const chatMessages = document.querySelector('#chatMessages');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const voiceInputButton = document.querySelector('#voiceInputButton');
const voiceOutputButton = document.querySelector('#voiceOutputButton');
const voiceStatus = document.querySelector('#voiceStatus');
const aiStatus = document.querySelector('#aiStatus');
const clearChatButton = document.querySelector('#clearChatButton');

const taskForm = document.querySelector('#taskForm');
const noteForm = document.querySelector('#noteForm');
const reminderForm = document.querySelector('#reminderForm');

const taskList = document.querySelector('#taskList');
const noteList = document.querySelector('#noteList');
const reminderList = document.querySelector('#reminderList');

const taskCount = document.querySelector('#taskCount');
const pendingCount = document.querySelector('#pendingCount');
const noteCount = document.querySelector('#noteCount');
const reminderCount = document.querySelector('#reminderCount');
const todayText = document.querySelector('#todayText');
const timeText = document.querySelector('#timeText');
const chatHistory = [];
let speechRecognition;
let speakReplies = true;

try {
  const savedHistory = JSON.parse(localStorage.getItem('jarvis-chat-history') || '[]');
  if (Array.isArray(savedHistory)) {
    savedHistory
      .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
      .slice(-20)
      .forEach((item) => chatHistory.push(item));
  }
} catch {
  voiceStatus.textContent = 'Não foi possível restaurar a conversa salva neste navegador.';
}

if (chatHistory.length) {
  chatMessages.innerHTML = '';
  chatHistory.forEach((item) => addMessage(item.role, item.content));
}

function saveChatHistory() {
  try {
    localStorage.setItem('jarvis-chat-history', JSON.stringify(chatHistory));
    return true;
  } catch (error) {
    voiceStatus.textContent = `A conversa não pôde ser salva neste navegador: ${error.message}`;
    return false;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    let message = `Erro HTTP: ${response.status}`;
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Keep the HTTP status when the server response is not JSON.
    }
    throw new Error(message);
  }

  return response.json();
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderTasks(tasks) {
  taskList.innerHTML = '';
  if (!tasks.length) {
    taskList.innerHTML = '<li class="empty-state">Nenhuma tarefa por enquanto.</li>';
    return;
  }

  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'item';
    const done = task.done ? 'Concluída' : 'Pendente';
    li.innerHTML = `
      <div class="item-main">
        <strong>${escapeHTML(task.title)}</strong>
        <small>${escapeHTML(task.category || 'Pessoal')} • ${escapeHTML(task.due_date || 'Sem data')} • ${done}</small>
      </div>
      <div class="item-actions">
        <button class="action-btn success" data-type="toggle-task" data-id="${task.id}">${task.done ? 'Reabrir' : 'Concluir'}</button>
        <button class="action-btn delete" data-type="delete-task" data-id="${task.id}">Excluir</button>
      </div>
    `;
    taskList.appendChild(li);
  });
}

function renderNotes(notes) {
  noteList.innerHTML = '';
  if (!notes.length) {
    noteList.innerHTML = '<li class="empty-state">Nenhuma nota salva.</li>';
    return;
  }

  notes.forEach((note) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML = `
      <div class="item-main">
        <strong>${escapeHTML(note.title)}</strong>
        <small>${escapeHTML(note.content)}</small>
      </div>
      <div class="item-actions">
        <button class="action-btn delete" data-type="delete-note" data-id="${note.id}">Excluir</button>
      </div>
    `;
    noteList.appendChild(li);
  });
}

function renderReminders(reminders) {
  reminderList.innerHTML = '';
  if (!reminders.length) {
    reminderList.innerHTML = '<li class="empty-state">Nenhum lembrete registrado.</li>';
    return;
  }

  reminders.forEach((reminder) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML = `
      <div class="item-main">
        <strong>${escapeHTML(reminder.text)}</strong>
        <small>às ${escapeHTML(reminder.time)}</small>
      </div>
      <div class="item-actions">
        <button class="action-btn delete" data-type="delete-reminder" data-id="${reminder.id}">Excluir</button>
      </div>
    `;
    reminderList.appendChild(li);
  });
}

async function loadOverview() {
  const overview = await fetchJson('/api/overview');
  taskCount.textContent = overview.task_count;
  pendingCount.textContent = overview.pending_tasks;
  noteCount.textContent = overview.note_count;
  reminderCount.textContent = overview.reminder_count;
  todayText.textContent = `Hoje: ${overview.today}`;
  timeText.textContent = `Hora: ${overview.current_time}`;
}

async function loadAIStatus() {
  const status = await fetchJson('/api/status');
  if (!status.configured) {
    aiStatus.textContent = 'IA não configurada: ajuste as variáveis no terminal.';
    return;
  }
  const provider = status.provider === 'ollama' ? 'Local (Ollama)' : 'OpenAI';
  aiStatus.textContent = `Provedor selecionado: ${provider} · ${status.model}`;
}

async function loadAll() {
  const [tasks, notes, reminders] = await Promise.all([
    fetchJson('/api/tasks'),
    fetchJson('/api/notes'),
    fetchJson('/api/reminders'),
  ]);

  renderTasks(tasks);
  renderNotes(notes);
  renderReminders(reminders);
  await loadOverview();
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const payload = {
    title: document.querySelector('#taskTitle').value,
    category: document.querySelector('#taskCategory').value || 'Pessoal',
    due_date: document.querySelector('#taskDueDate').value,
  };

  if (!payload.title.trim()) {
    return;
  }

  await fetchJson('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  taskForm.reset();
  document.querySelector('#taskCategory').value = 'Pessoal';
  await loadAll();
}

async function handleNoteSubmit(event) {
  event.preventDefault();
  const payload = {
    title: document.querySelector('#noteTitle').value,
    content: document.querySelector('#noteContent').value,
  };

  if (!payload.title.trim()) {
    return;
  }

  await fetchJson('/api/notes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  noteForm.reset();
  await loadAll();
}

async function handleReminderSubmit(event) {
  event.preventDefault();
  const payload = {
    text: document.querySelector('#reminderText').value,
    time: document.querySelector('#reminderTime').value || '09:00',
  };

  if (!payload.text.trim()) {
    return;
  }

  await fetchJson('/api/reminders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  reminderForm.reset();
  document.querySelector('#reminderTime').value = '09:00';
  await loadAll();
}

async function sendMessage(message, speakReply = false) {
  if (!message) {
    return;
  }

  addMessage('user', message);
  chatInput.value = '';
  voiceStatus.textContent = 'Pensando...';
  const sendButton = chatForm.querySelector('button[type="submit"]');
  sendButton.disabled = true;

  try {
    const response = await fetchJson('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history: chatHistory }),
    });

    addMessage('assistant', response.reply);
    chatHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response.reply },
    );
    if (chatHistory.length > 20) {
      chatHistory.splice(0, chatHistory.length - 20);
    }
    const historySaved = saveChatHistory();
    voiceStatus.textContent = historySaved ? 'Pronto.' : 'Resposta recebida, mas não foi possível salvar o histórico.';
    if (speakReply && speakReplies && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(response.reply);
      utterance.lang = 'pt-BR';
      utterance.onerror = () => {
        voiceStatus.textContent = 'Não foi possível reproduzir a resposta em voz.';
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
    await loadAll();
  } catch (error) {
    addMessage('assistant', `Não consegui responder: ${error.message}`);
    voiceStatus.textContent = error.message;
  } finally {
    sendButton.disabled = false;
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();
  await sendMessage(chatInput.value.trim());
}

async function handleItemActions(event) {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const { type, id } = button.dataset;
  if (!id || !type) {
    return;
  }

  if (type === 'delete-task') {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }

  if (type === 'toggle-task') {
    const task = (await fetchJson('/api/tasks')).find((item) => item.id === id);
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !task.done }),
    });
  }

  if (type === 'delete-note') {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  }

  if (type === 'delete-reminder') {
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
  }

  await loadAll();
}

taskForm.addEventListener('submit', handleTaskSubmit);
noteForm.addEventListener('submit', handleNoteSubmit);
reminderForm.addEventListener('submit', handleReminderSubmit);
chatForm.addEventListener('submit', handleChatSubmit);
document.addEventListener('click', handleItemActions);
clearChatButton.addEventListener('click', () => {
  chatHistory.length = 0;
  try {
    localStorage.removeItem('jarvis-chat-history');
  } catch (error) {
    voiceStatus.textContent = `Não foi possível apagar a conversa salva: ${error.message}`;
  }
  chatMessages.innerHTML = '';
  addMessage('assistant', 'Conversa limpa. Como posso ajudar?');
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = 'pt-BR';
  speechRecognition.interimResults = false;
  speechRecognition.maxAlternatives = 1;
  speechRecognition.onstart = () => {
    voiceInputButton.textContent = 'Parar de ouvir';
    voiceStatus.textContent = 'Estou ouvindo...';
  };
  speechRecognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript.trim();
    sendMessage(spokenText, true);
  };
  speechRecognition.onerror = (event) => {
    voiceStatus.textContent = `Falha no reconhecimento de voz: ${event.error}.`;
  };
  speechRecognition.onend = () => {
    voiceInputButton.textContent = 'Falar';
  };
} else {
  voiceInputButton.disabled = true;
  voiceStatus.textContent = 'Reconhecimento de voz indisponível neste navegador. Tente usar Chrome ou Edge.';
}

voiceInputButton.addEventListener('click', () => {
  if (!speechRecognition) {
    return;
  }
  try {
    if (voiceInputButton.textContent === 'Parar de ouvir') {
      speechRecognition.stop();
    } else {
      speechRecognition.start();
    }
  } catch (error) {
    voiceStatus.textContent = `Não foi possível iniciar o microfone: ${error.message}`;
  }
});

voiceOutputButton.addEventListener('click', () => {
  speakReplies = !speakReplies;
  voiceOutputButton.textContent = `Voz: ${speakReplies ? 'ligada' : 'desligada'}`;
  voiceOutputButton.setAttribute('aria-pressed', String(speakReplies));
  if (!speakReplies && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
});

loadAll().catch((error) => {
  addMessage('assistant', `Não consegui carregar os dados: ${error.message}`);
});
loadAIStatus().catch((error) => {
  aiStatus.textContent = `Não foi possível consultar o provedor: ${error.message}`;
});
