const TabMindI18n = (() => {
  const translations = {
    en: {
      appTitle: 'TabMind',
      appSubtitle: 'Quiet tabs. Clear mind.',
      openCount: '{count} open',
      snoozeCategory: 'Snooze category',
      snoozedHeading: 'Snoozed',
      restore: 'Restore',
      restoreAll: 'Restore all',
      noSnoozed: 'No snoozed tabs',
      optionsTitle: 'TabMind Settings',
      sectionTimers: 'Inactivity timers',
      sectionTimersHint: 'Auto-snooze tabs after this many minutes without focus.',
      sectionNotifications: 'Browser notification schedule',
      sectionNotificationsHint: 'Get reminded about snoozed tabs in your system tray.',
      notificationsEnabled: 'Enable browser notifications',
      scheduleInterval: 'Every X hours',
      scheduleDaily: 'At a specific time',
      notificationInterval: 'Remind every (hours)',
      notificationTime: 'Remind at (local time)',
      notificationTitle: 'Snoozed tabs waiting',
      notificationCategoryLine: '{name}: {count} tab(s)',
      notificationMore: '+{count} more categories',
      notificationEmpty: 'No snoozed tabs right now.',
      notificationRestore: 'Restore all',
      notificationIgnore: 'Ignore',
      sectionLanguage: 'Language',
      languageLabel: 'Interface language',
      save: 'Save settings',
      saved: 'Settings saved',
      minutes: 'min',
      sectionManageCategories: 'Manage categories',
      sectionManageCategoriesHint: 'Add or remove categories, then assign domains so matching sites use that category for timers and snoozing.',
      addCategory: 'Add category',
      deleteCategory: 'Delete',
      newCategoryPlaceholder: 'New category name',
      cannotDeleteLast: 'You must keep at least one category.',
      duplicateCategory: 'A category with this name already exists.',
      emptyCategoryName: 'Enter a category name.',
      categoryDomainsHint: 'Domains and subdomains listed here override automatic sorting (not per-tab overrides). Example: news.ycombinator.com matches rule ycombinator.com.',
      categoryDomainsLabel: 'Domain rules',
      domainPlaceholder: 'e.g. reddit.com or https://app.slack.com',
      addDomain: 'Add domain',
      invalidDomain: 'Could not read a domain from that text.',
      domainAlreadyInCategory: 'That domain is already listed for this category.',
      removeDomain: 'Remove domain',
      focusMode: 'Focus mode',
      focusModeHint: 'Snooze distractions and stay on task.',
      focusStart25: '25 min',
      focusStart45: '45 min',
      focusActive: 'Focus active',
      focusRemaining: '{time} left',
      focusEnd: 'End focus',
      focusBlocked: 'Blocked during focus mode',
      searchPlaceholder: 'Search open & snoozed tabs…',
      searchNoResults: 'No matching tabs',
      snoozeAllTabs: 'Snooze all tabs',
      openTabsHeading: 'Open',
      tabOpen: 'Go to tab',
      sectionSmartFeatures: 'Smart features',
      preventDuplicateTabs: 'Prevent duplicate tabs',
      preventDuplicateTabsHint: 'When you open a URL that is already open, ask before creating a duplicate.',
      duplicateTitle: 'TabMind',
      duplicateMessage: 'This page is already open.',
      duplicateSwitch: 'Switch to existing tab',
      duplicateOpenAnyway: 'Open duplicate anyway',
      duplicateUrlHint: 'Already open elsewhere',
      actionTitleWithSnoozed: 'TabMind — {count} snoozed tab(s). Open to restore.',
      actionTitleEmpty: 'TabMind — no snoozed tabs',
      categories: {
        work: 'Work',
        entertainment: 'Entertainment',
        readLater: 'Read Later',
        shopping: 'Shopping',
        education: 'Education / Tech',
        finance: 'Finance',
      },
    },
    ru: {
      appTitle: 'TabMind',
      appSubtitle: 'Меньше вкладок. Больше ясности.',
      openCount: 'Открыто: {count}',
      snoozeCategory: 'Усыпить категорию',
      snoozedHeading: 'Усыплено',
      restore: 'Вернуть',
      restoreAll: 'Вернуть все',
      noSnoozed: 'Нет усыпленных вкладок',
      optionsTitle: 'Настройки TabMind',
      sectionTimers: 'Таймеры неактивности',
      sectionTimersHint: 'Авто-усыпление вкладок после стольких минут без фокуса.',
      sectionNotifications: 'Расписание уведомлений',
      sectionNotificationsHint: 'Напоминания об усыпленных вкладках в системе.',
      notificationsEnabled: 'Включить уведомления браузера',
      scheduleInterval: 'Каждые X часов',
      scheduleDaily: 'В определённое время',
      notificationInterval: 'Напоминать каждые (часов)',
      notificationTime: 'Напоминать в (локальное время)',
      notificationTitle: 'Есть усыпленные вкладки',
      notificationCategoryLine: '{name}: {count} вкл.',
      notificationMore: 'ещё {count} категорий',
      notificationEmpty: 'Сейчас нет усыпленных вкладок.',
      notificationRestore: 'Вернуть все',
      notificationIgnore: 'Пропустить',
      sectionLanguage: 'Язык',
      languageLabel: 'Язык интерфейса',
      save: 'Сохранить',
      saved: 'Настройки сохранены',
      minutes: 'мин',
      sectionManageCategories: 'Управление категориями',
      sectionManageCategoriesHint: 'Добавляйте или удаляйте категории и укажите домены — подходящие сайты попадут в эту категорию для таймеров и усыпления.',
      addCategory: 'Добавить категорию',
      deleteCategory: 'Удалить',
      newCategoryPlaceholder: 'Название новой категории',
      cannotDeleteLast: 'Должна остаться хотя бы одна категория.',
      duplicateCategory: 'Категория с таким названием уже есть.',
      emptyCategoryName: 'Введите название категории.',
      categoryDomainsHint: 'Домены и поддомены из списка переопределяют авто-категорию (не отдельные вкладки). Пример: для правила ycombinator.com подойдёт и news.ycombinator.com.',
      categoryDomainsLabel: 'Домены',
      domainPlaceholder: 'например reddit.com или https://app.slack.com',
      addDomain: 'Добавить домен',
      invalidDomain: 'Не удалось распознать домен.',
      domainAlreadyInCategory: 'Этот домен уже указан для этой категории.',
      removeDomain: 'Удалить домен',
      focusMode: 'Режим фокуса',
      focusModeHint: 'Усыпить отвлекающие вкладки и сосредоточиться.',
      focusStart25: '25 мин',
      focusStart45: '45 мин',
      focusActive: 'Фокус активен',
      focusRemaining: 'Осталось {time}',
      focusEnd: 'Завершить фокус',
      focusBlocked: 'Заблокировано в режиме фокуса',
      searchPlaceholder: 'Поиск открытых и усыпленных вкладок…',
      searchNoResults: 'Ничего не найдено',
      snoozeAllTabs: 'Усыпить все вкладки',
      openTabsHeading: 'Открыто',
      tabOpen: 'Перейти',
      sectionSmartFeatures: 'Умные функции',
      preventDuplicateTabs: 'Блокировать дубликаты вкладок',
      preventDuplicateTabsHint: 'Если URL уже открыт, спросить перед созданием дубликата.',
      duplicateTitle: 'TabMind',
      duplicateMessage: 'Эта страница уже открыта.',
      duplicateSwitch: 'Перейти к существующей вкладке',
      duplicateOpenAnyway: 'Всё равно открыть дубликат',
      duplicateUrlHint: 'Уже открыта в другой вкладке',
      actionTitleWithSnoozed: 'TabMind — усыплено вкладок: {count}. Откройте, чтобы вернуть.',
      actionTitleEmpty: 'TabMind — нет усыпленных вкладок',
      categories: {
        work: 'Работа',
        entertainment: 'Развлечения',
        readLater: 'Почитать позже',
        shopping: 'Покупки',
        education: 'Обучение и IT',
        finance: 'Финансы',
      },
    },
  };

  function t(lang, key, vars = {}) {
    const parts = key.split('.');
    let value = translations[lang] || translations.en;
    for (const part of parts) {
      value = value?.[part];
    }
    if (value == null) {
      value = key;
    }
    return String(value).replace(/\{(\w+)\}/g, (_, name) => (
      vars[name] != null ? String(vars[name]) : `{${name}}`
    ));
  }

  function categoryLabel(lang, categoryId) {
    return t(lang, `categories.${categoryId}`);
  }

  function displayCategoryName(lang, category) {
    if (!category) return '';
    if (category.defaultKey) {
      const fallbackKey = `categories.${category.defaultKey}`;
      const translated = t(lang, fallbackKey);
      if (translated !== fallbackKey) return translated;
    }
    return category.name;
  }

  function applyToDocument(lang, root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(lang, key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(lang, key));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      el.setAttribute('title', t(lang, key));
    });
    document.documentElement.lang = lang === 'ru' ? 'ru' : 'en';
  }

  return { translations, t, categoryLabel, displayCategoryName, applyToDocument };
})();
