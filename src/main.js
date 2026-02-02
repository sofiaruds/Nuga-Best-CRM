const { invoke } = window.__TAURI__.core;
const times = ["08:00", "08:40", "09:20", "10:00", "10:40", "11:20", "12:00", "12:40", "13:20", "14:00", "14:40"];
const scheduleCapacity = 22;

// Инициализация чипов даты и времени
function init() {
  const dGrid = document.querySelector("#date-btns");
  for (let i = 0; i < 16; i++) { // Увеличено до 16 дней
    let d = new Date(); 
    d.setDate(d.getDate() + i);
    let iso = d.toISOString().split('T')[0];
    let btn = document.createElement('div'); 
    btn.className = 'chip';
    
    let label;
    if (i === 0) label = "Сегодня";
    else if (i === 1) label = "Завтра";
    else label = d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'});
    
    btn.innerHTML = `<span>${label}</span>`;
    btn.onclick = () => {
      document.querySelectorAll('#date-btns .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active'); 
      document.querySelector("#final-date").value = iso;
    };
    dGrid.appendChild(btn);
  }
  
  const tGrid = document.querySelector("#time-grid");
  times.forEach(t => {
    let btn = document.createElement('div'); 
    btn.className = 'chip'; 
    btn.innerHTML = `<span>${t}</span>`;
    btn.onclick = () => {
      document.querySelectorAll('#time-grid .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active'); 
      document.querySelector("#final-time").value = t;
    };
    tGrid.appendChild(btn);
  });
}

// ============ АВТОРИЗАЦИЯ ============

function showAuthModal() {
  document.getElementById("auth-modal").style.display = "flex";
}

function hideAuthModal() {
  document.getElementById("auth-modal").style.display = "none";
}

function setBlur(enabled) {
  const main = document.querySelector(".main");
  if (main) main.style.filter = enabled ? "blur(8px)" : "none";
}

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");

tabLogin.onclick = () => {
  document.getElementById("login-form").style.display = "block";
  document.getElementById("register-form").style.display = "none";
  tabLogin.classList.remove('btn-secondary');
  tabRegister.classList.add('btn-secondary');
};

tabRegister.onclick = () => {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "block";
  tabRegister.classList.remove('btn-secondary');
  tabLogin.classList.add('btn-secondary');
};

// ============ УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЕМ ============

function getUser() {
  try { 
    return JSON.parse(localStorage.getItem("user")); 
  } catch { 
    return null; 
  }
}

function setUser(user) {
  localStorage.setItem("user", JSON.stringify(user)); 
  renderAccountPanel();
}

window.logout = function() {
  if (confirm("Вы уверены, что хотите выйти?")) {
    localStorage.removeItem("user");
    renderAccountPanel();
    showAuthModal();
    setBlur(true);
    showToast("Вы вышли из системы", "");
  }
}

// НОВАЯ ФУНКЦИЯ: Сделать пользователя админом (для разработки)
window.makeAdmin = async function() {
  const user = getUser();
  if (!user) return showToast("Войдите в систему", "danger");
  
  try {
    await invoke("make_admin", { phone: user.phone });
    user.role = "admin";
    setUser(user);
    showToast("Теперь вы администратор!", "success");
    load();
  } catch(err) {
    showToast("Ошибка: " + err, "danger");
  }
}

function renderAccountPanel() {
  const user = getUser();
  let panel = document.getElementById("account-panel");
  
  if (!user) { 
    if (panel) panel.remove(); 
    return; 
  }
  
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "account-panel";
    panel.className = "account-panel";
    const host = document.getElementById("sidebar-account");
    if (host) {
      host.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }
  }
  
  panel.innerHTML = `
    <div class='acc-name'>${user.name}</div>
    <div class='acc-role'>${user.role === "admin" ? "🔐 Администратор" : "👤 Работник"}</div>
    <div class='acc-phone'>${user.phone}</div>
    <button class='acc-logout' onclick='window.logout()'>Выйти</button>
  `;
}

renderAccountPanel();

function hideBlur() {
  setBlur(false);
  renderAccountPanel();
}

// ============ ФОРМЫ АВТОРИЗАЦИИ ============

const loginForm = document.getElementById("login-form");
loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const phone = document.getElementById("login-phone").value.trim();
  const password = document.getElementById("login-password").value;
  
  if (!phone || !password) {
    return showToast("Заполните все поля!", "danger");
  }
  
  try {
    const user = await invoke("login_user", { phone, password });
    setUser(user); 
    hideAuthModal(); 
    showToast(`Добро пожаловать, ${user.name}!`, "success");
    hideBlur();
    await load();
  } catch (err) {
    showToast("" + err, "danger");
  }
};

const regForm = document.getElementById("register-form");
regForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value.trim();
  const phone = document.getElementById("reg-phone").value.trim();
  const password = document.getElementById("reg-password").value;
  
  if (!name || !phone || !password) {
    return showToast("Заполните все поля!", "danger");
  }
  
  if (password.length < 4) {
    return showToast("Пароль должен содержать минимум 4 символа", "danger");
  }
  
  try {
    await invoke("register_user", { name, phone, password });
    showToast("Регистрация успешна! Теперь войдите.", "success");
    document.getElementById("login-phone").value = phone;
    tabLogin.click();
    hideBlur();
  } catch (err) {
    showToast("" + err, "danger");
  }
};

// Проверка сессии при загрузке
if (!getUser()) {
  setTimeout(showAuthModal, 200);
  setBlur(true);
} else {
  hideAuthModal();
  setBlur(false);
}

// ============ ПРОВЕРКА ИСТОРИИ КЛИЕНТА ============

let historyCheckTimeout;
document.querySelector("#phone").oninput = (e) => {
  clearTimeout(historyCheckTimeout);
  const alertBox = document.querySelector("#history-alert");
  
  historyCheckTimeout = setTimeout(async () => {
    const phone = e.target.value.trim();
    if (phone.length < 10) {
      alertBox.style.display = "none";
      return;
    }
    
    try {
      const history = await invoke("check_client_history", { phone });
      
      if (history.last_name) {
        if (!document.querySelector("#name").value) {
          document.querySelector("#name").value = history.last_name;
        }
        alertBox.style.display = "block";
        
        if (history.missed > 0) {
          alertBox.className = "alert alert-danger";
          alertBox.innerHTML = `⚠️ <strong>ВНИМАНИЕ!</strong> Пропусков: ${history.missed}, Посещений: ${history.attended}`;
        } else if (history.attended > 0) {
          alertBox.className = "alert alert-success";
          alertBox.innerHTML = `✅ <strong>Постоянный клиент</strong> — ${history.attended} ${history.attended === 1 ? 'визит' : history.attended < 5 ? 'визита' : 'визитов'}`;
        }
      } else { 
        alertBox.style.display = "none"; 
      }
    } catch(err) {
      console.error("История клиента:", err);
    }
  }, 500); // Debounce 500ms
};

// ============ ПОИСК И ФИЛЬТРАЦИЯ ============

let searchTimeout;
document.querySelector("#search-input").oninput = (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const term = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll("#schedule-body tr");
    let visibleCount = 0;
    
    rows.forEach(row => {
      const text = row.innerText.toLowerCase();
      const isVisible = !term || text.includes(term);
      row.style.display = isVisible ? "table-row" : "none";
      if (isVisible) visibleCount++;
    });
    
    updateNoResultsMessage(visibleCount === 0 && term.length > 0, "🔍 Ничего не найдено. Попробуйте изменить запрос.");
  }, 300);
};

// Поиск по клиентам
const clientsSearch = document.getElementById("clients-search");
if (clientsSearch) {
  clientsSearch.oninput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll(".client-row");
    let visibleCount = 0;
    rows.forEach(row => {
      const isVisible = !term || row.innerText.toLowerCase().includes(term);
      row.style.display = isVisible ? "table-row" : "none";
      if (isVisible) visibleCount++;
    });
    updateClientsEmpty(visibleCount === 0 && term.length > 0, "Ничего не найдено.");
  };
}

const workersSearch = document.getElementById("workers-search");
if (workersSearch) {
  workersSearch.oninput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll(".worker-row");
    let visibleCount = 0;
    rows.forEach(row => {
      const isVisible = !term || row.innerText.toLowerCase().includes(term);
      row.style.display = isVisible ? "table-row" : "none";
      if (isVisible) visibleCount++;
    });
    updateWorkersEmpty(visibleCount === 0 && term.length > 0, "Ничего не найдено.");
  };
}
function updateNoResultsMessage(show, message) {
  const empty = document.getElementById("list-empty");
  if (!empty) return;
  if (show) {
    empty.style.display = "block";
    empty.textContent = message || "Ничего не найдено.";
  } else {
    empty.style.display = "none";
  }
}

function updateScheduleLabel(dateStr) {
  const label = document.getElementById("schedule-date-label");
  if (!label) return;
  const dt = new Date(dateStr + "T00:00:00");
  label.textContent = dt.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function updateClientsEmpty(show, message) {
  const empty = document.getElementById("clients-empty");
  if (!empty) return;
  if (show) {
    empty.style.display = "block";
    empty.textContent = message || "Нет клиентов.";
  } else {
    empty.style.display = "none";
  }
}

function updateWorkersEmpty(show, message) {
  const empty = document.getElementById("workers-empty");
  if (!empty) return;
  if (show) {
    empty.style.display = "block";
    empty.textContent = message || "Нет сотрудников.";
  } else {
    empty.style.display = "none";
  }
}

// Toast уведомления
function showToast(msg, type = "") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.className = type ? `show ${type}` : "show";
  setTimeout(() => { toast.className = ""; }, 3000);
}

// ============ ФИЛЬТРАЦИЯ ПО СТАТУСУ (убрана, теперь расписание) ============

// ============ ОПЕРАЦИИ С ЗАПИСЯМИ ============

window.updateStatus = async (id, status) => {
  try {
    await invoke("update_status", { id, status });
    const statusLabels = {
      attended: "посетил",
      missed: "пропустил",
      pending: "ожидает"
    };
    showToast(`Клиент ${statusLabels[status]}`, status === "attended" ? "success" : status === "missed" ? "danger" : "");
    await load();
  } catch(err) {
    showToast("" + err, "danger");
  }
};

window.del = async (id) => {
  if(confirm("Удалить эту запись? Действие необратимо.")) {
    try {
      await invoke("delete_booking", {id});
      showToast("Запись удалена", "danger");
      await load();
    } catch(err) {
      showToast("" + err, "danger");
    }
  }
};

window.openEdit = async (id) => {
  try {
    const bookings = await invoke("get_bookings");
    const b = bookings.find(x => x.id === id);
    if (!b) return showToast("Запись не найдена", "danger");
    
    document.getElementById("edit-id").value = b.id;
    document.getElementById("edit-name").value = b.name;
    document.getElementById("edit-phone").value = b.phone;
    
    const dateTimeParts = b.date.split('T');
    document.getElementById("edit-date").value = dateTimeParts[0];
    document.getElementById("edit-time").value = dateTimeParts[1] ? dateTimeParts[1].substring(0, 5) : "";
    document.getElementById("edit-bought").checked = !!b.bought;
    document.getElementById("edit-status").value = b.status;
    document.getElementById("edit-modal").style.display = "flex";
  } catch(err) {
    showToast("" + err, "danger");
  }
};

window.showWorkerHistory = async (workerId, workerName) => {
  try {
    const bookings = await invoke("get_worker_history", { workerId: workerId });
    
    const stats = {
      total: bookings.length,
      attended: bookings.filter(b => b.status === 'attended').length,
      missed: bookings.filter(b => b.status === 'missed').length,
      bought: bookings.filter(b => b.bought).length
    };
    
    let html = `
      <h3 style="margin-bottom: 1rem;">📊 История: ${workerName}</h3>
      <div class="stats-grid" style="margin-bottom: 1.5rem;">
        <div class="stat-card">
          <div class="stat-label">Всего</div>
          <div class="stat-value">${stats.total}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Посещено</div>
          <div class="stat-value success">${stats.attended}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Пропущено</div>
          <div class="stat-value danger">${stats.missed}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Купили</div>
          <div class="stat-value warning">${stats.bought}</div>
        </div>
      </div>
    `;
    
    if (bookings.length === 0) {
      html += '<div class="alert alert-warning" style="display:block;">📝 Пока нет записей</div>';
    } else {
      html += bookings.map(b => {
        const sClass = b.status === 'attended' ? 'card-attended' : (b.status === 'missed' ? 'card-missed' : '');
        return `
          <div class='booking-card ${sClass}' style="margin-bottom: 0.75rem;">
            <div class='booking-info'>
              <div class='booking-name'>
                ${b.name}
                ${b.bought ? '<span class="badge badge-gold">💰</span>' : ''}
              </div>
              <div class='booking-phone'>${b.phone}</div>
              <div class='booking-date'>${new Date(b.date).toLocaleString('ru-RU', {
                day:'numeric', 
                month:'long', 
                hour:'2-digit', 
                minute:'2-digit'
              })}</div>
            </div>
            <div class='booking-meta'>
              <span class='badge ${b.status === "attended" ? "badge-gold" : b.status === "missed" ? "badge-danger" : "badge-warning"}' style='${
                b.status === "attended" ? "background: var(--success-bg); color: var(--success);" : 
                b.status === "missed" ? "background: var(--danger-bg); color: var(--danger);" : 
                "background: var(--warning-bg); color: var(--warning);"
              }'>
                ${b.status === "attended" ? "✅ Посетил" : b.status === "missed" ? "❌ Пропустил" : "⏳ Ожидает"}
              </span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    let modal = document.getElementById('worker-history-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'worker-history-modal';
      modal.className = 'modal';
      modal.style.display = 'flex';
      modal.innerHTML = `
        <div class='modal-content' style='max-width: 800px; max-height: 80vh; overflow-y: auto;'>
          <button onclick='document.getElementById("worker-history-modal").remove()' class='modal-close'>✖</button>
          <div id='worker-history-content'></div>
        </div>
      `;
      document.body.appendChild(modal);
    } else {
      modal.style.display = 'flex';
    }
    
    document.getElementById('worker-history-content').innerHTML = html;
  } catch(err) {
    showToast("" + err, "danger");
  }
};

function showClientHistory(clientPhone, clientName, bookings) {
  const clientBookings = bookings.filter(b => b.phone === clientPhone);
  const stats = {
    total: clientBookings.length,
    attended: clientBookings.filter(b => b.status === 'attended').length,
    missed: clientBookings.filter(b => b.status === 'missed').length,
    bought: clientBookings.filter(b => b.bought).length
  };

  let html = `
    <h3 style="margin-bottom: 1rem;">История клиента: ${clientName}</h3>
    <div class="stats-grid" style="margin-bottom: 1.5rem;">
      <div class="stat-card">
        <div class="stat-label">Всего</div>
        <div class="stat-value">${stats.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Посещено</div>
        <div class="stat-value success">${stats.attended}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Пропущено</div>
        <div class="stat-value danger">${stats.missed}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Покупки</div>
        <div class="stat-value warning">${stats.bought}</div>
      </div>
    </div>
  `;

  if (clientBookings.length === 0) {
    html += '<div class="alert alert-warning" style="display:block;">Записей пока нет</div>';
  } else {
    html += clientBookings.map(b => {
      const sClass = b.status === 'attended' ? 'card-attended' : (b.status === 'missed' ? 'card-missed' : '');
      return `
        <div class='booking-card ${sClass}' style="margin-bottom: 0.75rem;">
          <div class='booking-info'>
            <div class='booking-name'>${b.name}</div>
            <div class='booking-phone'>${b.phone}</div>
            <div class='booking-date'>${new Date(b.date).toLocaleString('ru-RU', {
              day:'numeric',
              month:'long',
              hour:'2-digit',
              minute:'2-digit'
            })}</div>
          </div>
          <div class='booking-meta'>
            <span class='status ${b.status}'>${
              b.status === "attended" ? "Посетил" : b.status === "missed" ? "Пропустил" : "Ожидает"
            }</span>
          </div>
        </div>
      `;
    }).join('');
  }

  let modal = document.getElementById('client-history-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'client-history-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class='modal-content' style='max-width: 800px; max-height: 80vh; overflow-y: auto; position: relative;'>
        <button onclick='document.getElementById(\"client-history-modal\").remove()' class='modal-close'>✖</button>
        <div id='client-history-content'></div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }

  document.getElementById('client-history-content').innerHTML = html;
}

// ============ ЗАГРУЗКА ДАННЫХ ============

async function load() {
  try {
    const user = getUser();
    if (!user) return;
    
    const bookings = await invoke("get_bookings");
    window.__BOOKINGS_CACHE = bookings;
    let workers = {};
    
    const oldWorkerStats = document.querySelector(".worker-stats-container");
    if (oldWorkerStats) oldWorkerStats.remove();
    
    // Админская панель
    if (user.role === "admin") {
      const workerList = await invoke("get_workers");
      workerList.forEach(w => { workers[w.id] = w.name; });
      
      const workerStats = document.createElement("div");
      workerStats.className = "stats-grid worker-stats-container";
      workerStats.innerHTML = workerList.map(w => {
        const workerBookings = bookings.filter(b => b.created_by === w.id);
        const workerTotal = workerBookings.length;
        
        return `
          <div class='stat-card'>
            <div class='stat-label'>${w.name}</div>
            <div class='stat-value' style='font-size: 1rem; margin-bottom: 0.5rem;'>${w.phone}</div>
            <small style='color: var(--text-dim); display: block; margin-bottom: 0.5rem;'>
              ${workerTotal} ${workerTotal === 1 ? 'запись' : workerTotal < 5 ? 'записи' : 'записей'}
            </small>
            <button class='btn btn-sm' onclick='showWorkerHistory(${w.id}, "${w.name}")' style='width:100%;'>
              <span>📊 Подробнее</span>
            </button>
          </div>
        `;
      }).join("");
      
      const statsElement = document.getElementById("stats");
      statsElement.parentNode.insertBefore(workerStats, statsElement);
    }
    
    // Общая статистика
    const total = bookings.length;
    const attended = bookings.filter(b => b.status === 'attended').length;
    const missed = bookings.filter(b => b.status === 'missed').length;
    const pending = bookings.filter(b => b.status === 'pending').length;
    const bought = bookings.filter(b => b.bought).length;
    
    document.getElementById("stats").innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Всего записей</div>
        <div class="stat-value">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ожидают</div>
        <div class="stat-value" style="color: var(--warning);">${pending}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Посетили</div>
        <div class="stat-value success">${attended}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Пропустили</div>
        <div class="stat-value danger">${missed}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Купили массажер</div>
        <div class="stat-value warning">${bought}</div>
      </div>
    `;
    
    const scheduleInput = document.getElementById("schedule-date");
    if (scheduleInput) {
      if (!scheduleInput.value) {
        scheduleInput.value = new Date().toISOString().split("T")[0];
      }
      updateScheduleLabel(scheduleInput.value);
      renderSchedule(scheduleInput.value, bookings);
    }

    await renderWorkers(bookings);
    renderClients(bookings);
    renderReports("day", bookings);
  } catch(err) {
    showToast("Ошибка загрузки: " + err, "danger");
    console.error(err);
  }
}

function renderSchedule(dateStr, bookings) {
  const body = document.getElementById("schedule-body");
  if (!body) return;

  const dayBookings = bookings.filter(b => (b.date || "").startsWith(dateStr));
  updateNoResultsMessage(dayBookings.length === 0, "На выбранный день записей нет.");

  const byTime = new Map();
  times.forEach(t => byTime.set(t, []));
  dayBookings.forEach(b => {
    const timePart = (b.date || "").split("T")[1]?.substring(0, 5);
    if (byTime.has(timePart)) {
      byTime.get(timePart).push(b);
    }
  });

  body.innerHTML = times.map(t => {
    const list = byTime.get(t) || [];
    const cells = [];
    for (let i = 0; i < scheduleCapacity; i += 1) {
      const b = list[i];
      if (b) {
        cells.push(`<td><div class="slot filled">${b.name}</div></td>`);
      } else {
        cells.push(`<td><div class="slot"></div></td>`);
      }
    }
    return `<tr><td>${t}</td>${cells.join("")}</tr>`;
  }).join("");
}

function renderClients(bookings) {
  const list = document.getElementById("clients-list");
  if (!list) return;

  const map = new Map();
  bookings.forEach(b => {
    const key = b.phone;
    const existing = map.get(key);
    const entry = existing || {
      name: b.name,
      phone: b.phone,
      attended: 0,
      missed: 0,
      bought: 0,
      lastVisit: null
    };

    if (b.status === "attended") entry.attended += 1;
    if (b.status === "missed") entry.missed += 1;
    if (b.bought) entry.bought += 1;

    const dt = new Date(b.date);
    if (!entry.lastVisit || dt > entry.lastVisit) {
      entry.lastVisit = dt;
      entry.name = b.name;
    }
    map.set(key, entry);
  });

  const clients = Array.from(map.values()).sort((a, b) => {
    if (!a.lastVisit && !b.lastVisit) return 0;
    if (!a.lastVisit) return 1;
    if (!b.lastVisit) return -1;
    return b.lastVisit - a.lastVisit;
  });

  if (clients.length === 0) {
    list.innerHTML = "";
    updateClientsEmpty(true, "Пока нет клиентов. Добавьте первую запись.");
    return;
  }

  updateClientsEmpty(false);
  list.innerHTML = clients.map(c => {
    const last = c.lastVisit ? c.lastVisit.toLocaleString('ru-RU', {
      day:'numeric',
      month:'short',
      hour:'2-digit',
      minute:'2-digit'
    }) : "—";
    return `
      <tr class="client-row">
        <td><strong>${c.name}</strong></td>
        <td>${c.phone}</td>
        <td>${last}</td>
        <td>${c.attended}</td>
        <td>${c.missed}</td>
        <td>${c.bought}</td>
        <td>
          <button class="btn btn-sm" onclick='showClientHistory(${JSON.stringify(c.phone)}, ${JSON.stringify(c.name)}, window.__BOOKINGS_CACHE)'>История</button>
        </td>
      </tr>
    `;
  }).join("");

  window.__BOOKINGS_CACHE = bookings;
}

async function renderWorkers(bookings) {
  const list = document.getElementById("workers-list");
  if (!list) return;

  const workersSearch = document.getElementById("workers-search");
  if (workersSearch) workersSearch.value = "";

  let workers = [];
  try {
    workers = await invoke("get_workers");
  } catch (err) {
    updateWorkersEmpty(true, "Не удалось загрузить сотрудников.");
    return;
  }

  if (!workers || workers.length === 0) {
    list.innerHTML = "";
    updateWorkersEmpty(true, "Пока нет сотрудников.");
    return;
  }

  const statsByWorker = new Map();
  workers.forEach(w => {
    statsByWorker.set(w.id, {
      total: 0,
      attended: 0,
      missed: 0,
      bought: 0
    });
  });

  bookings.forEach(b => {
    if (!b.created_by || !statsByWorker.has(b.created_by)) return;
    const s = statsByWorker.get(b.created_by);
    s.total += 1;
    if (b.status === "attended") s.attended += 1;
    if (b.status === "missed") s.missed += 1;
    if (b.bought) s.bought += 1;
  });

  updateWorkersEmpty(false);
  list.innerHTML = workers.map(w => {
    const s = statsByWorker.get(w.id) || { total: 0, attended: 0, missed: 0, bought: 0 };
    return `
      <tr class="worker-row">
        <td><strong>${w.name}</strong></td>
        <td>${w.phone}</td>
        <td>${s.total}</td>
        <td>${s.attended}</td>
        <td>${s.missed}</td>
        <td>${s.bought}</td>
        <td>
          <button class="btn btn-sm" onclick='showWorkerHistory(${w.id}, ${JSON.stringify(w.name)})'>История</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderReports(period, bookings) {
  const summary = document.getElementById("reports-summary");
  const list = document.getElementById("reports-list");
  if (!summary || !list) return;

  const now = new Date();
  let start;
  if (period === "day") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    const day = (now.getDay() + 6) % 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const periodBookings = bookings.filter(b => {
    const dt = new Date(b.date);
    return dt >= start && dt <= now;
  });

  const totals = {
    total: periodBookings.length,
    attended: periodBookings.filter(b => b.status === "attended").length,
    missed: periodBookings.filter(b => b.status === "missed").length,
    bought: periodBookings.filter(b => b.bought).length
  };

  summary.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Всего</div>
      <div class="stat-value">${totals.total}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Посещено</div>
      <div class="stat-value success">${totals.attended}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Пропущено</div>
      <div class="stat-value danger">${totals.missed}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Покупки</div>
      <div class="stat-value warning">${totals.bought}</div>
    </div>
  `;

  if (periodBookings.length === 0) {
    list.innerHTML = `<tr><td colspan="5">Нет данных за выбранный период</td></tr>`;
    return;
  }

  let grouped = new Map();
  if (period === "day") {
    periodBookings.forEach(b => {
      const dt = new Date(b.date);
      const key = dt.toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
      const entry = grouped.get(key) || { total:0, attended:0, missed:0, bought:0 };
      entry.total += 1;
      if (b.status === "attended") entry.attended += 1;
      if (b.status === "missed") entry.missed += 1;
      if (b.bought) entry.bought += 1;
      grouped.set(key, entry);
    });
  } else if (period === "week") {
    periodBookings.forEach(b => {
      const dt = new Date(b.date);
      const key = dt.toLocaleDateString('ru-RU', { weekday:'short', day:'numeric', month:'short' });
      const entry = grouped.get(key) || { total:0, attended:0, missed:0, bought:0 };
      entry.total += 1;
      if (b.status === "attended") entry.attended += 1;
      if (b.status === "missed") entry.missed += 1;
      if (b.bought) entry.bought += 1;
      grouped.set(key, entry);
    });
  } else {
    periodBookings.forEach(b => {
      const dt = new Date(b.date);
      const key = dt.toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
      const entry = grouped.get(key) || { total:0, attended:0, missed:0, bought:0 };
      entry.total += 1;
      if (b.status === "attended") entry.attended += 1;
      if (b.status === "missed") entry.missed += 1;
      if (b.bought) entry.bought += 1;
      grouped.set(key, entry);
    });
  }

  const rows = Array.from(grouped.entries()).map(([label, v]) => {
    return `
      <tr>
        <td>${label}</td>
        <td>${v.total}</td>
        <td>${v.attended}</td>
        <td>${v.missed}</td>
        <td>${v.bought}</td>
      </tr>
    `;
  }).join("");

  list.innerHTML = rows;
}

// ============ ОБРАБОТЧИКИ ФОРМ ============

document.getElementById("close-edit").onclick = () => {
  document.getElementById("edit-modal").style.display = "none";
};

document.getElementById("edit-form").onsubmit = async (e) => {
  e.preventDefault();
  const id = Number(document.getElementById("edit-id").value);
  const name = document.getElementById("edit-name").value.trim();
  const phone = document.getElementById("edit-phone").value.trim();
  const date = document.getElementById("edit-date").value;
  const time = document.getElementById("edit-time").value;
  const bought = document.getElementById("edit-bought").checked ? 1 : 0;
  const status = document.getElementById("edit-status").value;
  
  if (!name || !phone || !date || !time) {
    return showToast("Заполните все поля!", "danger");
  }
  
  try {
    await invoke("edit_booking", { 
      id, name, phone, 
      date: `${date}T${time}`, 
      bought, status 
    });
    showToast("Запись обновлена!", "success");
    document.getElementById("edit-modal").style.display = "none";
    await load();
  } catch(err) {
    showToast("" + err, "danger");
  }
};

document.querySelector("#booking-form").onsubmit = async (e) => {
  e.preventDefault();
  const user = getUser();
  
  if (!user || !user.id) {
    showToast("Войдите в систему!", "danger");
    showAuthModal();
    setBlur(true);
    return;
  }
  
  const date = document.querySelector("#final-date").value;
  const time = document.querySelector("#final-time").value;
  const name = document.querySelector("#name").value.trim();
  const phone = document.querySelector("#phone").value.trim();
  
  if (!date || !time) return showToast("Выберите дату и время!", "danger");
  if (!name || !phone) return showToast("Заполните имя и телефон!", "danger");
  
  try {
    await invoke("save_booking", {
      name: name,
      phone: phone,
      date: `${date}T${time}`,
      bought: document.querySelector("#bought-check").checked ? 1 : 0,
      created_by: user && user.id ? user.id : null
    });
    
    showToast("✅ Запись успешно создана!", "success");
    
    // Очистка формы
    document.querySelector("#name").value = "";
    document.querySelector("#phone").value = "+48 ";
    document.querySelector("#bought-check").checked = false;
    document.querySelector("#final-date").value = "";
    document.querySelector("#final-time").value = "";
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    document.querySelector("#history-alert").style.display = "none";
    
    await load();
  } catch(err) {
    showToast("" + err, "danger");
  }
};

// ============ ИНИЦИАЛИЗАЦИЯ ============

document.addEventListener('DOMContentLoaded', () => {
  init();
  if (getUser()) load();

  const scheduleInput = document.getElementById("schedule-date");
  const scheduleToday = document.getElementById("schedule-today");
  if (scheduleInput) {
    scheduleInput.addEventListener("change", () => {
      updateScheduleLabel(scheduleInput.value);
      renderSchedule(scheduleInput.value, window.__BOOKINGS_CACHE || []);
    });
  }
  if (scheduleToday && scheduleInput) {
    scheduleToday.addEventListener("click", () => {
      scheduleInput.value = new Date().toISOString().split("T")[0];
      updateScheduleLabel(scheduleInput.value);
      renderSchedule(scheduleInput.value, window.__BOOKINGS_CACHE || []);
    });
  }
  
  // Навигация по боковому меню (визуальная активность)
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const view = item.getAttribute("data-view");
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      document.querySelectorAll("[data-view]").forEach(section => {
        if (section.classList.contains("nav-item")) return;
        section.style.display = section.getAttribute("data-view") === view ? "block" : "none";
      });

      if (view === "reports") {
        const period = document.querySelector("[data-report].active")?.getAttribute("data-report") || "day";
        renderReports(period, window.__BOOKINGS_CACHE || []);
      }
    });
  });

  document.querySelectorAll("[data-report]").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-report]").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderReports(chip.getAttribute("data-report"), window.__BOOKINGS_CACHE || []);
    });
  });

  // Горячие клавиши
  document.addEventListener('keydown', (e) => {
    // Ctrl+K - фокус на поиск
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.querySelector("#search-input").focus();
    }
  });
  
  console.log("🌟 Massage CRM Pro загружена");
  console.log("💡 Совет: для получения прав админа используйте: makeAdmin()");
});
