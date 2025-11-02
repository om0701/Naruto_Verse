
/* ===== Config ===== */
const API_BASE = 'https://dattebayo-api.onrender.com';
const API_TIMEOUT = 30000;

/* One reliable banner used everywhere (PNG) */
const GENERIC_BANNER_URL = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQQqb1nFRAQqu-WbvdIv0A-2-uMpX7zDR0DFA&s';
const CLAN_BANNER_URL = GENERIC_BANNER_URL;
const VILLAGE_BANNER_URL = GENERIC_BANNER_URL;

/* ===== DOM ===== */
const loader = document.getElementById('loading');
const itemGrid = document.getElementById('item-grid');
const gridTitle = document.getElementById('grid-title');
const pagination = document.getElementById('pagination');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const pageInfo = document.getElementById('page-info');
const navLinks = document.querySelectorAll('.nav-link');
const errorMessage = document.getElementById('error-message');

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const themeToggle = document.getElementById('theme-toggle');

const heroButton = document.getElementById('hero-action-button');
const contentAnchor = document.getElementById('content-anchor');

const detailsOverlay = document.getElementById('details-overlay');
const detailsImg = document.getElementById('details-img');
const detailsName = document.getElementById('details-name');

const charOnlySections = document.querySelectorAll('.character-only-section');
const genericSection = document.getElementById('details-section-generic');

const detailsGenericDescription = document.getElementById('details-generic-description');
const detailsInfoPersonal = document.getElementById('details-info-personal');
const detailsInfoRank = document.getElementById('details-info-rank');
const detailsJutsu = document.getElementById('details-jutsu');
const detailsFamily = document.getElementById('details-family');
const detailsGenericList = document.getElementById('details-generic-list');

/* ===== State ===== */
let state = {
  currentPage: 1,
  totalPages: 1,
  currentEndpoint: 'character',
  currentSearch: '',
  itemsPerPage: 20
};

const titleMap = { character: 'Characters', clan: 'Clans', village: 'Villages' };

/* ===== Helpers ===== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function updateActiveNav(endpoint) {
  navLinks.forEach((link) => {
    link.classList.remove('active');
    if (link.id === `nav-${endpoint}`) link.classList.add('active');
  });
}

function scrollToContent() {
  contentAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setSearchPlaceholder(endpoint) {
  searchInput.disabled = false;
  searchInput.placeholder = `Search ${titleMap[endpoint]}...`;
}

function isValidData(data) {
  if (!data) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') return Object.values(data).some((v) => v != null && `${v}`.trim() !== '');
  return !!data;
}

/* Prefer real home villages; ignore orgs like Akatsuki/Allied forces */
function pickVillage(personal) {
  if (!personal) return 'Unknown';
  if (personal.village) return personal.village;

  const BLACKLIST = [
    'allied shinobi forces','akatsuki','kara','anbu','root','taka','team','sannin',
    'seven ninja swordsmen','kara organization','konoha council'
  ];
  const PRIORITY = [
    'Sunagakure','Konohagakure','Iwagakure','Kumogakure','Kirigakure','Amegakure',
    'Uzushiogakure','Takigakure','Kusagakure','Yugakure','Hoshigakure','Otogakure'
  ];

  const aff = personal.affiliation;
  const list = Array.isArray(aff) ? aff : aff ? [aff] : [];

  const villages = list
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => /gakure/i.test(s) && !BLACKLIST.some((b) => s.toLowerCase().includes(b)));

  for (const v of PRIORITY) {
    if (villages.some((s) => s.toLowerCase().includes(v.toLowerCase()))) return v;
  }
  if (villages.length) return villages[0];

  if (typeof personal.birthplace === 'string' && /gakure/i.test(personal.birthplace)) {
    return personal.birthplace;
  }
  return 'Unknown';
}

/* Skeleton cards to avoid flicker */
function showSkeleton(count = 12) {
  itemGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const sk = document.createElement('div');
    sk.className = 'card-skeleton';
    sk.innerHTML = `<div class="sk-img"></div><div class="sk-line sk-title"></div><div class="sk-line"></div>`;
    itemGrid.appendChild(sk);
  }
}

function showError(message) {
  errorMessage.innerHTML = `<p>${message}</p><p>The API server might be sleeping or offline. Please try again in a minute.</p>`;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  errorMessage.classList.add('hidden');
}

function updateStats(type, value) {
  const el = document.getElementById(`stat-${type}`);
  if (el) el.textContent = value > 0 ? value : '...';
}

/* ===== API ===== */
async function fetchData(endpoint, page = 1, searchQuery = '') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  const limit = state.itemsPerPage;
  let url = `${API_BASE}/${endpoint}s?page=${page}&limit=${limit}`;
  if (searchQuery) url += `&name=${encodeURIComponent(searchQuery)}`;

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();

    const list = data[`${endpoint}s`] || data.data || data.results || [];
    const total =
      data.total || data.totalItems || data.totalCharacters || data.totalClans || data.totalVillages ||
      (Array.isArray(list) ? list.length : 0);

    return { list, currentPage: data.currentPage || page, pageSize: data.pageSize || limit, total };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`API request timed out (${API_TIMEOUT / 1000} seconds).`);
    throw err;
  }
}

/* ===== Rendering ===== */
function renderGrid(items, type) {
  itemGrid.innerHTML = '';
  if (!items || items.length === 0) {
    itemGrid.innerHTML = `<p class="message-center">No results found.</p>`;
    return;
  }

  items.forEach((item, index) => {
    if (!item || !item.name) return;

    const card = document.createElement('div');
    card.className = 'item-card clickable';
    card.style.animationDelay = `${index * 0.05}s`;

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'card-image-wrapper';

    const img = document.createElement('img');
    img.className = 'card-image';
    const placeholderUrl = `https://via.placeholder.com/600x450/141414/ff6b35?text=${encodeURIComponent(item.name)}`;

    if (type === 'character') {
      img.src = item.images && item.images.length > 0 ? item.images[0] : placeholderUrl;
    } else {
      img.src = type === 'clan' ? CLAN_BANNER_URL : VILLAGE_BANNER_URL;
    }
    img.alt = item.name;
    img.onerror = function () { this.src = placeholderUrl; };

    imgWrapper.appendChild(img);
    card.appendChild(imgWrapper);

    const content = document.createElement('div');
    content.className = 'card-content';

    if (type === 'character') {
      const village = pickVillage(item.personal);
      content.innerHTML = `<h3>${item.name}</h3><p>Village: ${village}</p>`;
      card.onclick = () => openCharacterDetails(item);
    } else {
      const members = item.characters?.length || 0;
      content.innerHTML = `<h3>${item.name}</h3><p>Known Members: ${members}</p>`;
      card.onclick = () => openGenericDetails(item, type);
    }

    card.appendChild(content);
    itemGrid.appendChild(card);
  });

  itemGrid.style.opacity = '0';
  requestAnimationFrame(() => {
    itemGrid.style.transition = 'opacity .25s ease';
    itemGrid.style.opacity = '1';
  });
}

function updatePagination() {
  if (state.totalPages > 1) {
    pagination.classList.remove('hidden');
    pageInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
    prevButton.disabled = state.currentPage === 1;
    nextButton.disabled = state.currentPage >= state.totalPages;
  } else {
    pagination.classList.add('hidden');
  }
}

/* ===== Details ===== */
function renderDetailInfo(container, data) {
  container.innerHTML = '';
  let ok = false;
  if (isValidData(data)) {
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (!value || `${value}`.length === 0 || ['age', 'height', 'weight'].includes(lower)) continue;
      const val = Array.isArray(value) ? value.join(', ') : value;
      const formatted = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      container.insertAdjacentHTML('beforeend', `<p><strong>${formatted}:</strong> <span>${val}</span></p>`);
      ok = true;
    }
  }
  return ok;
}

function renderDetailList(container, list) {
  container.innerHTML = '';
  if (!isValidData(list)) return false;
  (Array.isArray(list) ? list : [list]).forEach((v) => container.insertAdjacentHTML('beforeend', `<li>${v}</li>`));
  return true;
}

function openCharacterDetails(character) {
  detailsOverlay.classList.remove('hidden');
  const img =
    character.images && character.images.length > 0
      ? character.images[0]
      : `https://via.placeholder.com/800x1000/141414/ff6b35?text=${encodeURIComponent(character.name)}`;
  detailsImg.style.backgroundImage = `url('${img}')`;
  detailsImg.style.backgroundSize = 'cover';
  detailsImg.style.backgroundRepeat = 'no-repeat';
  detailsImg.style.backgroundPosition = 'center';
  detailsName.textContent = character.name || 'Unknown';

  charOnlySections.forEach((el) => el.classList.add('hidden'));
  genericSection.classList.add('hidden');

  if (renderDetailInfo(detailsInfoPersonal, character.personal)) {
    document.getElementById('section-personal').classList.remove('hidden');
  }
  if (renderDetailInfo(detailsInfoRank, character.rank)) {
    document.getElementById('section-rank').classList.remove('hidden');
  }
  if (renderDetailList(detailsJutsu, character.jutsu)) {
    document.getElementById('section-jutsu').classList.remove('hidden');
  }
  const fam = Array.isArray(character.family) ? character.family : character.family ? Object.values(character.family) : [];
  if (renderDetailList(detailsFamily, fam)) {
    document.getElementById('section-family').classList.remove('hidden');
  }
}

function openGenericDetails(item, type) {
  detailsOverlay.classList.remove('hidden');

  charOnlySections.forEach((el) => el.classList.add('hidden'));
  const img = type === 'clan' ? CLAN_BANNER_URL : VILLAGE_BANNER_URL;
  detailsImg.style.backgroundImage = `url('${img}')`;
  detailsImg.style.backgroundSize = 'cover';
  detailsImg.style.backgroundPosition = 'center';
  detailsImg.style.backgroundRepeat = 'no-repeat';

  detailsName.textContent = item.name || 'Unknown';

  const desc =
    type === 'clan'
      ? `<h3>About this Clan</h3><p class="details-description">Clans are bloodline groups with unique traditions and techniques. Members listed below are known shinobi from this clan.</p>`
      : `<h3>About this Village</h3><p class="details-description">Hidden Villages are the shinobi centers of their countries. Members listed below are known shinobi from this village.</p>`;
  detailsGenericDescription.innerHTML = desc;

  const list = Array.isArray(item.characters) ? item.characters : [];
  if (renderDetailList(detailsGenericList, list)) {
    genericSection.classList.remove('hidden');
  } else {
    genericSection.classList.add('hidden');
  }
}

function closeDetails() {
  detailsOverlay.classList.add('hidden');
}

/* ===== Main loader (smooth) ===== */
async function loadData(endpoint, page = 1) {
  scrollToContent();

  if (endpoint !== state.currentEndpoint) {
    state.currentSearch = '';
    searchInput.value = '';
  }
  setSearchPlaceholder(endpoint);
  updateActiveNav(endpoint);

  state.currentEndpoint = endpoint;
  state.currentPage = page;
  gridTitle.textContent = state.currentSearch ? `Results for "${state.currentSearch}"` : titleMap[endpoint] || 'Items';

  hideError();
  showSkeleton();

  try {
    const result = await fetchData(endpoint, page, state.currentSearch);

    const totalPages = result.total ? Math.ceil(result.total / state.itemsPerPage) : 1;
    state.totalPages = Math.max(1, totalPages);

    if (!state.currentSearch && page === 1) {
      if (endpoint === 'character') updateStats('characters', result.total);
      if (endpoint === 'clan') updateStats('clans', result.total);
      if (endpoint === 'village') updateStats('villages', result.total);
    }

    renderGrid(result.list, endpoint);
    updatePagination();
  } catch (err) {
    console.error(err);
    showError(err.message);
  }
}

/* ===== Events ===== */
prevButton.addEventListener('click', () => {
  if (state.currentPage > 1) {
    loadData(state.currentEndpoint, state.currentPage - 1);
  }
});
nextButton.addEventListener('click', () => {
  if (state.currentPage < state.totalPages) {
    loadData(state.currentEndpoint, state.currentPage + 1);
  }
});
document.getElementById('details-close').addEventListener('click', closeDetails);
document.addEventListener('click', (e) => { if (e.target === detailsOverlay) closeDetails(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !detailsOverlay.classList.contains('hidden')) closeDetails(); });

function handleSearch() {
  const q = searchInput.value.trim();
  if (q !== state.currentSearch || state.currentPage !== 1) {
    state.currentSearch = q;
    loadData(state.currentEndpoint, 1);
  }
}
searchButton.addEventListener('click', handleSearch);
 
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const q = searchInput.value.trim();
    if (q !== state.currentSearch) {
      state.currentSearch = q;
      loadData(state.currentEndpoint, 1);
    }
  }, 400);  
});


themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  themeToggle.textContent = isLight ? '☀' : '🌙';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
});

/* ===== Initial ===== */
window.addEventListener('load', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') { document.body.classList.add('light-mode'); themeToggle.textContent = '☀'; }
  else { themeToggle.textContent = '🌙'; }

  heroButton.addEventListener('click', (e) => {
  e.preventDefault(); // stops instant hash jump if it's an <a href="#...">
  contentAnchor.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
});


  loadData('character', 1);

  // non-blocking stats fetch
  fetchData('character', 1).then((r) => updateStats('characters', r.total)).catch(()=>{});
  fetchData('clan', 1).then((r) => updateStats('clans', r.total)).catch(()=>{});
  fetchData('village', 1).then((r) => updateStats('villages', r.total)).catch(()=>{});
});

