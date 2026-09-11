import { callOpenAiAnalysis } from './ai.js';
import { parseKeywordInput } from './research-brief.js';
import { showError, showToast } from './ui.js';

function extractJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('ИИ не вернул JSON-план исследования');
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/^www\./i, '')
    .toLowerCase();
}

function sanitizePlan(plan) {
  const queries = parseKeywordInput((plan?.queries || []).join('\n'))
    .filter((query) => query.length <= 500 && query.split(/\s+/).length >= 2)
    .slice(0, 30);
  const domains = [...new Set((Array.isArray(plan?.domains) ? plan.domains : [])
    .map(normalizeDomain)
    .filter((domain) => /^[a-z0-9а-яё.-]+\.[a-zа-яё]{2,}$/i.test(domain)))]
    .slice(0, 15);
  const questions = (Array.isArray(plan?.research_questions) ? plan.research_questions : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 12);
  return { queries, domains, questions };
}

export async function buildAiResearchPlan() {
  const briefEl = document.getElementById('researchBrief');
  const brief = briefEl?.value?.trim() || '';
  if (!brief) {
    alert('Сначала заполните техническое задание исследования');
    return;
  }

  const existingDomains = document.getElementById('researchDomains')?.value?.trim() || '';
  const button = document.getElementById('btnAiPlanResearch');
  if (button) {
    button.disabled = true;
    button.textContent = 'ИИ планирует…';
  }

  try {
    const answer = await callOpenAiAnalysis({
      system: 'Ты планировщик интернет-исследований. Верни только валидный JSON без пояснений.',
      user: `Построй поисковый план по техническому заданию.\n\nТЗ:\n${brief}\n\nУже заданные домены, если есть:\n${existingDomains || 'нет'}\n\nВерни JSON строго такой структуры:\n{\n  "research_questions": ["вопрос 1", "вопрос 2"],\n  "queries": ["поисковый запрос 1", "поисковый запрос 2"],\n  "domains": ["example.ru"]\n}\n\nТребования:\n- 8-20 поисковых запросов, максимум 30;\n- запросы короткие, конкретные, пригодные для веб-поиска;\n- покрыть разные аспекты задания и синонимы;\n- домены добавлять только когда они действительно полезны;\n- не придумывать несуществующие сайты;\n- не включать персональные данные;\n- язык запросов выбирать по теме и целевым источникам.`
    }, 1800);

    const plan = sanitizePlan(extractJson(answer));
    if (!plan.queries.length) throw new Error('ИИ не сформировал пригодные поисковые запросы');

    const keywordsEl = document.getElementById('researchKeywords');
    const domainsEl = document.getElementById('researchDomains');
    if (keywordsEl) keywordsEl.value = plan.queries.join('\n');
    if (domainsEl && plan.domains.length) domainsEl.value = plan.domains.join(' ');

    const countEl = document.getElementById('researchKeywordCount');
    if (countEl) {
      const q = plan.questions.length ? ` · вопросов исследования: ${plan.questions.length}` : '';
      countEl.textContent = `В списке: ${plan.queries.length} ключевых слов${q}`;
    }
    showToast(`AI-план готов: ${plan.queries.length} поисковых запросов`);
  } catch (error) {
    showError(error.message || String(error));
    showToast('Не удалось построить AI-план. Можно использовать обычное «Сформировать запросы».');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '✦ Сформировать план с ИИ';
    }
  }
}

export function installResearchPlannerButton() {
  if (document.getElementById('btnAiPlanResearch')) return;
  const anchor = document.getElementById('btnParseBriefFields');
  if (!anchor) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-sm';
  button.id = 'btnAiPlanResearch';
  button.style.marginTop = '.4rem';
  button.style.marginLeft = '.4rem';
  button.textContent = '✦ Сформировать план с ИИ';
  button.setAttribute('data-tip', 'ИИ разберёт ТЗ и сформирует 8-20 поисковых запросов и полезные домены');
  button.addEventListener('click', buildAiResearchPlan);
  anchor.insertAdjacentElement('afterend', button);
}
