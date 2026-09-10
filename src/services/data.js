import { fetchAll, vibe } from '../utils/api.js';

// ─── НАСТРОЙКА: замени ID сущности и полей под свой смарт-процесс ─────────────
const ENTITY_TYPE_ID = process.env.ENTITY_TYPE_ID || '1096';

// Поля сущности — UF-коды из настроек смарт-процесса в Б24
// Найти: Б24 → CRM → Смарт-процессы → твой процесс → Поля → скопировать "Код поля"
const F = {
  CATEGORY:   'ufCrm56_XXXXXXXXX',  // ЗАМЕНИ: поле категории/типа (enum или iblock_section)
  SUB_ITEM:   'ufCrm56_XXXXXXXXX',  // ЗАМЕНИ: поле подкатегории/вида работ (опционально)
  DATE_FIELD: 'ufCrm56_XXXXXXXXX',  // ЗАМЕНИ: поле даты (завершения, создания и т.п.)
  AMOUNT:     'ufCrm56_XXXXXXXXX',  // ЗАМЕНИ: числовое поле суммы/количества
  FILTER_KEY: 'ufCrm56_XXXXXXXXX',  // ЗАМЕНИ: поле для фильтрации по категории (марка, отдел...)
};

// Имена значений поля FILTER_KEY (если это enum)
// Пример: { 6428: 'Foton Auman', 6430: 'MB Actros' }
const FILTER_NAMES = {
  // ЗАМЕНИ: ID_enum_значения: 'Название',
};

// ─── Парсинг числового поля (Б24 возвращает "1234.56|RUB" или просто "1234.56") ──
function parseMoney(value) {
  if (!value) return 0;
  const n = parseFloat(String(value).split('|')[0]);
  return isNaN(n) ? 0 : n;
}

// ─── Фильтр по дате и категории ────────────────────────────────────────────────
function matches(record, { dateFrom, dateTo, category }) {
  const raw = record[F.DATE_FIELD];
  if (!raw) return false;
  const day = raw.slice(0, 10);
  if (day < dateFrom || day > dateTo) return false;
  if (category && String(record[F.FILTER_KEY]) !== category) return false;
  return true;
}

// ─── Кеш разрешения названий категорий (catalog-sections) ─────────────────────
const categoryNameCache = new Map();
async function resolveCategoryName(id) {
  if (categoryNameCache.has(id)) return categoryNameCache.get(id);
  try {
    const res  = await vibe(`/catalog-sections/${id}`);
    const name = res.data?.name || `#${id}`;
    categoryNameCache.set(id, name);
    return name;
  } catch {
    return `#${id}`;
  }
}

// ─── Кеш разрешения названий товаров/подкатегорий (catalog-products) ──────────
const subItemCache = new Map();
async function resolveSubItem(id) {
  if (subItemCache.has(id)) return subItemCache.get(id);
  try {
    const res  = await vibe(`/catalog-products/${id}`);
    const info = { name: res.data?.name || `#${id}`, sectionId: String(res.data?.iblockSectionId || '') };
    subItemCache.set(id, info);
    return info;
  } catch {
    const fallback = { name: `#${id}`, sectionId: '' };
    subItemCache.set(id, fallback);
    return fallback;
  }
}

// ─── Кеш всех записей (TTL 5 минут) ───────────────────────────────────────────
let _cache    = null;
let _cacheAt  = 0;
const CACHE_TTL = 300_000;

export async function getAllItems() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;
  _cache   = await fetchAll(`/items/${ENTITY_TYPE_ID}`);
  _cacheAt = now;
  return _cache;
}

// ─── Круговая диаграмма: суммы по категориям ────────────────────────────────
export async function getByCategory(filter) {
  const items = (await getAllItems()).filter(r => matches(r, filter));

  const sumById = new Map();
  for (const r of items) {
    const amount = parseMoney(r[F.AMOUNT]);
    if (!amount) continue;
    for (const id of (r[F.CATEGORY] || [])) {
      const key = String(id);
      sumById.set(key, (sumById.get(key) || 0) + amount);
    }
  }

  const ids   = Array.from(sumById.keys());
  const names = await Promise.all(ids.map(resolveCategoryName));

  return ids
    .map((id, i) => ({ label: names[i], value: Math.round(sumById.get(id)) }))
    .sort((a, b) => b.value - a.value);
}

// ─── Таблица по элементам ────────────────────────────────────────────────────
export async function getByItem(filter) {
  const items = (await getAllItems()).filter(r => matches(r, filter));

  const itemMap = new Map();
  for (const r of items) {
    // ЗАМЕНИ: r.parentId1084 на нужный parentId — ID связанной сущности
    const key = r.parentId1084 || r.title;
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        name:         r.title,
        filterName:   FILTER_NAMES[r[F.FILTER_KEY]] || '',
        totalAmount:  0,
        categoryToSubs: new Map(),
        records:      [],
      });
    }
    const entry = itemMap.get(key);
    entry.totalAmount += parseMoney(r[F.AMOUNT]);
    entry.records.push({ id: r.id, amount: parseMoney(r[F.AMOUNT]) });

    const subIds = (r[F.SUB_ITEM] || []).map(String);
    for (const catId of (r[F.CATEGORY] || []).map(String)) {
      if (!entry.categoryToSubs.has(catId)) entry.categoryToSubs.set(catId, new Set());
      for (const subId of subIds) entry.categoryToSubs.get(catId).add(subId);
    }
  }

  const rows = await Promise.all(
    Array.from(itemMap.values()).map(async entry => {
      const groups = await Promise.all(
        Array.from(entry.categoryToSubs.entries()).map(async ([catId, subIds]) => {
          const [catName, subNames] = await Promise.all([
            resolveCategoryName(catId),
            Promise.all(Array.from(subIds).map(async id => (await resolveSubItem(id)).name)),
          ]);
          return { type: catName, items: subNames };
        })
      );
      const topId = entry.records.sort((a, b) => b.amount - a.amount)[0]?.id;
      return {
        name:        entry.name,
        filterName:  entry.filterName,
        totalAmount: Math.round(entry.totalAmount),
        groups,
        topId,
      };
    })
  );

  return rows.sort((a, b) => b.totalAmount - a.totalAmount);
}

// ─── Гистограмма: суммы по месяцам за год ────────────────────────────────────
export async function getByMonth(year, category = '') {
  const yearStr = String(year);
  const items = (await getAllItems()).filter(r => {
    const raw = r[F.DATE_FIELD];
    if (!raw || raw.slice(0, 4) !== yearStr) return false;
    if (category && String(r[F.FILTER_KEY]) !== category) return false;
    return true;
  });

  const months = Array(12).fill(0);
  for (const r of items) {
    const month = parseInt(r[F.DATE_FIELD].slice(5, 7), 10) - 1;
    months[month] += parseMoney(r[F.AMOUNT]);
  }

  return months.map((value, i) => ({ month: i + 1, value: Math.round(value) }));
}

// ─── Сводные карточки ─────────────────────────────────────────────────────────
export async function getSummary(filter) {
  const items = (await getAllItems()).filter(r => matches(r, filter));

  const total       = items.length;
  const totalAmount = items.reduce((s, r) => s + parseMoney(r[F.AMOUNT]), 0);
  const avgAmount   = total ? totalAmount / total : 0;
  // ЗАМЕНИ parentId1084 на нужное поле для подсчёта уникальных связанных объектов
  const uniqueItems = new Set(items.map(r => r.parentId1084).filter(Boolean)).size;

  return {
    total,
    totalAmount: Math.round(totalAmount),
    avgAmount:   Math.round(avgAmount),
    uniqueItems,
  };
}
