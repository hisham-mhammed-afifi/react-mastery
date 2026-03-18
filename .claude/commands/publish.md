You are building/updating the "React.js Mastery" course website. Follow these steps precisely.

## Step 1: Check if project exists

Look for a folder called "reactjs-mastery-site" in the current working directory.

- If it does NOT exist -> go to Step 2 (Full Setup)
- If it DOES exist -> go to Step 3 (Update Only)

## Step 2: Full Project Setup (first run only)

### 2.1 Scaffold Vite + React + TypeScript
```bash
npm create vite@latest reactjs-mastery-site -- --template react-ts
cd reactjs-mastery-site
npm install
```

### 2.2 Install dependencies
```bash
npm install react-router-dom react-markdown remark-gfm rehype-highlight rehype-raw gray-matter
npm install -D tailwindcss @tailwindcss/typography @tailwindcss/vite
```

### 2.3 Copy content folder

Copy the `content/` folder from the project root into `reactjs-mastery-site/public/content/`.
```bash
cp -r ../content ./public/content
```

### 2.4 Build the full site

Create the following structure and files. Use these design specs strictly:

#### Design System

- **Theme**: System-based dark/light mode using CSS variables and a manual toggle that overrides system preference. Persist choice in localStorage.
- **Color palette (Light)**: Background #FAFAF9, surface #FFFFFF, primary #6D5AE6 (vivid violet), accent #F59E0B (warm amber), text #1E1E2E, muted text #6B7280, code background #F3F0FF, borders #E5E7EB.
- **Color palette (Dark)**: Background #0F0F14, surface #1A1A24, primary #A78BFA (soft lavender), accent #FBBF24 (golden), text #E4E4E7, muted text #9CA3AF, code background #1E1B2E, borders #2D2D3A.
- **Typography**: Use Google Fonts. Headings: "Outfit" (bold, tracking tight). Body: "Nunito" (regular, 1.7 line-height). Code: "JetBrains Mono".
- **Border radius**: 12px for cards, 8px for buttons/inputs, 20px for badges.
- **Shadows (Light)**: 0 4px 24px rgba(109,90,230,0.08). Dark: 0 4px 24px rgba(0,0,0,0.3).
- **Transitions**: All interactive elements 0.25s cubic-bezier(0.4, 0, 0.2, 1).

#### Layout & Pages

**App structure:**
- `/` - Home/landing with hero section + list of all lessons
- `/lesson/:slug` - Individual lesson page rendering the markdown

**Home page:**
- Hero section with gradient background (primary to accent at 135deg, subtle), course title "React.js Mastery", a short tagline, and a "Start Learning" CTA button.
- Below hero: a grid of lesson cards (responsive: 1 col mobile, 2 col tablet, 3 col desktop).
- Each card shows: lesson title (extracted from first `# heading` in the md file), a short preview (first 100 chars of content), and a colored index badge.
- Cards have hover effect: subtle lift (translateY -4px), shadow increase, and a left border color accent animation.

**Lesson page:**
- Sticky top nav bar with back arrow, lesson title, and theme toggle.
- Centered content column (max-width 720px) with generous padding.
- Markdown rendered with full styling: headings with colored left borders, code blocks with syntax highlighting (use highlight.js via rehype-highlight with a theme that matches light/dark mode), blockquotes styled with a violet left bar, tables with alternating row colors, images responsive with rounded corners.
- Bottom nav: "Previous Lesson" / "Next Lesson" buttons.

**Animations:**
- Page load: stagger-fade-in for lesson cards (each card delayed by 50ms * index).
- Route transitions: gentle fade (opacity 0 to 1, 300ms).
- Hero title: slide-up + fade-in on mount.
- Scroll: lesson cards animate in when they enter viewport (use IntersectionObserver).
- Theme toggle: smooth color transitions on all themed elements (0.3s).

**Responsive breakpoints:**
- Mobile: < 640px (single column, compact padding, hamburger if nav grows)
- Tablet: 640px - 1024px (2 columns)
- Desktop: > 1024px (3 columns, wider content area)

**Additional details:**
- Favicon: use a simple inline SVG React icon as favicon.
- Page title updates dynamically per lesson.
- Accessible: proper heading hierarchy, focus states, aria labels on toggle, skip-to-content link.
- All markdown files are fetched at runtime from `/content/*.md` using fetch(). Create a manifest approach: generate a `content-manifest.json` in `public/` listing all md filenames by scanning the content folder at build time (write a small Node script in `scripts/generate-manifest.js` that runs as a prebuild step).

### 2.5 Configure for Vercel

- Add a `vercel.json` with rewrites so all routes fall back to `index.html`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 2.6 Update package.json scripts
```json
"scripts": {
  "dev": "node scripts/generate-manifest.js && vite",
  "prebuild": "node scripts/generate-manifest.js",
  "build": "tsc -b && vite build",
  "preview": "vite preview"
}
```

### 2.7 Build and verify
```bash
npm run build
```

Fix any TypeScript or build errors before finishing.

## Step 3: Update Only (subsequent runs)

When the project already exists:

### 3.1 Sync content
```bash
cd reactjs-mastery-site
rm -rf ./public/content
cp -r ../content ./public/content
```

### 3.2 Regenerate manifest
```bash
node scripts/generate-manifest.js
```

### 3.3 Check for new dependencies or issues

If any new markdown features are used (e.g., math, diagrams), install needed rehype/remark plugins.

### 3.4 Rebuild
```bash
npm run build
```

Fix any errors.


## Important Notes

- Never use em dashes in any generated content or code comments.
- Keep all code clean, typed (no `any`), and well-organized.
- Use CSS modules or Tailwind utility classes (Tailwind preferred for consistency).
- The content folder reference is always `public/content/` inside the project. If the `/next` command or any other command references the content path, update it to `public/content/`.
- If the build fails, diagnose and fix.