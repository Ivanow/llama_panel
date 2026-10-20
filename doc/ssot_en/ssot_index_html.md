# File Passport: `index.html` + `style.css`

**Path:** `llama_server/web_panel/templates/index.html` (and `static/style.css`)
**Role:** Provides the visual interface (UI).
Styling: **Glassmorphism** (translucent panels, `backdrop-filter` background blur).
Layout: responsive `CSS Grid`, which rearranges into a column on mobile devices.

## 1. Key Elements
- **Grid container** (`#instances-grid`): Card grid.
- **Create/Edit Modal** (`#addModal`): Includes input forms, explorer button, and "Configure" button (opens a hidden block with checkboxes).
- **File Explorer Modal** (`#explorerModal`): Nested modal (z-index 2000) that overlays the main form, dimming the background. Implements folder navigation.
