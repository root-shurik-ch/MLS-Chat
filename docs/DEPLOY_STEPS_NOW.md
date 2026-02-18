# Деплой по шагам — minimum.chat

Чек-лист: выполняем по порядку.

---

## Шаг 1. Supabase: проект и ключи

1. Открой [Supabase Dashboard](https://app.supabase.com) и войди в аккаунт.
2. **Create a new project** (или выбери существующий).
   - Name: например `mls-chat` или `minimum-chat`.
   - Database password — сохрани, понадобится для доступа к БД.
   - Region — выбери ближайший (например Frankfurt).
3. Дождись создания проекта (1–2 минуты).
4. В левом меню: **Project Settings** (иконка шестерёнки) → **API**.
5. Скопируй и сохрани:
   - **Project URL** — это твой `VITE_SUPABASE_URL` (например `https://veuspxhoghenwakxnunw.supabase.co`).
   - **Project API keys → anon public** — это `VITE_SUPABASE_ANON_KEY`.
   - **Project ref** для этого проекта: `veuspxhoghenwakxnunw` (для `supabase link` и для `VITE_WS_URL`).

Когда сделаешь — переходи к шагу 2 (схема БД).

---

## Шаг 2. Supabase: схема БД

**Вариант A — через SQL Editor (проще, без CLI):**

1. В Supabase: **SQL Editor** → **New query**.
2. Открой файл `backend/supabase/apply_schema.sql` из репозитория, скопируй весь текст и вставь в запрос.
3. Нажми **Run**. Должно выполниться без ошибок.

**Вариант B — через Supabase CLI:**

```bash
cd backend
supabase login
supabase link --project-ref veuspxhoghenwakxnunw
supabase db push
```

(Если миграций ещё нет, после `link` можно применить схему вручную через SQL Editor, как в варианте A.)

После применения схемы переходи к шагу 3.

---

## Шаг 3. Supabase: деплой Edge Functions

Запускай команды **из корня репозитория** (папка `min/`), не из `backend/`. В корне есть симлинк `supabase` → `backend/supabase`, иначе CLI не найдёт `supabase/functions/.../index.ts`.

```bash
cd /Users/alexandra/min
supabase login   # один раз: откроется браузер, войди в Supabase
supabase link --project-ref veuspxhoghenwakxnunw   # если ещё не делал
supabase functions deploy ds_send
supabase functions deploy auth_challenge
supabase functions deploy auth_register
supabase functions deploy auth_login
supabase functions deploy auth_keypackage
```

Или задеплоить все функции одной командой (часто обходит ошибку «entrypoint path does not exist»):
```bash
supabase functions deploy
```

Если появляется ошибка `entrypoint path does not exist` (часто на macOS из‑за монтирования в Docker):
- **Вариант без Docker** — деплой через Management API (бандл на стороне Supabase):
  ```bash
  cd /Users/alexandra/min
  npx supabase@latest functions deploy --use-api
  ```
  Или по одной: `npx supabase@latest functions deploy ds_send --use-api` и т.д.
- Либо проверь в Docker Desktop: **Settings → Resources → File sharing** — должна быть доступна папка с проектом (например `/Users` или `/Users/alexandra`).

Нужен установленный [Supabase CLI](https://supabase.com/docs/guides/cli).

После деплоя проверь в Dashboard: **Edge Functions** — все пять функций в списке.

---

## Шаг 4. Supabase: CORS для твоего домена

CORS настраивается **без хардкода**: разрешённые origin берутся из переменной окружения `CORS_ALLOWED_ORIGINS` (список через запятую). По умолчанию в коде только localhost — для продакшена домен задаётся в Supabase.

1. Задать **`CORS_ALLOWED_ORIGINS`** одним из способов:
   - **Дашборд:** **Edge Functions** → **Vault** (раздел с переменными для функций) → добавить переменную `CORS_ALLOWED_ORIGINS` со значением `https://minimum.chat,https://www.minimum.chat`.
   - **CLI** (из корня репо):  
     `supabase secrets set CORS_ALLOWED_ORIGINS="https://minimum.chat,https://www.minimum.chat"`
2. Перезадеплой функции: `npx supabase@latest functions deploy --use-api`.

Код: `supabase/functions/_shared/cors.ts` — без хардкода доменов, подходит для open source и форков.

---

## Шаг 5. Cloudflare Pages: проект, сборка, переменные (подробно)

### 5.1 Создать проект и подключить Git

1. Открой [Cloudflare Dashboard](https://dash.cloudflare.com) и войди в аккаунт.
2. В левой панели выбери **Workers & Pages**.
3. Нажми **Create** → **Pages** → **Connect to Git**.
4. Если репозиторий ещё не подключён:
   - Нажми **Connect Git provider** и выбери **GitHub** (или GitLab / Bitbucket).
   - Разреши доступ Cloudflare к твоим репозиториям (можно только выбранный репо).
5. В списке репозиториев выбери тот, где лежит проект (папки `client/`, `backend/`, `supabase/` и т.д.).
6. Нажми **Begin setup**.

### 5.2 Настройки сборки (Build configuration)

На экране **Set up builds and deployments** укажи:

| Поле | Что ввести |
|------|------------|
| **Project name** | Любое, например `minimum-chat` или `mls-chat`. Так будет называться проект и поддомен `*.pages.dev`. |
| **Production branch** | `main` (или ветка, с которой деплоишь). |
| **Build command** | Точная строка: `cd client && npm ci && npm run build` |
| **Build output directory** | Точная строка: `client/dist` |
| **Root directory** | Оставь **пустым** (корень репозитория). |

- **Framework preset** можно оставить **None** — команда и папка вывода заданы вручную.
- Не нажимай **Save and Deploy** сразу — сначала добавь переменные (п. 5.3).

### 5.3 Переменные окружения (Environment variables)

Переменные нужны на этапе сборки: Vite подставляет их в бандл.

1. На той же странице найдите блок **Environment variables** (или **Variables**).
2. Убедись, что выбран **Production** (переключатель Production / Preview).
3. Добавь три переменные (кнопка **Add variable** или **Add**):

   **Переменная 1**
   - **Variable name:** `VITE_SUPABASE_URL`
   - **Value:** `https://veuspxhoghenwakxnunw.supabase.co`
   - **Encrypt** (если есть) — можно не включать.

   **Переменная 2**
   - **Variable name:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** вставь свой **anon public** key из Supabase (Dashboard → Project Settings → API → Project API keys → anon public). Длинная строка, начинается с `eyJ...`.
   - **Encrypt** — желательно включить.

   **Переменная 3**
   - **Variable name:** `VITE_WS_URL`
   - **Value:** `wss://veuspxhoghenwakxnunw.supabase.co/functions/v1/ds_send`
   - **Encrypt** — можно не включать.

4. Проверь, что все три видны в списке и привязаны к **Production**.

### 5.4 Запуск деплоя

1. Нажми **Save and Deploy** (или **Deploy site**).
2. Откроется страница деплоя: лог сборки в реальном времени.
3. Дождись статуса **Success** (зелёная галочка). Обычно 1–3 минуты.
4. После успеха появится ссылка вида `https://<project-name>.pages.dev` — это пока основной URL сайта. Домен minimum.chat привязывается на шаге 6.

Если сборка упала: открой **View build logs**, посмотри ошибку (часто неверный путь к `client/dist` или отсутствие переменной `VITE_*`). Исправь настройки и нажми **Retry deployment**.

**Если в логе только "Failed: error occurred while running build command":**
- Раскрой шаг **Build** в логе и посмотри последние строки (там будет npm/vite ошибка).
- Добавь переменную **NODE_VERSION** = `18` (или `20`) в **Environment variables** (Production) и перезапусти деплой.
- Если падает `npm ci`, замени **Build command** на: `cd client && npm install && npm run build`
- Убедись, что в GitHub запушен актуальный код и выбран правильный branch (например `main`).

---

## Шаг 6. Cloudflare: домен (app.minimum.chat или minimum.chat)

Если домен **minimum.chat** целиком на Cloudflare, удобно отдать приложение на **app.minimum.chat** (корень потом под лендинг).

1. В проекте Pages: **Custom domains** → **Set up a custom domain**.
2. Введи **app.minimum.chat** (или **minimum.chat**).
3. Подтверди создание/обновление DNS. Дождись **Active** (SSL автоматически).
4. В Supabase обнови **CORS_ALLOWED_ORIGINS**: добавь `https://app.minimum.chat` (и при необходимости minimum.chat), затем передеплой функции.

Готово: сайт доступен по **https://app.minimum.chat** (или https://minimum.chat).
