// Проверка подключения Supabase
if (typeof supabaseClient === 'undefined') {
  console.error('❌ supabaseClient не найден! Проверьте supabase-config.js');
} else {
  console.log('✅ Supabase клиент загружен');
}

const STATUS_LABEL = { ok: 'В наличии', low: 'Мало на складе', out: 'Нет в наличии' };

let siteData = {
  products: [],
  reviews: []
};

/* ---- загрузка данных из Supabase ---- */
async function loadData(){
  try {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      console.log('Загрузка данных из Supabase...');
      
      const { data: products, error: prodErr } = await supabaseClient
        .from('products')
        .select('*')
        .order('created_at', { ascending: true });
      if(prodErr) throw prodErr;
      if(products && products.length){
        siteData.products = products.map(row => ({
          id: row.id,
          img: row.img,
          name: row.name,
          desc: row.description,
          dosage: row.dosage,
          contra: row.contra,
          link: row.link,
          status: row.status
        }));
        console.log('✅ Загружено товаров:', siteData.products.length);
      }

      const { data: reviews, error: revErr } = await supabaseClient
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: true });
      if(revErr) throw revErr;
      if(reviews && reviews.length){
        siteData.reviews = reviews.map(row => ({ id: row.id, text: row.text }));
        console.log('✅ Загружено отзывов:', siteData.reviews.length);
      }
    } else {
      console.log('Supabase не подключён');
    }
  } catch(e){
    console.error('❌ Ошибка загрузки данных:', e);
  }
  renderGrid();
  renderReview();
}

/* ---- reviews carousel ---- */
let reviewIdx = 0;
function renderReview(){
  const el = document.getElementById('reviewText');
  const counter = document.getElementById('reviewCounter');
  
  if (!el || !counter) return;
  
  if (siteData.reviews.length === 0) {
    el.textContent = 'Пока нет отзывов. Будьте первым!';
    counter.textContent = '0/0';
    return;
  }
  
  if (reviewIdx >= siteData.reviews.length) reviewIdx = 0;
  
  el.classList.add('fading');
  setTimeout(() => {
    el.textContent = '«' + siteData.reviews[reviewIdx].text + '»';
    counter.textContent = (reviewIdx+1) + '/' + siteData.reviews.length;
    el.classList.remove('fading');
  }, 160);
}
document.getElementById('prevReview').onclick = () => { 
  if (siteData.reviews.length === 0) return;
  reviewIdx = (reviewIdx - 1 + siteData.reviews.length) % siteData.reviews.length; 
  renderReview(); 
};
document.getElementById('nextReview').onclick = () => { 
  if (siteData.reviews.length === 0) return;
  reviewIdx = (reviewIdx + 1) % siteData.reviews.length; 
  renderReview(); 
};

/* ---- product grid + modal ---- */
function renderGrid(){
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  if (siteData.products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--cream);padding:40px 0;">Товары загружаются...</div>';
    return;
  }
  
  siteData.products.forEach(p => {
    const status = p.status || 'ok';
    const tile = document.createElement('div');
    tile.className = 'tile reveal';
    tile.innerHTML = `
      <div class="tile-img-wrap">
        <span class="badge ${status}">${STATUS_LABEL[status]}</span>
        <img src="${p.img}" alt="${p.name}">
      </div>
      <div class="tile-cta">Подробнее
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1px;margin-left:2px;"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    `;
    tile.onclick = () => openModal(p.id);
    grid.appendChild(tile);
    observeReveal(tile);
  });
}

function openModal(id){
  const p = siteData.products.find(x => x.id === id);
  if (!p) return;
  const status = p.status || 'ok';
  const disabled = status === 'out' ? 'disabled' : '';
  const btnLabel = status === 'out' ? 'Нет в наличии' : 'Заказать на Wildberries';
  const modal = document.getElementById('modalContent');
  modal.innerHTML = `
    <button class="modal-close" id="closeModal" aria-label="Закрыть">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
    <div class="modal-img"><img src="${p.img}" alt=""></div>
    <span class="modal-badge ${status}">${STATUS_LABEL[status]}</span>
    <h2>${p.name}</h2>
    <div class="desc">${p.desc}</div>
    <div class="field-label">Способ применения</div>
    <div class="field-text">${p.dosage}</div>
    <div class="field-label">Противопоказания</div>
    <div class="field-text">${p.contra}</div>
    <a class="order-btn ${disabled}" href="${status === 'out' ? '#' : p.link}" target="_blank" rel="noopener">${btnLabel}</a>
    <div class="order-note">Заказ оформляется на Wildberries — там же можно увидеть все отзывы о товаре.</div>
  `;
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('overlay').classList.add('active');
}
function closeModal(){ document.getElementById('overlay').classList.remove('active'); }
document.getElementById('overlay').addEventListener('click', (e) => { if(e.target.id === 'overlay') closeModal(); });

/* ---- форма "Оставить отзыв" для обычных посетителей ---- */
function openReviewForm(){
  const modal = document.getElementById('modalContent');
  modal.innerHTML = `
    <button class="modal-close" id="closeModal" aria-label="Закрыть">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
    <h2>Оставить отзыв</h2>
    <div class="review-form-note">Отзыв появится на сайте после проверки администратором.</div>
    <div class="admin-form">
      <textarea id="publicReviewText" maxlength="500" placeholder="Расскажите о своём опыте..."></textarea>
      <input type="text" id="publicReviewHp" class="review-honeypot" tabindex="-1" autocomplete="off">
      <button class="primary" id="submitReviewBtn">Отправить отзыв</button>
    </div>
    <div class="review-form-status" id="reviewFormStatus"></div>
  `;
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('overlay').classList.add('active');
  document.getElementById('submitReviewBtn').onclick = submitPublicReview;
}

async function submitPublicReview(){
  const textEl = document.getElementById('publicReviewText');
  const hpEl = document.getElementById('publicReviewHp');
  const statusEl = document.getElementById('reviewFormStatus');
  const btn = document.getElementById('submitReviewBtn');
  const text = textEl.value.trim();

  statusEl.classList.remove('error');
  statusEl.textContent = '';

  if(text.length < 3){
    statusEl.classList.add('error');
    statusEl.textContent = 'Слишком короткий отзыв.';
    return;
  }

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Отправка...';

  try {
    const { data, error } = await supabaseClient.functions.invoke('submit-review', {
      body: { text, hp: hpEl.value }
    });
    if(error || !data || data.success === false){
      throw new Error((data && data.error) || 'Ошибка отправки');
    }
    statusEl.textContent = 'Спасибо! Отзыв отправлен на модерацию.';
    textEl.value = '';
    setTimeout(closeModal, 1600);
  } catch(e){
    console.error(e);
    statusEl.classList.add('error');
    statusEl.textContent = 'Не удалось отправить отзыв. Попробуйте позже.';
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

const openReviewFormBtn = document.getElementById('openReviewFormBtn');
if(openReviewFormBtn) openReviewFormBtn.onclick = openReviewForm;


/* ---- scroll reveal ---- */
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add('in-view');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
function observeReveal(el){ io.observe(el); }
document.querySelectorAll('.reveal').forEach(el => observeReveal(el));

/* ---- admin ---- */
let adminUnlocked = false;
let adminTab = 'stock';

/* ---- admin JWT storage (sessionStorage) ---- */
const ADMIN_TOKEN_KEY = 'admin_jwt';
const ADMIN_TOKEN_EXP_KEY = 'admin_jwt_exp';

function saveAdminToken(token, expiresAtUnixSeconds){
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  sessionStorage.setItem(ADMIN_TOKEN_EXP_KEY, String(expiresAtUnixSeconds));
}
function getAdminToken(){
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const exp = parseInt(sessionStorage.getItem(ADMIN_TOKEN_EXP_KEY) || '0', 10);
  if(!token || !exp) return null;
  if(Math.floor(Date.now() / 1000) >= exp){
    clearAdminToken();
    return null;
  }
  return token;
}
function clearAdminToken(){
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_EXP_KEY);
}

/* ---- единая точка входа для всех административных изменений ----
   Больше никаких прямых supabase.from(...).insert/update/delete
   для админ-операций — всё идёт через защищённую Edge Function. */
async function adminAction(action, payload){
  const token = getAdminToken();
  if(!token){
    adminUnlocked = false;
    renderAdminPassScreen();
    throw new Error('Сессия истекла, войдите снова');
  }
  const { data, error } = await supabaseClient.functions.invoke('admin-action', {
    body: { action, payload },
    headers: { Authorization: `Bearer ${token}` }
  });
  if(error){
    // Токен могли отклонить как невалидный/просроченный — вернём на экран входа
    if(error.context && (error.context.status === 401 || error.context.status === 403)){
      clearAdminToken();
      adminUnlocked = false;
      renderAdminPassScreen();
    }
    throw error;
  }
  if(data && data.success === false){
    throw new Error(data.error || 'Ошибка операции');
  }
  return data && data.result !== undefined ? data.result : data;
}

/* Автовыход по истечении токена, пока панель открыта */
setInterval(() => {
  const overlay = document.getElementById('adminOverlay');
  if(overlay && overlay.classList.contains('active') && adminUnlocked){
    if(!getAdminToken()){
      adminUnlocked = false;
      renderAdminPassScreen();
    }
  }
}, 30000);

function renderAdminPassScreen(){
  const panel = document.getElementById('adminPanel');
  panel.innerHTML = `
    <button class="admin-close" id="closeAdmin" aria-label="Закрыть">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
    <div class="admin-pass-screen">
      <h3>Панель управления</h3>
      <div style="font-size:12px;color:var(--ink-soft);">Введите код доступа</div>
      <input type="password" id="adminPassInput" placeholder="Код доступа">
      <button id="adminPassSubmit">Войти</button>
      <div id="adminError" style="color:#d32f2f;font-size:12px;margin-top:8px;display:none;">Неверный код доступа</div>
    </div>
  `;
  document.getElementById('closeAdmin').onclick = closeAdmin;
  document.getElementById('adminPassSubmit').onclick = async () => {
    const val = document.getElementById('adminPassInput').value;
    const errorEl = document.getElementById('adminError');
    
    errorEl.style.display = 'none';
    
    try {
      console.log('🔍 Отправка запроса к Edge Function...');
      
      const { data, error } = await supabaseClient.functions.invoke('verify-admin', {
        body: { password: val }
      });
      
      console.log('📦 Ответ от функции:', data);
      
      if (error || !data || !data.success || !data.token) {
        errorEl.style.display = 'block';
        document.getElementById('adminPassInput').style.borderColor = 'var(--out)';
        return;
      }

      saveAdminToken(data.token, data.expiresAt);
      adminUnlocked = true;
      renderAdminPanel();
    } catch(e) {
      errorEl.style.display = 'block';
      document.getElementById('adminPassInput').style.borderColor = 'var(--out)';
      console.error('❌ Ошибка при проверке пароля:', e);
    }
  };
}

function adminTabsHtml(){
  const tabs = [['stock','Наличие'],['reviews','Отзывы'],['products','Товары']];
  return '<div class="admin-tabs">' + tabs.map(t =>
    `<button class="admin-tab ${adminTab===t[0]?'active':''}" data-tab="${t[0]}">${t[1]}</button>`
  ).join('') + '</div>';
}

let adminReviewsData = null; // полный список (pending+approved), грузится через admin-action

function renderAdminPanel(){
  const panel = document.getElementById('adminPanel');
  let body = '';
  if(adminTab === 'stock') body = adminStockHtml();
  else if(adminTab === 'reviews') body = adminReviewsData ? adminReviewsHtml() : '<p style="color:var(--ink-soft);">Загрузка отзывов...</p>';
  else if(adminTab === 'products') body = adminProductsHtml();

  panel.innerHTML = `
    <button class="admin-close" id="closeAdmin" aria-label="Закрыть">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
    <h3>Панель управления</h3>
    ${adminTabsHtml()}
    ${body}
    <div class="admin-save-note" id="saveNote"></div>
  `;
  document.getElementById('closeAdmin').onclick = closeAdmin;
  panel.querySelectorAll('.admin-tab').forEach(btn => {
    btn.onclick = () => { adminTab = btn.getAttribute('data-tab'); renderAdminPanel(); };
  });
  bindAdminTabEvents(panel);

  if(adminTab === 'reviews' && !adminReviewsData){
    loadAdminReviews();
  }
}

async function loadAdminReviews(){
  try {
    const result = await adminAction('reviews.listAll', {});
    adminReviewsData = Array.isArray(result) ? result : [];
  } catch(e){
    console.error(e);
    adminReviewsData = [];
  }
  if(adminTab === 'reviews') renderAdminPanel();
}

function flashSaved(){
  const note = document.getElementById('saveNote');
  if(note){ note.textContent = 'Сохранено'; setTimeout(()=>{ if(note) note.textContent=''; }, 1500); }
}

function adminStockHtml(){
  if (siteData.products.length === 0) {
    return '<p style="color:var(--ink-soft);">Нет товаров для управления</p>';
  }
  return siteData.products.map(p => {
    const status = p.status || 'ok';
    return `
      <div class="admin-row">
        <img src="${p.img}" alt="">
        <div class="name">${p.name}</div>
        <div class="admin-btns">
          <button class="admin-btn stock-btn ${status==='ok'?'active-ok':''}" data-id="${p.id}" data-s="ok">Есть</button>
          <button class="admin-btn stock-btn ${status==='low'?'active-low':''}" data-id="${p.id}" data-s="low">Мало</button>
          <button class="admin-btn stock-btn ${status==='out'?'active-out':''}" data-id="${p.id}" data-s="out">Нет</button>
        </div>
      </div>
    `;
  }).join('');
}

function adminReviewsHtml(){
  const list = adminReviewsData.map((r,i) => `
    <div class="review-item">
      <div class="txt">${r.text}<span class="admin-status-pill ${r.status}">${r.status === 'pending' ? 'На модерации' : 'Опубликован'}</span></div>
      ${r.status === 'pending' ? `<button class="approve-btn review-approve" data-i="${i}">Одобрить</button>` : ''}
      <button class="del-btn review-del" data-i="${i}">Удалить</button>
    </div>
  `).join('');
  return `
    <div class="admin-note-box">Отзывы, добавленные здесь, публикуются сразу. Отзывы посетителей сайта попадают сюда со статусом «На модерации» — их нужно одобрить, чтобы они появились в карусели.</div>
    <div class="admin-form">
      <label>Новый отзыв</label>
      <textarea id="newReviewText" placeholder="Текст отзыва"></textarea>
      <button class="primary" id="addReviewBtn">Добавить отзыв</button>
    </div>
    <div style="margin-top:14px;">${list || '<p style="color:var(--ink-soft);">Нет отзывов</p>'}</div>
  `;
}

function adminProductsHtml(){
  const list = siteData.products.map((p,i) => `
    <div class="admin-form" style="border-bottom:1px solid rgba(43,38,32,0.1); padding-bottom:12px; margin-bottom:12px;">
      <div style="display:flex; gap:10px; align-items:center;">
        <img src="${p.img}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;">
        <div style="font-size:12px; font-weight:700; flex:1;">${p.name}</div>
        <button class="del-btn product-del" data-i="${i}">Удалить</button>
      </div>
      <label>Название</label>
      <input type="text" class="p-name" data-i="${i}" value="${p.name.replace(/"/g,'&quot;')}">
      <label>Описание</label>
      <textarea class="p-desc" data-i="${i}">${p.desc}</textarea>
      <label>Способ применения</label>
      <textarea class="p-dosage" data-i="${i}">${p.dosage}</textarea>
      <label>Противопоказания</label>
      <textarea class="p-contra" data-i="${i}">${p.contra}</textarea>
      <label>Ссылка на Wildberries</label>
      <input type="text" class="p-link" data-i="${i}" value="${p.link}">
      <button class="primary product-save" data-i="${i}">Сохранить товар</button>
    </div>
  `).join('');
  return `
    <div class="admin-note-box">Изображение для нового товара указывается ссылкой (URL).</div>
    <div class="admin-form" style="border-bottom:2px solid rgba(31,92,67,0.2); padding-bottom:14px; margin-bottom:14px;">
      <label>Добавить новый товар</label>
      <input type="text" id="newP_name" placeholder="Название товара">
      <input type="text" id="newP_img" placeholder="Ссылка на изображение (URL)">
      <textarea id="newP_desc" placeholder="Описание"></textarea>
      <textarea id="newP_dosage" placeholder="Способ применения"></textarea>
      <textarea id="newP_contra" placeholder="Противопоказания"></textarea>
      <input type="text" id="newP_link" placeholder="Ссылка на Wildberries">
      <button class="primary" id="addProductBtn">Добавить товар</button>
    </div>
    ${list || '<p style="color:var(--ink-soft);">Нет товаров</p>'}
  `;
}

function bindAdminTabEvents(panel){
  panel.querySelectorAll('.stock-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const status = btn.getAttribute('data-s');
      try {
        await adminAction('products.setStatus', { id, status });
      } catch(e){ console.error(e); return; }
      const p = siteData.products.find(x => x.id === id);
      if(p) p.status = status;
      renderGrid();
      renderAdminPanel();
      flashSaved();
    };
  });

  const addReviewBtn = panel.querySelector('#addReviewBtn');
  if(addReviewBtn) addReviewBtn.onclick = async () => {
    const val = document.getElementById('newReviewText').value.trim();
    if(!val) return;
    let data;
    try {
      data = await adminAction('reviews.create', { text: val });
    } catch(e){ console.error(e); return; }
    // отзыв, добавленный админом, публикуется сразу
    siteData.reviews.push({ id: data.id, text: data.text });
    if(adminReviewsData) adminReviewsData.push(data);
    renderReview();
    renderAdminPanel();
    flashSaved();
  };
  panel.querySelectorAll('.review-approve').forEach(btn => {
    btn.onclick = async () => {
      const i = parseInt(btn.getAttribute('data-i'));
      const rev = adminReviewsData[i];
      if(!rev) return;
      try {
        await adminAction('reviews.approve', { id: rev.id });
      } catch(e){ console.error(e); return; }
      rev.status = 'approved';
      // теперь отзыв виден и в публичной карусели
      if(!siteData.reviews.some(r => r.id === rev.id)){
        siteData.reviews.push({ id: rev.id, text: rev.text });
        renderReview();
      }
      renderAdminPanel();
      flashSaved();
    };
  });
  panel.querySelectorAll('.review-del').forEach(btn => {
    btn.onclick = async () => {
      const i = parseInt(btn.getAttribute('data-i'));
      const rev = adminReviewsData[i];
      if(!rev) return;
      try {
        await adminAction('reviews.delete', { id: rev.id });
      } catch(e){ console.error(e); return; }
      adminReviewsData.splice(i,1);
      const pubIdx = siteData.reviews.findIndex(r => r.id === rev.id);
      if(pubIdx !== -1) siteData.reviews.splice(pubIdx,1);
      reviewIdx = 0;
      renderReview();
      renderAdminPanel();
      flashSaved();
    };
  });

  const addProductBtn = panel.querySelector('#addProductBtn');
  if(addProductBtn) addProductBtn.onclick = async () => {
    const name = document.getElementById('newP_name').value.trim();
    const img = document.getElementById('newP_img').value.trim();
    const desc = document.getElementById('newP_desc').value.trim();
    const dosage = document.getElementById('newP_dosage').value.trim();
    const contra = document.getElementById('newP_contra').value.trim();
    const link = document.getElementById('newP_link').value.trim();
    if(!name || !img || !link) return;
    let data;
    try {
      data = await adminAction('products.create', {
        img, name, description: desc, dosage, contra, link
      });
    } catch(e){ console.error(e); return; }
    siteData.products.push({
      id: data.id, img: data.img, name: data.name, desc: data.description,
      dosage: data.dosage, contra: data.contra, link: data.link, status: data.status
    });
    renderGrid();
    renderAdminPanel();
    flashSaved();
  };
  panel.querySelectorAll('.product-save').forEach(btn => {
    btn.onclick = async () => {
      const i = parseInt(btn.getAttribute('data-i'));
      const p = siteData.products[i];
      p.name = panel.querySelector(`.p-name[data-i="${i}"]`).value;
      p.desc = panel.querySelector(`.p-desc[data-i="${i}"]`).value;
      p.dosage = panel.querySelector(`.p-dosage[data-i="${i}"]`).value;
      p.contra = panel.querySelector(`.p-contra[data-i="${i}"]`).value;
      p.link = panel.querySelector(`.p-link[data-i="${i}"]`).value;
      try {
        await adminAction('products.update', {
          id: p.id, name: p.name, description: p.desc, dosage: p.dosage, contra: p.contra, link: p.link
        });
      } catch(e){ console.error(e); return; }
      renderGrid();
      flashSaved();
    };
  });
  panel.querySelectorAll('.product-del').forEach(btn => {
    btn.onclick = async () => {
      const i = parseInt(btn.getAttribute('data-i'));
      const removedId = siteData.products[i].id;
      try {
        await adminAction('products.delete', { id: removedId });
      } catch(e){ console.error(e); return; }
      siteData.products.splice(i,1);
      renderGrid();
      renderAdminPanel();
      flashSaved();
    };
  });
}

function openAdmin(){
  const overlay = document.getElementById('adminOverlay');
  if (!overlay) {
    console.error('❌ adminOverlay не найден!');
    return;
  }
  overlay.classList.add('active');
  adminUnlocked = !!getAdminToken();
  if(adminUnlocked){ renderAdminPanel(); } else { renderAdminPassScreen(); }
}
function closeAdmin(){ 
  const overlay = document.getElementById('adminOverlay');
  if (overlay) overlay.classList.remove('active'); 
}
document.getElementById('adminOverlay').addEventListener('click', (e) => { if(e.target.id === 'adminOverlay') closeAdmin(); });

// ЗАПУСКАЕМ ЗАГРУЗКУ
loadData();

/* ---- intro / entrance screen ---- */
(function(){
  const overlay = document.getElementById('introOverlay');
  const enterBtn = document.getElementById('introEnterBtn');
  const page = document.getElementById('pageContent');
  const audio = document.getElementById('quranAudio');
  if(enterBtn){
    enterBtn.onclick = () => {
      overlay.classList.add('hidden');
      if(page) page.classList.remove('blurred');
      if(audio){
        audio.play().catch(() => {});
      }
      setTimeout(() => { if(overlay && overlay.parentNode) overlay.remove(); }, 700);
    };
  }
})();
