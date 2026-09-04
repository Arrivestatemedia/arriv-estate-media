# Arriv One Connect Chat — Replication Guide

> **Purpose:** Document every change made to Estate Media's chat tabs (rep + admin) so Arriv One can reproduce the same glassmorphic, transparent, brand-colored look and behavior — with Arriv One's own multi-tenant color palette.

---

## 1. Architecture Overview

Estate Media's Connect chat is built from **5 files**. Arriv One needs all five, with one variable swapped (the host accent color):

| File | Role |
|---|---|
| `src/components/chat/connectChat.css` | The glassmorphism design system — CSS variables + utility classes |
| `src/components/chat/ArrivOneConnectBadge.jsx` | The "Arriv One \| CONNECT" product identity badge |
| `src/components/sales/ChatTab.jsx` | The chat shell — sidebar + chat pane + background orbs |
| `src/components/sales/ChatSidebar.jsx` | Channel list, DM list, search, status picker |
| `src/components/sales/ChatWindow.jsx` | Message thread, input bar, reactions, threads, calls |
| `src/components/sales/FloatingChatBubble.jsx` | **Rep** — draggable gold bubble + panel (bottom-right corner anchors to bubble center) |
| `src/components/admin/AdminChatBubble.jsx` | **Admin** — fixed gold bubble + panel (same anchor logic) |

---

## 2. The CSS Design System (`connectChat.css`)

This is the heart of the look. **Copy this file verbatim** into Arriv One. The only change is the `--chat-accent` value under `[data-connect-chat="arriv_one"]`.

### 2.1 Host-Aware Theming Cascade

The entire chat is themed by a **single data attribute** on the root container:

```jsx
<div data-connect-chat="estate_media">
```

Arriv One uses:

```jsx
<div data-connect-chat="arriv_one">
```

The CSS cascade:

```css
/* Default (purple — the canonical Connect identity) */
[data-connect-chat] {
  --chat-accent: #4B2A78;
  --chat-accent-hover: #3E2263;
  --chat-on-accent: #FFFFFF;
  --chat-surface: rgba(255, 255, 255, 0.32);
  --chat-surface-light: rgba(255, 255, 255, 0.38);
  --chat-surface-bubble: rgba(255, 255, 255, 0.6);
  --chat-border: rgba(255, 255, 255, 0.5);
}

/* Arriv One host — swap these three for Arriv One's brand blue */
[data-connect-chat="arriv_one"] {
  --chat-accent: #2563EB;        /* ← Arriv One brand blue */
  --chat-accent-hover: #1D4ED8; /* ← darker blue for hover */
  --chat-on-accent: #FFFFFF;
}

/* Estate Media host — gold accent, cream-tinted surfaces */
[data-connect-chat="estate_media"] {
  --chat-accent: var(--accent-color, #B8956A);
  --chat-accent-hover: var(--accent-hover, #A68559);
  --chat-on-accent: var(--on-primary, #FFFFFF);
  --chat-surface: rgba(255, 251, 245, 0.5);       /* cream tint */
  --chat-surface-light: rgba(255, 251, 245, 0.35);
  --chat-surface-bubble: rgba(255, 251, 245, 0.6);
  --chat-border: rgba(184, 149, 106, 0.25);        /* gold-tinted border */
}
```

### 2.2 Multi-Tenant Color Injection (Arriv One Specific)

Arriv One is multi-tenant, so each tenant needs its own accent. Estate Media hardcodes gold; Arriv One should **inject the tenant accent at runtime** via inline CSS variables on the root container:

```jsx
// Arriv One ChatTab root — tenant-aware accent
<div
  data-connect-chat="arriv_one"
  style={{
    '--chat-accent': tenant.brand_color,         // e.g. "#2563EB"
    '--chat-accent-hover': tenant.brand_color_hover,
    '--chat-on-accent': tenant.brand_on_accent || '#FFFFFF',
  }}
>
```

This overrides the CSS-file defaults for that tenant. The glassmorphism surface classes (`--chat-surface`, `--chat-border`) can stay as the default white-tinted values, OR you can tint them per-tenant:

```jsx
style={{
  '--chat-accent': tenant.brand_color,
  '--chat-accent-hover': tenant.brand_color_hover,
  '--chat-surface': hexToRgba(tenant.brand_color, 0.05), // very light tint
  '--chat-border': hexToRgba(tenant.brand_color, 0.25),
}}
```

### 2.3 Glassmorphism Surface Classes

These are the **utility classes** applied throughout the chat components. They all use the CSS variables above, so they automatically pick up the tenant color:

| Class | Used On | Effect |
|---|---|---|
| `.glass-sidebar` | ChatSidebar root | Translucent sidebar with 22px blur |
| `.glass-header` | Top bars (badge bar, chat header) | Lighter translucent surface + bottom border |
| `.glass-chat` | ChatWindow root | Translucent chat background |
| `.glass-bubble-in` | Incoming message bubble | More opaque translucent surface + border |
| `.glass-bubble-out` | Outgoing message bubble | **Accent-colored** at 92% opacity + accent shadow |
| `.glass-input` | Search bar, message input | Translucent input field, accent border on focus |
| `.glass-panel` | Modals, dropdowns, emoji picker | Translucent panel with shadow |
| `.chat-accent-btn` | Send button, Create Channel button | Solid accent background |
| `.chat-row-active` | Selected channel/DM row | Accent background, white text |
| `.chat-initial-square` | Channel avatar square | 15% accent tint background, accent text |

Full CSS (copy verbatim):

```css
.glass-sidebar {
  background-color: var(--chat-surface);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border-right: 1px solid var(--chat-border);
}

.glass-header {
  background-color: var(--chat-surface-light);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border-bottom: 1px solid var(--chat-border);
}

.glass-chat {
  background-color: var(--chat-surface-light);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
}

.glass-bubble-in {
  background-color: var(--chat-surface-bubble);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--chat-border);
}

.glass-input {
  background-color: var(--chat-surface-bubble);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--chat-border);
}
.glass-input:focus {
  border-color: var(--chat-accent);
  box-shadow: 0 0 0 1px var(--chat-accent);
  outline: none;
}

.glass-panel {
  background-color: var(--chat-surface-light);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid var(--chat-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

.glass-bubble-out {
  background-color: color-mix(in srgb, var(--chat-accent) 92%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--chat-accent) 25%, transparent);
  border: 1px solid color-mix(in srgb, var(--chat-accent) 30%, transparent);
}

.chat-accent-btn {
  background-color: var(--chat-accent);
  color: var(--chat-on-accent);
}
.chat-accent-btn:hover {
  background-color: var(--chat-accent-hover);
}

.chat-row-active {
  background-color: var(--chat-accent);
  color: var(--chat-on-accent);
}

.chat-initial-square {
  background-color: color-mix(in srgb, var(--chat-accent) 15%, transparent);
  color: var(--chat-accent);
}
```

### 2.4 Background Orbs (Glassmorphism Needs a Colorful Backdrop)

Glassmorphism blurs what's **behind** the surface. Without a colorful backdrop, the blur is invisible. Estate Media places 3 blurred gold orbs behind the chat:

```jsx
<div className="connect-bg-orbs">
  <div className="connect-bg-orb" style={{ width: 300, height: 300, top: -60, left: -60, backgroundColor: "#B8956A" }} />
  <div className="connect-bg-orb" style={{ width: 250, height: 250, bottom: -40, right: -40, backgroundColor: "#D4B896" }} />
  <div className="connect-bg-orb" style={{ width: 200, height: 200, top: "30%", left: "40%", backgroundColor: "#E8D5B8" }} />
</div>
```

CSS:

```css
.connect-bg-orbs {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
  pointer-events: none;
}
.connect-bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.35;
}
[data-connect-chat="estate_media"] .connect-bg-orb {
  opacity: 0.18;  /* gold orbs are subtler */
}
```

**Arriv One:** Use three blue orbs (or tenant brand color) at the same positions. For multi-tenant, inject the orb colors via inline style from the tenant config.

---

## 3. The Product Identity Badge (`ArrivOneConnectBadge.jsx`)

This is the "Arriv One | CONNECT" wordmark in the header bar. It is **not** a logo — it's the canonical product identity. Copy verbatim.

```jsx
export function ArrivOneConnectBadge({ compact = false, className = "" }) {
  if (compact) {
    return (
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${className}`}
        style={{ backgroundColor: "#4B2A78" }} aria-label="Arriv One Connect">
        <span className="text-white text-[11px] font-bold leading-none">C</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span style={{ color: "#4e6ccf", fontSize: "11px", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em" }}>Arriv One</span>
      <span style={{ color: "#4e6ccf", fontSize: "11px", fontWeight: 600,
        textTransform: "uppercase" }}>|</span>
      <span style={{ backgroundColor: "#482d71", color: "#FFFFFF", fontSize: "11px",
        fontWeight: 700, textTransform: "uppercase",
        padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>Connect</span>
    </div>
  );
}
```

---

## 4. ChatTab — The Shell

The ChatTab is the container that sets `data-connect-chat`, renders the background orbs, the badge bar, and splits into sidebar + chat pane.

### 4.1 Root Container — The `data-connect-chat` Attribute

```jsx
<div className="flex flex-col h-full relative" data-connect-chat="estate_media">
```

**Arriv One:**
```jsx
<div className="flex flex-col h-full relative"
  data-connect-chat="arriv_one"
  style={{
    '--chat-accent': tenant.brand_color,
    '--chat-accent-hover': tenant.brand_color_hover,
  }}>
```

### 4.2 Full ChatTab Structure

```jsx
import "@/components/chat/connectChat.css";  // ← import the CSS!

export default function ChatTab({ currentUserId, currentUserName, isAdmin, ... }) {
  const [selectedChat, setSelectedChat] = useState(null);

  return (
    <div className="flex flex-col h-full relative" data-connect-chat="estate_media">
      {/* 1. Background orbs — behind everything, blurred for glassmorphism */}
      <div className="connect-bg-orbs">
        <div className="connect-bg-orb" style={{ width: 300, height: 300, top: -60, left: -60, backgroundColor: "#B8956A" }} />
        <div className="connect-bg-orb" style={{ width: 250, height: 250, bottom: -40, right: -40, backgroundColor: "#D4B896" }} />
        <div className="connect-bg-orb" style={{ width: 200, height: 200, top: "30%", left: "40%", backgroundColor: "#E8D5B8" }} />
      </div>

      {/* 2. Connect badge bar — glass-header */}
      <div className="relative z-10 glass-header px-4 py-2 flex items-center">
        <ArrivOneConnectBadge />
      </div>

      {/* 3. Chat shell — sidebar + chat pane */}
      <div className="flex flex-1 relative z-10 min-h-0">
        {/* Sidebar — full width on mobile, 288px on desktop */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-72`}>
          <ChatSidebar ... />
        </div>
        {/* Chat pane — hidden on mobile until a conversation is selected */}
        <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
          {selectedChat ? (
            <>
              {/* Mobile back button — glass-header */}
              <div className="flex items-center gap-2 px-3 py-2 glass-header md:hidden">
                <button onClick={() => setSelectedChat(null)} className="text-slate-700 flex items-center gap-1 text-sm">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-slate-800 text-sm font-medium truncate">{selectedChat.name}</span>
              </div>
              <ChatWindow ... />
            </>
          ) : (
            <div className="hidden md:flex items-center justify-center h-full text-slate-400 text-sm">
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Key z-index pattern:** Orbs are `z-0`, content is `z-10`. The glass surfaces sit between (they're translucent, so orbs show through).

---

## 5. ChatSidebar — Channels, DMs, Status

### 5.1 Root — `glass-sidebar`

```jsx
<div className="w-full h-full glass-sidebar flex flex-col">
```

### 5.2 Search Bar — `glass-input`

```jsx
<input
  placeholder="Search"
  className="glass-input rounded-full w-full pl-9 pr-9 py-2 text-sm text-slate-800 placeholder:text-slate-400"
/>
```

### 5.3 Channel Row — `chat-row-active` + `chat-initial-square`

```jsx
<button className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
  active ? "chat-row-active" : "text-slate-700 hover:bg-slate-200/60"
}`}>
  <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
    active ? "bg-white/20 text-white" : "chat-initial-square"
  }`}>
    {channelInitials(channel.name)}
  </div>
  <span className="truncate">{channel.name}</span>
</button>
```

### 5.4 DM Row — Avatar with Status Dot

The Avatar component uses `var(--chat-accent)` for the fallback background:

```jsx
<div className="rounded-full overflow-hidden flex items-center justify-center font-semibold"
  style={{
    backgroundColor: "var(--chat-accent)",
    color: "var(--chat-on-accent)",
  }}>
  {profileUrl ? <img .../> : initials}
</div>
```

### 5.5 Status Picker — `glass-panel` Dropdown

```jsx
<div className="absolute bottom-full left-0 mb-2 glass-panel rounded-lg p-1 w-44 z-50">
  {STATUSES.map(s => (
    <button onClick={() => handleSetStatus(s.value)}
      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-200/60 rounded transition-colors">
      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: s.color }} />
      {s.label}
    </button>
  ))}
</div>
```

### 5.6 New Channel Dialog — `glass-panel` Modal

```jsx
<div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  <div className="glass-panel rounded-2xl p-5 max-w-sm w-full">
    <input className="glass-input rounded-lg w-full px-3 py-2 text-sm ..." />
    <button className="w-full py-2.5 rounded-lg chat-accent-btn text-sm font-medium">
      Create Channel
    </button>
  </div>
</div>
```

---

## 6. ChatWindow — Messages, Input, Calls

### 6.1 Root — `glass-chat`

```jsx
<div className="flex flex-col h-full glass-chat">
```

### 6.2 Header — `glass-header`

```jsx
<div className="glass-header h-14 px-4 flex items-center justify-between">
```

### 6.3 Message Bubbles — `glass-bubble-in` / `glass-bubble-out`

```jsx
<div className={`px-3.5 py-2.5 rounded-2xl text-sm ${
  isOutgoing
    ? 'glass-bubble-out rounded-br-md text-white'
    : 'glass-bubble-in rounded-bl-md text-slate-800'
}`}>
  {renderMessageContent(msg.content, isOutgoing)}
</div>
```

### 6.4 Sender Avatar — Accent Background

```jsx
<div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm"
  style={{ backgroundColor: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}>
```

### 6.5 Input Bar — `glass-input` + `chat-accent-btn`

```jsx
<input
  className="flex-1 glass-input rounded-full px-4 py-2.5 text-sm border-transparent"
  placeholder="Message"
/>
<Button type="submit" size="icon" className="w-10 h-10 rounded-full chat-accent-btn">
  <Send className="w-4 h-4" />
</Button>
```

### 6.6 Emoji Picker — `glass-panel`

```jsx
<div className="absolute bottom-full left-0 mb-2 glass-panel rounded-xl p-2 flex flex-wrap gap-1 w-64 z-10">
```

### 6.7 Hover Colors — `var(--chat-accent)`

Throughout the ChatWindow, hover states use the accent CSS variable:

```jsx
className="text-slate-600 hover:text-[var(--chat-accent)] hover:bg-slate-100 rounded-lg transition"
```

This makes the phone icon, video icon, paperclip, smiley, and thread reply button all turn the tenant's brand color on hover.

---

## 7. FloatingChatBubble (Rep) — Draggable Bubble + Panel

### 7.1 The Bubble Button

- **Color:** `#B8956A` (gold) → Arriv One: `var(--chat-accent)` or tenant brand color
- **Size:** 56px (w-14 h-14)
- **Position:** Draggable via pointer events, persisted to `localStorage('floatingChatPos')`
- **Default:** bottom-right (`bottom: 1rem, right: 1rem`)

```jsx
<button
  className="fixed w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 select-none"
  style={{
    ...btnStyle,
    zIndex: 9000,
    backgroundColor: '#B8956A',  // ← Arriv One: tenant brand color
    cursor: dragging.current ? 'grabbing' : 'grab',
    touchAction: 'none',
  }}
>
  <MessageSquare className="w-6 h-6 text-white pointer-events-none" />
</button>
```

### 7.2 Panel Positioning — Bottom-Right Corner at Bubble Center

This is the key behavior: the panel's **bottom-right corner** sits at the **center of the bubble**.

```jsx
const panelWidth = Math.min(700, window.innerWidth - 16);
const panelHeight = 560;
const bubbleSize = 56;
const panelMargin = 8;

// Bubble position (from drag state or default bottom-right)
let bubbleX, bubbleY;
if (pos) {
  bubbleX = pos.x;
  bubbleY = pos.y;
} else {
  bubbleX = window.innerWidth - bubbleSize - 16;
  bubbleY = window.innerHeight - bubbleSize - 16;
}

// Panel's bottom-right corner = bubble's center
let panelLeft = bubbleX + bubbleSize / 2 - panelWidth;
let panelTop = bubbleY + bubbleSize / 2 - panelHeight;

// Clamp to viewport
panelLeft = Math.max(panelMargin, Math.min(panelLeft, window.innerWidth - panelWidth - panelMargin));
panelTop = Math.max(panelMargin, Math.min(panelTop, window.innerHeight - panelHeight - panelMargin));
```

### 7.3 Panel Container — Cream/Gold Transparent Backdrop

```jsx
<div
  className="fixed rounded-xl shadow-2xl overflow-hidden"  // ← NO "relative"! (breaks fixed positioning)
  style={{
    left: `${panelLeft}px`,
    top: `${panelTop}px`,
    width: `${panelWidth}px`,
    height: `${panelHeight}px`,
    background: 'rgba(255, 251, 245, 0.88)',           // ← cream translucent
    border: '1px solid rgba(184, 149, 106, 0.3)',       // ← gold border
    zIndex: 9000,
  }}
>
  <button onClick={() => setOpen(false)}
    className="absolute top-2 right-2 z-50 w-8 h-8 rounded-full bg-[#B8956A]/20 hover:bg-[#B8956A]/40 text-[#2a3536] flex items-center justify-center transition-colors">
    <X className="w-4 h-4" />
  </button>
  <div className="h-full">
    <ChatTab currentUserId={userId} currentUserName={userName} ... />
  </div>
</div>
```

**⚠️ CRITICAL:** Do NOT add `relative` to the panel's className. `fixed` + `relative` conflict — `relative` can override `fixed` and break the viewport positioning.

### 7.4 Drag Logic (Pointer Events)

```jsx
const onPointerDown = (e) => {
  let startPos = pos;
  if (!startPos) {
    startPos = { x: window.innerWidth - 56 - 16, y: window.innerHeight - 56 - 16 };
    setPos(startPos);
  }
  dragging.current = true;
  dragMoved.current = false;
  dragStart.current = { x: e.clientX, y: e.clientY, posX: startPos.x, posY: startPos.y };
  e.currentTarget.setPointerCapture?.(e.pointerId);
};

const onPointerMove = (e) => {
  if (!dragging.current) return;
  const dx = e.clientX - dragStart.current.x;
  const dy = e.clientY - dragStart.current.y;
  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragMoved.current = true;
  const next = clampPos(dragStart.current.posX + dx, dragStart.current.posY + dy);
  setPos(next);
};

const onPointerUp = (e) => {
  if (!dragging.current) return;
  dragging.current = false;
  e.currentTarget.releasePointerCapture?.(e.pointerId);
  if (dragMoved.current) {
    setPos(prev => { localStorage.setItem('floatingChatPos', JSON.stringify(prev)); return prev; });
  } else {
    handleToggleChat();  // click (not drag) → open panel
  }
};
```

---

## 8. AdminChatBubble — Fixed Bubble + Panel

Identical to FloatingChatBubble **except**:
- **No drag logic** — the admin bubble is fixed at `bottom: 1rem, right: 1rem`
- Panel positioning uses the same bottom-right-corner-at-bubble-center math
- Passes `isAdmin={true}` to ChatTab

```jsx
const bubbleX = window.innerWidth - 56 - 16;
const bubbleY = window.innerHeight - 56 - 16;
let panelLeft = bubbleX + 28 - panelWidth;
let panelTop = bubbleY + 28 - panelHeight;
panelLeft = Math.max(8, Math.min(panelLeft, window.innerWidth - panelWidth - 8));
panelTop = Math.max(8, Math.min(panelTop, window.innerHeight - panelHeight - 8));
```

---

## 9. Multi-Tenant Implementation for Arriv One

### 9.1 Tenant Config Entity

Arriv One should store brand colors per tenant:

```jsonc
// base44/entities/Tenant.jsonc
{
  "name": "Tenant",
  "type": "object",
  "properties": {
    "brand_color": { "type": "string", "description": "Primary accent hex, e.g. #2563EB" },
    "brand_color_hover": { "type": "string", "description": "Darker shade for hover" },
    "brand_on_accent": { "type": "string", "default": "#FFFFFF" },
    "brand_surface_tint": { "type": "string", "description": "Light tint for glass surfaces" },
    "brand_orb_colors": { "type": "array", "items": { "type": "string" }, "description": "3 hex colors for background orbs" }
  }
}
```

### 9.2 Injecting Tenant Colors at Runtime

In ChatTab, inject the tenant's colors as CSS variables on the root div:

```jsx
function ChatTab({ tenant, ...props }) {
  return (
    <div
      className="flex flex-col h-full relative"
      data-connect-chat="arriv_one"
      style={{
        '--chat-accent': tenant?.brand_color || '#2563EB',
        '--chat-accent-hover': tenant?.brand_color_hover || '#1D4ED8',
        '--chat-on-accent': tenant?.brand_on_accent || '#FFFFFF',
        '--chat-surface': tenant?.brand_surface_tint || 'rgba(255, 255, 255, 0.32)',
        '--chat-border': hexToRgba(tenant?.brand_color || '#2563EB', 0.25),
      }}
    >
      <div className="connect-bg-orbs">
        <div className="connect-bg-orb" style={{ width: 300, height: 300, top: -60, left: -60,
          backgroundColor: tenant?.brand_orb_colors?.[0] || '#2563EB' }} />
        <div className="connect-bg-orb" style={{ width: 250, height: 250, bottom: -40, right: -40,
          backgroundColor: tenant?.brand_orb_colors?.[1] || '#3B82F6' }} />
        <div className="connect-bg-orb" style={{ width: 200, height: 200, top: "30%", left: "40%",
          backgroundColor: tenant?.brand_orb_colors?.[2] || '#93C5FD' }} />
      </div>
      {/* ... rest of ChatTab ... */}
    </div>
  );
}
```

### 9.3 Bubble Color Per Tenant

The floating bubble button should also use the tenant color:

```jsx
style={{
  backgroundColor: tenant?.brand_color || '#2563EB',
}}
```

### 9.4 Panel Backdrop Per Tenant

The panel's translucent background can also be tinted:

```jsx
style={{
  background: hexToRgba(tenant?.brand_surface_tint || '#FFFFFF', 0.88),
  border: `1px solid ${hexToRgba(tenant?.brand_color || '#2563EB', 0.3)}`,
}}
```

---

## 10. Summary — What to Copy vs. What to Change

### Copy Verbatim (no changes):
1. `connectChat.css` — the entire glassmorphism class system
2. `ArrivOneConnectBadge.jsx` — the product identity badge
3. `ChatSidebar.jsx` — channel/DM/status UI (uses CSS variables, auto-themes)
4. `ChatWindow.jsx` — message thread/input (uses CSS variables, auto-themes)
5. The drag logic in `FloatingChatBubble.jsx`
6. The panel positioning math (bottom-right corner at bubble center)

### Change for Arriv One:
1. `data-connect-chat="estate_media"` → `data-connect-chat="arriv_one"`
2. `--chat-accent: #B8956A` → `--chat-accent: <tenant brand color>`
3. Background orb colors: gold → blue (or tenant brand)
4. Bubble button `backgroundColor: '#B8956A'` → tenant brand color
5. Panel `background: 'rgba(255, 251, 245, 0.88)'` → `rgba(255, 255, 255, 0.88)` (or tenant tint)
6. Panel `border: '1px solid rgba(184, 149, 106, 0.3)'` → `1px solid rgba(<brand>, 0.3)`
7. Close button `bg-[#B8956A]/20` → `bg-[<brand>]/20`
8. **Add tenant config injection** — load tenant brand colors and inject as CSS variables on the ChatTab root

### Behavior (identical, no changes needed):
- Click bubble → panel opens with bottom-right corner at bubble center
- Drag bubble → repositions, persisted to localStorage
- Panel contains ChatTab (sidebar + chat pane)
- Glassmorphism surfaces blur the background orbs
- All accent colors (buttons, active rows, outgoing bubbles, hover states) use `var(--chat-accent)` and auto-theme

---

## 10. Cross-App Chat Bridge (Real-Time Messaging Between Apps)

> **Purpose:** Allow a user in Estate Media's Chattab to send direct messages to a user in Arriv One's Chattab — and vice versa — in real time, restricted to same-company contacts.

### 10.1 Architecture

The bridge uses the **same HMAC-signed webhook pattern** as the existing entity sync system (`syncEnvelope.ts`). Chat messages are append-only events (not mutable records), so they bypass the sync mapping/conflict machinery and use a dedicated, simpler handler.

```
Estate Media user types message
  → sendCrossAppChatMessage function
    → creates ChatMessage locally (origin_app=estate_media)
    → POSTs HMAC-signed envelope to Arriv One's chat webhook
      → Arriv One's receiveEstateMediaChatMessage function
        → validates HMAC, checks same-company, deduplicates
        → creates ChatMessage in Arriv One (origin_app=estate_media)

Arriv One user types message
  → Arriv One's sendEstateMediaChatMessage function
    → creates ChatMessage locally (origin_app=arriv_one)
    → POSTs HMAC-signed envelope to Estate Media's chat webhook
      → receiveArrivOneChatMessage function
        → validates HMAC, checks same-company, deduplicates
        → creates ChatMessage in Estate Media (origin_app=arriv_one)
        → real-time subscription fires → message appears in Chattab
```

### 10.2 Channel ID Convention (SHARED — both apps must match)

Cross-app DMs use a **deterministic channel ID** from the two participants' emails:

```
cross_app_dm:<lower_email_alphabetically_first>:<lower_email_alphabetically_second>
```

Example: `brad@arrivestatemedia.com` chatting with `sarah@arrivestatemedia.com` →
`cross_app_dm:brad@arrivestatemedia.com:sarah@arrivestatemedia.com`

Both apps compute the same ID, so messages from both sides land in the same conversation.

### 10.3 Same-Company Gate

Cross-app chat is restricted to users with the **same email domain**. The backend checks `getEmailDomain(sender_email) === getEmailDomain(recipient_email)` before accepting any message. This prevents cross-company data leakage.

### 10.4 Estate Media Side (ALREADY IMPLEMENTED)

Estate Media has three backend functions and entity changes in place:

| Component | Path | Purpose |
|---|---|---|
| `sendCrossAppChatMessage` | `base44/functions/sendCrossAppChatMessage/entry.ts` | Creates local ChatMessage + POSTs to Arriv One webhook |
| `receiveArrivOneChatMessage` | `base44/functions/receiveArrivOneChatMessage/entry.ts` | Webhook receiver — validates HMAC, creates inbound ChatMessage |
| `listArrivOneChatContacts` | `base44/functions/listArrivOneChatContacts/entry.ts` | Queries Person entity for same-domain Arriv One users |
| `crossAppChat.ts` | `base44/shared/crossAppChat.ts` | Shared helpers: channel ID, email domain, same-company check |
| `ChatMessage.jsonc` | `base44/entities/ChatMessage.jsonc` | Added `origin_app`, `cross_app_channel_id`, `remote_message_id`, `sender_email` |
| `ChatChannel.jsonc` | `base44/entities/ChatChannel.jsonc` | Added `is_cross_app`, `cross_app_channel_id`, `participant_emails` |

**Secrets used:**
- `ARRIV_ONE_CHAT_WEBHOOK_URL` — full URL of Arriv One's chat receiver endpoint
- `ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET` — HMAC signing (Estate Media → Arriv One)
- `ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET` — HMAC verification (Arriv One → Estate Media)

**Frontend changes:**
- `ChatSidebar.jsx` — new "Arriv One" section showing same-company contacts from `listArrivOneChatContacts`
- `ChatWindow.jsx` — handles `chatType === "cross_app_dm"`: loads by `cross_app_channel_id`, subscribes to ChatMessage, sends via `sendCrossAppChatMessage`
- `ChatTab.jsx` — resolves `currentUserEmail` and passes to sidebar + window

### 10.5 Arriv One Side (TO BE IMPLEMENTED)

Arriv One needs to build the **mirror image** of the Estate Media side:

#### 10.5.1 Backend Functions

1. **`receiveEstateMediaChatMessage`** (webhook endpoint)
   - Validates HMAC using the **same shared secret** (`ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET` from Arriv One's perspective = `ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET` from Estate Media's perspective — both apps share the same secret value)
   - Wait — actually the secrets are directional. Arriv One needs:
     - `ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET` — for signing messages Arriv One → Estate Media (same value as Estate Media's inbound secret)
     - `ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET` — for verifying messages from Estate Media (same value as Estate Media's outbound secret)
   - Validates `source_application === "estate_media"`, `destination_application === "arriv_one"`
   - Checks same-company (email domain match)
   - Deduplicates by `remote_message_id`
   - Creates ChatMessage locally with `origin_app: "estate_media"`

2. **`sendEstateMediaChatMessage`** (user-facing function)
   - Creates ChatMessage locally with `origin_app: "arriv_one"`
   - Builds HMAC-signed envelope (same format as Estate Media's, but `source_application: "arriv_one"`, `destination_application: "estate_media"`)
   - POSTs to Estate Media's webhook: `https://arrivestatemedia.base44.app/functions/receiveArrivOneChatMessage`
   - Secret: `ESTATE_MEDIA_ARRIV_ONE_CHAT_WEBHOOK_URL` (Arriv One's secret pointing to Estate Media's endpoint)

3. **`listEstateMediaChatContacts`** (user-facing function)
   - Queries Arriv One's Person entity for people with Estate Media roles and same email domain
   - Returns contact list for the sidebar

#### 10.5.2 Entity Changes

Arriv One's `ChatMessage` entity needs the same fields:
- `origin_app` — `"estate_media" | "arriv_one"`
- `cross_app_channel_id` — deterministic channel ID
- `remote_message_id` — for dedup
- `sender_email` — for same-company verification

#### 10.5.3 Frontend Changes

Mirror the Estate Media frontend changes:
- ChatSidebar — add "Estate Media" section showing same-company Estate Media contacts
- ChatWindow — handle `chatType === "cross_app_dm"` with the same channel ID convention
- ChatTab — resolve current user's email and pass to sidebar + window

#### 10.5.4 Secrets to Set in Arriv One

| Secret Name | Value |
|---|---|
| `ESTATE_MEDIA_ARRIV_ONE_CHAT_WEBHOOK_URL` | `https://arrivestatemedia.base44.app/functions/receiveArrivOneChatMessage` |
| `ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET` | Same value as Estate Media's `ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET` |
| `ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET` | Same value as Estate Media's `ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET` |

### 10.6 HMAC Envelope Format for Chat Messages

The envelope uses the **exact same format** as entity sync (`syncEnvelope.ts`):

```json
{
  "event_id": "<uuid>",
  "event_type": "chat.message.sent",
  "schema_version": "1.0.0",
  "signature_version": "sync_hmac_v1",
  "source_application": "estate_media",
  "destination_application": "arriv_one",
  "tenant_id": "tnt_estate_media",
  "entity_type": "ChatMessage",
  "entity_id": "<local message UUID>",
  "immutable_shared_id": "<cross_app_channel_id>",
  "operation": "create",
  "occurred_at": "<ISO timestamp>",
  "source_updated_at": "<ISO timestamp>",
  "record_version": 1,
  "idempotency_key": "<message_id>|<timestamp>|create",
  "payload": {
    "message_id": "<local UUID>",
    "channel_id": "<cross_app_channel_id>",
    "sender_id": "<sender user ID>",
    "sender_name": "<sender full name>",
    "sender_email": "<sender email>",
    "recipient_email": "<recipient email>",
    "content": "<message text>",
    "timestamp": "<ISO timestamp>"
  },
  "signature_timestamp": "<ISO timestamp>",
  "signature_nonce": "<random nonce>",
  "signature": "<HMAC-SHA256 hex>"
}
```

The canonical signing string (11 pipe-delimited fields, same as entity sync):
```
source_application|destination_application|tenant_id|entity_type|immutable_shared_id|record_version|operation|occurred_at|signature_timestamp|signature_nonce|sha256(payload)
```

### 10.7 Person Entity Prerequisite

The `listArrivOneChatContacts` function queries the **Person entity** for people with `arriv_employee_id` set. For cross-app contacts to appear in the sidebar, Person records must exist linking Estate Media users to their Arriv One employee IDs. This is populated by the existing Person model / `resolvePerson` infrastructure.

If Person records are not yet populated, the "Arriv One" section in the sidebar will show "No same-company contacts" until they are.