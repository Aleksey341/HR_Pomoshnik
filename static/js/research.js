import { MAX_SEARCH_QUERY } from './config.js';
import { firecrawlRequest } from './api.js';
import { parseDomainsInput, urlMatchesDomains } from './domains.js';
import {
  buildDateTbs,
  buildKeywordsFromBrief,
  buildResearchJobs,
  extractDomainsFromBrief,
  mergeSearchItems,
  parseKeywordInput,
  urlMatchesBriefTopic
} from './research-brief.js';
import { normalizeItems, renderResults } from './results.js';
import { getApiKey } from './storage.js';
import {
  HR_RESEARCH_BRIEF,
  HR_RESEARCH_DOMAINS,
  HR_RESEARCH_KEYWORDS,
  SVO_RESEARCH_BRIEF
} from './templates-data.js';
import {
  hideError,
  hideLoader,
  hideProgress,
  runLoader,
  setProgress,
  showError,
  showToast
} from './ui.js';
import {
  classifyApiFailure,
  retryDelayMs,
  shouldRetryRateLimit,
  waitSeconds,
} from './retry-policy.js';
import { refreshUsageQuietly } from './usage.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function updateResearchKeywordCount() {
  const n = parseKeywordInput(document.getElementById('researchKeywords').value).length;
  const el = document.getElementById('researchKeywordCount');
  if (el) el.textContent = `В списке: ${n} ключевых слов`;
}

export function initResearchKeywordCount() {
  const ta = document.getElementById('researchKeywords');
  ta.addEventListener('input', updateResearchKeywordCount);
  updateResearchKeywordCount();
}

export function parseBriefFields(force = true) {
  const brief = document.getElementById('researchBrief').value;
  const kwEl = document.getElementById('researchKeywords');
  const domEl = document.getElementById('researchDomains');
  const keywords = buildKeywordsFromBrief(brief);
  const domains = extractDomainsFromBrief(brief);

  if (force || !kwEl.value.trim()) {
    if (keywords.length) kwEl.value = keywords.join('\n');
  }
  if (force || !domEl.value.trim()) {
    if (domains.length) domEl.value = domains.join(' ');
  }
  updateResearchKeywordCount();
  return { keywords, domains };
}

function syncResearchDateFilter() {
  const enabled = document.getElementById('researchDateFilter').checked;
  document.getElementById('researchDateFrom').disabled = !enabled;
}

export function initResearchDatePicker() {
  const input = document.getElementById('researchDateFrom');
  input.max = new Date().toISOString().slice(0, 10);
  document.getElementById('researchDateFilter').addEventListener('change', syncResearchDateFilter);
  syncResearchDateFilter();
}

export function loadHrTemplate(switchTab = false) {
  document.getElementById('researchBrief').value = HR_RESEARCH_BRIEF;
  document.getElementById('researchKeywords').value = HR_RESEARCH_KEYWORDS;
  document.getElementById('researchDomains').value = HR_RESEARCH_DOMAINS;
  document.getElementById('researchMaxQueries').value = '0';
  document.getElementById('researchBroad').checked = false;
  updateResearchKeywordCount();
  if (switchTab) document.querySelector('[data-tab="research"]').click();
}

export function loadSvoTemplate(switchTab = true) {
  document.getElementById('researchBrief').value = SVO_RESEARCH_BRIEF;
  parseBriefFields(true);
  document.getElementById('researchMaxQueries').value = '0';
  document.getElementById('researchBroad').checked = false;
  updateResearchKeywordCount();
  if (switchTab) document.querySelector('[data-tab="research"]').click();
}

async function searchWithAutomaticRetry(body, job, index, total, onWait) {
  let attempt = 0;
  while (true) {
    try {
      return await firecrawlRequest('search', body);
    } catch (error) {
      if (!shouldRetryRateLimit(error, attempt, 4)) throw error;
      const delay = retryDelayMs(error, attempt);
      attempt += 1;
      onWait?.(delay, attempt);
      setProgress(
        'researchProgress',
        `Firecrawl ограничил частоту запросов. Ждём ${waitSeconds(delay)} сек., затем автоматически повторим запрос ${index + 1} из ${total}: «${job.label.slice(0, 48)}»…`
      );
      await sleep(delay);
    }
  }
}

function failureSummary(counts) {
  const parts = [];
  if (counts.rate_limit) parts.push(`${counts.rate_limit} - лимит частоты Firecrawl`);
  if (counts.credits) parts.push(`${counts.credits} - недостаточно кредитов Firecrawl`);
  if (counts.other) parts.push(`${counts.other} - другие ошибки API`);
  return parts.join('; ');
}

export async function doResearch() {
  if (!getApiKey()) {
    alert('Укажите API-ключ');
    return;
  }

  const brief = document.getElementById('researchBrief').value.trim();
  let keywords = parseKeywordInput(document.getElementById('researchKeywords').value);
  const domains = parseDomainsInput(document.getElementById('researchDomains').value);
  const limit = Number(document.getElementById('researchLimit').value);
  const maxQueriesRaw = Number(document.getElementById('researchMaxQueries').value);
  const scrape = document.getElementById('researchScrape').checked;
  const dateFilter = document.getElementById('researchDateFilter').checked;
  const dateFrom = document.getElementById('researchDateFrom').value;
  const broad = document.getElementById('researchBroad').checked;

  if (!keywords.length && brief) {
    keywords = buildKeywordsFromBrief(brief);
    if (keywords.length) {
      document.getElementById('researchKeywords').value = keywords.join('\n');
      updateResearchKeywordCount();
    }
  }

  if (!keywords.length) {
    alert('Не найдены ключевые слова. Нажмите «Сформировать запросы» или заполните список вручную.');
    return;
  }

  const weakOnly = keywords.every((k) => k.split(/\s+/).length < 2);
  if (weakOnly && brief) {
    keywords = buildKeywordsFromBrief(brief);
    document.getElementById('researchKeywords').value = keywords.join('\n');
    updateResearchKeywordCount();
  }

  const maxQueries = maxQueriesRaw > 0 ? maxQueriesRaw : keywords.length;
  const kwSlice = keywords.slice(0, maxQueries);
  const jobs = buildResearchJobs(kwSlice, domains, broad);

  if (!jobs.length) {
    alert('Нет запросов для запуска. Добавьте ключевые слова или домены.');
    return;
  }

  const domainNote =
    domains.length && !broad
      ? `\nТолько домены: ${domains.slice(0, 8).join(', ')}${domains.length > 8 ? '…' : ''}`
      : domains.length && broad
        ? '\n⚠ Включён доп. поиск по всему интернету - будут и другие сайты'
        : '\nПоиск по всему интернету';

  if (kwSlice.length > 20 || jobs.length > 25) {
    const ok = confirm(
      `Запуск исследования:\n• Ключевых слов: ${kwSlice.length} из ${keywords.length}\n• API-запросов: ${jobs.length}${domainNote}\n\nПри ограничении Firecrawl исследование автоматически поставит запросы на паузу и продолжит. Это может занять несколько минут. Продолжить?`
    );
    if (!ok) return;
  } else if (domains.length && broad) {
    const ok = confirm(
      `Включён «Доп. поиск без фильтра доменов» - часть результатов будет с других сайтов, не только: ${domains.slice(0, 5).join(', ')}${domains.length > 5 ? '…' : ''}.\n\nПродолжить?`
    );
    if (!ok) return;
  }

  const btn = document.getElementById('btnResearch');
  btn.disabled = true;
  hideError();
  const allItems = [];
  let queriesRun = 0;
  let errors = 0;
  let rateLimitWaits = 0;
  const failures = { rate_limit: 0, credits: 0, other: 0 };
  const t0 = performance.now();

  runLoader('research', async () => {
    try {
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        setProgress('researchProgress', `Запрос ${i + 1} из ${jobs.length}: «${job.label.slice(0, 60)}»…`);
        try {
          const body = {
            query: job.query.slice(0, MAX_SEARCH_QUERY),
            limit,
            scrape,
            lang: 'ru',
            sources: ['web'],
            tbs: dateFilter ? buildDateTbs(dateFrom) : undefined
          };
          if (job.includeDomains.length) body.includeDomains = job.includeDomains;
          const json = await searchWithAutomaticRetry(body, job, i, jobs.length, () => {
            rateLimitWaits += 1;
          });
          let items = normalizeItems(json.data);
          if (job.domainOnly && job.includeDomains.length) {
            items = items.filter((it) => urlMatchesDomains(it.url || it.sourceURL, job.includeDomains));
          }
          mergeSearchItems(allItems, items, job.label);
          queriesRun++;
        } catch (error) {
          errors++;
          failures[classifyApiFailure(error)] += 1;
          console.warn('Search failed:', job.label, error);
        }
        if (i < jobs.length - 1) await sleep(350);
      }

      let finalItems = allItems;
      let filteredOut = 0;
      if (domains.length && !broad) {
        const before = finalItems.length;
        finalItems = finalItems.filter((it) => urlMatchesDomains(it.url || it.sourceURL, domains));
        filteredOut += before - finalItems.length;
      }
      if (brief) {
        const beforeTopic = finalItems.length;
        finalItems = finalItems.filter((it) => urlMatchesBriefTopic(it, brief));
        filteredOut += beforeTopic - finalItems.length;
      }

      renderResults(`Исследование: ${kwSlice.length} из ${keywords.length} ключевых слов`, finalItems, {
        ms: Math.round(performance.now() - t0),
        queriesRun,
        errors,
        rateLimitWaits,
        limit,
        mode: 'research',
        keywordsUsed: kwSlice.length,
        keywordsTotal: keywords.length,
        domains,
        researchQueries: kwSlice,
        domainsStrict: domains.length > 0 && !broad,
        filteredOut,
        researchBrief: document.getElementById('researchBrief').value.trim(),
        dateFrom: dateFilter ? dateFrom : '',
        broad,
        scrape
      });

      if (filteredOut > 0) {
        showError(`Отфильтровано ${filteredOut} нерелевантных ссылок (чужие домены или не по теме задания).`);
      }
      if (errors) {
        const reasons = failureSummary(failures);
        showError(
          `Не удалось выполнить ${errors} из ${jobs.length} запросов.${reasons ? ` Причины: ${reasons}.` : ''} Уже собранные ${finalItems.length} источников сохранены в результатах.`
        );
      } else if (rateLimitWaits) {
        showToast(`Исследование завершено полностью. Firecrawl ограничивал частоту ${rateLimitWaits} раз, запросы автоматически продолжились после паузы.`);
      }
      if (!finalItems.length) {
        showError('Ссылки не найдены. Попробуйте снять фильтр доменов или отключить фильтр по дате.');
      }
    } catch (e) {
      showError(e.message || String(e));
      document.getElementById('resultsArea').style.display = 'block';
      document.getElementById('placeholder').style.display = 'none';
    } finally {
      hideLoader('research');
      hideProgress('researchProgress');
      btn.disabled = false;
      await refreshUsageQuietly();
    }
  });
}
