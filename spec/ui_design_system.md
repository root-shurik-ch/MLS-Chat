# UI/UX Design System: minimum.chat

## Philosophy: "Monochrome Security"
- **Strict Minimalism:** Eliminate all unnecessary visual noise. Focus on content and security.
- **Invisible Interface:** The UI should not compete for attention.
- **Security by Clarity:** Use clear visual metaphors for encryption and MLS states.

## Tech Stack
- **Framework:** React + Vite
- **Styling:** Tailwind CSS
- **Icons:** Lucide React (thin, geometric)
- **Components:** Radix UI (accessible primitives)

## Visual Style (Design Tokens)
- **Palette:** 100% Monochrome (except for errors).
  - `Background`: `#000000` (Pure Black)
  - `Surface`: `#000000` (Pure Black) with `border-white/8` or `bg-white/5` for depth.
  - `Text Primary`: `#FFFFFF` (Pure White)
  - `Text Secondary`: `rgba(255, 255, 255, 0.35)`
  - `Accents`: `rgba(255, 255, 255, 0.05)` for hovers/active states.
- **Typography:**
  - Font: **Geist** (sans) + **Geist Mono** (mono) — loaded via Google Fonts.
    ```html
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
    ```
  - Sizing: Message text `15px`. Label/meta text `10–12px` in `font-mono`.
  - Hierarchy: Use font weight (Semibold/Medium) and opacity instead of colors.
  - Labels (section titles, statuses): `font-mono text-[10px] uppercase tracking-widest text-white/30`
- **Borders:** 1px solid `rgba(255, 255, 255, 0.08)`. No shadows. No border-radius on containers.
- **Scrollbar:** 1px width, `rgba(255,255,255,0.1)` thumb.
- **Animations:** `animate-fade-up` (translateY 6px → 0, opacity 0 → 1, 200ms) on new messages and form reveals.

## UI Patterns

### 1. Main Layout
- **Sidebar:** Left-aligned, separated by a thin vertical line. List of chats with only names and "unread" white dots.
- **Chat View:** Clean list of messages. No "bubbles".
- **Input Area:** A single line at the bottom, underlined. Icons (paperclip, send) only appear on focus/typing.

### 2. Messaging
- **Message Style:** Terminal-like or text-editor-like.
  - **Header:** `[Sender Name] [Timestamp]` (minimal opacity for timestamp).
  - **Body:** Direct text below the header.
- **Files (Max 100MB):**
  - Display as a card with a 1px border.
  - Label: "Encrypted File" with a lock icon.
  - Progress: Thin white line.
- **MLS Status:** System messages in the chat flow: *"User X joined. Keys rotated."* in `text-white/40` and uppercase small caps.

### 3. Group Management
- **Members List:** Simple list with "Remove" button appearing on hover.
- **Invite Links:** Copyable string containing group identifier.
- **State Changes:** Clearly notify when the MLS group "Epoch" changes.

### 4. Onboarding: "The Key Ceremony"
- Step-by-step ritual for generating keys.
- Use full-screen layout with centered text and progress indicators.
- Explicitly mention: "Keys stay on your device. We store nothing but encrypted noise."
- Prompt for Passkey/Biometrics immediately after key generation.

## Component Library (Atoms & Molecules)

### Atoms
- **`Button`**: 
  - `Primary`: `bg-white text-black hover:bg-white/90 px-4 py-2 transition-all`
  - `Ghost`: `bg-transparent text-white border border-white/10 hover:bg-white/5`
  - `Icon`: `p-2 text-white/60 hover:text-white transition-colors`
- **`Input`**: 
  - `BottomLine`: `bg-transparent border-b border-white/10 focus:border-white px-0 py-2 outline-none transition-all w-full`
- **`Typography`**:
  - `Heading`: `text-xl font-bold tracking-tight`
  - `Body`: `text-[15px] leading-relaxed text-white/80`
  - `Mono`: `font-mono text-[13px] text-white/40` (for hashes/IDs)
- **`Avatar`**:
  - `Circle`: `w-10 h-10 rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-xs`

### Molecules
- **`ChatListItem`**:
  - Layout: `flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-all`
  - Elements: `Name (Left)`, `UnreadDot (Right, 6px white circle)`
- **`MessageItem`**:
  - Layout: `flex flex-col mb-6 px-4 group`
  - Header: `flex items-baseline space-x-2 mb-1` -> `[Sender: font-bold text-sm] [Time: text-[10px] opacity-30]`
  - Body: `text-sm text-white/90 whitespace-pre-wrap`
- **`FileCard`**:
  - Layout: `border border-white/10 p-3 bg-black flex items-center space-x-3 w-full max-w-sm`
  - Progress: `h-[1px] bg-white/10` with `bg-white` fill.
- **`SystemMessage`**:
  - Layout: `flex justify-center my-8`
  - Style: `text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium`

### Organisms (Layout Blocks)
- **`Sidebar`**: `w-80 border-r border-white/10 h-screen flex flex-col`
- **`ChatHeader`**: `h-16 border-b border-white/10 px-6 flex items-center justify-between`
- **`InputBar`**: `p-4 bg-black border-t border-white/5`

## Implementation Strategy for Coder Agent
1. **Setup Theme:** Configure `tailwind.config.js` with Geist fonts, custom animations (`fadeUp`, `fadeIn`).
2. **`index.html`:** Import Geist + Geist Mono from Google Fonts.
3. **`index.css`:** Minimal 1px scrollbar, `::selection` color, `.cursor-blink` animation for loading states.
4. **Base Components:** `Button` (primary/ghost/icon), `Input` (bottom-border), `Avatar` (circle).
5. **Chat Components:** `MessageItem` (with `animate-fade-up`), `FileCard`, `SystemMessage` (flanked by lines).
6. **Layout Shell:** Two-panel auth layout (branding left, forms right). Sidebar `17rem` with `border-white/8`.
7. **Auth Page:** Two-column — left column: static brand/manifesto list; right column: forms with `animate-fade-up`.
8. **Loading States:** Use `.cursor-blink` class on text during async operations instead of `...` ellipsis.
9. **Input Bar:** Terminal `›` prompt prefix before the message input field.
10. **Section Labels:** Always `font-mono text-[10px] uppercase tracking-widest text-white/30`.
