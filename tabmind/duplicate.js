const { t, applyToDocument } = TabMindI18n;

const SETTINGS_KEY = 'tabmind_settings';

function getPageParams() {
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('targetUrl') || '';
  const originalTabId = Number(params.get('originalTabId'));
  return { targetUrl, originalTabId };
}

async function getLanguage() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
  return settings?.language === 'ru' ? 'ru' : 'en';
}

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function init() {
  const { targetUrl, originalTabId } = getPageParams();
  const lang = await getLanguage();
  applyToDocument(lang);

  const urlEl = document.getElementById('target-url');
  if (targetUrl && urlEl) {
    try {
      const parsed = new URL(targetUrl);
      urlEl.textContent = parsed.hostname + parsed.pathname;
    } catch {
      urlEl.textContent = targetUrl;
    }
    urlEl.hidden = false;
    urlEl.title = targetUrl;
    urlEl.setAttribute('aria-label', t(lang, 'duplicateUrlHint'));
  }

  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const interceptorTabId = currentTab?.id;

  const switchBtn = document.getElementById('btn-switch');
  const anywayBtn = document.getElementById('btn-anyway');

  switchBtn?.addEventListener('click', async () => {
    switchBtn.disabled = true;
    anywayBtn.disabled = true;
    await sendMessage('DEDUP_SWITCH_TO_EXISTING', {
      interceptorTabId,
      originalTabId,
    });
  });

  anywayBtn?.addEventListener('click', async () => {
    switchBtn.disabled = true;
    anywayBtn.disabled = true;
    await sendMessage('DEDUP_OPEN_ANYWAY', {
      interceptorTabId,
      targetUrl,
    });
  });

  if (!targetUrl || !originalTabId || !interceptorTabId) {
    switchBtn.disabled = true;
    anywayBtn.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', init);
