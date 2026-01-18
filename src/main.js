const { invoke } = window.__TAURI__.core;
const times = ["08:00", "08:40", "09:20", "10:00", "10:40", "11:20", "12:00", "12:40", "13:20", "14:00", "14:40"];

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
    document.querySelector(".container").style.filter = "blur(8px)";
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
    document.body.appendChild(panel);
  }
  
  const adminBadge = user.role === "admin" ? 
    `<button class='btn btn-sm' onclick='console.log("Admin ID: ${user.id}")' style='margin-top:0.5rem;opacity:0.7;'>ID: ${user.id}</button>` : "";
  
  panel.innerHTML = `
    <div class='acc-name'>${user.name}</div>
    <div class='acc-role'>${user.role === "admin" ? "🔐 Администратор" : "👤 Работник"}</div>
    <div class='acc-phone'>${user.phone}</div>
    ${adminBadge}
    <button class='acc-logout' onclick='window.logout()'>Выйти</button>
  `;
}

renderAccountPanel();

function hideBlur() {
  document.querySelector(".container").style.filter = "none";
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
  document.querySelector(".container").style.filter = "blur(8px)";
} else {
  hideAuthModal();
  document.querySelector(".container").style.filter = "none";
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
    const cards = document.querySelectorAll(".booking-card");
    let visibleCount = 0;
    
    cards.forEach(card => {
      const isVisible = !term || card.innerText.toLowerCase().includes(term);
      card.style.display = isVisible ? "flex" : "none";
      if (isVisible) visibleCount++;
    });
    
    // Показать сообщение если ничего не найдено
    updateNoResultsMessage(visibleCount === 0 && term.length > 0);
  }, 300);
};

function updateNoResultsMessage(show) {
  let msg = document.getElementById("no-results-msg");
  
  if (show) {
    if (!msg) {
      msg = document.createElement("div");
      msg.id = "no-results-msg";
      msg.className = "alert alert-warning";
      msg.style.display = "block";
      msg.innerHTML = "🔍 Ничего не найдено. Попробуйте изменить запрос.";
      document.querySelector("#list").appendChild(msg);
    }
  } else {
    if (msg) msg.remove();
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

// ============ ФИЛЬТРАЦИЯ ПО СТАТУСУ ============

const statusFilter = ["Все", "pending", "attended", "missed"];
const filterBar = document.createElement("div");
filterBar.className = "filter-bar";

statusFilter.forEach(s => {
  const chip = document.createElement("div");
  chip.className = "chip";
  const labels = {
    "Все": "📋 Все",
    "pending": "⏳ Ожидают",
    "attended": "✅ Посетили",
    "missed": "❌ Пропустили"
  };
  chip.innerHTML = `<span>${labels[s]}</span>`;
  chip.onclick = () => {
    document.querySelectorAll(".filter-bar .chip").forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filterBookings(s);
  };
  filterBar.appendChild(chip);
});

document.querySelector(".card:nth-child(2) .search-wrapper").after(filterBar);
filterBar.firstChild.classList.add("active");

function filterBookings(status) {
  const cards = document.querySelectorAll(".booking-card");
  let visibleCount = 0;
  
  cards.forEach(card => {
    const isVisible = status === "Все" || card.classList.contains(`card-${status}`);
    card.style.display = isVisible ? "flex" : "none";
    if (isVisible) visibleCount++;
  });
  
  updateNoResultsMessage(visibleCount === 0 && status !== "Все");
}

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

// ============ ЗАГРУЗКА ДАННЫХ ============

async function load() {
  try {
    const user = getUser();
    if (!user) return;
    
    const bookings = await invoke("get_bookings");
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
    
    // Список записей
    if (bookings.length === 0) {
      document.querySelector("#list").innerHTML = `
        <div class="alert alert-warning" style="display:block; text-align:center;">
          📝 Пока нет записей. Создайте первую запись!
        </div>
      `;
    } else {
      document.querySelector("#list").innerHTML = bookings.map(b => {
        let sClass = '';
        if (b.status === 'attended') sClass = 'card-attended';
        else if (b.status === 'missed') sClass = 'card-missed';
        else sClass = 'card-pending';
        
        let creator = b.created_by && workers[b.created_by] ? 
          `<div class='booking-creator'>👤 ${workers[b.created_by]}</div>` : "";
        
        const bookingDate = new Date(b.date);
        const now = new Date();
        const isPast = bookingDate < now;
        const isToday = bookingDate.toDateString() === now.toDateString();
        
        let dateLabel = "";
        if (isToday) dateLabel = " (сегодня)";
        else if (isPast && b.status === 'pending') dateLabel = " (просрочено)";
        
        return `
          <div class="booking-card ${sClass}">
            <div class='booking-info'>
              <div class='booking-name'>
                ${b.name}
                ${b.bought ? '<span class="badge badge-gold">💰 Купил массажер</span>' : ''}
              </div>
              <div class='booking-phone'>📞 ${b.phone}</div>
              ${creator}
              <div class='booking-actions'>
                <button class="btn-icon success" onclick="updateStatus(${b.id}, 'attended')" title="Посетил">✅</button>
                <button class="btn-icon danger" onclick="updateStatus(${b.id}, 'missed')" title="Пропустил">❌</button>
                <button class="btn-icon" onclick="openEdit(${b.id})" title="Редактировать">✏️</button>
                <button class="btn-icon danger" onclick="del(${b.id})" title="Удалить">🗑️</button>
              </div>
            </div>
            <div class='booking-meta'>
              <div class='booking-date'>
                📅 ${bookingDate.toLocaleString('ru-RU', {
                  day:'numeric', 
                  month:'short', 
                  hour:'2-digit', 
                  minute:'2-digit'
                })}${dateLabel}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch(err) {
    showToast("Ошибка загрузки: " + err, "danger");
    console.error(err);
  }
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
    document.querySelector(".container").style.filter = "blur(8px)";
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
      createdBy: user.id
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