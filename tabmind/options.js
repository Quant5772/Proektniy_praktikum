const {
  STORAGE_KEYS,
  defaultThresholdForCategory,
} = TabMindShared;
const { t, displayCategoryName, applyToDocument } = TabMindI18n;

let currentLang = 'en';
let categoriesCache = [];

const els = {
  timerGrid: () => document.getElementById('timer-grid'),
  categoryList: () => document.getElementById('category-list'),
  newCategoryName: () => document.getElementById('new-category-name'),
  addCategoryBtn: () => document.getElementById('add-category-btn'),
  preventDuplicateTabs: () => document.getElementById('prevent-duplicate-tabs'),
  notificationsEnabled: () => document.getElementById('notifications-enabled'),
  notificationInterval: () => document.getElementById('notification-interval'),
  notificationTime: () => document.getElementById('notification-time'),
  scheduleIntervalFields: () => document.getElementById('schedule-interval-fields'),
  scheduleTimeFields: () => document.getElementById('schedule-time-fields'),
  languageSelect: () => document.getElementById('language-select'),
  saveBtn: () => document.getElementById('save-btn'),
  toast: () => document.getElementById('toast'),
};

async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function loadCategories() {
  const { categories } = await sendMessage('GET_CATEGORIES');
  categoriesCache = categories || [];
  return categoriesCache;
}

function readScheduleType() {
  const selected = document.querySelector('input[name="notification-schedule"]:checked');
  return selected?.value === 'daily' ? 'daily' : 'interval';
}

function updateScheduleFieldsVisibility() {
  const type = readScheduleType();
  els.scheduleIntervalFields().classList.toggle('hidden', type !== 'interval');
  els.scheduleTimeFields().classList.toggle('hidden', type !== 'daily');
}

async function loadSettings() {
  const { [STORAGE_KEYS.settings]: stored } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const categories = await loadCategories();
  const defaultThresholds = Object.fromEntries(
    categories.map((c) => [c.id, defaultThresholdForCategory(c.id, categories)]),
  );

  const legacyInterval = stored?.notificationIntervalHours
    ?? stored?.reminderIntervalHours
    ?? stored?.webhookIntervalHours
    ?? 24;

  return {
    thresholds: { ...defaultThresholds, ...(stored?.thresholds || {}) },
    notificationsEnabled: Boolean(
      stored?.notificationsEnabled ?? stored?.remindersEnabled ?? stored?.webhookEnabled,
    ),
    notificationScheduleType: stored?.notificationScheduleType === 'daily' ? 'daily' : 'interval',
    notificationIntervalHours: legacyInterval,
    notificationTime: stored?.notificationTime || '09:00',
    preventDuplicateTabs: stored?.preventDuplicateTabs !== false,
    language: stored?.language === 'ru' ? 'ru' : 'en',
  };
}

function showToast(message) {
  const toast = els.toast();
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2200);
}

function renderCategoryList(settings) {
  const list = els.categoryList();
  list.replaceChildren();

  const canDelete = categoriesCache.length > 1;

  for (const category of categoriesCache) {
    const li = document.createElement('li');
    li.className = 'category-manage-item';

    const name = document.createElement('span');
    name.className = 'category-manage-item__name';
    name.textContent = displayCategoryName(currentLang, category);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn--ghost';
    deleteBtn.textContent = t(currentLang, 'deleteCategory');
    deleteBtn.disabled = !canDelete;
    deleteBtn.addEventListener('click', async () => {
      const result = await sendMessage('DELETE_CATEGORY', { categoryId: category.id });
      if (result?.error === 'LAST_CATEGORY') {
        showToast(t(currentLang, 'cannotDeleteLast'));
        return;
      }
      await reloadUi();
    });

    li.append(name, deleteBtn);
    list.append(li);
  }
}

function renderTimerInputs(settings) {
  const grid = els.timerGrid();
  grid.replaceChildren();

  for (const category of categoriesCache) {
    const row = document.createElement('div');
    row.className = 'timer-row';

    const label = document.createElement('label');
    label.htmlFor = `threshold-${category.id}`;
    label.textContent = displayCategoryName(currentLang, category);

    const inputWrap = document.createElement('div');
    inputWrap.style.display = 'flex';
    inputWrap.style.alignItems = 'center';
    inputWrap.style.gap = '6px';

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `threshold-${category.id}`;
    input.min = '1';
    input.max = '10080';
    input.step = '1';
    input.value = String(
      settings.thresholds[category.id] ?? defaultThresholdForCategory(category.id, categoriesCache),
    );
    input.dataset.category = category.id;

    const suffix = document.createElement('span');
    suffix.style.color = 'var(--text-muted)';
    suffix.style.fontSize = '11px';
    suffix.textContent = t(currentLang, 'minutes');

    inputWrap.append(input, suffix);
    row.append(label, inputWrap);
    grid.append(row);
  }
}

function readThresholds(settings) {
  const thresholds = { ...settings.thresholds };
  for (const category of categoriesCache) {
    const input = document.getElementById(`threshold-${category.id}`);
    const fallback = defaultThresholdForCategory(category.id, categoriesCache);
    thresholds[category.id] = Math.max(1, Math.round(Number(input?.value) || fallback));
  }
  return thresholds;
}

function readForm(settings) {
  return {
    thresholds: readThresholds(settings),
    notificationsEnabled: els.notificationsEnabled().checked,
    notificationScheduleType: readScheduleType(),
    notificationIntervalHours: Math.max(0.25, Number(els.notificationInterval().value) || 24),
    notificationTime: els.notificationTime().value || '09:00',
    preventDuplicateTabs: els.preventDuplicateTabs().checked,
    language: els.languageSelect().value === 'ru' ? 'ru' : 'en',
  };
}

async function reloadUi() {
  const settings = await loadSettings();
  renderCategoryList(settings);
  renderTimerInputs(settings);
}

async function init() {
  const settings = await loadSettings();
  currentLang = settings.language;
  applyToDocument(currentLang);

  els.preventDuplicateTabs().checked = settings.preventDuplicateTabs;
  els.notificationsEnabled().checked = settings.notificationsEnabled;
  els.notificationInterval().value = String(settings.notificationIntervalHours);
  els.notificationTime().value = settings.notificationTime;
  els.languageSelect().value = settings.language;

  document.querySelectorAll('input[name="notification-schedule"]').forEach((input) => {
    input.checked = input.value === settings.notificationScheduleType;
  });
  updateScheduleFieldsVisibility();

  document.querySelectorAll('input[name="notification-schedule"]').forEach((input) => {
    input.addEventListener('change', updateScheduleFieldsVisibility);
  });

  renderCategoryList(settings);
  renderTimerInputs(settings);

  els.addCategoryBtn().addEventListener('click', async () => {
    const name = els.newCategoryName().value.trim();
    if (!name) {
      showToast(t(currentLang, 'emptyCategoryName'));
      return;
    }

    const result = await sendMessage('ADD_CATEGORY', { name });
    if (result?.error === 'DUPLICATE_NAME') {
      showToast(t(currentLang, 'duplicateCategory'));
      return;
    }
    if (result?.error) return;

    els.newCategoryName().value = '';
    await reloadUi();
    showToast(t(currentLang, 'saved'));
  });

  els.newCategoryName().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.addCategoryBtn().click();
  });

  els.languageSelect().addEventListener('change', () => {
    currentLang = els.languageSelect().value === 'ru' ? 'ru' : 'en';
    applyToDocument(currentLang);
    const partial = readForm(settings);
    renderCategoryList(partial);
    renderTimerInputs({ ...settings, thresholds: partial.thresholds });
  });

  els.saveBtn().addEventListener('click', async () => {
    const next = readForm(settings);
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
    currentLang = next.language;
    applyToDocument(currentLang);
    renderCategoryList(next);
    renderTimerInputs(next);
    showToast(t(currentLang, 'saved'));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.categories]) {
      reloadUi();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
