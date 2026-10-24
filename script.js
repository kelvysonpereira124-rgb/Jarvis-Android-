const chatMessages = document.querySelector('#chatMessages');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const voiceInputButton = document.querySelector('#voiceInputButton');
const voiceOutputButton = document.querySelector('#voiceOutputButton');
const voiceStatus = document.querySelector('#voiceStatus');
const aiStatus = document.querySelector('#aiStatus');
const clearChatButton = document.querySelector('#clearChatButton');
const chatPanel = document.querySelector('#chatPanel');
const chatToggleButton = document.querySelector('#chatToggleButton');
const closeChatButton = document.querySelector('#closeChatButton');
const hudViewport = document.querySelector('#hudViewport');
const hudObject = document.querySelector('#hudObject');
const hudCanvas = document.querySelector('#hudCanvas');
const hudClock = document.querySelector('#hudClock');
const hudTaskTotal = document.querySelector('#hudTaskTotal');
const hudProjectTotal = document.querySelector('#hudProjectTotal');
const hudPending = document.querySelector('#hudPending');
const hudNotes = document.querySelector('#hudNotes');
const hudPendingBar = document.querySelector('#hudPendingBar');
const hudNotesBar = document.querySelector('#hudNotesBar');
const hudProvider = document.querySelector('#hudProvider');
const hudZoomIn = document.querySelector('#hudZoomIn');
const hudZoomOut = document.querySelector('#hudZoomOut');
const hudReset = document.querySelector('#hudReset');

const taskForm = document.querySelector('#taskForm');
const noteForm = document.querySelector('#noteForm');
const reminderForm = document.querySelector('#reminderForm');
const projectForm = document.querySelector('#projectForm');

const taskList = document.querySelector('#taskList');
const noteList = document.querySelector('#noteList');
const reminderList = document.querySelector('#reminderList');
const projectList = document.querySelector('#projectList');

const taskCount = document.querySelector('#taskCount');
const pendingCount = document.querySelector('#pendingCount');
const noteCount = document.querySelector('#noteCount');
const reminderCount = document.querySelector('#reminderCount');
const projectCount = document.querySelector('#projectCount');
const todayText = document.querySelector('#todayText');
const timeText = document.querySelector('#timeText');
const chatHistory = [];
let speechRecognition;
let speakReplies = true;
let voiceArmed = false;
let waitingForVoiceCommand = false;
let voiceProcessing = false;
let voiceSpeaking = false;
let elevenLabsVoiceEnabled = false;
let elevenLabsVoiceStatusPromise = Promise.resolve();
let currentSpeechAudio;
let hudRotationX = -15;
let hudRotationY = 0;
let hudScale = 1;
let hudPointer;
let hudLastX = 0;
let hudLastY = 0;
let hudCanvasWidth = 0;
let hudCanvasHeight = 0;
let hudAnimationFrame;

const hudCanvasContext = hudCanvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setChatPanelOpen(open) {
  chatPanel.hidden = !open;
  chatToggleButton.setAttribute('aria-expanded', String(open));
  if (open) {
    chatInput.focus();
  } else {
    chatToggleButton.focus();
  }
}

chatToggleButton.addEventListener('click', () => setChatPanelOpen(chatPanel.hidden));
closeChatButton.addEventListener('click', () => setChatPanelOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !chatPanel.hidden) {
    setChatPanelOpen(false);
  }
});

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

function renderProjects(projects, tasks) {
  projectList.innerHTML = '';
  if (!projects.length) {
    projectList.innerHTML = '<li class="empty-state">Nenhum projeto. Crie um aqui ou peça ao JARVIS para planejar um objetivo.</li>';
    return;
  }

  projects.forEach((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const completed = projectTasks.filter((task) => task.done).length;
    const progress = projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0;
    const li = document.createElement('li');
    li.className = 'project-item';
    li.innerHTML = `
      <div class="item-main">
        <strong>${escapeHTML(project.title)}</strong>
        <small>${escapeHTML(project.goal)}</small>
        <small>${completed} de ${projectTasks.length} etapas concluídas · ${progress}%</small>
        <progress max="100" value="${progress}" aria-label="Progresso do projeto">${progress}%</progress>
        <ul class="project-steps">
          ${projectTasks.map((task) => `<li class="${task.done ? 'step-done' : ''}">${escapeHTML(task.title)}</li>`).join('')}
        </ul>
      </div>
    `;
    projectList.appendChild(li);
  });
}

async function loadOverview() {
  const overview = await fetchJson('/api/overview');
  taskCount.textContent = overview.task_count;
  pendingCount.textContent = overview.pending_tasks;
  noteCount.textContent = overview.note_count;
  reminderCount.textContent = overview.reminder_count;
  projectCount.textContent = overview.project_count || 0;
  todayText.textContent = `Hoje: ${overview.today}`;
  timeText.textContent = `Hora: ${overview.current_time}`;
  hudTaskTotal.textContent = String(overview.task_count).padStart(2, '0');
  hudProjectTotal.textContent = `PROJETOS · ${String(overview.project_count || 0).padStart(2, '0')}`;
  hudPending.textContent = String(overview.pending_tasks).padStart(2, '0');
  hudNotes.textContent = String(overview.note_count).padStart(2, '0');
  hudPendingBar.style.width = `${overview.task_count ? Math.round((overview.pending_tasks / overview.task_count) * 100) : 0}%`;
  hudNotesBar.style.width = `${Math.min(100, overview.note_count * 10)}%`;
  updateHudClock();
}

function updateHudClock() {
  hudClock.textContent = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

async function loadAIStatus() {
  const status = await fetchJson('/api/status');
  if (!status.configured) {
    aiStatus.textContent = 'IA não configurada: ajuste as variáveis no terminal.';
    return;
  }
  const provider = status.provider === 'ollama' ? 'Local (Ollama)' : 'OpenAI';
  const displayProvider = status.provider === 'groq' ? 'Groq' : provider;
  aiStatus.textContent = `Provedor selecionado: ${displayProvider} · ${status.model}`;
  hudProvider.textContent = displayProvider.toUpperCase();
}

async function loadAll() {
  const [tasks, notes, reminders, projects] = await Promise.all([
    fetchJson('/api/tasks'),
    fetchJson('/api/notes'),
    fetchJson('/api/reminders'),
    fetchJson('/api/projects'),
  ]);

  renderTasks(tasks);
  renderNotes(notes);
  renderReminders(reminders);
  renderProjects(projects, tasks);
  await loadOverview();
  if (voiceStatus.textContent.startsWith('Não foi possível atualizar o painel:')) {
    voiceStatus.textContent = 'Painel atualizado.';
  }
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

async function handleProjectSubmit(event) {
  event.preventDefault();
  const payload = {
    title: document.querySelector('#projectTitle').value.trim(),
    goal: document.querySelector('#projectGoal').value.trim(),
    steps: document.querySelector('#projectSteps').value.split(/\r?\n/).map((step) => step.trim()).filter(Boolean),
  };
  if (!payload.title || !payload.goal || !payload.steps.length) {
    voiceStatus.textContent = 'Informe o nome, o objetivo e pelo menos uma etapa do projeto.';
    return;
  }

  try {
    await fetchJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    projectForm.reset();
    await loadAll();
    voiceStatus.textContent = 'Projeto criado e etapas adicionadas às tarefas.';
  } catch (error) {
    voiceStatus.textContent = `Não foi possível criar o projeto: ${error.message}`;
  }
}

async function sendMessage(message, speakReply = false) {
  if (!message) {
    voiceProcessing = false;
    scheduleWakeRecognition();
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
    if (speakReply && speakReplies) {
      voiceSpeaking = true;
      try {
        await speakAssistantReply(response.reply);
      } catch (error) {
        if (speakReplies) {
          voiceStatus.textContent = `Resposta recebida, mas não foi possível reproduzir a voz: ${error.message}`;
        }
      } finally {
        voiceSpeaking = false;
      }
    }
    await loadAll();
  } catch (error) {
    addMessage('assistant', `Não consegui responder: ${error.message}`);
    voiceStatus.textContent = error.message;
  } finally {
    sendButton.disabled = false;
    voiceProcessing = false;
    scheduleWakeRecognition();
  }
}

async function speakAssistantReply(text) {
  await elevenLabsVoiceStatusPromise;
  if (elevenLabsVoiceEnabled) {
    const response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      let message = `ElevenLabs retornou HTTP ${response.status}.`;
      try {
        const error = await response.json();
        message = error.error || message;
      } catch {
        // Keep the HTTP status if the server response is not JSON.
      }
      throw new Error(message);
    }

    const audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    currentSpeechAudio = audio;
    try {
      const playbackEnded = new Promise((resolve, reject) => {
        audio.addEventListener('ended', resolve, { once: true });
        audio.addEventListener('error', () => reject(new Error('O áudio não pôde ser reproduzido.')), { once: true });
        audio.addEventListener('pause', () => {
          if (!audio.ended && !speakReplies) {
            reject(new Error('Reprodução de voz interrompida.'));
          }
        }, { once: true });
      });
      await audio.play();
      await playbackEnded;
    } finally {
      currentSpeechAudio = undefined;
      URL.revokeObjectURL(audioUrl);
    }
    return;
  }

  if (!('speechSynthesis' in window)) {
    throw new Error('Síntese de voz não está disponível neste navegador.');
  }
  await new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.onend = resolve;
    utterance.onerror = () => reject(new Error('A voz do navegador falhou.'));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
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
projectForm.addEventListener('submit', handleProjectSubmit);
chatForm.addEventListener('submit', handleChatSubmit);
document.addEventListener('click', handleItemActions);
function updateHudTransform() {
  hudObject.style.setProperty('--rotate-x', `${hudRotationX}deg`);
  hudObject.style.setProperty('--rotate-y', `${hudRotationY}deg`);
  hudObject.style.setProperty('--hud-scale', String(hudScale));
}

function updateHudParallax(event) {
  if (reducedMotion || hudPointer !== undefined) {
    return;
  }
  const bounds = hudViewport.getBoundingClientRect();
  const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
  const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
  hudObject.style.setProperty('--pointer-x', `${-horizontal * 28}px`);
  hudObject.style.setProperty('--pointer-y', `${-vertical * 28}px`);
  hudObject.style.setProperty('--pointer-rotate-x', `${vertical * 9}deg`);
  hudObject.style.setProperty('--pointer-rotate-y', `${horizontal * 9}deg`);
}

function resetHudParallax() {
  hudObject.style.setProperty('--pointer-x', '0px');
  hudObject.style.setProperty('--pointer-y', '0px');
  hudObject.style.setProperty('--pointer-rotate-x', '0deg');
  hudObject.style.setProperty('--pointer-rotate-y', '0deg');
}

function createHudParticles() {
  let seed = 48271;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const particles = [];

  for (let index = 0; index < 2100; index += 1) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = 0.72 + random() * 0.3;
    const spread = Math.sqrt(1 - y * y) * radius;
    particles.push({
      x: Math.cos(angle) * spread,
      y: y * radius,
      z: Math.sin(angle) * spread,
      size: 0.35 + random() * 1.3,
      alpha: 0.15 + random() * 0.65,
      hue: random(),
    });
  }

  const arms = [];
  const armCount = 5;
  const particlesPerArm = 340;
  for (let arm = 0; arm < armCount; arm += 1) {
    const stream = [];
    for (let index = 0; index < particlesPerArm; index += 1) {
      const progress = (index + random() * 0.7) / particlesPerArm;
      const angle = progress * Math.PI * 7.5 + (Math.PI * 2 * arm) / armCount;
      const radius = 0.035 + progress * 0.88;
      const variation = (random() - 0.5) * (0.06 + progress * 0.2);
      const planeRadius = radius + variation;
      const elevation = (random() - 0.5) * (0.24 + (1 - progress) * 0.3);
      const particle = {
        x: Math.cos(angle) * planeRadius,
        y: Math.sin(angle) * planeRadius,
        z: elevation,
        size: 0.45 + random() * (1.7 - progress * 0.5),
        alpha: 0.24 + random() * 0.72,
        hue: random(),
      };
      particles.push(particle);
      stream.push(particle);
    }
    arms.push(stream);
  }
  return { particles, arms };
}

const hudParticleField = createHudParticles();

function resizeHudCanvas() {
  const bounds = hudCanvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  hudCanvasWidth = bounds.width;
  hudCanvasHeight = bounds.height;
  hudCanvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
  hudCanvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
  hudCanvasContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  drawHudCore(0);
}

function drawHudCore(timestamp) {
  if (!hudCanvasContext || !hudCanvasWidth || !hudCanvasHeight) {
    return;
  }

  const ctx = hudCanvasContext;
  const width = hudCanvasWidth;
  const height = hudCanvasHeight;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.43;
  const elapsed = reducedMotion ? 0 : timestamp * 0.00012;
  const yaw = (hudRotationY * Math.PI) / 180 + elapsed;
  const pitch = (hudRotationX * Math.PI) / 180;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  ctx.clearRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(centerX, centerY, 1, centerX, centerY, radius * 1.04);
  glow.addColorStop(0, 'rgba(255, 191, 91, 0.27)');
  glow.addColorStop(0.25, 'rgba(255, 117, 35, 0.13)');
  glow.addColorStop(0.67, 'rgba(145, 53, 18, 0.07)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = 'rgba(255, 156, 65, 0.16)';
  ctx.lineWidth = 0.7;
  for (const scale of [0.56, 0.77, 1]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * scale, -Math.PI * 0.92, Math.PI * 0.92);
    ctx.stroke();
  }
  for (let tick = 0; tick < 72; tick += 1) {
    const angle = (Math.PI * 2 * tick) / 72;
    const inner = radius * (tick % 6 === 0 ? 0.91 : 0.96);
    const outer = radius * 1.01;
    ctx.strokeStyle = tick % 6 === 0 ? 'rgba(255, 173, 89, 0.42)' : 'rgba(255, 144, 60, 0.16)';
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();

  const project = (particle) => {
    const rotatedX = particle.x * cosYaw - particle.z * sinYaw;
    const rotatedZ = particle.x * sinYaw + particle.z * cosYaw;
    const rotatedY = particle.y * cosPitch - rotatedZ * sinPitch;
    const depth = particle.y * sinPitch + rotatedZ * cosPitch;
    const perspective = 1.32 / (1.32 - depth * 0.31);
    return {
      x: centerX + rotatedX * radius * perspective,
      y: centerY + rotatedY * radius * perspective,
      depth,
      perspective,
    };
  };

  for (const arm of hudParticleField.arms) {
    ctx.beginPath();
    let hasStarted = false;
    arm.forEach((particle, index) => {
      const point = project(particle);
      if (index % 5 === 0 || point.depth < -0.5) {
        hasStarted = false;
      }
      if (!hasStarted) {
        ctx.moveTo(point.x, point.y);
        hasStarted = true;
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.strokeStyle = 'rgba(255, 142, 48, 0.17)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  const projected = hudParticleField.particles.map((particle) => ({ particle, point: project(particle) }));
  projected.sort((left, right) => left.point.depth - right.point.depth);
  projected.forEach(({ particle, point }) => {
    const depthLight = 0.48 + ((point.depth + 1) / 2) * 0.92;
    const flicker = reducedMotion ? 0.9 : 0.72 + Math.sin(timestamp * 0.006 + particle.hue * 27) * 0.28;
    const alpha = Math.min(1, particle.alpha * depthLight * flicker);
    const size = particle.size * point.perspective * (0.75 + Math.max(0, point.depth) * 0.6);
    ctx.fillStyle = particle.hue > 0.9
      ? `rgba(255, 231, 160, ${alpha})`
      : `rgba(255, ${Math.round(101 + particle.hue * 105)}, ${Math.round(24 + particle.hue * 48)}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
  });

  const coreGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 0.38);
  coreGlow.addColorStop(0, 'rgba(255, 241, 186, 0.96)');
  coreGlow.addColorStop(0.035, 'rgba(255, 195, 81, 0.9)');
  coreGlow.addColorStop(0.12, 'rgba(255, 126, 28, 0.38)');
  coreGlow.addColorStop(1, 'rgba(255, 94, 14, 0)');
  ctx.fillStyle = coreGlow;
  ctx.fillRect(centerX - radius * 0.4, centerY - radius * 0.4, radius * 0.8, radius * 0.8);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(reducedMotion ? 0 : -timestamp * 0.00032);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.3, radius * 0.105, -0.18, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 213, 128, 0.74)';
  ctx.lineWidth = 1.1;
  ctx.shadowColor = 'rgba(255, 132, 35, 0.95)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
}

function animateHudCore(timestamp) {
  drawHudCore(timestamp);
  if (!document.hidden && !reducedMotion) {
    hudAnimationFrame = window.requestAnimationFrame(animateHudCore);
  }
}

if (window.ResizeObserver) {
  new ResizeObserver(resizeHudCanvas).observe(hudViewport);
} else {
  window.addEventListener('resize', resizeHudCanvas);
}
resizeHudCanvas();
if (!reducedMotion) {
  hudAnimationFrame = window.requestAnimationFrame(animateHudCore);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    window.cancelAnimationFrame(hudAnimationFrame);
  } else if (!reducedMotion) {
    hudAnimationFrame = window.requestAnimationFrame(animateHudCore);
  }
});

function changeHudZoom(amount) {
  hudScale = Math.min(1.45, Math.max(0.72, hudScale + amount));
  updateHudTransform();
}

hudViewport.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button')) {
    return;
  }
  hudPointer = event.pointerId;
  hudLastX = event.clientX;
  hudLastY = event.clientY;
  hudViewport.setPointerCapture(event.pointerId);
  hudObject.classList.add('is-dragging');
});

hudViewport.addEventListener('pointermove', (event) => {
  if (event.pointerId !== hudPointer) {
    updateHudParallax(event);
    return;
  }
  hudRotationY += (event.clientX - hudLastX) * 0.65;
  hudRotationX = Math.min(45, Math.max(-45, hudRotationX - (event.clientY - hudLastY) * 0.5));
  hudLastX = event.clientX;
  hudLastY = event.clientY;
  updateHudTransform();
});

hudViewport.addEventListener('pointerleave', resetHudParallax);

function stopHudDrag(event) {
  if (event.pointerId === hudPointer) {
    hudPointer = undefined;
    hudObject.classList.remove('is-dragging');
    resetHudParallax();
  }
}

hudViewport.addEventListener('pointerup', stopHudDrag);
hudViewport.addEventListener('pointercancel', stopHudDrag);
hudViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  changeHudZoom(event.deltaY < 0 ? 0.05 : -0.05);
}, { passive: false });
hudZoomIn.addEventListener('click', () => changeHudZoom(0.1));
hudZoomOut.addEventListener('click', () => changeHudZoom(-0.1));
hudReset.addEventListener('click', () => {
  hudRotationX = -15;
  hudRotationY = 0;
  hudScale = 1;
  updateHudTransform();
});
hudViewport.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') hudRotationY -= 8;
  else if (event.key === 'ArrowRight') hudRotationY += 8;
  else if (event.key === 'ArrowUp') hudRotationX = Math.min(45, hudRotationX + 8);
  else if (event.key === 'ArrowDown') hudRotationX = Math.max(-45, hudRotationX - 8);
  else if (event.key === '+' || event.key === '=') changeHudZoom(0.1);
  else if (event.key === '-') changeHudZoom(-0.1);
  else if (event.key === 'Home') {
    hudRotationX = -15;
    hudRotationY = 0;
    hudScale = 1;
  } else return;
  event.preventDefault();
  updateHudTransform();
});
window.setInterval(updateHudClock, 1000);
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
function scheduleWakeRecognition() {
  if (!voiceArmed || voiceProcessing || voiceSpeaking || !speechRecognition) {
    return;
  }
  window.setTimeout(() => {
    if (!voiceArmed || voiceProcessing || voiceSpeaking) {
      return;
    }
    try {
      speechRecognition.start();
    } catch (error) {
      if (error.name !== 'InvalidStateError') {
        voiceStatus.textContent = `Não foi possível reativar o microfone: ${error.message}`;
      }
    }
  }, 700);
}

if (SpeechRecognition) {
  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = 'pt-BR';
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 1;
  speechRecognition.onstart = () => {
    voiceStatus.textContent = waitingForVoiceCommand
      ? 'Estou ouvindo seu comando...'
      : 'Microfone ativo. Diga “Jarvis” para começar.';
  };
  speechRecognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result.isFinal) {
        continue;
      }
      const transcript = result[0].transcript.trim();
      if (waitingForVoiceCommand) {
        waitingForVoiceCommand = false;
        voiceProcessing = true;
        speechRecognition.stop();
        sendMessage(transcript, true);
        return;
      }
      const wakeMatch = transcript.match(/\bjarvis\b[,\s.!?]*/i);
      if (!wakeMatch) {
        continue;
      }
      const command = transcript.slice(wakeMatch.index + wakeMatch[0].length).trim();
      if (command) {
        voiceProcessing = true;
        speechRecognition.stop();
        sendMessage(command, true);
        return;
      }
      waitingForVoiceCommand = true;
      voiceStatus.textContent = 'Pois não? Estou ouvindo...';
    }
  };
  speechRecognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      voiceArmed = false;
      voiceInputButton.setAttribute('aria-pressed', 'false');
      voiceInputButton.setAttribute('aria-label', 'Ativar reconhecimento por voz');
      voiceInputButton.title = 'Ativar reconhecimento por voz';
    }
    voiceStatus.textContent = `Falha no reconhecimento de voz: ${event.error}.`;
  };
  speechRecognition.onend = () => {
    scheduleWakeRecognition();
  };
  voiceInputButton.disabled = false;
} else {
  voiceInputButton.disabled = true;
  voiceInputButton.title = 'Reconhecimento por voz indisponível neste navegador';
  voiceInputButton.setAttribute('aria-label', voiceInputButton.title);
  voiceStatus.textContent = 'Ativação por voz indisponível neste navegador. Tente Chrome ou Edge.';
}

voiceInputButton.addEventListener('click', () => {
  if (!speechRecognition) {
    return;
  }
  if (voiceArmed) {
    voiceArmed = false;
    waitingForVoiceCommand = false;
    speechRecognition.stop();
    voiceInputButton.setAttribute('aria-pressed', 'false');
    voiceInputButton.setAttribute('aria-label', 'Ativar reconhecimento por voz');
    voiceInputButton.title = 'Ativar reconhecimento por voz';
    voiceStatus.textContent = 'Ativação por voz desligada.';
    return;
  }
  voiceArmed = true;
  voiceInputButton.setAttribute('aria-pressed', 'true');
  voiceInputButton.setAttribute('aria-label', 'Desativar reconhecimento por voz');
  voiceInputButton.title = 'Desativar reconhecimento por voz';
  voiceStatus.textContent = 'Solicitando acesso ao microfone...';
  try {
    speechRecognition.start();
  } catch (error) {
    voiceArmed = false;
    voiceInputButton.setAttribute('aria-pressed', 'false');
    voiceInputButton.setAttribute('aria-label', 'Ativar reconhecimento por voz');
    voiceInputButton.title = 'Ativar reconhecimento por voz';
    voiceStatus.textContent = `Não foi possível iniciar o microfone: ${error.message}`;
  }
});

voiceOutputButton.addEventListener('click', () => {
  speakReplies = !speakReplies;
  voiceOutputButton.textContent = `Voz: ${speakReplies ? 'ligada' : 'desligada'}`;
  voiceOutputButton.setAttribute('aria-pressed', String(speakReplies));
  if (!speakReplies) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    currentSpeechAudio?.pause();
    currentSpeechAudio = undefined;
    voiceSpeaking = false;
    scheduleWakeRecognition();
  }
});

loadAll().catch((error) => {
  addMessage('assistant', `Não consegui carregar os dados: ${error.message}`);
});
loadAIStatus().catch((error) => {
  aiStatus.textContent = `Não foi possível consultar o provedor: ${error.message}`;
});
elevenLabsVoiceStatusPromise = fetchJson('/api/voice-status').then((status) => {
  elevenLabsVoiceEnabled = Boolean(status.configured);
}).catch((error) => {
  voiceStatus.textContent = `Não foi possível consultar a voz ElevenLabs: ${error.message}`;
});

window.setInterval(() => {
  loadAll().catch((error) => {
    voiceStatus.textContent = `Não foi possível atualizar o painel: ${error.message}`;
  });
}, 60000);
