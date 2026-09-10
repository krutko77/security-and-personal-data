// ЗАМЕНИ: URL для ссылок в таблице → карточка записи в Б24
// Формат: https://ВАШ_ПОРТАЛ.bitrix24.ru/crm/type/ENTITY_TYPE_ID/details
const B24_ITEM_URL = 'https://PORTAL.bitrix24.ru/crm/type/ENTITY_TYPE_ID/details';

const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
                     'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const PALETTE = [
  '#2fc6f6', '#5b9cf6', '#7c6af7', '#e066b3',
  '#ff6b6b', '#ff8c42', '#ffc145', '#5fd67a',
  '#26c6a8', '#78909c',
];

let chartInstance        = null;
let monthlyChartInstance = null;
let selectedMonthIndex   = null;
let barValues            = [];
let loadVersion          = 0; // версионирование: устаревшие ответы от предыдущих запросов игнорируются

function fmt(n) {
  return Number(n).toLocaleString('ru-RU');
}

function toDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getRange() {
  return {
    dateFrom: document.getElementById('dateFrom').value,
    dateTo:   document.getElementById('dateTo').value,
    category: document.getElementById('categorySelect').value,
  };
}

// ─── Цвета столбцов гистограммы ─────────────────────────────────────────────
function getBarColors(values, selectedIdx) {
  return values.map((v, i) => {
    if (selectedIdx === null) return v > 0 ? '#2fc6f6' : '#e0e5ee';
    if (i === selectedIdx)    return '#00aae3';
    return v > 0 ? '#b8e8f8' : '#e0e5ee';
  });
}

// ─── Бейдж активного месяца ──────────────────────────────────────────────────
function updateMonthBadge(year) {
  const badge = document.getElementById('monthFilterBadge');
  if (selectedMonthIndex === null) { badge.innerHTML = ''; return; }
  const label = `${MONTH_NAMES[selectedMonthIndex]} ${year}`;
  badge.innerHTML = `<span class="month-badge">${label}<button class="badge-reset" id="badgeReset" title="Сбросить фильтр">×</button></span>`;
  document.getElementById('badgeReset').addEventListener('click', resetMonthFilter);
}

function applyMonthFilter(idx, year) {
  selectedMonthIndex = idx;
  const firstDay = new Date(year, idx, 1);
  const lastDay  = new Date(year, idx + 1, 0);
  document.getElementById('dateFrom').value = toDateStr(firstDay);
  document.getElementById('dateTo').value   = toDateStr(lastDay);
  updateMonthBadge(year);
  if (monthlyChartInstance) {
    monthlyChartInstance.data.datasets[0].backgroundColor = getBarColors(barValues, selectedMonthIndex);
    monthlyChartInstance.update('none');
  }
  loadAll(getRange());
}

function resetMonthFilter() {
  selectedMonthIndex = null;
  const now = new Date();
  document.getElementById('dateFrom').value = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  document.getElementById('dateTo').value   = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  updateMonthBadge(null);
  if (monthlyChartInstance) {
    monthlyChartInstance.data.datasets[0].backgroundColor = getBarColors(barValues, null);
    monthlyChartInstance.update('none');
  }
  loadAll(getRange());
}

function clearBarHighlight() {
  selectedMonthIndex = null;
  updateMonthBadge(null);
  if (monthlyChartInstance) {
    monthlyChartInstance.data.datasets[0].backgroundColor = getBarColors(barValues, null);
    monthlyChartInstance.update('none');
  }
}

// ─── Фильтр дат ──────────────────────────────────────────────────────────────
function buildDateFilter() {
  const now      = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const inputFrom = document.getElementById('dateFrom');
  const inputTo   = document.getElementById('dateTo');
  inputFrom.value = toDateStr(firstDay);
  inputTo.value   = toDateStr(now);

  function onDateChange() {
    if (selectedMonthIndex !== null) clearBarHighlight();
    if (inputFrom.value && inputTo.value && inputFrom.value <= inputTo.value) {
      loadAll(getRange());
    }
  }

  inputFrom.addEventListener('change', onDateChange);
  inputTo.addEventListener('change', onDateChange);
  document.getElementById('categorySelect').addEventListener('change', () => {
    loadAll(getRange());
    loadMonthlyChart(document.getElementById('yearSelect').value);
  });
}

// ─── Сводные карточки ────────────────────────────────────────────────────────
async function loadSummary({ dateFrom, dateTo, category }, version) {
  try {
    const res = await fetch(`api/data/summary?dateFrom=${dateFrom}&dateTo=${dateTo}&category=${category}`);
    const { data } = await res.json();
    if (version !== loadVersion) return;

    document.getElementById('statTotal').textContent       = fmt(data.total);
    document.getElementById('statUniqueItems').textContent = fmt(data.uniqueItems);
    document.getElementById('statTotalAmount').textContent = fmt(data.totalAmount);
    document.getElementById('statAvgAmount').textContent   = fmt(data.avgAmount);

    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('loading'));
  } catch (err) {
    console.error('Ошибка загрузки сводки:', err);
  }
}

// ─── Круговая диаграмма ───────────────────────────────────────────────────────
async function loadChart({ dateFrom, dateTo, category }, version) {
  const canvas = document.getElementById('categoryChart');
  const legend = document.getElementById('chartLegend');
  const empty  = document.getElementById('chartEmpty');

  const res = await fetch(`api/data/by-category?dateFrom=${dateFrom}&dateTo=${dateTo}&category=${category}`);
  const { data } = await res.json();
  if (version !== loadVersion) return;

  legend.innerHTML = '';
  empty.classList.add('hidden');
  canvas.classList.remove('hidden');

  if (!data || data.length === 0) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    canvas.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  const labels = data.map(d => d.label);
  const values = data.map(d => d.value);
  const total  = values.reduce((s, v) => s + v, 0);
  const colors = data.map((_, i) => PALETTE[i % PALETTE.length]);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }],
    },
    options: {
      cutout: '62%',
      animation: { duration: 500 },
      layout: { padding: 10 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return `  ${fmt(ctx.parsed)} ₽ (${pct}%)`; // ЗАМЕНИ единицу
            },
          },
        },
      },
    },
  });

  data.forEach((item, i) => {
    const pct = total ? ((item.value / total) * 100).toFixed(1) : '0';
    const el = document.createElement('div');
    el.className = 'legend-item';
    el.innerHTML = `
      <span class="legend-dot" style="background:${colors[i]}"></span>
      <span class="legend-name">${item.label}</span>
      <span class="legend-value">${fmt(item.value)} ₽</span>
      <span class="legend-pct">${pct}%</span>
    `;
    el.addEventListener('click', () => {
      const meta = chartInstance.getDatasetMeta(0);
      const arc  = meta.data[i];
      arc.hidden = !arc.hidden;
      chartInstance.update();
      el.style.opacity = arc.hidden ? '0.4' : '1';
    });
    legend.appendChild(el);
  });
}

// ─── Гистограмма по месяцам ───────────────────────────────────────────────────
async function loadMonthlyChart(year) {
  const canvas = document.getElementById('monthlyChart');
  const empty  = document.getElementById('monthlyEmpty');

  empty.classList.add('hidden');
  canvas.classList.remove('hidden');

  const category = document.getElementById('categorySelect').value;
  const res = await fetch(`api/data/by-month?year=${year}&category=${category}`);
  const { data } = await res.json();

  const hasData = data.some(d => d.value > 0);
  if (!hasData) {
    if (monthlyChartInstance) { monthlyChartInstance.destroy(); monthlyChartInstance = null; }
    canvas.classList.add('hidden');
    empty.classList.remove('hidden');
    barValues = [];
    return;
  }

  const labels = data.map(d => MONTH_NAMES[d.month - 1]);
  barValues    = data.map(d => d.value);

  if (monthlyChartInstance) monthlyChartInstance.destroy();

  monthlyChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: barValues,
        backgroundColor: getBarColors(barValues, selectedMonthIndex),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (barValues[idx] === 0) return;
        if (selectedMonthIndex === idx) {
          resetMonthFilter();
        } else {
          applyMonthFilter(idx, year);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y > 0 ? `  ${fmt(ctx.parsed.y)} ₽` : '  Нет данных', // ЗАМЕНИ
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 13 }, color: '#6b7a8d' },
        },
        y: {
          grid: { color: '#e0e5ee', lineWidth: 1 },
          border: { dash: [4, 4], display: false },
          ticks: {
            font: { size: 12 },
            color: '#6b7a8d',
            callback: v => fmt(v) + ' ₽', // ЗАМЕНИ единицу
          },
        },
      },
    },
  });
}

// ─── Таблица по объектам ──────────────────────────────────────────────────────
async function loadItemsTable({ dateFrom, dateTo, category }, version) {
  const tbody = document.getElementById('itemsTableBody');
  const empty = document.getElementById('itemsEmpty');

  const res = await fetch(`api/data/by-item?dateFrom=${dateFrom}&dateTo=${dateTo}&category=${category}`);
  const { data } = await res.json();
  if (version !== loadVersion) return;

  tbody.innerHTML = '';
  empty.classList.add('hidden');

  if (!data || data.length === 0) {
    empty.classList.remove('hidden');
    return;
  }

  const totalAmount = data.reduce((s, r) => s + r.totalAmount, 0);

  tbody.innerHTML = data.map((row, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="col-plate">
        <a class="car-number car-link" href="${B24_ITEM_URL}/${row.topId}/" target="_blank" rel="noopener">
          ${row.name}
        </a>
      </td>
      <td class="col-brand">${row.filterName || '—'}</td>
      <td>
        <div class="work-tags">
          ${row.groups.map(g => `<span class="work-tag">${g.type}${g.items.length ? ` <span class="work-items">(${g.items.join(', ')})</span>` : ''}</span>`).join('')}
        </div>
      </td>
      <td class="col-cost">${fmt(row.totalAmount)}</td>
    </tr>
  `).join('') + `
    <tr class="table-total">
      <td class="col-num"></td>
      <td colspan="3">Итого</td>
      <td class="col-cost">${fmt(totalAmount)}</td>
    </tr>
  `;
}

// ─── Загрузить всё ────────────────────────────────────────────────────────────
async function loadAll(range) {
  const version = ++loadVersion;
  document.querySelectorAll('.stat-card').forEach(c => c.classList.add('loading'));
  await Promise.all([
    loadSummary(range, version),
    loadChart(range, version),
    loadItemsTable(range, version),
  ]);
}

// ─── Кнопка обновления ───────────────────────────────────────────────────────
function setupRefresh() {
  const btn = document.getElementById('btnRefresh');
  btn.addEventListener('click', () => {
    btn.classList.add('spinning');
    loadAll(getRange()).finally(() => btn.classList.remove('spinning'));
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  buildDateFilter();
  setupRefresh();

  const yearSelect = document.getElementById('yearSelect');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= 2024; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = String(currentYear);
  yearSelect.addEventListener('change', () => {
    selectedMonthIndex = null;
    updateMonthBadge(null);
    loadMonthlyChart(yearSelect.value);
  });

  await Promise.all([loadAll(getRange()), loadMonthlyChart(yearSelect.value)]);
}

init();
