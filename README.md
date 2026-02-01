# PLE Platform

Post-Labor Economics Community Platform - A unified suite for enterprise architecture, content management, community engagement, and publishing.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Deployment

The built files will be in the `dist` folder. Deploy to any static hosting:

**Netlify:**
- Build command: `npm run build`
- Publish directory: `dist`

**Vercel:**
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

**Cloudflare Pages:**
- Build command: `npm run build`
- Build output directory: `dist`

## 📁 Project Structure

```
ple-platform/
├── index.html              # Main landing page
├── platform-home.html      # Platform dashboard
├── ea-hub.html             # Enterprise Architecture hub
├── content-hub.html        # Content management
├── community-hub.html      # Community management
├── publish-hub.html        # Publishing hub
├── ea-*.html               # EA tools (16 pages)
├── arch-*.html             # Architecture tools (30+ pages)
├── public/                 # Static assets
├── src/
│   ├── styles/            # Shared CSS
│   └── scripts/           # Shared JavaScript
├── package.json
└── vite.config.js
```

## 🏗️ Platform Suites

### Enterprise Architecture (16 tools)
- Business Motivation Model (BMM)
- Architecture Principles
- Capability Model
- Standards Catalog
- Building Blocks
- Value Streams
- Stakeholder Map
- Viewpoints & Views
- Gap Analysis
- Impact Analysis
- Architecture Roadmap
- Metamodel Reference
- Governance Dashboard
- Repository
- Alignment Checker

### Content Suite
- Content Hub
- Content Editor with architecture tagging
- Articles management
- Research documents

### Community Suite  
- Community Hub
- Member Directory
- Working Groups (mapped to capabilities)

### Publishing Suite
- Publishing Hub
- Multi-channel distribution
- Analytics

## 🎨 Design System

The platform uses a dark theme with:
- **Primary**: Indigo (#6366f1)
- **Background**: Near-black (#09090b)
- **Glassmorphism** effects on overlays
- **Lucide** icons throughout
- Responsive grid layouts

## ⌨️ Keyboard Shortcuts

- `⌘/Ctrl + K` - Open command palette
- `Escape` - Close modals/palette

## 📄 License

MIT License - Post-Labor Economics
