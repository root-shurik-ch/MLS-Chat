# Final Implementation Plan for MLS Chat MVP

## Обзор Фазы

Эта фаза представляет собой финальную реализацию MVP для MLS Chat — open-source чата с end-to-end шифрованием на базе Messaging Layer Security (MLS). MVP включает:

- Web-клиент (SPA) с поддержкой браузеров, включая iPhone.
- Authentication Service (AS) для регистрации и логина через WebAuthn.
- Delivery Service (DS) для доставки зашифрованных сообщений.
- Первичная реализация на Supabase с облачно-агностичной архитектурой.

Цель: Доставить функциональный MVP, где пользователи могут регистрироваться, создавать группы, отправлять и получать зашифрованные сообщения, с полным контролем криптографии на клиенте.

## Задачи

### High Priority

1. **Реализация MLS-слоя в WASM**
   - **Описание**: Создать WASM-библиотеку на базе MLS для клиента, включая TypeScript-обёртку. Обеспечить хранение всего MLS-состояния (деревья, ключи, история) на клиенте в IndexedDB.
   - **Acceptance Criteria**:
     - MLS-операции (key exchange, encryption/decryption) работают в браузере.
     - Состояние сохраняется локально и восстанавливается при перезагрузке.
     - Интеграция с WebCrypto для дополнительных ключей.
   - **Зависимости**: Доступ к MLS-спецификациям и WASM toolchain.

2. **Web-клиент UI и Core Logic**
   - **Описание**: Разработать SPA на React/Vue с компонентами для регистрации, логина, списка групп, чата, управления группами.
   - **Acceptance Criteria**:
     - UI адаптивен для мобильных устройств (включая iPhone).
     - Поддержка WebAuthn обязательна; ошибка если не поддерживается.
     - Сообщения отображаются с расшифровкой в реальном времени.
     - Клиент зависит только от абстрактных интерфейсов AuthService и DeliveryService.

3. **Authentication Service (AS) на Supabase**
   - **Описание**: Реализовать AS как Supabase Edge Function. Хранить профили пользователей, passkey данные, публичные MLS-ключи и зашифрованные приватные ключи.
   - **Acceptance Criteria**:
     - Регистрация и логин через WebAuthn API.
     - Никогда не хранит приватные MLS-ключи в открытом виде.
     - Соответствует протоколу из spec/auth_service.md.
     - WebAuthn обязателен: hardware keys, Android biometric, iOS Face ID/Touch ID.
     - Target browsers: Chrome 67+, Firefox 60+, Safari 14+, Edge 18+.
     - Если браузер не поддерживает — показать ошибку: "WebAuthn required. Update browser or use compatible device."

4. **Delivery Service (DS) на Supabase**
   - **Описание**: Реализовать DS как Supabase Realtime/WebSocket. Принимать и рассылать зашифрованные MLS-сообщения, назначать server_seq.
   - **Acceptance Criteria**:
     - WebSocket соединение с аутентификацией.
     - Монотонный server_seq по group_id.
     - Не расшифровывает mls_bytes.
     - Соответствует протоколу из spec/delivery_service.md.

5. **Интеграция WebAuthn и Key Management**
   - **Описание**: Внедрить WebAuthn в клиент для генерации и использования passkeys. Использовать PRF для вывода K_enc из passkey секрета для расшифровки mls_private_key_enc.
   - **Acceptance Criteria**:
     - Нет fallback на пароли — WebAuthn обязателен.
     - Поддержка всех типов: hardware keys, biometric.
     - Ошибка если navigator.credentials не поддерживается.

### Medium Priority

6. **Supabase Tables и Schema**
   - **Описание**: Создать и настроить таблицы: users, groups, group_members, messages, group_seq.
   - **Acceptance Criteria**: Схема соответствует спецификациям, с RLS политиками для безопасности.

7. **E2E Testing и Security Audit**
   - **Описание**: Написать тесты для шифрования, аутентификации, доставки сообщений.
   - **Acceptance Criteria**: Все тесты проходят; аудит подтверждает E2E шифрование без утечек.

### Low Priority

8. **Документация и Deployment**
   - **Описание**: Обновить README, spec файлы; настроить CI/CD для deployment на Vercel/Netlify.
   - **Acceptance Criteria**: Проект готов к open-source release.

## Зависимости

- Завершенные спецификации в spec/*.md.
- Доступ к Supabase project.
- WASM toolchain (Emscripten или аналог).
- MLS reference implementation (e.g., openmls).
- Браузеры для тестирования.

## Критерии Успеха

- Пользователи могут зарегистрироваться/залогиниться через WebAuthn.
- Создавать группы и приглашать участников.
- Отправлять и получать сообщения с end-to-end шифрованием.
- Все криптография на клиенте; серверы видят только шифртекст.
- MVP работает в target browsers без ошибок.

## Ресурсы

- Разработчики: 2-3 full-stack devs с опытом TypeScript, React, WASM, Supabase.
- Инструменты: Node.js, Rust (для WASM), Supabase CLI, GitHub.
- Время: 4-6 недель на фазу.

## Риски

- **WebAuthn Support**: Если пользовательский браузер не поддерживает WebAuthn (старые версии), показать четкую ошибку с инструкциями по обновлению или использованию compatible device. Риск: Пользователи на устаревших браузерах; Mitigation: Target modern browsers, fallback error.
- **MLS Complexity**: Реализация MLS в WASM может быть сложной; Mitigation: Использовать существующие библиотеки.
- **Security Leaks**: Неправильная обработка ключей; Mitigation: Code review и audit.
- **Performance**: Шифрование в браузере на мобильных; Mitigation: Оптимизировать WASM.
- **Supabase Limits**: Бесплатный tier ограничен; Mitigation: Мониторить использование, план на upgrade.