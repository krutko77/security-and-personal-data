import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dataRouter from './routes/data.js';
import { getByCategory, getByItem } from './services/data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public')));

// ─── Обязательно: страница установки Б24-приложения ───────────────────────────
// Без этого обычные сотрудники видят "Приложение ещё не установлено до конца".
// Причина: Б24 вызывает /install при каждом новом пользователе и ждёт BX24.installFinish().
// Решение: отдельный маршрут /install с обоими методами (GET и POST).
const INSTALL_HTML = `<!DOCTYPE html>
<html><head>
<script src="https://api.bitrix24.com/api/v1/"></script>
</head><body>
<script>BX24.init(function(){ BX24.installFinish(); });</script>
</body></html>`;

app.get('/install', (req, res) => res.send(INSTALL_HTML));
app.post('/install', (req, res) => {
  console.log('[POST /install] body:', JSON.stringify(req.body));
  res.send(INSTALL_HTML);
});

// ─── POST / — Б24 открывает приложение через iframe с POST-запросом ───────────
// Также сюда приходит событие ONAPPINSTALL при установке приложения администратором.
app.post('/', (req, res) => {
  console.log('[POST /] body:', JSON.stringify(req.body));
  if (req.body.event === 'ONAPPINSTALL') {
    console.log('[ONAPPINSTALL] вызываем installFinish');
    return res.send(INSTALL_HTML);
  }
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.use('/api/data', dataRouter);

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  // Прогрев кешей — чтобы первый запрос пользователя был быстрым
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const warmFilter = { dateFrom: `${y}-${m}-01`, dateTo: `${y}-${m}-31`, category: '' };
  Promise.all([getByCategory(warmFilter), getByItem(warmFilter)])
    .then(() => console.log('[warmup] кеши прогреты'))
    .catch(err => console.error('[warmup] ошибка прогрева:', err.message));
});

export default app;
