# Деплой MLS-Chat на minimum.chat (Cloudflare + Supabase)

Пошаговый план первой версии с доменом **minimum.chat** и управлением DNS в **Cloudflare**.

---

## Архитектура деплоя

```
                    Cloudflare
                         │
   minimum.chat          │  Cloudflare Pages (frontend)
   (DNS в CF)            │  • React SPA: https://app.minimum.chat (или https://minimum.chat)
                         │  • Статика, HTTPS
                         │
   Backend ──────────────┼── Supabase (вне Cloudflare)
                         │  • Edge Function: ds_send (WebSocket)
                         │  • Edge Functions: auth_register, auth_login, ...
                         │  • Realtime, Database
                         │
   Клиент подключается:  │
   • Frontend: https://app.minimum.chat (или minimum.chat)
   • WebSocket: wss://<project>.supabase.co/functions/v1/ds_send
```

**Почему так:**
- **Frontend на Cloudflare Pages** — домен уже в Cloudflare, бесплатный хостинг, CDN, авто-SSL.
- **Backend на Supabase** — уже используется в проекте (Edge Functions, Realtime). WebSocket и API остаются на Supabase.

**WASM (MLS):** в образе сборки Cloudflare Pages нет Rust/wasm-pack. Сейчас в репо коммитится уже собранный `client/src/mls/wasm/pkg/` — сборка на Pages быстрая и стабильная. Варианты: [сборка WASM в CI](#сборка-wasm-в-cicd-опционально) (например GitHub Actions) или установка Rust в build command на Pages (медленно, 10+ минут, возможны таймауты).

---

## Риски блокировок (РФ и др.)

**Cloudflare** и его IP/сервисы периодически блокируются или ограничиваются в РФ. Если фронтенд отдаётся через Cloudflare Pages:

- Пользователи **из России** могут не открыть https://minimum.chat (сайт не грузится или таймаут).
- DNS домена minimum.chat может оставаться в Cloudflare — часто блокируют именно трафик к CDN/хостингу, а не только DNS.

**Нам это грозит только если важна доступность из РФ.** Если целевая аудитория — вне РФ или VPN-пользователи, текущая схема допустима.

**План в два этапа:**

- **Фаза 1 (сейчас):** один фронт на Cloudflare Pages. Домен minimum.chat → CF. Если в РФ блокируют CF — пользователи из РФ не откроют сайт; для остального мира всё работает.
- **Фаза 2 (позже):** не только зеркало фронта, но и **федерация DS с сервером в РФ** (доставка сообщений через ноду в РФ) и **решение по AS** (оставить центральным или вынести инстанс в РФ). Трафик из РФ на minimum.chat отправляем через **302 с Cloudflare** на зеркало; зеркало обращается к DS (и при необходимости к AS) в РФ. Подробно — в разделе [Фаза 2: зеркало для РФ, федерация DS, AS](#фаза-2-зеркало-для-рф-федерация-ds-as) ниже.

---

## Часть 1. Supabase (backend)

### 1.1 Проект Supabase

1. Зайти в [Supabase Dashboard](https://app.supabase.com).
2. Создать проект (или использовать существующий).
3. В **Settings → API** скопировать:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

### 1.2 База данных

Применить схему (таблицы из репозитория):

```bash
cd backend
supabase login
supabase link --project-ref veuspxhoghenwakxnunw
supabase db push
# или вручную выполнить SQL из backend/supabase/tables/*.sql
```

### 1.3 Edge Functions

Для WebSocket (ds_send) обязательно использовать в коде **Deno.serve**, а не `serve` из std — иначе шлюз возвращает 502. При деплое функции, которая не проверяет JWT в заголовке (браузер не шлёт заголовки при upgrade), укажи **--no-verify-jwt**:  
`supabase functions deploy ds_send --no-verify-jwt --project-ref <ref>`.

```bash
supabase functions deploy ds_send --no-verify-jwt
supabase functions deploy auth_challenge
supabase functions deploy auth_register
supabase functions deploy auth_login
supabase functions deploy auth_keypackage
```

URL WebSocket для клиента будет:

`wss://veuspxhoghenwakxnunw.supabase.co/functions/v1/ds_send`

Это значение нужно подставить в **VITE_WS_URL** при сборке фронтенда.

### 1.4 CORS (для minimum.chat)

CORS для Edge Functions: без хардкода. В `supabase/functions/_shared/cors.ts` разрешённые origin читаются из **`CORS_ALLOWED_ORIGINS`** (через запятую). В Supabase (Vault или CLI) задай нужные origin, например:
- если приложение на корне: `https://minimum.chat,https://www.minimum.chat`
- если на поддомене: `https://app.minimum.chat` (и при необходимости `https://minimum.chat` для редиректа/лендинга)

Пример: `supabase secrets set CORS_ALLOWED_ORIGINS="https://app.minimum.chat,https://minimum.chat"`. После изменений передеплой: `npx supabase@latest functions deploy --use-api`.

---

## Часть 2. Cloudflare Pages (frontend)

### 2.1 Подготовка репозитория

В корне или в `client/` должен быть валидный сборка:

```bash
cd client
npm ci
npm run build
```

Сборка создаёт папку `client/dist/`.

### 2.2 Создание проекта в Cloudflare Pages

**Вариант A: через Dashboard (первый деплой)**

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Выбрать репозиторий (например GitHub: `root-shurik-ch/MLS-Chat`).
3. Настройки сборки (монорепо: фронт в `client/`):
   - **Framework preset:** None (или Vite — тогда Build output будет `dist`; для монорепо лучше None и явно указать пути ниже).
   - **Root directory:** оставить пустым (корень репозитория).
   - **Build command:** `cd client && npm ci && npm run build`
   - **Build output directory:** `client/dist`

4. **Environment variables** (Settings → Environment variables) — для **Production**:

   | Name                   | Value                                      | Encrypt |
   |------------------------|--------------------------------------------|--------|
   | `VITE_SUPABASE_URL`    | `https://veuspxhoghenwakxnunw.supabase.co` | No     |
   | `VITE_SUPABASE_ANON_KEY` | anon key из Supabase Dashboard           | Yes    |
   | `VITE_WS_URL`          | `wss://veuspxhoghenwakxnunw.supabase.co/functions/v1/ds_send` | No |

   Подставь реальные значения из Supabase.

5. **Save** и запустить **Deploy**.

**Вариант B: через Wrangler CLI**

```bash
npm install -g wrangler
cd client
npm run build
wrangler pages project create mls-chat --production-branch main
wrangler pages deploy dist --project-name=mls-chat
```

Переменные окружения для сборки с `VITE_*` нужно задать в Dashboard (Pages → проект → Settings → Environment variables), т.к. они вшиваются в билд на этапе сборки.

### 2.3 Домен в Cloudflare (app.minimum.chat или minimum.chat)

Если весь домен **minimum.chat** на Cloudflare, удобно отдать приложение на **app.minimum.chat**, а корень оставить под лендинг/редирект позже.

1. Зона **minimum.chat** в Cloudflare (DNS уже там).
2. **Workers & Pages** → проект → **Custom domains** → **Set up a custom domain**.
3. Ввести **app.minimum.chat** (или **minimum.chat**, если приложение на корне).
4. Cloudflare создаст CNAME и выдаст SSL. Дождаться **Active**.

Фронт будет доступен по **https://app.minimum.chat** (или https://minimum.chat). Добавить этот origin в **CORS_ALLOWED_ORIGINS** в Supabase.

---

## Часть 3. Проверка и переменные

### 3.1 Чек-лист

- [ ] Supabase: проект создан, таблицы применены.
- [ ] Supabase: все нужные Edge Functions задеплоены.
- [ ] Supabase: в CORS (CORS_ALLOWED_ORIGINS) добавлен origin приложения, например `https://app.minimum.chat`.
- [ ] Cloudflare Pages: сборка с `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WS_URL` прошла успешно.
- [ ] Cloudflare Pages: привязан домен **app.minimum.chat** (или minimum.chat), SSL активен.
- [ ] В браузере: https://app.minimum.chat открывается, регистрация/логин и чат работают.

### 3.2 Локальная проверка продакшен-билда

Создай `client/.env.production` (или задай переменные в системе) и собери билд:

```bash
cd client
export VITE_SUPABASE_URL=https://veuspxhoghenwakxnunw.supabase.co
export VITE_SUPABASE_ANON_KEY=your_anon_key
export VITE_WS_URL=wss://veuspxhoghenwakxnunw.supabase.co/functions/v1/ds_send
npm run build
npm run preview
```

Проверь в браузере по выданному адресу (например `http://localhost:4173`).

---

## Часть 4. Дальнейшие шаги (опционально)

- **www.minimum.chat**: добавить как второй custom domain в Pages и решить в DNS, куда редиректить (например minimum.chat → основной).
- **Мониторинг**: подключить Sentry/LogRocket для фронта, смотреть логи Edge Functions в Supabase.
- **Rate limiting / безопасность**: настроить в Supabase и при необходимости правила в Cloudflare (WAF, Rate limiting).

---

## Фаза 2: зеркало для РФ, федерация DS, AS

Когда понадобится полноценная доступность из РФ, не убирая Cloudflare как основной хостинг, план такой: **зеркало фронта** + **федерация DS с сервером в РФ** + **решение по AS** (ниже).

### 2.1 Зеркало фронта и 302 с Cloudflare

1. **Поднять зеркало для РФ** — тот же фронт (`client/dist`) на хостинге, доступном из РФ:
   - поддомен: например **ru.minimum.chat** (CNAME на Vercel/Netlify/VPS);
   - или отдельный домен (если нужна изоляция).
   - Для зеркала в `VITE_*` указать **российский DS** (см. п. 2.2) и при необходимости свой AS (см. п. 2.3).

2. **302 redirect по гео в Cloudflare** — один вход по-прежнему **minimum.chat**:
   - **Вариант A: Redirect Rule** (Rules → Redirect Rules): условие "Country equals Russia" → Action: Dynamic redirect, URL = `https://ru.minimum.chat` (или URL зеркала), status 302.
   - **Вариант B: Worker** на `minimum.chat`: в `fetch` смотреть `request.cf.country === 'RU'` и возвращать `Response.redirect('https://ru.minimum.chat', 302)`; иначе — передать запрос в Pages (или на origin).

В итоге: пользователь из РФ заходит на https://minimum.chat → получает 302 на зеркало → браузер открывает зеркало. Остальной мир продолжает ходить на Cloudflare Pages.

**Ограничение:** если в РФ полностью блокируют доступ к Cloudflare (включая первый запрос к minimum.chat), пользователь не получит и 302. Тогда остаётся вариант: продвигать для РФ прямой URL зеркала (ru.minimum.chat или отдельный домен) через соцсети/поиск, либо вынести DNS для части трафика вне Cloudflare (сложнее). Для многих сценариев 302 по гео достаточно (частичные блокировки, мобильные сети).

### 2.2 Федерация DS (Delivery Service) с сервером в РФ

Не только зеркало статики: **доставка сообщений** для пользователей из РФ должна идти через инфраструктуру, доступную из РФ. Иначе WebSocket к Supabase из РФ может не открываться.

- **Поставить ноду DS в РФ** — тот же протокол, что и текущий DS (Edge Function `ds_send`): WebSocket, подписка на группы, broadcast через Realtime. Развёртывание: VPS/хостинг в РФ, тот же код или совместимая реализация (например, порт `ds_send` на Node/Deno).
- **Федерация:** клиент на зеркале (ru.minimum.chat) в конфиге получает `VITE_WS_URL` = URL **российского DS** (например `wss://ds-ru.minimum.chat` или отдельный домен). Российская нода DS может:
  - синхронизироваться с центральной БД/Realtime (Supabase) через сервер-сервер; или
  - быть самостоятельной репликой с обменом сообщениями между нодами по договорённому протоколу.
- Итог: трафик доставки сообщений для пользователей из РФ не зависит от доступности Supabase из РФ; один домен minimum.chat, по гео — 302 на зеркало, которое уже обращается к DS в РФ.

### 2.3 AS (Authentication Service) — что учесть

AS отвечает за регистрацию/логин (WebAuthn, челленджи, ключи). Сейчас это Edge Functions на Supabase (`auth_challenge`, `auth_register`, `auth_login`, `auth_keypackage`). Варианты для Фазы 2:

- **Оставить AS центральным (Supabase):** пользователи из РФ ходят на зеркало за фронтом и на DS в РФ за сообщениями, но регистрация/логин — на Supabase. Плюс: одна точка истины, проще. Минус: если из РФ блокируют не только Cloudflare, но и Supabase, логин/регистрация перестанут работать.
- **Федерация AS / отдельный инстанс в РФ:** развернуть те же (или совместимые) AS-эндпоинты на сервере в РФ; зеркало в `VITE_*` указывает на этот AS. Тогда WebAuthn и челленджи идут в инфраструктуру в РФ. Нужно решить: один общий каталог пользователей (российский AS синхронизируется с центральной БД или читает её) или раздельные каталоги и кросс-доменная идентификация (сложнее).
- **Прокси AS в РФ:** российский сервер проксирует запросы к центральному Supabase AS. Улучшает доступность только если проблема — именно в прямом доступе к Supabase из РФ; при полной блокировке Supabase не поможет.

**Рекомендация:** на этапе планирования Фазы 2 заложить в архитектуру возможность подставить для зеркала отдельные базовые URL для AS и DS (например `VITE_AS_URL`, `VITE_WS_URL`). Конкретный выбор — один центр AS vs федерация AS в РФ — обдумать отдельно с учётом требований к доступности, единому аккаунту и сложности эксплуатации.

---

## Сборка WASM в CI/CD (опционально)

Сейчас в репозитории лежит уже собранный `client/src/mls/wasm/pkg/` — так Cloudflare Pages не нужен Rust, сборка быстрая.

**Если хочешь не коммитить артефакты, а собирать WASM автоматически:**

1. **На самом Cloudflare Pages** — в Build command перед `npm run build` установить Rust и wasm-pack (curl rustup, `wasm-pack build` в `client/src/mls/wasm`). Минусы: сборка 10–20 минут, риск таймаута, в образе Pages нет Rust по умолчанию.
2. **В отдельном CI (рекомендуется)** — например GitHub Actions: при пуше в `main` job с Rust устанавливает wasm-pack, собирает WASM, коммитит обновлённый `pkg/` в репо (или выкладывает артефакт); Pages при следующем деплое подхватывает уже готовый pkg. Так Rust не нужен на Pages, обновление wasm автоматическое при изменении кода в `client/src/mls/wasm/`.

Для первой версии достаточно коммитить `pkg/` вручную после локального `wasm-pack build`. Автоматизацию в Actions можно добавить позже.

---

## Отладка WebSocket (ds_send)

### План отладки по шагам

1. **Задеплоить последний код**  
   `git push origin main` — Cloudflare Pages соберёт фронт. Edge Function `ds_send` деплоится отдельно:  
   `npx supabase functions deploy ds_send --project-ref <your-project-ref>` (если меняли код функции).

2. **Проверить CORS в Supabase**  
   **Dashboard → Project Settings → Edge Functions → Secrets.**  
   Должен быть секрет `CORS_ALLOWED_ORIGINS` со значением, где есть ваш origin, например:  
   `https://app.minimum.chat,https://minimum.chat,https://www.minimum.chat`  
   Без пробелов, запятая между значениями. После сохранения секретов перезапуск функции не нужен.

3. **Открыть сайт и DevTools**  
   Зайти на https://app.minimum.chat, **F12 → Network → фильтр WS**. Обновить страницу или выполнить действие, при котором должен открываться WebSocket.

4. **Посмотреть ответ сервера**  
   В списке запросов клик по запросу к `ds_send` (URL вида `.../functions/v1/ds_send`). Во вкладке **Headers** смотреть:
   - **Status Code**: 101 — успех; 400/403/502 — ошибка.
   - **Request Headers**: есть ли `Upgrade: websocket`, какой `Origin`.
   - **Response Headers**: при 101 должен быть `Access-Control-Allow-Origin` с вашим origin.

5. **Посмотреть логи функции**  
   **Supabase Dashboard → Edge Functions → ds_send → Logs.** Искать строки `[ds_send]`: приходят ли запросы, какой `upgrade`/`origin`, есть ли «Rejecting» или «WebSocket upgrade accepted».

**Итог:** если в Network статус **403** — почти всегда CORS (добавить origin в секрет). Если **400** — в логах будет «Rejecting» (проверить заголовок Upgrade). Если **101** в Network, но в консоли всё равно ошибка — смотреть уже логику клиента или сообщения по сокету.

### Логи Edge Function

В **Supabase Dashboard → Edge Functions → ds_send → Logs** смотреть строки:

- `[ds_send] method=GET upgrade=... origin=...` — что пришло в запросе.
- `[ds_send] Rejecting: missing or invalid Upgrade header` — возвращается 400.
- `[ds_send] WebSocket upgrade accepted, status=101` — апгрейд успешен.

По ним можно понять, доходит ли запрос до функции и с каким `Origin`/`Upgrade`.

### Отладка в браузере

1. Открыть **https://app.minimum.chat** (или тот origin, с которого идёт запрос).
2. **F12** → вкладка **Network**.
3. В фильтре выбрать **WS** (WebSocket).
4. Обновить страницу или выполнить действие, которое открывает сокет.
5. Клик по запросу к `ds_send`:
   - **Headers**: смотреть **Request URL**, **Status Code** (должен быть 101), **Request Headers** (есть ли `Upgrade: websocket`, какой `Origin`).
   - **Response Headers**: есть ли `Access-Control-Allow-Origin` и совпадает ли с вашим origin.
6. Вкладка **Console**: ошибки вида «WebSocket connection failed» или «bad response» означают, что сервер вернул не 101 (например 400/403) — смотреть в Network статус и в Supabase логи.

**Частые причины «bad response»:**

- В **Supabase → Edge Function Secrets** не указан origin приложения в `CORS_ALLOWED_ORIGINS` (для app.minimum.chat нужно `https://app.minimum.chat`).
- Прокси или CDN обрезают заголовок `Upgrade` (редко).

**«Failed to open group» / «Session not found»:** DS при подписке на группу проверяет, что `user_id` и `device_id` есть в таблицах **users** и **devices**. Если пользователь не проходил регистрацию через Edge Functions (auth_register) или схема БД не применена, запись не найдется. Нужно: применить схему (миграции / apply_schema.sql), зарегистрироваться через приложение заново, затем открывать группу.

После изменения секретов перезадеплой не нужен; после изменения кода функции — задеплоить заново.

---

## Краткая шпаргалка

| Что | Где |
|-----|-----|
| Frontend | Cloudflare Pages, домен app.minimum.chat (или minimum.chat) |
| Backend (API, WebSocket, DB) | Supabase |
| DNS | Cloudflare (зона minimum.chat) |
| SSL | Cloudflare (для minimum.chat), Supabase (для *.supabase.co) |

Переменные для сборки фронта (в Cloudflare Pages):  
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WS_URL`.

После выполнения шагов первая версия будет доступна по **https://app.minimum.chat** (или https://minimum.chat, в зависимости от выбранного custom domain).
