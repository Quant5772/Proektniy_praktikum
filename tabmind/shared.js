/* global TabMindShared */
const TabMindShared = (() => {
  const DEFAULT_THRESHOLD_MINUTES = 30;

  const DEFAULT_CATEGORIES = [
    { id: 'work', name: 'Work', defaultKey: 'work' },
    { id: 'entertainment', name: 'Entertainment', defaultKey: 'entertainment' },
    { id: 'readLater', name: 'Read Later', defaultKey: 'readLater' },
    { id: 'shopping', name: 'Shopping', defaultKey: 'shopping' },
    { id: 'education', name: 'Education / Tech', defaultKey: 'education' },
    { id: 'finance', name: 'Finance', defaultKey: 'finance' },
  ];

  const DEFAULT_THRESHOLDS = {
    work: 30,
    entertainment: 15,
    readLater: 60,
    shopping: 20,
    education: 45,
    finance: 30,
  };

  const WORK_DEFAULT_KEYS = ['work', 'education'];

  const STORAGE_KEYS = {
    settings: 'tabmind_settings',
    categories: 'tabmind_categories',
    snoozed: 'tabmind_snoozed',
    activity: 'tabmind_tab_activity',
    overrides: 'tabmind_category_overrides',
    domainRules: 'tabmind_category_domain_rules',
    focusMode: 'tabmind_focus_mode',
  };

  const ALARM_NAMES = {
    scan: 'tabmind_scan_inactive',
    notification: 'tabmind_notification_reminder',
    focus: 'tabmind_focus_end',
  };

  function isWorkCategory(category) {
    return WORK_DEFAULT_KEYS.includes(category?.defaultKey);
  }

  function isNonWorkCategory(category) {
    return category && !isWorkCategory(category);
  }

  function normalizeTabUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    } catch {
      return url.split('#')[0].replace(/\/$/, '');
    }
  }

  function getCategoryIds(categories) {
    return categories.map((c) => c.id);
  }

  function emptySnoozedForCategories(categories) {
    return Object.fromEntries(getCategoryIds(categories).map((id) => [id, []]));
  }

  function createCategoryId(name, existingIds) {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'category';
    let id = base;
    let suffix = 1;
    while (existingIds.includes(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
  }

  function classifyUrlDefaultKey(url, title) {
    const haystack = `${url || ''} ${title || ''}`.toLowerCase();

    const rules = [
      {
        key: 'finance',
        patterns: [
          'paypal', 'stripe', 'bank', 'chase.com', 'wellsfargo', 'coinbase',
          'binance', 'robinhood', 'fidelity', 'schwab', 'mint.com', 'ynab',
          'finance.yahoo', 'investing.com', 'bloomberg', 'tradingview',
        ],
      },
      {
        key: 'shopping',
        patterns: [
          'amazon.', 'ebay.', 'etsy.com', 'shopify', 'aliexpress', 'walmart',
          'target.com', 'bestbuy', 'ikea.', 'zalando', 'ozon.', 'wildberries',
          'checkout', 'shop.',
        ],
      },
      {
        key: 'entertainment',
        patterns: [
          'youtube.com', 'netflix', 'twitch.tv', 'spotify', 'soundcloud',
          'tiktok', 'instagram.com', 'twitter.com', 'x.com',
          'facebook.com', 'steamcommunity', 'discord.com/channels',
          'hulu', 'disneyplus', 'primevideo',
        ],
      },
      {
        key: 'readLater',
        patterns: [
          'medium.com', 'substack', 'pocket', 'readwise', 'feedly',
          'habr.com', 'dev.to', 'blog.', 'wikipedia.org',
        ],
      },
      {
        key: 'education',
        patterns: [
          'stackoverflow', 'stackexchange', 'github.com', 'gitlab',
          'developer.mozilla', 'coursera', 'udemy', 'khanacademy', 'leetcode',
          'freecodecamp', 'w3schools', 'npmjs', 'arxiv.org',
        ],
      },
      {
        key: 'work',
        patterns: [
          'mail.google', 'outlook.', 'office.com', 'teams.microsoft', 'slack.com',
          'notion.so', 'asana', 'trello', 'jira.', 'figma.com',
          'docs.google', 'drive.google', 'calendar.google',
          'linkedin.com', 'zoom.us', 'meet.google',
        ],
      },
    ];

    for (const rule of rules) {
      if (rule.patterns.some((p) => haystack.includes(p))) {
        return rule.key;
      }
    }

    return 'work';
  }

  /**
   * Normalize user input (domain or URL) to a hostname for matching, e.g. "youtube.com".
   * @param {string} raw
   * @returns {string|null}
   */
  function normalizeDomainRuleInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let candidate = s;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    try {
      const { hostname } = new URL(candidate);
      const host = hostname.toLowerCase();
      return host || null;
    } catch {
      return null;
    }
  }

  function hostnameMatchesDomainRule(hostname, ruleHost) {
    if (!hostname || !ruleHost) return false;
    const h = hostname.toLowerCase();
    const r = ruleHost.toLowerCase();
    if (h === r) return true;
    if (h.endsWith(`.${r}`)) return true;
    return false;
  }

  /**
   * First matching rule wins (category order, then rule order within the category).
   * @param {string} url
   * @param {Array<{ id: string }>} categories
   * @param {Record<string, string[]>} domainRulesByCategory
   * @returns {string|null}
   */
  function resolveCategoryIdFromDomainRules(url, categories, domainRulesByCategory) {
    if (!url || !categories?.length) return null;
    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    if (!hostname) return null;

    for (const category of categories) {
      const rules = domainRulesByCategory[category.id];
      if (!Array.isArray(rules) || !rules.length) continue;
      for (const rule of rules) {
        if (typeof rule !== 'string' || !rule.trim()) continue;
        if (hostnameMatchesDomainRule(hostname, rule.trim())) {
          return category.id;
        }
      }
    }
    return null;
  }

  function resolveCategoryId(categories, url, title, urlOverrides = {}, domainRulesByCategory = {}) {
    if (!categories?.length) return null;

    if (url && urlOverrides[url]) {
      const overrideId = urlOverrides[url];
      if (categories.some((c) => c.id === overrideId)) {
        return overrideId;
      }
    }

    const fromDomains = url
      ? resolveCategoryIdFromDomainRules(url, categories, domainRulesByCategory)
      : null;
    if (fromDomains && categories.some((c) => c.id === fromDomains)) {
      return fromDomains;
    }

    const defaultKey = classifyUrlDefaultKey(url, title);
    const matched = categories.find(
      (c) => c.defaultKey === defaultKey || c.id === defaultKey,
    );
    return matched?.id ?? categories[0].id;
  }

  function defaultThresholdForCategory(categoryId, categories) {
    const category = categories.find((c) => c.id === categoryId);
    if (category?.defaultKey && DEFAULT_THRESHOLDS[category.defaultKey] != null) {
      return DEFAULT_THRESHOLDS[category.defaultKey];
    }
    return DEFAULT_THRESHOLD_MINUTES;
  }

  return {
    DEFAULT_CATEGORIES,
    DEFAULT_THRESHOLDS,
    DEFAULT_THRESHOLD_MINUTES,
    WORK_DEFAULT_KEYS,
    STORAGE_KEYS,
    ALARM_NAMES,
    getCategoryIds,
    emptySnoozedForCategories,
    createCategoryId,
    classifyUrlDefaultKey,
    normalizeDomainRuleInput,
    hostnameMatchesDomainRule,
    resolveCategoryIdFromDomainRules,
    resolveCategoryId,
    defaultThresholdForCategory,
    isWorkCategory,
    isNonWorkCategory,
    normalizeTabUrl,
  };
})();
