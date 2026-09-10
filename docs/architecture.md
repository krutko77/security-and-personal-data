# Архитектура шаблона Б24-дашборда

## Структура файлов

```
test-2/
├── src/
│   ├── server.js           ← точка входа, Express
│   ├── utils/api.js        ← обёртка над VibeCode API
│   ├── routes/data.js      ← HTTP-маршруты
│   ├── services/data.js    ← бизнес-логика и кеш
│   └── public/
│       ├── index.html      ← разметка дашборда
│       ├── css/dashboard.css
│       └── js/app.js       ← фронтенд (Chart.js)
├── docs/                   ← история и состояние проекта
├── scripts/snapshot.sh     ← коммит + пуш на GitHub
├── deploy-vps.sh           ← деплой на VPS
├── .env.example
└── CLAUDE.md               ← инструкция для Клода
```

---

## Поток данных

```
Б24 смарт-процесс
    ↓
VibeCode API  (utils/api.js)
    ↓
fetchAll() — автопагинация, грузит все записи
    ↓
Кеш в памяти — TTL 5 минут  (services/data.js)
    ↓
4 функции агрегации:
  getSummary()     → карточки
  getByCategory()  → круговая диаграмма
  getByItem()      → таблица
  getByMonth()     → гистограмма
    ↓
REST-маршруты  (routes/data.js)
  GET /api/data/summary
  GET /api/data/by-category
  GET /api/data/by-item
  GET /api/data/by-month
    ↓
Фронтенд  (app.js)
  loadAll() — параллельно грузит summary + chart + table
  loadMonthlyChart() — отдельно, по году
```

---

## Ключевые решения

**Кеш в памяти.** При старте сервер загружает все записи смарт-процесса и держит их 5 минут. Фильтрация по дате и категории происходит локально — без повторных запросов к API при каждом клике пользователя.

**Версионирование запросов (`loadVersion`).** При быстром переключении фильтров старый медленный ответ не перетирает данные нового. Каждый `loadAll()` получает номер версии и игнорирует результат, если версия устарела.

**Интеграция с Б24.** Б24 открывает приложение через POST-запрос в iframe. Отдельный маршрут `/install` с `BX24.installFinish()` решает проблему «приложение не установлено» для рядовых сотрудников.

**Настройка через `services/data.js`.** Весь специфичный для проекта код сосредоточен в одном месте — объект `F` с UF-кодами полей и `FILTER_NAMES` со значениями фильтра. Остальной код трогать не нужно.

---

## Что нужно заменить при создании нового проекта

| Файл | Что |
|------|-----|
| `services/data.js` | `F` (коды полей), `FILTER_NAMES`, `parentId...` |
| `index.html` | заголовки, эмодзи, `<option>` в селекте |
| `app.js` | `B24_ITEM_URL`, единицы измерения (₽) |
| `deploy-vps.sh` | `APP_NAME`, `APP_PORT`, `APP_DOMAIN` |
| `.env` | `VIBE_API_KEY`, `ENTITY_TYPE_ID`, `PORT` |
