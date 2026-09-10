import { Router } from 'express';
import { getByCategory, getSummary, getByItem, getByMonth } from '../services/data.js';

const router = Router();

// Извлекает dateFrom / dateTo / category из query-параметров.
// Если не заданы — берёт текущий месяц.
function parseRange(query) {
  const now      = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const dateFrom = query.dateFrom || firstDay.toISOString().split('T')[0];
  const dateTo   = query.dateTo   || now.toISOString().split('T')[0];
  const category = query.category || '';  // ЗАМЕНИ: фильтр по категории/марке/отделу и т.п.
  return { dateFrom, dateTo, category };
}

// Сводные карточки (итоги за период)
router.get('/summary', async (req, res) => {
  try {
    res.json({ success: true, data: await getSummary(parseRange(req.query)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Круговая диаграмма: суммы по категориям
router.get('/by-category', async (req, res) => {
  try {
    res.json({ success: true, data: await getByCategory(parseRange(req.query)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Таблица: детализация по элементам (автомобиль / сотрудник / объект и т.п.)
router.get('/by-item', async (req, res) => {
  try {
    res.json({ success: true, data: await getByItem(parseRange(req.query)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Гистограмма: данные по месяцам за год
router.get('/by-month', async (req, res) => {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const category = req.query.category || '';
    res.json({ success: true, data: await getByMonth(year, category) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
