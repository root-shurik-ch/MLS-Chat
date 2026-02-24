import React from 'react';
import { Shield, Fingerprint, Zap, Globe, ArrowRight, Lock, EyeOff, Database } from 'lucide-react';
import { Button } from './ui/Button';

interface LandingPageProps {
  onGetStarted: () => void;
}

// ---------------------------------------------------------------------------
// i18n — inline translations, no external library
// ---------------------------------------------------------------------------

type Lang = 'en' | 'de' | 'ru';

const translations = {
  en: {
    nav: {
      login: 'Log in',
      getStarted: 'Get Started',
    },
    badge: {
      e2e: 'End-to-End Encrypted',
      activeDev: '⚡ Active Development — expect rapid iteration',
    },
    hero: {
      title1: 'Maximum Privacy.',
      title2: 'Zero Trust.',
      subtitle:
        'The next-generation chat app built with Messaging Layer Security (MLS) and Passkeys. Your keys stay on your device. We store only ciphertext. No exceptions.',
      cta: 'Start Chatting Securely',
      github: 'View on GitHub',
    },
    features: {
      heading: 'Uncompromising Architecture',
      subheading:
        'Built from the ground up to guarantee privacy without sacrificing user experience.',
      items: [
        {
          title: 'MLS Cryptography',
          desc: 'State-of-the-art Messaging Layer Security protocol. Key management and encryption happen entirely on your device.',
        },
        {
          title: 'Passkey Authentication',
          desc: 'Say goodbye to passwords. Hardware-backed, biometric logins via WebAuthn for maximum account security.',
        },
        {
          title: 'Multi-Device Sync',
          desc: 'Seamlessly synchronize your encrypted chat history across all your devices without compromising end-to-end security.',
        },
        {
          title: 'Cloud-Agnostic',
          desc: 'Flexible backend architecture. Deploy anywhere—starting with Supabase, entirely open-source.',
        },
      ],
    },
    howItWorks: {
      heading: 'How It Works',
      subheading: 'Every message follows this cryptographic path — no shortcuts, no backdoors.',
      steps: [
        { label: 'Passkey', detail: 'WebAuthn L3 · Ed25519' },
        { label: 'WASM MLS', detail: 'OpenMLS 0.7 · RFC 9420' },
        { label: 'Ciphertext', detail: 'AES-128-GCM · X25519' },
        { label: 'Supabase Relay', detail: 'WebSocket · Edge Fn' },
        { label: 'Recipient Decrypts', detail: 'WASM on-device' },
      ],
      techTitle: 'Cryptographic Primitives',
      tech: [
        { label: 'Protocol', value: 'MLS RFC 9420' },
        { label: 'Cipher suite', value: 'X25519 + AES-128-GCM + SHA-256 + Ed25519' },
        { label: 'Crypto engine', value: 'OpenMLS 0.7 (Rust → WASM)' },
        { label: 'Authentication', value: 'WebAuthn Level 3 / FIDO2 Passkeys' },
        { label: 'Key storage', value: 'IndexedDB — never leaves device' },
        { label: 'Transport', value: 'WebSocket via Supabase Edge Functions' },
      ],
    },
    zeroData: {
      heading: "We Can't Leak What We Don't Have",
      subheading:
        'Zero-knowledge by architecture — not by policy. We designed a system where leaking your data is technically impossible.',
      storedTitle: 'What we store',
      stored: [
        'Passkey public key (WebAuthn — no password)',
        'User ID + avatar URL',
        'MLS ciphertext (unreadable without your keys)',
        'Message sequence numbers + timestamps',
      ],
      neverTitle: 'What we never have',
      never: [
        'Your private keys (live in WASM + IndexedDB)',
        'Message plaintext (encrypted before leaving your device)',
        'Passwords (replaced by passkeys)',
        'Encryption keys (never reach the server)',
      ],
      legalTitle: 'Architectural Compliance',
      legal:
        'Because we process only ciphertext and public authentication data, classical data protection obligations under GDPR, CCPA, and similar frameworks — including right-to-erasure, data minimization, and breach notification for message content — are architecturally satisfied by design. There is no plaintext to protect, expose, or delete.',
    },
    footer: {
      license: 'Open Source · MIT License',
      domain: 'minimum.chat',
    },
  },

  de: {
    nav: {
      login: 'Anmelden',
      getStarted: 'Loslegen',
    },
    badge: {
      e2e: 'Ende-zu-Ende verschlüsselt',
      activeDev: '⚡ Aktive Entwicklung — erwarte schnelle Iteration',
    },
    hero: {
      title1: 'Maximale Privatsphäre.',
      title2: 'Zero Trust.',
      subtitle:
        'Die nächste Generation von Chat-Apps, gebaut mit Messaging Layer Security (MLS) und Passkeys. Deine Schlüssel bleiben auf deinem Gerät. Wir speichern nur Chiffretext. Keine Ausnahmen.',
      cta: 'Sicher chatten',
      github: 'Auf GitHub ansehen',
    },
    features: {
      heading: 'Kompromisslose Architektur',
      subheading:
        'Von Grund auf gebaut, um Privatsphäre ohne Einbußen bei der Benutzerfreundlichkeit zu garantieren.',
      items: [
        {
          title: 'MLS-Kryptografie',
          desc: 'Modernster Messaging Layer Security Protokoll. Schlüsselverwaltung und Verschlüsselung finden vollständig auf deinem Gerät statt.',
        },
        {
          title: 'Passkey-Authentifizierung',
          desc: 'Lebe ohne Passwörter. Hardware-gestützte biometrische Anmeldung via WebAuthn für maximale Kontosicherheit.',
        },
        {
          title: 'Multi-Gerät-Synchronisation',
          desc: 'Synchronisiere deinen verschlüsselten Chatverlauf nahtlos auf allen Geräten ohne die Ende-zu-Ende-Sicherheit zu gefährden.',
        },
        {
          title: 'Cloud-agnostisch',
          desc: 'Flexible Backend-Architektur. Überall einsetzbar — beginnend mit Supabase, vollständig Open Source.',
        },
      ],
    },
    howItWorks: {
      heading: 'So funktioniert es',
      subheading: 'Jede Nachricht folgt diesem kryptografischen Pfad — keine Abkürzungen, keine Hintertüren.',
      steps: [
        { label: 'Passkey', detail: 'WebAuthn L3 · Ed25519' },
        { label: 'WASM MLS', detail: 'OpenMLS 0.7 · RFC 9420' },
        { label: 'Chiffretext', detail: 'AES-128-GCM · X25519' },
        { label: 'Supabase-Relay', detail: 'WebSocket · Edge Fn' },
        { label: 'Empfänger entschlüsselt', detail: 'WASM auf Gerät' },
      ],
      techTitle: 'Kryptografische Primitive',
      tech: [
        { label: 'Protokoll', value: 'MLS RFC 9420' },
        { label: 'Cipher Suite', value: 'X25519 + AES-128-GCM + SHA-256 + Ed25519' },
        { label: 'Krypto-Engine', value: 'OpenMLS 0.7 (Rust → WASM)' },
        { label: 'Authentifizierung', value: 'WebAuthn Level 3 / FIDO2 Passkeys' },
        { label: 'Schlüsselspeicher', value: 'IndexedDB — verlässt nie das Gerät' },
        { label: 'Transport', value: 'WebSocket via Supabase Edge Functions' },
      ],
    },
    zeroData: {
      heading: 'Wir können nicht leaken, was wir nicht haben',
      subheading:
        'Zero-Knowledge durch Architektur — nicht durch Richtlinien. Wir haben ein System entworfen, bei dem das Leaken deiner Daten technisch unmöglich ist.',
      storedTitle: 'Was wir speichern',
      stored: [
        'Öffentlicher Passkey (WebAuthn — kein Passwort)',
        'Benutzer-ID + Avatar-URL',
        'MLS-Chiffretext (ohne deine Schlüssel unlesbar)',
        'Nachrichtensequenznummern + Zeitstempel',
      ],
      neverTitle: 'Was wir niemals haben',
      never: [
        'Deine privaten Schlüssel (WASM + IndexedDB)',
        'Klartextnachrichten (verschlüsselt bevor sie dein Gerät verlassen)',
        'Passwörter (ersetzt durch Passkeys)',
        'Verschlüsselungsschlüssel (erreichen niemals den Server)',
      ],
      legalTitle: 'Architektonische Compliance',
      legal:
        'Da wir ausschließlich Chiffretext und öffentliche Authentifizierungsdaten verarbeiten, sind klassische Datenschutzverpflichtungen gemäß DSGVO, CCPA und ähnlichen Rahmenwerken — einschließlich Recht auf Löschung, Datensparsamkeit und Benachrichtigungspflicht bei Datenpannen bezüglich Nachrichteninhalte — durch das Design architektonisch erfüllt. Es gibt keinen Klartext zu schützen, offenzulegen oder zu löschen.',
    },
    footer: {
      license: 'Open Source · MIT-Lizenz',
      domain: 'minimum.chat',
    },
  },

  ru: {
    nav: {
      login: 'Войти',
      getStarted: 'Начать',
    },
    badge: {
      e2e: 'Сквозное шифрование',
      activeDev: '⚡ Активная разработка — ожидайте быстрых обновлений',
    },
    hero: {
      title1: 'Максимальная приватность.',
      title2: 'Нулевое доверие.',
      subtitle:
        'Мессенджер нового поколения на основе Messaging Layer Security (MLS) и Passkeys. Ваши ключи остаются на устройстве. Мы храним только зашифрованный текст. Без исключений.',
      cta: 'Начать безопасный чат',
      github: 'Смотреть на GitHub',
    },
    features: {
      heading: 'Бескомпромиссная архитектура',
      subheading:
        'Построено с нуля для гарантии приватности без ущерба для удобства использования.',
      items: [
        {
          title: 'MLS-криптография',
          desc: 'Передовой протокол Messaging Layer Security. Управление ключами и шифрование происходят полностью на вашем устройстве.',
        },
        {
          title: 'Аутентификация Passkey',
          desc: 'Забудьте о паролях. Аппаратная биометрическая аутентификация через WebAuthn для максимальной защиты аккаунта.',
        },
        {
          title: 'Мульти-устройство',
          desc: 'Бесшовная синхронизация зашифрованной истории чатов на всех устройствах без ущерба для сквозной безопасности.',
        },
        {
          title: 'Независимость от облака',
          desc: 'Гибкая архитектура бэкенда. Развёртывайте где угодно — начиная с Supabase, полностью с открытым исходным кодом.',
        },
      ],
    },
    howItWorks: {
      heading: 'Как это работает',
      subheading: 'Каждое сообщение проходит этот криптографический путь — без ярлыков и бэкдоров.',
      steps: [
        { label: 'Passkey', detail: 'WebAuthn L3 · Ed25519' },
        { label: 'WASM MLS', detail: 'OpenMLS 0.7 · RFC 9420' },
        { label: 'Шифртекст', detail: 'AES-128-GCM · X25519' },
        { label: 'Supabase реле', detail: 'WebSocket · Edge Fn' },
        { label: 'Расшифровка', detail: 'WASM на устройстве' },
      ],
      techTitle: 'Криптографические примитивы',
      tech: [
        { label: 'Протокол', value: 'MLS RFC 9420' },
        { label: 'Cipher suite', value: 'X25519 + AES-128-GCM + SHA-256 + Ed25519' },
        { label: 'Крипто-движок', value: 'OpenMLS 0.7 (Rust → WASM)' },
        { label: 'Аутентификация', value: 'WebAuthn Level 3 / FIDO2 Passkeys' },
        { label: 'Хранилище ключей', value: 'IndexedDB — никогда не покидает устройство' },
        { label: 'Транспорт', value: 'WebSocket через Supabase Edge Functions' },
      ],
    },
    zeroData: {
      heading: 'Мы не можем слить то, чего у нас нет',
      subheading:
        'Zero-knowledge через архитектуру — не через политику. Мы спроектировали систему, в которой утечка ваших данных технически невозможна.',
      storedTitle: 'Что мы храним',
      stored: [
        'Публичный ключ Passkey (WebAuthn — без пароля)',
        'ID пользователя + URL аватара',
        'MLS-шифртекст (нечитаем без ваших ключей)',
        'Порядковые номера сообщений + временные метки',
      ],
      neverTitle: 'Чего у нас никогда нет',
      never: [
        'Ваши приватные ключи (WASM + IndexedDB)',
        'Открытый текст сообщений (шифруется до отправки)',
        'Пароли (заменены Passkeys)',
        'Ключи шифрования (никогда не достигают сервера)',
      ],
      legalTitle: 'Архитектурное соответствие',
      legal:
        'Поскольку мы обрабатываем только шифртекст и публичные данные аутентификации, классические обязательства по защите данных согласно GDPR, CCPA и аналогичным нормативным актам — включая право на удаление, минимизацию данных и уведомление об утечках содержимого сообщений — выполнены по дизайну архитектурно. Нет открытого текста, который нужно защищать, раскрывать или удалять.',
    },
    footer: {
      license: 'Открытый исходный код · Лицензия MIT',
      domain: 'minimum.chat',
    },
  },
} as const;

function useLang(): (typeof translations)[Lang] {
  const langs = [navigator.language, ...(navigator.languages ?? [])];
  for (const l of langs) {
    if (l.startsWith('de')) return translations.de;
    if (l.startsWith('ru')) return translations.ru;
  }
  return translations.en;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const t = useLang();

  const featureIcons = [
    <Shield className="w-6 h-6 text-purple-400" />,
    <Fingerprint className="w-6 h-6 text-blue-400" />,
    <Zap className="w-6 h-6 text-yellow-400" />,
    <Globe className="w-6 h-6 text-emerald-400" />,
  ];

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-500/30 overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-purple-500" />
            <span className="font-mono text-sm tracking-widest uppercase font-semibold">MLS-Chat</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onGetStarted} className="hidden md:flex text-white/70 hover:text-white">
              {t.nav.login}
            </Button>
            <Button onClick={onGetStarted} className="bg-white text-black hover:bg-white/90 rounded-full px-6">
              {t.nav.getStarted}
            </Button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 max-w-7xl mx-auto">
          {/* Background glowing effects */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Hero Content */}
            <div className="max-w-2xl text-center lg:text-left mx-auto lg:mx-0">
              {/* E2E badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-mono uppercase tracking-wider mb-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </span>
                {t.badge.e2e}
              </div>
              {/* Active Development badge */}
              <div className="flex justify-center lg:justify-start mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-mono tracking-wide">
                  {t.badge.activeDev}
                </div>
              </div>

              <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/50">
                {t.hero.title1} <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
                  {t.hero.title2}
                </span>
              </h1>
              <p className="text-lg md:text-xl text-white/40 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                {t.hero.subtitle}
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <Button
                  onClick={onGetStarted}
                  className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-full px-8 py-6 text-lg font-medium shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)] transition-all hover:scale-105"
                >
                  {t.hero.cta}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <a href="https://github.com/root-shurik-ch/MLS-Chat" target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                  <Button variant="ghost" className="w-full rounded-full px-8 py-6 text-lg text-white/70 hover:text-white border border-white/10 hover:bg-white/5">
                    {t.hero.github}
                  </Button>
                </a>
              </div>
            </div>

            {/* Hero Visual Mockup */}
            <div className="relative mx-auto w-full max-w-lg lg:max-w-none perspective-[2000px]">
              <div className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-2 shadow-2xl transform rotate-y-[-10deg] rotate-x-[5deg] hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-700 ease-out">
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-blue-500/10 rounded-2xl pointer-events-none" />
                <div className="rounded-xl overflow-hidden border border-white/5 bg-[#0A0A0A] aspect-[4/3] flex flex-col">
                  {/* Fake UI Header */}
                  <div className="h-12 border-b border-white/5 flex items-center px-4 gap-4 bg-white/[0.02]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="h-4 w-32 bg-white/5 rounded-full" />
                    </div>
                  </div>
                  {/* Fake UI Body */}
                  <div className="flex-1 flex p-4 gap-4">
                    <div className="w-1/3 hidden sm:flex flex-col gap-3 border-r border-white/5 pr-4">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex gap-3 items-center">
                          <div className="w-10 h-10 rounded-full bg-white/5 shrink-0" />
                          <div className="space-y-2 flex-1">
                            <div className="h-3 bg-white/10 rounded w-full" />
                            <div className="h-2 bg-white/5 rounded w-2/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="flex gap-3 items-end">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 shrink-0" />
                        <div className="bg-white/5 p-3 rounded-2xl rounded-bl-sm text-sm text-white/50 w-3/4">
                          <div className="h-2 bg-white/20 rounded w-full mb-2" />
                          <div className="h-2 bg-white/20 rounded w-4/5" />
                        </div>
                      </div>
                      <div className="flex gap-3 items-end justify-end">
                        <div className="bg-gradient-to-r from-purple-600/80 to-blue-600/80 p-3 rounded-2xl rounded-br-sm text-sm w-2/3 shadow-lg border border-purple-500/20">
                          <div className="h-2 bg-white/40 rounded w-full mb-2" />
                          <div className="h-2 bg-white/40 rounded w-1/2" />
                        </div>
                      </div>
                      <div className="mt-auto relative">
                        <div className="h-10 bg-white/5 rounded-full w-full border border-white/10 flex items-center px-4">
                          <div className="h-3 w-1/3 bg-white/10 rounded" />
                        </div>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-purple-500/50" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 border-t border-white/5 relative bg-black">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.features.heading}</h2>
              <p className="text-white/40 max-w-2xl mx-auto">{t.features.subheading}</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {t.features.items.map((feature, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {featureIcons[idx]}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works — Technical Stack */}
        <section className="py-24 border-t border-white/5 relative bg-black">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.howItWorks.heading}</h2>
              <p className="text-white/40 max-w-2xl mx-auto">{t.howItWorks.subheading}</p>
            </div>

            {/* Protocol flow */}
            <div className="flex flex-wrap justify-center items-center gap-2 mb-16">
              {t.howItWorks.steps.map((step, idx) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center gap-2">
                    <div className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-center min-w-[110px]">
                      <div className="text-xs font-mono text-purple-400 mb-1">0{idx + 1}</div>
                      <div className="text-sm font-semibold text-white">{step.label}</div>
                      <div className="text-xs font-mono text-white/30 mt-1">{step.detail}</div>
                    </div>
                  </div>
                  {idx < t.howItWorks.steps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-white/20 shrink-0 hidden sm:block" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Cryptographic primitives grid */}
            <div className="max-w-3xl mx-auto">
              <h3 className="text-sm font-mono text-white/40 uppercase tracking-widest mb-6 text-center">
                {t.howItWorks.techTitle}
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {t.howItWorks.tech.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-xs font-mono text-white/30 mt-0.5 shrink-0 w-28">{item.label}</span>
                    <span className="text-xs font-mono text-white/70">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Zero Data Architecture */}
        <section className="py-24 border-t border-white/5 relative bg-white/[0.01]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.zeroData.heading}</h2>
              <p className="text-white/40 max-w-2xl mx-auto">{t.zeroData.subheading}</p>
            </div>

            {/* Stored vs Never columns */}
            <div className="grid md:grid-cols-2 gap-6 mb-10 max-w-4xl mx-auto">
              {/* What we store */}
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-2 mb-5">
                  <Database className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-mono font-semibold text-blue-400 uppercase tracking-wider">
                    {t.zeroData.storedTitle}
                  </h3>
                </div>
                <ul className="space-y-3">
                  {t.zeroData.stored.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-white/60">
                      <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* What we never have */}
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-2 mb-5">
                  <EyeOff className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-mono font-semibold text-emerald-400 uppercase tracking-wider">
                    {t.zeroData.neverTitle}
                  </h3>
                </div>
                <ul className="space-y-3">
                  {t.zeroData.never.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-white/60">
                      <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Legal statement */}
            <div className="max-w-4xl mx-auto border-l-2 border-purple-500/30 pl-6 py-2 bg-white/[0.02] rounded-r-xl pr-6">
              <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-3">
                {t.zeroData.legalTitle}
              </p>
              <p className="text-sm text-white/50 leading-relaxed">{t.zeroData.legal}</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 text-center text-white/30 text-sm">
        <p>{t.footer.license}</p>
        <p className="mt-2 text-white/20 font-mono text-xs uppercase tracking-widest">{t.footer.domain}</p>
      </footer>
    </div>
  );
};

export default LandingPage;
