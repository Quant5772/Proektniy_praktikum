const {
  STORAGE_KEYS,
  defaultThresholdForCategory,
  normalizeDomainRuleInput,
  getCategoryIds,
} = TabMindShared;
const { t, displayCategoryName, applyToDocument } = TabMindI18n;

let currentLang = 'en';
let categoriesCache = [];
/** @type {Record<string, string[]>} */
let domainRulesCache = {};

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

function sanitizeDomainRulesForCategories(categories, rules) {
  const ids = new Set(getCategoryIds(categories));
  const out = {};
  for (const id of ids) {
    const raw = rules && typeof rules === 'object' ? rules[id] : [];
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const cleaned = [];
    for (const entry of list) {
      const h = typeof entry === 'string' ? entry.trim().toLowerCase() : '';
      if (!h || seen.has(h)) continue;
      seen.add(h);
      cleaned.push(h);
    }
    out[id] = cleaned;
  }
  return out;
}

async function loadDomainRules() {
  const { [STORAGE_KEYS.domainRules]: stored } = await chrome.storage.local.get(STORAGE_KEYS.domainRules);
  domainRulesCache = sanitizeDomainRulesForCategories(
    categoriesCache,
    stored && typeof stored === 'object' ? stored : {},
  );
  return domainRulesCache;
}

async function persistDomainRules() {
  domainRulesCache = sanitizeDomainRulesForCategories(categoriesCache, domainRulesCache);
  await chrome.storage.local.set({ [STORAGE_KEYS.domainRules]: domainRulesCache });
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

async function addDomainToCategory(categoryId, raw) {
  const host = normalizeDomainRuleInput(raw);
  if (!host) {
    showToast(t(currentLang, 'invalidDomain'));
    return;
  }

  for (const cid of Object.keys(domainRulesCache)) {
    if (cid === categoryId) continue;
    const arr = domainRulesCache[cid] || [];
    domainRulesCache[cid] = arr.filter((h) => h !== host);
  }

  const mine = domainRulesCache[categoryId] || [];
  if (mine.includes(host)) {
    showToast(t(currentLang, 'domainAlreadyInCategory'));
    return;
  }

  domainRulesCache[categoryId] = [...mine, host];
  await persistDomainRules();
  await reloadUi();
}

async function removeDomainFromCategory(categoryId, host) {
  const arr = domainRulesCache[categoryId] || [];
  domainRulesCache[categoryId] = arr.filter((h) => h !== host);
  await persistDomainRules();
  await reloadUi();
}

function renderCategoryList(settings) {
  const list = els.categoryList();
  list.replaceChildren();

  const canDelete = categoriesCache.length > 1;

  for (const category of categoriesCache) {
    const li = document.createElement('li');
    li.className = 'category-manage-item';

    const topRow = document.createElement('div');
    topRow.className = 'category-manage-item__row';

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

    topRow.append(name, deleteBtn);

    const domainsBlock = document.createElement('div');
    domainsBlock.className = 'category-domains';

    const domainsHint = document.createElement('p');
    domainsHint.className = 'category-domains__hint';
    domainsHint.textContent = t(currentLang, 'categoryDomainsHint');

    const chips = document.createElement('ul');
    chips.className = 'domain-chip-list';
    chips.setAttribute('aria-label', t(currentLang, 'categoryDomainsLabel'));

    const hosts = domainRulesCache[category.id] || [];
    for (const host of hosts) {
      const chip = document.createElement('li');
      chip.className = 'domain-chip';

      const chipText = document.createElement('span');
      chipText.className = 'domain-chip__text';
      chipText.textContent = host;

      const removeChip = document.createElement('button');
      removeChip.type = 'button';
      removeChip.className = 'domain-chip__remove';
      removeChip.setAttribute('aria-label', t(currentLang, 'removeDomain'));
      removeChip.textContent = '×';
      removeChip.addEventListener('click', () => {
        removeDomainFromCategory(category.id, host);
      });

      chip.append(chipText, removeChip);
      chips.append(chip);
    }

    const addRow = document.createElement('div');
    addRow.className = 'domain-add-row';

    const domainInput = document.createElement('input');
    domainInput.type = 'text';
    domainInput.className = 'domain-add-row__input';
    domainInput.setAttribute('autocomplete', 'off');
    domainInput.setAttribute('spellcheck', 'false');
    domainInput.placeholder = t(currentLang, 'domainPlaceholder');
    domainInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDomainBtn.click();
      }
    });

    const addDomainBtn = document.createElement('button');
    addDomainBtn.type = 'button';
    addDomainBtn.className = 'btn btn--ghost btn--compact';
    addDomainBtn.textContent = t(currentLang, 'addDomain');
    addDomainBtn.addEventListener('click', () => {
      addDomainToCategory(category.id, domainInput.value);
      domainInput.value = '';
      domainInput.focus();
    });

    addRow.append(domainInput, addDomainBtn);

    domainsBlock.append(domainsHint, chips, addRow);
    li.append(topRow, domainsBlock);
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
  await loadDomainRules();
  renderCategoryList(settings);
  renderTimerInputs(settings);
}

async function init() {
  const settings = await loadSettings();
  await loadDomainRules();
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
    if (area !== 'local') return;
    if (changes[STORAGE_KEYS.categories] || changes[STORAGE_KEYS.domainRules]) {
      reloadUi();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
