const { t, displayCategoryName, applyToDocument } = TabMindI18n;

let currentLang = 'en';
let latestState = null;
let searchQuery = '';
let focusTimerId = null;

async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function truncateTitle(title, max = 42) {
  if (!title) return '';
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

function formatFocusRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function matchesSearch(text, query) {
  if (!query) return true;
  return (text || '').toLowerCase().includes(query.toLowerCase());
}

function tabMatchesQuery(tab, query) {
  return matchesSearch(tab.title, query) || matchesSearch(tab.url, query);
}

function renderFocusBar(state) {
  const bar = document.getElementById('focus-bar');
  bar.replaceChildren();

  const focus = state?.focusMode;
  const isActive = focus?.active && focus.endsAt > Date.now();

  if (isActive) {
    bar.classList.add('toolbar--active');

    const info = document.createElement('div');
    info.className = 'focus-active';

    const label = document.createElement('span');
    label.className = 'focus-active__label';
    label.textContent = t(currentLang, 'focusActive');

    const timer = document.createElement('span');
    timer.className = 'focus-active__timer';
    timer.id = 'focus-timer';
    timer.textContent = t(currentLang, 'focusRemaining', {
      time: formatFocusRemaining(focus.endsAt - Date.now()),
    });

    const endBtn = document.createElement('button');
    endBtn.type = 'button';
    endBtn.className = 'btn btn--ghost';
    endBtn.textContent = t(currentLang, 'focusEnd');
    endBtn.addEventListener('click', async () => {
      await sendMessage('END_FOCUS_MODE');
      await refresh();
    });

    info.append(label, timer, endBtn);
    bar.append(info);
    return;
  }

  bar.classList.remove('toolbar--active');

  const wrap = document.createElement('div');
  wrap.className = 'focus-idle';

  const text = document.createElement('div');
  text.className = 'focus-idle__text';
  const title = document.createElement('span');
  title.className = 'focus-idle__title';
  title.textContent = t(currentLang, 'focusMode');
  const hint = document.createElement('span');
  hint.className = 'focus-idle__hint';
  hint.textContent = t(currentLang, 'focusModeHint');
  text.append(title, hint);

  const actions = document.createElement('div');
  actions.className = 'focus-idle__actions';

  [25, 45].forEach((mins) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--primary';
    btn.textContent = mins === 25
      ? t(currentLang, 'focusStart25')
      : t(currentLang, 'focusStart45');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await sendMessage('START_FOCUS_MODE', { durationMinutes: mins });
      await refresh();
    });
    actions.append(btn);
  });

  wrap.append(text, actions);
  bar.append(wrap);
}

function startFocusCountdown() {
  if (focusTimerId) clearInterval(focusTimerId);
  focusTimerId = setInterval(() => {
    const focus = latestState?.focusMode;
    const el = document.getElementById('focus-timer');
    if (!focus?.active || !el) return;
    const remaining = focus.endsAt - Date.now();
    if (remaining <= 0) {
      clearInterval(focusTimerId);
      refresh();
      return;
    }
    el.textContent = t(currentLang, 'focusRemaining', {
      time: formatFocusRemaining(remaining),
    });
  }, 1000);
}

function createTabRow({ title, url, onClick, actionLabel, actionIcon, disabled }) {
  const li = document.createElement('li');
  li.className = 'snoozed-item tab-result-item';

  const titleEl = document.createElement('button');
  titleEl.type = 'button';
  titleEl.className = 'tab-result-item__title';
  titleEl.textContent = truncateTitle(title);
  titleEl.title = title || url;
  titleEl.disabled = disabled;
  titleEl.addEventListener('click', onClick);

  if (actionIcon) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'btn btn--ghost btn--icon';
    actionBtn.textContent = actionIcon;
    actionBtn.title = actionLabel;
    actionBtn.setAttribute('aria-label', actionLabel);
    actionBtn.disabled = disabled;
    actionBtn.addEventListener('click', onClick);
    li.append(titleEl, actionBtn);
  } else {
    li.append(titleEl);
  }

  return li;
}

function renderCategoryCard(category, state, query) {
  const categoryId = category.id;
  const openTabs = state.openTabs?.[categoryId] || [];
  const snoozed = state.snoozed[categoryId] || [];
  const focusBlocked = state.focusMode?.active
    && state.focusMode.blockedCategoryIds?.includes(categoryId);

  const filteredOpen = query
    ? openTabs.filter((tab) => tabMatchesQuery(tab, query))
    : openTabs;
  const filteredSnoozed = query
    ? snoozed
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => tabMatchesQuery(item, query))
    : snoozed.map((item, index) => ({ item, index }));

  if (query && filteredOpen.length === 0 && filteredSnoozed.length === 0) {
    return null;
  }

  const openCount = query ? filteredOpen.length : (state.openCounts[categoryId] || 0);
  const label = displayCategoryName(currentLang, category);

  const card = document.createElement('article');
  card.className = 'category-card';
  if (focusBlocked) card.classList.add('category-card--blocked');
  card.dataset.category = categoryId;

  const head = document.createElement('div');
  head.className = 'category-card__head';

  const titleBlock = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'category-card__title';
  title.textContent = label;

  const meta = document.createElement('p');
  meta.className = 'category-card__meta';
  meta.textContent = t(currentLang, 'openCount', { count: openCount });

  titleBlock.append(title, meta);

  const snoozeBtn = document.createElement('button');
  snoozeBtn.type = 'button';
  snoozeBtn.className = 'btn btn--primary';
  snoozeBtn.textContent = t(currentLang, 'snoozeCategory');
  snoozeBtn.disabled = openCount === 0 || Boolean(focusBlocked);
  snoozeBtn.addEventListener('click', async () => {
    snoozeBtn.disabled = true;
    await sendMessage('SNOOZE_CATEGORY', { categoryId });
    await refresh();
  });

  head.append(titleBlock, snoozeBtn);
  card.append(head);

  if (query && filteredOpen.length > 0) {
    const openSection = document.createElement('section');
    openSection.className = 'snoozed-section';
    const openLabel = document.createElement('p');
    openLabel.className = 'snoozed-section__label';
    openLabel.textContent = t(currentLang, 'openTabsHeading');
    openSection.append(openLabel);

    const list = document.createElement('ul');
    list.className = 'snoozed-list';
    filteredOpen.forEach((tab) => {
      list.append(createTabRow({
        title: tab.title,
        url: tab.url,
        actionLabel: t(currentLang, 'tabOpen'),
        actionIcon: '→',
        onClick: async () => {
          await sendMessage('ACTIVATE_TAB', { tabId: tab.tabId });
          window.close();
        },
      }));
    });
    openSection.append(list);
    card.append(openSection);
  }

  const snoozedSection = document.createElement('section');
  snoozedSection.className = 'snoozed-section';

  const snoozedLabel = document.createElement('p');
  snoozedLabel.className = 'snoozed-section__label';
  snoozedLabel.textContent = t(currentLang, 'snoozedHeading');
  snoozedSection.append(snoozedLabel);

  const snoozedItems = query ? filteredSnoozed : filteredSnoozed;

  if (snoozedItems.length === 0 && !query) {
    const empty = document.createElement('p');
    empty.className = 'snoozed-empty';
    empty.textContent = t(currentLang, 'noSnoozed');
    snoozedSection.append(empty);
  } else if (snoozedItems.length > 0) {
    const list = document.createElement('ul');
    list.className = 'snoozed-list';

    snoozedItems.forEach(({ item, index }) => {
      list.append(createTabRow({
        title: item.title,
        url: item.url,
        disabled: focusBlocked,
        actionLabel: focusBlocked
          ? t(currentLang, 'focusBlocked')
          : t(currentLang, 'restore'),
        actionIcon: focusBlocked ? '🔒' : '↩',
        onClick: async () => {
          if (focusBlocked) return;
          const result = await sendMessage('RESTORE_TAB', { categoryId, index });
          if (result?.error === 'FOCUS_BLOCKED') return;
          await refresh();
        },
      }));
    });

    snoozedSection.append(list);

    if (!query && !focusBlocked && snoozed.length > 0) {
      const restoreAllRow = document.createElement('div');
      restoreAllRow.className = 'restore-all-row';
      const restoreAllBtn = document.createElement('button');
      restoreAllBtn.type = 'button';
      restoreAllBtn.className = 'btn';
      restoreAllBtn.textContent = t(currentLang, 'restoreAll');
      restoreAllBtn.addEventListener('click', async () => {
        const result = await sendMessage('RESTORE_ALL_CATEGORY', { categoryId });
        if (result?.error === 'FOCUS_BLOCKED') return;
        await refresh();
      });
      restoreAllRow.append(restoreAllBtn);
      snoozedSection.append(restoreAllRow);
    }
  }

  if (!query || snoozedItems.length > 0) {
    card.append(snoozedSection);
  }

  return card;
}

function renderCategories(state) {
  const container = document.getElementById('categories-container');
  const emptyMsg = document.getElementById('search-empty');
  container.replaceChildren();

  const query = searchQuery.trim();
  const categories = state?.categories || [];
  let visible = 0;

  for (const category of categories) {
    const card = renderCategoryCard(category, state, query);
    if (card) {
      container.append(card);
      visible += 1;
    }
  }

  const showEmpty = query.length > 0 && visible === 0;
  emptyMsg.classList.toggle('hidden', !showEmpty);
}

async function refresh() {
  const state = await sendMessage('GET_STATE');
  latestState = state;

  if (state?.settings?.language) {
    currentLang = state.settings.language === 'ru' ? 'ru' : 'en';
    applyToDocument(currentLang);
  }

  renderFocusBar(state);
  renderCategories(state);

  const snoozeAllBtn = document.getElementById('snooze-all-tabs');
  if (snoozeAllBtn && state?.categories) {
    const n = state.categories.reduce(
      (sum, c) => sum + (state.openCounts?.[c.id] || 0),
      0,
    );
    snoozeAllBtn.disabled = n === 0;
  }

  if (state?.focusMode?.active && state.focusMode.endsAt > Date.now()) {
    startFocusCountdown();
  } else if (focusTimerId) {
    clearInterval(focusTimerId);
    focusTimerId = null;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (
    changes.tabmind_settings
    || changes.tabmind_categories
    || changes.tabmind_focus_mode
    || changes.tabmind_snoozed
  ) {
    refresh();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('open-options')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('snooze-all-tabs')?.addEventListener('click', async () => {
    const btn = document.getElementById('snooze-all-tabs');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    await sendMessage('SNOOZE_ALL_TABS');
    await refresh();
  });

  const searchInput = document.getElementById('smart-search');
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    if (latestState) renderCategories(latestState);
  });

  refresh();
});
