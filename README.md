# 🍦 Plain Vanilla Web App Template

**[English](./README.md)** | [繁體中文](./README_zh-TW.md)

> **[📍 View 2026 Evolution Roadmap](./ROADMAP.md)**

A modern, zero-dependency, zero-build web application template built in the spirit of **[Plain Vanilla Web](https://plainvanillaweb.com/)**.
We reject unnecessary layers of framework abstraction and embrace native browser platform capabilities, offering a high-performance, resilient, and educational foundation for modern web development.

> **💡 Inspired by [jsebrech/plainvanilla](https://github.com/jsebrech/plainvanilla).**

---

## 🍦 The Vanilla Philosophy

> 💡 **Discover why we prioritize "Standards over Frameworks, Zero Build, Security by Default, and Transparency":** <br>
> Read the **[Vanilla Manifesto](./docs/manifesto.md)**

---

## 📚 Documentation & Navigation Map

The project is organized into four core functional domains, matching the application's sidebar navigation (`Navbar`):

### 1. Overview & Core
- **Overview**: This `README.md` introduction.
- **Manifesto**: [Vanilla Manifesto](./docs/manifesto.md) — The guiding philosophy of evergreen code.
- **Architecture Guide**: [Comprehensive Architecture Overview](./docs/project-architecture-overview.md) — Deep dive into components, state, and rendering.
- **AI Agent Guide**: [AI Agent Knowledge & Example Library Guide](./docs/ai-agent-example-library.md) — Why this codebase is an ideal reference for AI coding agents.

### 2. Learning & Lab
- **📚 Technical Docs**: In-depth Markdown documentation parsed and rendered at runtime:
    - [Component Architecture Guide](./docs/component-architecture.md) — Reactive Custom Elements without a virtual DOM.
    - [SafeHTML & XSS Defense](./docs/safe-html-rendering.md) — Automatic escaping tagged template rendering.
    - [Service Pattern Standards](./docs/service-patterns.md) — Singleton services and event-driven architecture.
    - [Core Subsystems](./docs/) — Routing, state management, PWA, i18n, and more.
- **🧪 Interactive Lab**: 38+ self-contained labs showcasing cutting-edge native browser APIs (WebGPU, WebRTC, WebAuthn, Web Bluetooth, Web Serial, etc.).
- **🎡 Vanilla Playground**: Built-in WYSIWYG online code playground powered by native Blob and ObjectURL.

### 3. Developer Tools & Monitoring
- **📊 Developer Dashboard**: Real-time monitoring of IndexedDB storage, network traffic, and global Store state.
- **📈 Performance Analytics**: Native Canvas-based real-time visualization of Web Vitals (LCP, CLS).
- **⚡ Web Worker Demo**: Offloading heavy computations from the UI main thread.
- **🔍 Repo Search**: Responsive search interface integrating the GitHub REST API.

### 4. Account
- **👤 User Profile**: Authentication demonstration with LocalStorage/IndexedDB integration and Auth Guard protected routes.

---

## 🚀 Key Features

- **Cutting-Edge Web Platform APIs**:
    - **WebGPU & WASM**: Hardware-accelerated parallel computing (Compute Shaders) and streaming WebAssembly execution.
    - **WebRTC (P2P)**：Serverless, decentralized peer-to-peer data and media streaming.
    - **Native Speech**: Native Web Speech API integration for TTS (Text-to-Speech) and STT (Speech-to-Text).
    - **Hardware Access**: Web Bluetooth (BLE), Web Serial (hardware communication), and Screen Capture.
    - **WebAuthn**: Passwordless authentication with FaceID, TouchID, and physical FIDO2 security keys.
    - **Web NFC & Barcode Detection**: Physical NDEF tag read/write and native QR/Barcode scanning.
    - **WebCodecs & Media Streams**: Low-latency video decoding/encoding and real-time canvas stream filtering.
    - **Compression Streams**: Native streaming Gzip and Deflate compression and decompression.
- **E-Commerce Ready**:
    - **Payment Request API**: Standardized browser-native checkout interface.
- **Industrial-Grade Resilience**:
    - **SafeHTML by Default**: Tagged template literal rendering with automatic HTML entity escaping against XSS.
    - **Deep Reactive State**: Proxied state with `requestAnimationFrame` debouncing, input focus & cursor preservation, and `data-persistent` node caching.
    - **Offline Action Queue**: Automatic queuing of mutations during offline mode, synchronizing upon reconnect.
    - **Cross-Tab Synchronization**: Real-time state broadcasting across browser tabs via `BroadcastChannel`.
    - **Undo/Redo History**: Snapshot-based state history management.
    - **Virtual List**: High-performance rendering of 10,000+ items without frame drops.
    - **Storage Persistence**: Proactive storage quota requests to prevent eviction.
- **Zero-Build Developer Experience**:
    - **No Bundler, No Transpiler**: Pure ES Modules directly executed by the browser.
    - **Dynamic Code Splitting**: Route-level lazy loading via native dynamic `import()`.
    - **View Transitions**: Native single-page transition animations powered by `document.startViewTransition()`.
    - **Light & Dark Theming**: CSS Variables system with circular ripple transition animation.
    - **Vanilla SDK v1.0.0**: 40+ unified singleton services decoupled for CDN/external distribution.

---

## 📂 Project Structure

```text
.
├── app/                  # Application root & chrome layout (App.js)
├── assets/               # Static assets (images, locales: zh-TW, en-US)
├── components/           # Custom Element components
│   ├── pages/            # Top-level view pages (HomePage, Docs, Dashboard, Login...)
│   │   └── lab/          # 38+ cutting-edge Web API interactive labs
│   ├── route/            # Native router elements (<x-switch>, <x-route>)
│   └── ui/               # Reusable UI elements (Card, NativeChart, VirtualList, Modal...)
├── docs/                 # Runtime-loaded documentation (Markdown)
│   └── decisions/        # 90+ Architecture Decision Records (ADRs)
├── lib/                  # Core services & base classes
│   ├── base-component.js # Reactive Custom Element base class
│   ├── base-service.js   # EventTarget-backed singleton service base
│   ├── store.js          # Cross-tab proxied reactive state store
│   ├── html.js           # SafeHTML tagged template literal & XSS escape
│   ├── vanilla-sdk.js    # Aggregated industrial SDK entry point
│   └── ...               # Native services (WebGPU, WebRTC, Bluetooth, Crypto...)
├── workers/              # Web Worker scripts (off-thread compute, IDB backup)
├── tests/                # Tests (Node built-in test runner & browser.html)
├── index.html            # Single page entry point
├── index.css             # Global CSS design tokens & responsive styles
├── index.js              # Application bootstrapper & SW registration
├── sw.js                 # Service Worker (stale-while-revalidate & offline sync)
└── manifest.json         # PWA configuration & Web Share Target
```

---

## 🛠 Quick Start

Because this project relies on ES Modules and Service Workers, it **must be served over HTTP** (opening `index.html` via `file://` will not work):

```bash
# Using Python (built-in)
python3 -m http.server

# Or using npx
npx serve .
```

Open `http://localhost:8000/` in your browser.

---

## 🧪 Testing & Code Quality

No test frameworks or linters need to be installed. We utilize Node.js built-in tooling:

```bash
# Run all unit tests (Node.js built-in test runner)
node --test tests/*.test.js

# Run DOM & lifecycle tests in the browser
# Serve via HTTP and open http://localhost:8000/tests/browser.html

# Run syntax check across all JavaScript files
find . -name "*.js" -not -path "./node_modules/*" -not -path "./.git/*" | xargs -n 1 node -c
```

---

## 📄 Architecture Decision Records (ADR)

Significant architectural choices are strictly documented under [`docs/decisions/`](./docs/decisions/).
Run `node scripts/update-adr-index.js` to regenerate the ADR index after adding a new decision.

---

## License

[MIT License](./LICENSE)
