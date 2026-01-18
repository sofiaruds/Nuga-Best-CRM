const { invoke } = window.__TAURI__.core;
const times = ["08:00", "08:40", "09:20", "10:00", "10:40", "11:20", "12:00", "12:40", "13:20", "14:00", "14:40"];

function init() {
  const dGrid = document.querySelector("#date-btns");
  for (let i = 0; i < 6; i++) {
    let d = new Date(); 
    d.setDate(d.getDate() + i);
    let iso = d.toISOString().split('T')[0];
    let btn = document.createElement('div'); 
    btn.className = 'chip';
    btn.innerHTML = `<span>${i === 0 ? "Сегодня" : d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})}</span>`;
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

// Авторизация
function showAuthModal() {
  document.getElementById("auth-modal").style.display = "flex";
}

function hideAuthModal() {
  document.getElementById("auth-modal").style.display = "none";
}

// Переключение вкладок авторизации
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

// Управление сессией
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
  localStorage.removeItem("user");
  renderAccountPanel();
  showAuthModal();
  document.querySelector(".container").style.filter = "blur(8px)";
}

// Панель аккаунта
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
  
  panel.innerHTML = `
    <div class='acc-name'>${user.name}</div>
    <div class='acc-role'>${user.role === "admin" ? "🔐 Администратор" : "👤 Работник"}</div>
    <div class='acc-phone'>${user.phone}</div>
    <button class='acc-logout' onclick='window.logout()'>Выйти</button>
  `;
}

renderAccountPanel();

// Скрыть блюр при входе
function hideBlur() {
  document.querySelector(".container").style.filter = "none";
  renderAccountPanel();
}

// Форма входа
const loginForm = document.getElementById("login-form");
loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const phone = document.getElementById("login-phone").value;
  const password = document.getElementById("login-password").value;
  
  try {
    const user = await invoke("login_user", { phone, password });
    setUser(user); 
    hideAuthModal(); 
    showToast("Вход выполнен!", "success");
    hideBlur();
    load();
  } catch (err) {
    showToast("Ошибка входа: " + err, "danger");
  }
};

// Форма регистрации
const regForm = document.getElementById("register-form");
regForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value;
  const phone = document.getElementById("reg-phone").value;
  const password = document.getElementById("reg-password").value;
  
  try {
    await invoke("register_user", { name, phone, password });
    showToast("Регистрация успешна! Теперь войдите.", "success");
    tabLogin.click();
    hideBlur();
  } catch (err) {
    showToast("Ошибка регистрации: " + err, "danger");
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

// Умная проверка истории клиента
document.querySelector("#phone").onblur = async (e) => {
  const phone = e.target.value;
  if (phone.length < 12) return;
  
  try {
    const history = await invoke("check_client_history", { phone });
    const alertBox = document.querySelector("#history-alert");
    
    if (history.last_name) {
      if (!document.querySelector("#name").value) {
        document.querySelector("#name").value = history.last_name;
      }
      alertBox.style.display = "block";
      
      if (history.missed > 0) {
        alertBox.className = "alert alert-danger";
        alertBox.innerHTML = `⚠️ <strong>ПРОГУЛЬЩИК!</strong> Пропусков: ${history.missed}`;
      } else {
        alertBox.className = "alert alert-success";
        alertBox.innerHTML = `✅ <strong>Постоянный клиент</strong> (${history.attended} визитов)`;
      }
    } else { 
      alertBox.style.display = "none"; 
    }
  } catch(err) {
    console.error("История клиента:", err);
  }
};

// Поиск
document.querySelector("#search-input").oninput = (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll(".booking-card").forEach(card => {
    card.style.display = card.innerText.toLowerCase().includes(term) ? "flex" : "none";
  });
};

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

// Фильтрация по статусу
const statusFilter = ["Все", "attended", "missed", "pending"];
const filterBar = document.createElement("div");
filterBar.className = "filter-bar";

statusFilter.forEach(s => {
  const chip = document.createElement("div");
  chip.className = "chip";
  const label = s === "Все" ? "Все" : (s === "attended" ? "✅ Посетили" : s === "missed" ? "❌ Пропустили" : "⏳ Ожидают");
  chip.innerHTML = `<span>${label}</span>`;
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
  document.querySelectorAll(".booking-card").forEach(card => {
    if (status === "Все") {
      card.style.display = "flex";
    } else {
      card.style.display = card.classList.contains(`card-${status}`) ? "flex" : "none";
    }
  });
}

// Обновление статуса
window.updateStatus = async (id, status) => {
  try {
    await invoke("update_status", { id, status });
    showToast("Статус обновлен!", status === "attended" ? "success" : status === "missed" ? "danger" : "");
    load();
  } catch(err) {
    showToast("Ошибка: " + err, "danger");
  }
};

// Удаление записи
window.del = async (id) => {
  if(confirm("Вы уверены, что хотите удалить эту запись?")) {
    try {
      await invoke("delete_booking", {id});
      showToast("Запись удалена", "danger");
      load();
    } catch(err) {
      showToast("Ошибка удаления: " + err, "danger");
    }
  }
};

// Открытие модального окна редактирования
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
    showToast("Ошибка: " + err, "danger");
  }
};

// История работника
window.showWorkerHistory = async (workerId, workerName) => {
  try {
    const bookings = await invoke("get_worker_history", { workerId: workerId });
    
    let html = `<h3 style="margin-bottom: 1rem;">📊 Клиенты работника: ${workerName}</h3>`;
    
    if (bookings.length === 0) {
      html += '<div class="alert alert-warning" style="display:block;">Нет записей</div>';
    } else {
      html += bookings.map(b => {
        const sClass = b.status === 'attended' ? 'card-attended' : (b.status === 'missed' ? 'card-missed' : '');
        return `
          <div class='booking-card ${sClass}' style="margin-bottom: 0.75rem;">
            <div class='booking-info'>
              <div class='booking-name'>${b.name}</div>
              <div class='booking-phone'>${b.phone}</div>
              <div class='booking-date'>${new Date(b.date).toLocaleString('ru-RU', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}</div>
            </div>
            <div class='booking-meta'>
              <span class='badge ${b.status === "attended" ? "badge-success" : b.status === "missed" ? "badge-danger" : "badge-warning"}'>
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
        <div class='modal-content' style='max-width: 700px; max-height: 80vh; overflow-y: auto;'>
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
    showToast("Ошибка загрузки истории: " + err, "danger");
  }
};

// Загрузка данных
async function load() {
  try {
    const user = getUser();
    let bookings = await invoke("get_bookings");
    let workers = {};
    
    // Удаляем старую статистику работников
    const oldWorkerStats = document.querySelector(".worker-stats-container");
    if (oldWorkerStats) oldWorkerStats.remove();
    
    // Статистика для админа
    if (user && user.role === "admin") {
      const workerList = await invoke("get_workers");
      workerList.forEach(w => { workers[w.id] = w.name; });
      
      const workerStats = document.createElement("div");
      workerStats.className = "stats-grid worker-stats-container";
      workerStats.innerHTML = workerList.map(w => `
        <div class='stat-card'>
          <div class='stat-label'>${w.name}</div>
          <div class='stat-value' style='font-size: 1rem; margin-bottom: 0.5rem;'>${w.phone}</div>
          <small style='color: var(--text-dim); display: block; margin-bottom: 0.75rem;'>
            Регистрация: ${new Date(w.registered_at).toLocaleDateString('ru-RU')}
          </small>
          <button class='btn btn-sm' onclick='showWorkerHistory(${w.id}, "${w.name}")'>
            <span>📊 История</span>
          </button>
        </div>
      `).join("");
      
      const statsElement = document.getElementById("stats");
      statsElement.parentNode.insertBefore(workerStats, statsElement);
    }
    
    // Общая статистика
    const total = bookings.length;
    const attended = bookings.filter(b => b.status === 'attended').length;
    const missed = bookings.filter(b => b.status === 'missed').length;
    const bought = bookings.filter(b => b.bought).length;
    
    document.getElementById("stats").innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Всего записей</div>
        <div class="stat-value">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Посещено</div>
        <div class="stat-value success">${attended}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Пропущено</div>
        <div class="stat-value danger">${missed}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Купили массажер</div>
        <div class="stat-value warning">${bought}</div>
      </div>
    `;
    
    // Список записей
    document.querySelector("#list").innerHTML = bookings.map(b => {
      let sClass = b.status === 'attended' ? 'card-attended' : (b.status === 'missed' ? 'card-missed' : '');
      let creator = b.created_by && workers[b.created_by] ? 
        `<div class='booking-creator'>Добавил: ${workers[b.created_by]}</div>` : "";
      
      return `
        <div class="booking-card ${sClass}">
          <div class='booking-info'>
            <div class='booking-name'>
              ${b.name}
              ${b.bought ? '<span class="badge badge-gold">💰 Купил массажер</span>' : ''}
            </div>
            <div class='booking-phone'>${b.phone}</div>
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
              ${new Date(b.date).toLocaleString('ru-RU', {
                day:'numeric', 
                month:'short', 
                hour:'2-digit', 
                minute:'2-digit'
              })}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch(err) {
    showToast("Ошибка загрузки данных: " + err, "danger");
    console.error(err);
  }
}

// Закрытие модального окна редактирования
document.getElementById("close-edit").onclick = () => {
  document.getElementById("edit-modal").style.display = "none";
};

// Форма редактирования
document.getElementById("edit-form").onsubmit = async (e) => {
  e.preventDefault();
  const id = Number(document.getElementById("edit-id").value);
  const name = document.getElementById("edit-name").value;
  const phone = document.getElementById("edit-phone").value;
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
    load();
  } catch(err) {
    showToast("Ошибка редактирования: " + err, "danger");
  }
};

// Форма создания записи
document.querySelector("#booking-form").onsubmit = async (e) => {
  e.preventDefault();
  const user = getUser();
  
  if (!user || !user.id) {
    showToast("Ошибка: вы не авторизованы!", "danger");
    showAuthModal();
    document.querySelector(".container").style.filter = "blur(8px)";
    return;
  }
  
  const date = document.querySelector("#final-date").value;
  const time = document.querySelector("#final-time").value;
  const name = document.querySelector("#name").value;
  const phone = document.querySelector("#phone").value;
  
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
    
    showToast("Запись добавлена!", "success");
    
    // Очистка формы
    document.querySelector("#name").value = "";
    document.querySelector("#phone").value = "+48 ";
    document.querySelector("#bought-check").checked = false;
    document.querySelector("#final-date").value = "";
    document.querySelector("#final-time").value = "";
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    document.querySelector("#history-alert").style.display = "none";
    
    load();
  } catch(err) {
    showToast("Ошибка добавления записи: " + err, "danger");
  }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  init();
  load();
});