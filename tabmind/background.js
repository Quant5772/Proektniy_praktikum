importScripts('shared.js', 'i18n.js');

const { t, displayCategoryName } = TabMindI18n;

const {
  DEFAULT_CATEGORIES,
  DEFAULT_THRESHOLD_MINUTES,
  STORAGE_KEYS,
  ALARM_NAMES,
  getCategoryIds,
  emptySnoozedForCategories,
  createCategoryId,
  resolveCategoryId,
  defaultThresholdForCategory,
  isNonWorkCategory,
  normalizeTabUrl,
} = TabMindShared;

const SCAN_PERIOD_MINUTES = 1;

/** @type {Record<string, string>} */
let urlCategoryOverrides = {};

/** @type {Record<number, number>} */
let tabActivity = {};

/** Tabs allowed to load a URL that already exists elsewhere. */
const dedupBypassTabIds = new Set();

/** Tabs currently being redirected to the duplicate interceptor page. */
const dedupInterceptingTabIds = new Set();

function cloneBaselineCategories() {
  return DEFAULT_CATEGORIES.map((category) => ({ ...category }));
}

async function readStoredCategories() {
  const { [STORAGE_KEYS.categories]: stored } = await chrome.storage.local.get(STORAGE_KEYS.categories);
  return Array.isArray(stored) ? stored : null;
}

/**
 * First-run seed: writes the 6 baseline categories only when storage has none.
 * Does not restore defaults the user has deleted on later runs.
 */
async function initializeDefaultCategoriesIfNeeded() {
  const stored = await readStoredCategories();
  if (stored && stored.length > 0) {
    return stored;
  }

  const categories = cloneBaselineCategories();
  await chrome.storage.local.set({ [STORAGE_KEYS.categories]: categories });

  const { [STORAGE_KEYS.snoozed]: existingSnoozed } = await chrome.storage.local.get(STORAGE_KEYS.snoozed);
  const snoozed = emptySnoozedForCategories(categories);
  if (existingSnoozed && typeof existingSnoozed === 'object') {
    for (const id of getCategoryIds(categories)) {
      snoozed[id] = Array.isArray(existingSnoozed[id]) ? existingSnoozed[id] : [];
    }
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.snoozed]: snoozed });

  const { [STORAGE_KEYS.settings]: settingsStored } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const thresholds = { ...(settingsStored?.thresholds || {}) };
  for (const category of categories) {
    if (thresholds[category.id] == null) {
      thresholds[category.id] = defaultThresholdForCategory(category.id, categories);
    }
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      notificationIntervalHours:
        settingsStored?.notificationIntervalHours
        ?? settingsStored?.reminderIntervalHours
        ?? settingsStored?.webhookIntervalHours
        ?? 24,
      notificationsEnabled: Boolean(
        settingsStored?.notificationsEnabled
        ?? settingsStored?.remindersEnabled
        ?? settingsStored?.webhookEnabled,
      ),
      notificationScheduleType:
        settingsStored?.notificationScheduleType === 'daily' ? 'daily' : 'interval',
      notificationTime: settingsStored?.notificationTime || '09:00',
      language: settingsStored?.language === 'ru' ? 'ru' : 'en',
      thresholds,
    },
  });

  return categories;
}

async function getCategories() {
  const stored = await readStoredCategories();
  if (stored && stored.length > 0) {
    return stored;
  }
  return initializeDefaultCategoriesIfNeeded();
}

async function saveCategories(categories) {
  await chrome.storage.local.set({ [STORAGE_KEYS.categories]: categories });
}

async function getSettings() {
  const categories = await getCategories();
  const { [STORAGE_KEYS.settings]: stored } = await chrome.storage.local.get(STORAGE_KEYS.settings);

  const defaultThresholds = Object.fromEntries(
    categories.map((c) => [c.id, defaultThresholdForCategory(c.id, categories)]),
  );

  const defaults = {
    thresholds: defaultThresholds,
    notificationsEnabled: false,
    notificationScheduleType: 'interval',
    notificationIntervalHours: 24,
    notificationTime: '09:00',
    preventDuplicateTabs: true,
    language: 'en',
  };

  if (!stored) return defaults;

  const thresholds = { ...defaults.thresholds, ...(stored.thresholds || {}) };
  for (const category of categories) {
    if (thresholds[category.id] == null) {
      thresholds[category.id] = defaultThresholdForCategory(category.id, categories);
    }
  }

  return {
    ...defaults,
    ...stored,
    thresholds,
    notificationsEnabled: Boolean(
      stored.notificationsEnabled ?? stored.remindersEnabled ?? stored.webhookEnabled,
    ),
    notificationScheduleType:
      stored.notificationScheduleType === 'daily' ? 'daily' : 'interval',
    notificationIntervalHours:
      stored.notificationIntervalHours
      ?? stored.reminderIntervalHours
      ?? stored.webhookIntervalHours
      ?? defaults.notificationIntervalHours,
    notificationTime: stored.notificationTime || defaults.notificationTime,
    preventDuplicateTabs: stored.preventDuplicateTabs !== false,
  };
}

async function getFocusMode() {
  const { [STORAGE_KEYS.focusMode]: stored } = await chrome.storage.local.get(STORAGE_KEYS.focusMode);
  if (!stored?.active) return { active: false };
  if (stored.endsAt <= Date.now()) {
    await clearFocusMode();
    return { active: false };
  }
  return stored;
}

async function saveFocusMode(focusMode) {
  await chrome.storage.local.set({ [STORAGE_KEYS.focusMode]: focusMode });
}

async function clearFocusMode() {
  await chrome.storage.local.remove(STORAGE_KEYS.focusMode);
  await chrome.alarms.clear(ALARM_NAMES.focus);
}

function getNonWorkCategories(categories) {
  return categories.filter((c) => isNonWorkCategory(c));
}

async function isCategoryBlockedByFocus(categoryId) {
  const focus = await getFocusMode();
  if (!focus.active) return false;
  return Array.isArray(focus.blockedCategoryIds)
    && focus.blockedCategoryIds.includes(categoryId);
}

async function startFocusMode(durationMinutes) {
  const categories = await getCategories();
  const blocked = getNonWorkCategories(categories);
  const blockedCategoryIds = blocked.map((c) => c.id);

  const allTabs = await chrome.tabs.query({});
  let snoozedCount = 0;
  for (const tab of allTabs) {
    if (tab.pinned) continue;
    const cat = await getTabCategory(tab);
    if (cat && blockedCategoryIds.includes(cat)) {
      if (await snoozeTab(tab)) snoozedCount += 1;
    }
  }

  const endsAt = Date.now() + durationMinutes * 60 * 1000;
  await saveFocusMode({ active: true, endsAt, blockedCategoryIds, durationMinutes });
  await chrome.alarms.clear(ALARM_NAMES.focus);
  chrome.alarms.create(ALARM_NAMES.focus, { when: endsAt });

  return { ok: true, endsAt, snoozedCount, blockedCategoryIds };
}

async function endFocusMode() {
  await clearFocusMode();
  return { ok: true };
}

async function enforceFocusModeOnTab(tab) {
  const focus = await getFocusMode();
  if (!focus.active || !tab?.id || tab.pinned) return;

  const categoryId = await getTabCategory(tab);
  if (!categoryId || !focus.blockedCategoryIds?.includes(categoryId)) return;

  await snoozeTab(tab);
}

function isDuplicateInterceptorPage(url) {
  return Boolean(url && url.includes('/duplicate.html'));
}

function buildDuplicateInterceptorUrl(targetUrl, originalTabId) {
  const params = new URLSearchParams({
    targetUrl,
    originalTabId: String(originalTabId),
  });
  return `${chrome.runtime.getURL('duplicate.html')}?${params.toString()}`;
}

async function handleDuplicateTab(tab) {
  const settings = await getSettings();
  if (!settings.preventDuplicateTabs || !tab?.id || !tab.url) return;

  if (dedupBypassTabIds.has(tab.id) || dedupInterceptingTabIds.has(tab.id)) return;

  if (
    tab.url.startsWith('chrome://')
    || tab.url.startsWith('chrome-extension://')
  ) {
    return;
  }

  const target = normalizeTabUrl(tab.url);
  if (!target) return;

  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find(
    (other) => other.id !== tab.id
      && other.url
      && !isDuplicateInterceptorPage(other.url)
      && normalizeTabUrl(other.url) === target,
  );

  if (!existing?.id) return;

  try {
    dedupInterceptingTabIds.add(tab.id);
    const interceptorUrl = buildDuplicateInterceptorUrl(tab.url, existing.id);
    await chrome.tabs.update(tab.id, { url: interceptorUrl });
  } catch (err) {
    dedupInterceptingTabIds.delete(tab.id);
    console.error('[TabMind] Dedup intercept failed:', err);
  }
}

async function switchToExistingTab(interceptorTabId, originalTabId) {
  const original = await chrome.tabs.get(originalTabId).catch(() => null);
  if (!original?.id) {
    await chrome.tabs.remove(interceptorTabId).catch(() => {});
    return { ok: false };
  }

  await chrome.tabs.update(originalTabId, { active: true });
  if (original.windowId != null) {
    await chrome.windows.update(original.windowId, { focused: true });
  }
  dedupInterceptingTabIds.delete(interceptorTabId);
  await chrome.tabs.remove(interceptorTabId);
  return { ok: true };
}

async function openDuplicateAnyway(interceptorTabId, targetUrl) {
  dedupBypassTabIds.add(interceptorTabId);
  dedupInterceptingTabIds.delete(interceptorTabId);
  await chrome.tabs.update(interceptorTabId, { url: targetUrl });
  return { ok: true };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

function getNextDailyAlarmMs(timeHHMM) {
  const [hours, minutes] = (timeHHMM || '09:00').split(':').map((v) => parseInt(v, 10));
  const next = new Date();
  next.setSeconds(0, 0);
  next.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

async function getSnoozed() {
  const categories = await getCategories();
  const { [STORAGE_KEYS.snoozed]: stored } = await chrome.storage.local.get(STORAGE_KEYS.snoozed);
  const merged = emptySnoozedForCategories(categories);

  if (stored && typeof stored === 'object') {
    for (const id of getCategoryIds(categories)) {
      merged[id] = Array.isArray(stored[id]) ? stored[id] : [];
    }
  }

  return merged;
}

async function saveSnoozed(snoozed) {
  await chrome.storage.local.set({ [STORAGE_KEYS.snoozed]: snoozed });
}

async function loadActivity() {
  const { [STORAGE_KEYS.activity]: stored } = await chrome.storage.local.get(STORAGE_KEYS.activity);
  tabActivity = stored && typeof stored === 'object' ? stored : {};
}

async function persistActivity() {
  await chrome.storage.local.set({ [STORAGE_KEYS.activity]: tabActivity });
}

async function loadOverrides() {
  const { [STORAGE_KEYS.overrides]: stored } = await chrome.storage.local.get(STORAGE_KEYS.overrides);
  urlCategoryOverrides = stored && typeof stored === 'object' ? stored : {};
}

async function getTabCategory(tab) {
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return null;
  }
  const categories = await getCategories();
  return resolveCategoryId(categories, tab.url, tab.title || '', urlCategoryOverrides);
}

function touchTab(tabId, timestamp = Date.now()) {
  tabActivity[tabId] = timestamp;
}

async function snoozeTab(tab) {
  const categoryId = await getTabCategory(tab);
  if (!categoryId || !tab.url) return false;

  const snoozed = await getSnoozed();
  const entry = {
    url: tab.url,
    title: tab.title || tab.url,
    timestamp: Date.now(),
  };

  if (!snoozed[categoryId]) snoozed[categoryId] = [];
  const exists = snoozed[categoryId].some((item) => item.url === entry.url);
  if (!exists) {
    snoozed[categoryId].push(entry);
    await saveSnoozed(snoozed);
  }

  delete tabActivity[tab.id];
  await persistActivity();

  try {
    await chrome.tabs.remove(tab.id);
  } catch {
    return false;
  }
  return true;
}

async function snoozeTabs(tabs) {
  let count = 0;
  for (const tab of tabs) {
    if (await snoozeTab(tab)) count += 1;
  }
  return count;
}

async function snoozeCategory(categoryId) {
  const allTabs = await chrome.tabs.query({});
  const targets = [];
  for (const tab of allTabs) {
    if (tab.pinned) continue;
    const cat = await getTabCategory(tab);
    if (cat === categoryId) targets.push(tab);
  }
  return snoozeTabs(targets);
}

async function restoreTab(categoryId, index) {
  if (await isCategoryBlockedByFocus(categoryId)) {
    return { ok: false, error: 'FOCUS_BLOCKED' };
  }

  const snoozed = await getSnoozed();
  const list = snoozed[categoryId];
  if (!list || index < 0 || index >= list.length) return { ok: false };

  const [entry] = list.splice(index, 1);
  await saveSnoozed(snoozed);
  await chrome.tabs.create({ url: entry.url, active: true });
  return { ok: true };
}

async function restoreAllCategory(categoryId) {
  if (await isCategoryBlockedByFocus(categoryId)) {
    return { count: 0, error: 'FOCUS_BLOCKED' };
  }

  const snoozed = await getSnoozed();
  const list = snoozed[categoryId] || [];
  if (!list.length) return { count: 0 };

  for (const entry of list) {
    await chrome.tabs.create({ url: entry.url, active: false });
  }
  snoozed[categoryId] = [];
  await saveSnoozed(snoozed);
  return { count: list.length };
}

async function addCategory(name) {
  const trimmed = name?.trim();
  if (!trimmed) return { error: 'EMPTY_NAME' };

  const categories = await getCategories();
  const exists = categories.some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) return { error: 'DUPLICATE_NAME' };

  const id = createCategoryId(trimmed, getCategoryIds(categories));
  const category = { id, name: trimmed };
  categories.push(category);
  await saveCategories(categories);

  const snoozed = await getSnoozed();
  snoozed[id] = [];
  await saveSnoozed(snoozed);

  const settings = await getSettings();
  settings.thresholds[id] = DEFAULT_THRESHOLD_MINUTES;
  await saveSettings(settings);

  return { ok: true, category };
}

async function deleteCategory(categoryId) {
  const categories = await getCategories();
  if (categories.length <= 1) {
    return { error: 'LAST_CATEGORY' };
  }

  const nextCategories = categories.filter((c) => c.id !== categoryId);
  if (nextCategories.length === categories.length) {
    return { error: 'NOT_FOUND' };
  }

  await saveCategories(nextCategories);

  const snoozed = await getSnoozed();
  delete snoozed[categoryId];
  await saveSnoozed(snoozed);

  const settings = await getSettings();
  delete settings.thresholds[categoryId];
  await saveSettings(settings);

  const overrides = { ...urlCategoryOverrides };
  for (const [url, catId] of Object.entries(overrides)) {
    if (catId === categoryId) delete overrides[url];
  }
  urlCategoryOverrides = overrides;
  await chrome.storage.local.set({ [STORAGE_KEYS.overrides]: overrides });

  return { ok: true };
}

async function isTabActive(tab) {
  if (!tab?.id || !tab.windowId) return false;
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  return active?.id === tab.id;
}

async function scanInactiveTabs() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const allTabs = await chrome.tabs.query({});
  const now = Date.now();

  for (const tab of allTabs) {
    if (tab.pinned) continue;

    const categoryId = await getTabCategory(tab);
    if (!categoryId) continue;

    const active = await isTabActive(tab);
    if (active) {
      touchTab(tab.id, now);
      continue;
    }

    const lastActive = tabActivity[tab.id] ?? now;
    const thresholdMinutes = settings.thresholds[categoryId]
      ?? defaultThresholdForCategory(categoryId, categories);
    const thresholdMs = thresholdMinutes * 60 * 1000;

    if (now - lastActive >= thresholdMs) {
      await snoozeTab(tab);
    }
  }

  await persistActivity();
}

function buildNotificationBody(categories, snoozed, lang) {
  const lines = [];
  for (const category of categories) {
    const count = (snoozed[category.id] || []).length;
    if (count > 0) {
      lines.push(t(lang, 'notificationCategoryLine', {
        name: displayCategoryName(lang, category),
        count,
      }));
    }
  }
  if (!lines.length) return t(lang, 'notificationEmpty');

  const maxLines = 6;
  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    visible.push(t(lang, 'notificationMore', { count: lines.length - maxLines }));
    return visible.join('\n');
  }
  return lines.join('\n');
}

async function restoreAllSnoozedTabs() {
  const categories = await getCategories();
  for (const category of categories) {
    await restoreAllCategory(category.id);
  }
}

async function sendSnoozedNotification() {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;

  const [categories, snoozed] = await Promise.all([getCategories(), getSnoozed()]);
  const lang = settings.language === 'ru' ? 'ru' : 'en';
  const total = categories.reduce(
    (sum, category) => sum + (snoozed[category.id]?.length || 0),
    0,
  );
  if (total === 0) return;

  const notificationId = `tabmind-snoozed-${Date.now()}`;
  const message = buildNotificationBody(categories, snoozed, lang);

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      title: t(lang, 'notificationTitle'),
      message,
      priority: 2,
      requireInteraction: true,
      buttons: [
        { title: t(lang, 'notificationRestore') },
        { title: t(lang, 'notificationIgnore') },
      ],
    });
  } catch (err) {
    console.error('[TabMind] Notification failed:', err);
  }
}

async function syncNotificationAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear(ALARM_NAMES.notification);
  await chrome.alarms.clear('tabmind_webhook_reminder');

  if (!settings.notificationsEnabled) return;

  if (settings.notificationScheduleType === 'daily') {
    chrome.alarms.create(ALARM_NAMES.notification, {
      when: getNextDailyAlarmMs(settings.notificationTime),
    });
    return;
  }

  const period = Math.max(
    0.25,
    Number(settings.notificationIntervalHours) || 24,
  );
  chrome.alarms.create(ALARM_NAMES.notification, {
    periodInMinutes: period * 60,
  });
}

async function ensureScanAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAMES.scan);
  if (!existing) {
    chrome.alarms.create(ALARM_NAMES.scan, { periodInMinutes: SCAN_PERIOD_MINUTES });
  }
}

async function buildPopupState() {
  const [settings, categories, snoozed, allTabs, focusMode] = await Promise.all([
    getSettings(),
    getCategories(),
    getSnoozed(),
    chrome.tabs.query({}),
    getFocusMode(),
  ]);

  const openCounts = Object.fromEntries(
    getCategoryIds(categories).map((id) => [id, 0]),
  );
  const openTabs = Object.fromEntries(
    getCategoryIds(categories).map((id) => [id, []]),
  );

  for (const tab of allTabs) {
    const cat = await getTabCategory(tab);
    if (!cat) continue;
    openCounts[cat] = (openCounts[cat] || 0) + 1;
    openTabs[cat].push({
      tabId: tab.id,
      title: tab.title || tab.url || '',
      url: tab.url || '',
    });
  }

  return { settings, categories, snoozed, openCounts, openTabs, focusMode };
}

chrome.runtime.onInstalled.addListener(async () => {
  // First install: seed 6 baseline categories when storage is empty.
  // Updates/reloads with existing categories are left untouched (user edits preserved).
  await initializeDefaultCategoriesIfNeeded();
  await loadActivity();
  await loadOverrides();
  await ensureScanAlarm();
  await syncNotificationAlarm();

  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  for (const tab of tabs) {
    if (tab.id) touchTab(tab.id, now);
  }
  await persistActivity();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeDefaultCategoriesIfNeeded();
  await loadActivity();
  await loadOverrides();
  await ensureScanAlarm();
  await syncNotificationAlarm();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  touchTab(tabId, Date.now());
  await persistActivity();
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab?.url) {
    handleDuplicateTab(tab);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const currentTab = tab?.id ? tab : await chrome.tabs.get(tabId).catch(() => null);
  if (!currentTab) return;

  if (changeInfo.url && isDuplicateInterceptorPage(changeInfo.url)) {
    dedupInterceptingTabIds.delete(tabId);
  }

  if (changeInfo.url || changeInfo.status === 'complete') {
    await handleDuplicateTab(currentTab);
    await enforceFocusModeOnTab(currentTab);
  }

  if (changeInfo.status === 'complete' && currentTab.url) {
    if (!(tabId in tabActivity)) {
      touchTab(tabId, Date.now());
      await persistActivity();
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabActivity[tabId];
  dedupBypassTabIds.delete(tabId);
  dedupInterceptingTabIds.delete(tabId);
  persistActivity();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAMES.scan) {
    await loadActivity();
    await loadOverrides();
    await scanInactiveTabs();
  } else if (alarm.name === ALARM_NAMES.notification) {
    await sendSnoozedNotification();
    const settings = await getSettings();
    if (settings.notificationScheduleType === 'daily') {
      await syncNotificationAlarm();
    }
  } else if (alarm.name === ALARM_NAMES.focus) {
    await endFocusMode();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE_KEYS.settings]) {
    syncNotificationAlarm();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {
      case 'GET_STATE':
        return buildPopupState();
      case 'SNOOZE_CATEGORY':
        return { count: await snoozeCategory(message.categoryId) };
      case 'RESTORE_TAB':
        return restoreTab(message.categoryId, message.index);
      case 'RESTORE_ALL_CATEGORY':
        return restoreAllCategory(message.categoryId);
      case 'ADD_CATEGORY':
        return addCategory(message.name);
      case 'DELETE_CATEGORY':
        return deleteCategory(message.categoryId);
      case 'GET_CATEGORIES':
        return { categories: await getCategories() };
      case 'START_FOCUS_MODE':
        return startFocusMode(message.durationMinutes);
      case 'END_FOCUS_MODE':
        return endFocusMode();
      case 'ACTIVATE_TAB':
        await chrome.tabs.update(message.tabId, { active: true });
        if (message.windowId != null) {
          await chrome.windows.update(message.windowId, { focused: true });
        }
        return { ok: true };
      case 'DEDUP_SWITCH_TO_EXISTING':
        return switchToExistingTab(message.interceptorTabId, message.originalTabId);
      case 'DEDUP_OPEN_ANYWAY':
        return openDuplicateAnyway(message.interceptorTabId, message.targetUrl);
      default:
        return { error: 'Unknown message' };
    }
  };

  handle()
    .then(sendResponse)
    .catch((err) => {
      console.error('[TabMind]', err);
      sendResponse({ error: String(err) });
    });

  return true;
});

initializeDefaultCategoriesIfNeeded().then(() => {
  loadActivity();
  loadOverrides();
  ensureScanAlarm();
  getSettings().then(() => syncNotificationAlarm());
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith('tabmind-snoozed-')) return;

  if (buttonIndex === 0) {
    await restoreAllSnoozedTabs();
  }
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('tabmind-snoozed-')) {
    chrome.notifications.clear(notificationId);
  }
});
