import { showToast } from './ui.js';

const PLAYBOOKS = {
  retention: {
    title: 'Удержание и текучесть',
    description: 'Практики удержания, причины ухода, сегменты риска и меры работодателей.',
    fields: [
      ['industry', 'Отрасль / бизнес', 'например: телеком, ИТ, производство'],
      ['roles', 'Целевые категории сотрудников', 'например: разработчики, продажи, инженеры'],
      ['geo', 'География', 'например: Россия / регионы ЦФО'],
      ['companies', 'Компании для benchmark', 'например: МТС, Ростелеком, Сбер, Яндекс'],
      ['period', 'Период', 'например: 2024-2026'],
    ],
    build: (v) => `Проведи исследование практик удержания сотрудников и снижения текучести.\nОтрасль: ${v.industry || 'не ограничена'}.\nЦелевые категории: ${v.roles || 'ключевые категории персонала'}.\nГеография: ${v.geo || 'Россия'}.\nКомпании для сравнения: ${v.companies || 'ведущие работодатели отрасли'}.\nПериод: ${v.period || 'последние 3 года'}.\n\nНужно выявить: причины увольнений и дефицита, применяемые программы удержания, компенсационные и некомпенсационные меры, карьерные практики, работу руководителей, гибкость формата труда, wellbeing, аналитику рисков ухода. Сравни компании по конкретным практикам. Для каждой существенной практики укажи доказательство и Source ID. Отдельно выдели подтверждённые количественные эффекты, ограничения данных и рекомендации, которые можно адаптировать в другой компании.`,
  },
  onboarding: {
    title: 'Адаптация новичков',
    description: 'Onboarding, 30/60/90 дней, контроль выхода, обратная связь и ранняя текучесть.',
    fields: [
      ['industry', 'Отрасль', 'например: ритейл, телеком'],
      ['roles', 'Категории новичков', 'например: массовый персонал, ИТ'],
      ['geo', 'География', 'Россия'],
      ['companies', 'Компании для сравнения', 'необязательно'],
    ],
    build: (v) => `Исследуй лучшие практики адаптации новых сотрудников.\nОтрасль: ${v.industry || 'не ограничена'}.\nКатегории: ${v.roles || 'новые сотрудники разных категорий'}.\nГеография: ${v.geo || 'Россия'}.\nBenchmark: ${v.companies || 'крупные работодатели'}.\n\nПроверь preboarding, первый день, планы 30/60/90, роль руководителя и HR, наставничество, обучение, pulse/stay-интервью, контроль ранней текучести, цифровые onboarding-платформы и метрики эффективности. Составь сравнительную таблицу практик, покажи измеримые эффекты и предложи целевую модель процесса адаптации. Каждый существенный факт подтверждай Source ID.`,
  },
  mentoring: {
    title: 'Наставничество',
    description: 'Модели наставничества, мотивация наставников, метрики и эффект на текучесть.',
    fields: [
      ['industry', 'Отрасль', 'например: телеком / производство'],
      ['roles', 'Для кого наставничество', 'новички, кадровый резерв и т.п.'],
      ['companies', 'Компании benchmark', 'необязательно'],
      ['period', 'Период', '2023-2026'],
    ],
    build: (v) => `Исследуй программы наставничества работодателей.\nОтрасль: ${v.industry || 'разные отрасли'}.\nЦелевая аудитория: ${v.roles || 'новые сотрудники и кадровый резерв'}.\nКомпании для сравнения: ${v.companies || 'крупные работодатели'}.\nПериод: ${v.period || 'последние 3 года'}.\n\nНайди модели назначения наставников, критерии отбора, обучение, мотивацию и вознаграждение, длительность программы, цифровые инструменты, KPI, охват, влияние на адаптацию и увольнения. Отдельно собери количественные результаты и формулы оценки эффекта/окупаемости. Сформируй рекомендуемую модель процесса и набор KPI. Все факты подтверждай Source ID.`,
  },
  compensation: {
    title: 'Рынок зарплат и мотивация',
    description: 'Зарплатные вилки, переменная часть, льготы и конкурентность предложения.',
    fields: [
      ['roles', 'Должности / роли', 'например: аналитик 1С, PM, разработчик'],
      ['geo', 'География', 'Москва / регионы / удалённо'],
      ['industry', 'Отрасль', 'необязательно'],
      ['level', 'Уровень', 'junior / middle / senior / руководитель'],
      ['period', 'Период', '2026'],
    ],
    build: (v) => `Проведи исследование рынка вознаграждения.\nРоли: ${v.roles || 'целевые специалисты'}.\nУровень: ${v.level || 'разные уровни'}.\nГеография: ${v.geo || 'Россия'}.\nОтрасль: ${v.industry || 'не ограничена'}.\nПериод: ${v.period || 'текущий год'}.\n\nСобери зарплатные вилки, медианы и диапазоны, различия по географии и формату работы, переменную часть, бонусы, ДМС, обучение, гибкость, дополнительные льготы. Отделяй вакансии от обзоров рынка и официальных исследований. Укажи размер выборки, даты и ограничения. В финале дай конкурентный диапазон оффера и рекомендации по total rewards. Все цифры сопровождай Source ID.`,
  },
  wellbeing: {
    title: 'Льготы и wellbeing',
    description: 'ДМС, психологическая поддержка, гибкость, спорт, семьи и эффективность льгот.',
    fields: [
      ['industry', 'Отрасль', 'необязательно'],
      ['companies', 'Компании benchmark', 'например: Сбер, Яндекс, МТС'],
      ['audience', 'Целевая аудитория', 'все сотрудники / ИТ / родители'],
      ['geo', 'География', 'Россия'],
    ],
    build: (v) => `Исследуй программы льгот и wellbeing у работодателей.\nОтрасль: ${v.industry || 'разные отрасли'}.\nКомпании: ${v.companies || 'ведущие работодатели'}.\nЦелевая аудитория: ${v.audience || 'сотрудники компании'}.\nГеография: ${v.geo || 'Россия'}.\n\nСобери ДМС, психологическую поддержку, спорт, питание, гибрид/удалёнку, гибкий график, поддержку семей и родителей, финансовое благополучие, обучение и дополнительные выходные. Отдельно ищи данные об использовании льгот, удовлетворённости, eNPS, удержании и стоимости. Сравни практики и предложи приоритетный пакет льгот с аргументацией. Все факты подтверждай Source ID.`,
  },
  scarce_hiring: {
    title: 'Найм дефицитных специалистов',
    description: 'Каналы, EVP, скорость найма, конкуренты и нестандартные источники кандидатов.',
    fields: [
      ['roles', 'Дефицитные роли', 'например: 1С ERP, DevOps, сварщики'],
      ['geo', 'География', 'регионы найма'],
      ['industry', 'Отрасль', 'необязательно'],
      ['companies', 'Конкуренты за кандидатов', 'необязательно'],
    ],
    build: (v) => `Исследуй рынок и практики найма дефицитных специалистов.\nРоли: ${v.roles || 'дефицитные специалисты'}.\nГеография: ${v.geo || 'Россия'}.\nОтрасль: ${v.industry || 'не ограничена'}.\nКонкуренты за кандидатов: ${v.companies || 'ключевые работодатели рынка'}.\n\nОпредели признаки дефицита, спрос, требования, зарплаты, географию вакансий, каналы привлечения, реферальные программы, обучение с нуля, партнёрства с вузами/колледжами, релокацию, удалённую работу, EVP и скорость процесса. Составь карту конкуренции за кандидата и практический план найма. Цифры и практики подтверждай Source ID.`,
  },
  hrtech: {
    title: 'HR-tech и автоматизация',
    description: 'Системы, AI, автоматизация HR-процессов и подтверждённый эффект.',
    fields: [
      ['process', 'HR-процесс', 'подбор / адаптация / обучение / аналитика'],
      ['industry', 'Отрасль', 'необязательно'],
      ['companies', 'Компании / решения для сравнения', 'необязательно'],
      ['geo', 'Рынок', 'Россия / международный'],
    ],
    build: (v) => `Проведи исследование HR-tech и автоматизации процесса: ${v.process || 'HR-процессы'}.\nОтрасль: ${v.industry || 'не ограничена'}.\nКомпании/решения для сравнения: ${v.companies || 'лидеры рынка и крупные работодатели'}.\nРынок: ${v.geo || 'Россия'}.\n\nНайди используемые платформы и AI-сценарии, интеграции, архитектурные подходы, автоматизируемые операции, KPI до/после, экономический эффект, риски персональных данных и качества решений. Отдели маркетинговые заявления вендоров от подтверждённых кейсов клиентов. Сформируй shortlist практик/решений и критерии пилота. Все существенные факты подтверждай Source ID.`,
  },
  benchmark: {
    title: 'HR Benchmark работодателей',
    description: 'Комплексное сравнение нескольких работодателей по ключевым HR-практикам.',
    fields: [
      ['companies', 'Компании', 'обязательно: 3-8 работодателей'],
      ['industry', 'Отрасль', 'необязательно'],
      ['geo', 'География', 'Россия'],
      ['focus', 'Фокус сравнения', 'удержание, адаптация, льготы, развитие'],
      ['period', 'Период', '2024-2026'],
    ],
    build: (v) => `Проведи сравнительный HR benchmark работодателей: ${v.companies || 'выбранные крупные работодатели'}.\nОтрасль: ${v.industry || 'не ограничена'}.\nГеография: ${v.geo || 'Россия'}.\nФокус: ${v.focus || 'удержание, адаптация, развитие, мотивация, HR-tech'}.\nПериод: ${v.period || 'последние 3 года'}.\n\nДля каждой компании собери только публично подтверждаемые практики и показатели. Построй единую сравнительную таблицу, выдели уникальные практики, общие рыночные паттерны, сильные и слабые стороны, а также идеи, пригодные для переноса. Не делай вывод о наличии практики только по отсутствию данных. Каждый факт сопровождай Source ID.`,
  },
};

function closeDialog() {
  document.getElementById('hrPlaybookOverlay')?.classList.remove('visible');
}

function renderFields(key) {
  const playbook = PLAYBOOKS[key];
  const area = document.getElementById('hrPlaybookFields');
  const description = document.getElementById('hrPlaybookDescription');
  if (!area || !playbook) return;
  description.textContent = playbook.description;
  area.innerHTML = '';
  for (const [name, label, placeholder] of playbook.fields) {
    const field = document.createElement('div');
    field.className = 'field';
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    const input = document.createElement('input');
    input.id = `hrPlaybook_${name}`;
    input.dataset.field = name;
    input.placeholder = placeholder;
    field.append(labelEl, input);
    area.append(field);
  }
}

function applyPlaybook() {
  const key = document.getElementById('hrPlaybookSelect')?.value;
  const playbook = PLAYBOOKS[key];
  if (!playbook) return;
  const values = {};
  document.querySelectorAll('#hrPlaybookFields [data-field]').forEach((input) => {
    values[input.dataset.field] = input.value.trim();
  });
  const brief = playbook.build(values);
  const briefEl = document.getElementById('researchBrief');
  const focusEl = document.getElementById('aiFocus');
  if (briefEl) briefEl.value = brief;
  if (focusEl && !focusEl.value.trim()) {
    focusEl.value = 'Подготовь результат для HR-руководителя: сначала executive summary, затем доказательства, сравнение практик, риски, рекомендации и конкретные следующие шаги.';
  }
  closeDialog();
  document.querySelector('[data-tab="research"]')?.click();
  showToast(`HR-сценарий «${playbook.title}» загружен. Теперь можно сформировать AI-план поиска.`);
}

export function installHrPlaybooks() {
  if (document.getElementById('hrPlaybookOverlay')) return;
  const exampleBar = document.querySelector('#panel-research .example-btns');
  if (exampleBar) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-sm';
    button.id = 'btnHrPlaybooks';
    button.textContent = 'HR-сценарии';
    button.setAttribute('data-tip', 'Готовые сценарии HR-исследований с 3-5 параметрами');
    button.addEventListener('click', () => document.getElementById('hrPlaybookOverlay')?.classList.add('visible'));
    exampleBar.prepend(button);
  }

  const overlay = document.createElement('div');
  overlay.id = 'hrPlaybookOverlay';
  overlay.className = 'history-overlay';
  overlay.innerHTML = `
    <div class="history-dialog playbook-dialog" role="dialog" aria-modal="true" aria-labelledby="hrPlaybookTitle">
      <div class="history-head">
        <div><div class="ai-report-kicker">HR PLAYBOOKS</div><h2 id="hrPlaybookTitle">Готовый сценарий исследования</h2></div>
        <button type="button" class="btn-sm" id="btnCloseHrPlaybook">Закрыть</button>
      </div>
      <div class="field">
        <label>Сценарий</label>
        <select id="hrPlaybookSelect"></select>
        <p class="hint" id="hrPlaybookDescription"></p>
      </div>
      <div id="hrPlaybookFields" class="playbook-fields"></div>
      <button type="button" class="btn-run" id="btnApplyHrPlaybook">Подготовить техническое задание</button>
    </div>`;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeDialog(); });
  document.body.append(overlay);

  const select = document.getElementById('hrPlaybookSelect');
  for (const [key, value] of Object.entries(PLAYBOOKS)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = value.title;
    select.append(option);
  }
  select.addEventListener('change', () => renderFields(select.value));
  document.getElementById('btnCloseHrPlaybook')?.addEventListener('click', closeDialog);
  document.getElementById('btnApplyHrPlaybook')?.addEventListener('click', applyPlaybook);
  renderFields(select.value);
}

export function hrPlaybookNames() {
  return Object.values(PLAYBOOKS).map((item) => item.title);
}
