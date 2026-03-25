# Part 4, Chapter 9: Server-Side React

## What You Will Learn

- Compare CSR, SSR, SSG, and ISR rendering strategies and select the appropriate one for a given use case based on data freshness requirements, SEO needs, and performance constraints
- Explain how server-side rendering works at the API level, from `renderToString` through hydration, and identify the performance bottleneck that streaming SSR solves
- Diagnose and fix hydration mismatch errors by understanding the contract between server-rendered HTML and client-side React reconciliation
- Articulate the React Server Components mental model, including the serialization boundary between server and client component trees
- Apply a decision framework for choosing between Server Components and Client Components based on data access patterns, interactivity needs, and bundle size considerations
- Implement common Next.js App Router patterns including layouts, server actions, caching strategies, and data fetching in Server Components
- Configure streaming SSR with Suspense boundaries to enable progressive page loading and selective hydration

---

## 9.1 CSR vs SSR vs SSG vs ISR: When to Use Each

Modern React applications can render content using four distinct strategies. Each strategy represents a different answer to the fundamental question: when and where does HTML get generated? Understanding the tradeoffs is essential for making architecture decisions that affect performance, SEO, infrastructure costs, and developer experience.

### Client-Side Rendering (CSR)

In client-side rendering, the server delivers a minimal HTML document containing an empty root element and a JavaScript bundle. The browser downloads the bundle, executes it, and React builds the entire DOM tree on the client.

```javascript
// What the server sends for a CSR application
// index.html
<!DOCTYPE html>
<html>
  <head>
    <title>My App</title>
    <script defer src="/bundle.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <!-- No content here. The page is blank until JS executes. -->
  </body>
</html>
```

```javascript
// bundle.js - React takes over on the client
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
```

**The CSR timeline:**

```
Server responds          JS downloads         JS executes          Data fetches         UI ready
     │                       │                    │                    │                   │
     ▼                       ▼                    ▼                    ▼                   ▼
┌─────────┐           ┌───────────┐        ┌───────────┐        ┌──────────┐       ┌──────────┐
│  Empty   │──────────▶│  Download │───────▶│  Parse &  │───────▶│  Fetch   │──────▶│ Rendered │
│  HTML    │           │  Bundle   │        │  Execute  │        │  Data    │       │  + Ready │
└─────────┘           └───────────┘        └───────────┘        └──────────┘       └──────────┘
```

**Strengths:**

- Simplest deployment model (static file hosting, CDN)
- Rich interactivity after initial load
- No server infrastructure required at runtime
- Full client-side transitions with no server round-trips

**Weaknesses:**

- Poor SEO for content that search engines need to index (crawlers may not execute JavaScript reliably)
- Slow Time to First Contentful Paint (FCP); users see a blank page until JavaScript loads and executes
- Waterfall problem: HTML loads, then JS loads, then data fetches, then content appears
- Large bundle sizes increase time to interactive

**When to use CSR:** Internal dashboards, admin panels, authenticated applications where SEO is irrelevant, and applications where infrastructure simplicity outweighs initial load performance.

### Server-Side Rendering (SSR)

In server-side rendering, the server executes React components for each request, generates the full HTML, and sends it to the browser. The browser displays the HTML immediately (fast FCP), then downloads and executes JavaScript to "hydrate" the page, attaching event handlers and making it interactive.

```javascript
// Simplified Express server with React SSR
import express from 'express';
import { renderToString } from 'react-dom/server';
import { App } from './App';

const app = express();

app.get('*', async (req, res) => {
  // Fetch data the page needs
  const data = await fetchPageData(req.url);

  // Render React components to an HTML string
  const html = renderToString(<App url={req.url} data={data} />);

  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>My App</title></head>
      <body>
        <div id="root">${html}</div>
        <script>
          // Embed the data so the client can hydrate without re-fetching
          window.__INITIAL_DATA__ = ${JSON.stringify(data)};
        </script>
        <script src="/bundle.js"></script>
      </body>
    </html>
  `);
});
```

```javascript
// Client-side hydration
import { hydrateRoot } from 'react-dom/client';
import { App } from './App';

// hydrateRoot attaches event handlers to existing server-rendered HTML
// instead of re-creating the DOM from scratch
hydrateRoot(
  document.getElementById('root'),
  <App url={window.location.pathname} data={window.__INITIAL_DATA__} />
);
```

**The SSR timeline:**

```
Request          Server renders         HTML sent          JS downloads        Hydration          Interactive
   │                  │                    │                    │                  │                   │
   ▼                  ▼                    ▼                    ▼                  ▼                   ▼
┌──────┐        ┌───────────┐        ┌──────────┐       ┌───────────┐      ┌──────────┐       ┌──────────┐
│Client│───────▶│  Fetch +  │───────▶│  Visual  │──────▶│  Download │─────▶│ Hydrate  │──────▶│  Fully   │
│  Req │        │  Render   │        │  Content │       │  Bundle   │      │  (attach │       │ Interactive│
└──────┘        └───────────┘        └──────────┘       └───────────┘      │  events) │       └──────────┘
                                                                           └──────────┘
```

**Strengths:**

- Fast FCP; users see content before JavaScript loads
- SEO-friendly; crawlers receive fully rendered HTML
- Data fetching happens on the server, closer to databases and APIs (lower latency)
- Reduced client-side waterfall

**Weaknesses:**

- Higher Time to First Byte (TTFB); the server must finish rendering before sending any response
- Requires a running server (Node.js process), increasing infrastructure complexity
- Server load scales with traffic; each request triggers a full render
- The page is visible but not interactive until hydration completes (the "uncanny valley")

**When to use SSR:** Public-facing pages that need SEO and fast perceived load times, pages with personalized or frequently changing content, and e-commerce product pages where both SEO and fresh data matter.

### Static Site Generation (SSG)

Static site generation renders pages at build time rather than at request time. The build process generates HTML files for every page, which are then served directly from a CDN with no server computation per request.

```javascript
// Next.js SSG example (Pages Router for clarity)
// pages/blog/[slug].js

export async function getStaticPaths() {
  // Determine which pages to pre-render at build time
  const posts = await fetchAllPosts();
  const paths = posts.map(post => ({
    params: { slug: post.slug }
  }));

  return {
    paths,
    fallback: false // Return 404 for unknown slugs
  };
}

export async function getStaticProps({ params }) {
  // Fetch data at build time; this code never runs in the browser
  const post = await fetchPost(params.slug);

  return {
    props: { post }
  };
}

export default function BlogPost({ post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
```

**Strengths:**

- Fastest possible TTFB (pre-built HTML served from CDN edge)
- No server runtime needed; scales to unlimited traffic at minimal cost
- Maximum reliability; no server to crash
- Excellent SEO

**Weaknesses:**

- Build times grow with the number of pages (can become very slow for large sites)
- Content is stale until the next build
- Not suitable for personalized or frequently changing content
- Rebuilding the entire site for a single content change is wasteful

**When to use SSG:** Marketing pages, documentation sites, blogs, landing pages, and any content that changes infrequently and does not vary per user.

### Incremental Static Regeneration (ISR)

ISR combines the speed of static generation with the freshness of server-side rendering. Pages are statically generated at build time but can be revalidated in the background after a specified time interval. When a user requests a stale page, the CDN serves the cached version immediately while triggering a regeneration in the background for subsequent visitors.

```javascript
// Next.js ISR example (Pages Router)
export async function getStaticProps() {
  const products = await fetchProducts();

  return {
    props: { products },
    revalidate: 60 // Regenerate this page at most once every 60 seconds
  };
}

export default function ProductList({ products }) {
  return (
    <ul>
      {products.map(product => (
        <li key={product.id}>
          {product.name} - ${product.price}
        </li>
      ))}
    </ul>
  );
}
```

**The ISR lifecycle:**

```
Build time       First request       Within 60s       After 60s         Next request
    │                │                   │                │                   │
    ▼                ▼                   ▼                ▼                   ▼
┌────────┐     ┌──────────┐       ┌──────────┐    ┌───────────┐      ┌──────────┐
│Generate│────▶│  Serve   │──────▶│  Serve   │───▶│ Serve old │─────▶│  Serve   │
│  HTML  │     │  cached  │       │  cached  │    │ + regen   │      │  new     │
└────────┘     └──────────┘       └──────────┘    │ in bg     │      │  cached  │
                                                  └───────────┘      └──────────┘
```

**Strengths:**

- CDN-speed responses for most requests
- Content freshness within the revalidation window
- No full rebuild needed for content updates
- Graceful scaling; regeneration is amortized across requests

**Weaknesses:**

- Users may see stale content during the revalidation window
- More complex caching behavior to reason about
- Requires a server runtime for regeneration (cannot be purely static)
- Not suitable for highly personalized content

**When to use ISR:** E-commerce catalogs, news sites, content-heavy pages that update periodically but do not need real-time accuracy, and any page where "stale for a few seconds" is acceptable.

### Decision Matrix

```
┌──────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Consideration    │   CSR    │   SSR    │   SSG    │   ISR    │
├──────────────────┼──────────┼──────────┼──────────┼──────────┤
│ SEO Required     │    ✗     │    ✓     │    ✓     │    ✓     │
│ Personalized     │    ✓     │    ✓     │    ✗     │    ✗     │
│ Real-Time Data   │    ✓     │    ✓     │    ✗     │    ~     │
│ Fast FCP         │    ✗     │    ✓     │    ✓     │    ✓     │
│ Low TTFB         │    ✓     │    ✗     │    ✓     │    ✓     │
│ Low Server Cost  │    ✓     │    ✗     │    ✓     │    ~     │
│ Build Time Scale │    ✓     │    ✓     │    ✗     │    ✓     │
│ Infra Simplicity │    ✓     │    ✗     │    ✓     │    ✗     │
└──────────────────┴──────────┴──────────┴──────────┴──────────┘

✓ = strong fit   ✗ = poor fit   ~ = acceptable with tradeoffs
```

> **Common Mistake:** Choosing SSR for every page because "it's better for SEO." Many pages in an application (settings, dashboards, authenticated views) derive no benefit from SSR. The server computation cost, infrastructure complexity, and hydration overhead are wasted on pages that search engines will never index. Evaluate each route independently rather than applying a single rendering strategy to the entire application.

> **See Also:** Part 4, Chapter 1, Section 1.3 for Core Web Vitals metrics (FCP, LCP, CLS) that are directly affected by rendering strategy choices.

---

## 9.2 How SSR Works (renderToString, Hydration)

Understanding SSR at the API level clarifies what the framework does on your behalf and why certain constraints exist.

### The Server Rendering API

React provides several server rendering functions in the `react-dom/server` package. The two fundamental ones are `renderToString` (synchronous, legacy) and `renderToPipeableStream` (streaming, modern).

#### renderToString: The Synchronous Approach

`renderToString` takes a React element, traverses the component tree, calls every component function, and returns a complete HTML string.

```javascript
import { renderToString } from 'react-dom/server';

function Greeting({ name }) {
  return <h1>Hello, {name}</h1>;
}

const html = renderToString(<Greeting name="World" />);
// Result: '<h1>Hello, World</h1>'
```

Under the hood, `renderToString` performs these steps:

1. **Calls the component function.** `Greeting({ name: "World" })` returns a React element `{ type: 'h1', props: { children: 'Hello, World' } }`.
2. **Converts the element tree to HTML.** React walks the tree depth-first, converting each element to its HTML equivalent, applying attribute mappings (e.g., `className` to `class`, `htmlFor` to `for`), and escaping content to prevent XSS.
3. **Returns the complete string.** The entire tree must be resolved before any HTML is sent.

```javascript
// A more realistic SSR setup with data fetching
import express from 'express';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { DataProvider } from './DataProvider';

const server = express();
server.use(express.static('public'));

server.get('*', async (req, res) => {
  // Step 1: Fetch all data the page needs BEFORE rendering
  const pageData = await getPageData(req.url);

  // Step 2: Render the React tree to HTML
  const appHtml = renderToString(
    <DataProvider initialData={pageData}>
      <App url={req.url} />
    </DataProvider>
  );

  // Step 3: Send the complete HTML document
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${pageData.title}</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div id="root">${appHtml}</div>
        <script>
          window.__DATA__ = ${JSON.stringify(pageData).replace(/</g, '\\u003c')};
        </script>
        <script src="/client.js"></script>
      </body>
    </html>
  `);
});

server.listen(3000);
```

Note the `replace(/</g, '\\u003c')` on the serialized JSON. This prevents a malicious `</script>` tag inside data from breaking out of the script element, a subtle but critical XSS prevention measure.

#### The renderToString Bottleneck

`renderToString` is synchronous and blocking. The server cannot send any bytes to the client until the entire component tree has been rendered. If one component depends on a slow data source, the entire page waits:

```
Request arrives
    │
    ▼
Fetch header data ──────── 50ms
    │
    ▼
Fetch main content ─────── 200ms
    │
    ▼
Fetch sidebar data ─────── 800ms  ◄── Everything waits for this
    │
    ▼
renderToString ────────── 100ms
    │
    ▼
Send response ─────────── TTFB: ~1150ms
```

This "slowest component determines TTFB" problem is what streaming SSR (covered in Section 9.8) solves.

### Hydration: Making Static HTML Interactive

The HTML sent by the server is static; it has no event handlers, no state management, and no React behavior. Hydration is the process by which React on the client "adopts" the server-rendered HTML, attaches event handlers, and wires up state.

```javascript
// client.js - the hydration entry point
import { hydrateRoot } from 'react-dom/client';
import { App } from './App';
import { DataProvider } from './DataProvider';

hydrateRoot(
  document.getElementById('root'),
  <DataProvider initialData={window.__DATA__}>
    <App url={window.location.pathname} />
  </DataProvider>
);
```

`hydrateRoot` (React 18+) differs from `createRoot` in one critical way: instead of creating new DOM nodes, it walks the existing DOM and attaches React's internal data structures (fiber nodes, event handlers, state) to the nodes it finds. React expects the existing DOM to match what it would have rendered. When it does not, a hydration mismatch occurs.

**The hydration process, step by step:**

1. React calls your component functions on the client, producing a virtual DOM tree.
2. React walks the existing DOM and the virtual DOM simultaneously.
3. For each node, React checks that the DOM node type and key attributes match.
4. React attaches fiber nodes to existing DOM elements (no new elements created).
5. React registers event handlers on the appropriate elements.
6. State hooks initialize; effects are scheduled.
7. After hydration completes, the application is fully interactive.

```javascript
// Demonstrating that hydration attaches behavior, not DOM
function Counter() {
  const [count, setCount] = useState(0);

  // On the server: this renders <button>Count: 0</button>
  // On the client during hydration: React finds the existing <button>,
  // attaches the onClick handler, and wires up the useState hook.
  // No new DOM nodes are created.
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
```

> **Common Mistake:** Using `createRoot` instead of `hydrateRoot` for server-rendered applications. When `createRoot` encounters existing DOM content, it discards it and re-creates everything from scratch. This causes a visible flash (the server-rendered content disappears and reappears) and wastes the performance benefit of SSR. Always use `hydrateRoot` when the initial HTML was server-rendered.

> **See Also:** Part 2, Chapter 5, Section 5.4 for how the commit phase works during normal renders; hydration replaces the commit phase's DOM creation step with DOM adoption.

---

## 9.3 Hydration Mismatches: Why They Happen, How to Fix

A hydration mismatch occurs when the HTML rendered on the server does not match what React expects to produce on the client. React detects this during hydration and logs a warning. In React 18+, mismatches cause React to discard the server-rendered content for the mismatched subtree and re-render it on the client, negating the performance benefit of SSR for that portion of the page.

### Common Causes of Hydration Mismatches

#### 1. Date and Time Rendering

The server and client often run in different timezones or at different moments in time.

```javascript
// BAD: This will mismatch because the timestamp differs between server and client
function Timestamp() {
  return <span>{new Date().toLocaleString()}</span>;
}

// Server renders at 10:00:00.000
// Client hydrates at 10:00:01.234
// Mismatch: "3/25/2026, 10:00:00 AM" vs "3/25/2026, 10:00:01 AM"
```

**Fix:** Render a stable value on the server and update on the client after hydration.

```javascript
function Timestamp({ serverTime }) {
  const [displayTime, setDisplayTime] = useState(serverTime);

  useEffect(() => {
    // useEffect only runs on the client, after hydration
    setDisplayTime(new Date().toLocaleString());
  }, []);

  return <span>{displayTime}</span>;
}
```

#### 2. Browser-Only APIs

Code that reads from `window`, `localStorage`, `navigator`, or `document` produces values on the client that did not exist on the server.

```javascript
// BAD: window is undefined on the server
function ThemeProvider({ children }) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [theme, setTheme] = useState(prefersDark ? 'dark' : 'light');
  // Server: crashes or renders 'light'
  // Client: might render 'dark'
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

// GOOD: Default to a server-safe value, update after hydration
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light'); // Server-safe default

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      setTheme('dark');
    }
  }, []);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
```

#### 3. Conditional Rendering Based on Client State

```javascript
// BAD: The server has no concept of "logged in" via cookies/localStorage
function Header() {
  const isLoggedIn = typeof window !== 'undefined' && localStorage.getItem('token');
  return isLoggedIn ? <UserMenu /> : <LoginButton />;
}

// GOOD: Use a two-pass rendering approach
function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('token'));
  }, []);

  return isLoggedIn ? <UserMenu /> : <LoginButton />;
}
```

#### 4. Nesting Violations in HTML

Browsers auto-correct invalid HTML nesting before React can hydrate. If the server sends `<p><div>...</div></p>`, the browser's HTML parser restructures it (because `<div>` is not valid inside `<p>`), and React finds a different DOM tree than expected.

```javascript
// BAD: <div> inside <p> is invalid HTML
function BlogExcerpt({ content }) {
  return (
    <p>
      <div className="excerpt">{content}</div>
    </p>
  );
}

// GOOD: Use valid nesting
function BlogExcerpt({ content }) {
  return (
    <div className="excerpt">
      <p>{content}</p>
    </div>
  );
}
```

#### 5. Third-Party Scripts and Browser Extensions

Browser extensions that inject DOM nodes (ad blockers adding elements, translation tools modifying text) modify the DOM between server rendering and hydration, causing mismatches that are outside your control.

### suppressHydrationWarning

For content that is intentionally different between server and client (such as timestamps), React provides the `suppressHydrationWarning` prop:

```javascript
function Timestamp({ serverTime }) {
  return (
    <time suppressHydrationWarning>
      {new Date(serverTime).toLocaleTimeString()}
    </time>
  );
}
```

This prop suppresses the mismatch warning for the direct text content of that element only. It does not suppress warnings for structural mismatches (different element types or missing/extra children), and it does not prevent React from replacing the content; it only silences the console warning. Use it sparingly and only when you understand why the mismatch occurs.

### Debugging Hydration Mismatches

React 18+ provides improved hydration error messages that show the expected and actual content. In development mode:

```javascript
// React's development mode error output:
// Warning: Text content did not match.
// Server: "March 25, 2026" Client: "March 25, 2026"
// (these may look identical but differ in whitespace or encoding)

// Strategy for debugging:
// 1. Check the browser console for the specific mismatch
// 2. Use the React DevTools to identify which component triggers the mismatch
// 3. Search for typeof window, typeof document, Date, Math.random,
//    localStorage, and similar client-only APIs in the render path
// 4. Verify HTML nesting validity
// 5. Check for browser extensions that modify the DOM
```

A reliable pattern for content that must differ between server and client is the "client-only" component:

```javascript
import { useState, useEffect } from 'react';

function useIsClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  return isClient;
}

function ClientOnly({ children, fallback = null }) {
  const isClient = useIsClient();
  return isClient ? children : fallback;
}

// Usage: content that only renders on the client, after hydration
function App() {
  return (
    <div>
      <h1>Welcome</h1>
      <ClientOnly fallback={<span>Loading preferences...</span>}>
        <UserPreferences />
      </ClientOnly>
    </div>
  );
}
```

---

## 9.4 React Server Components: The Mental Model

React Server Components (RSC) represent a fundamental shift in how React applications are structured. Introduced as a stable feature in React 18 and deeply integrated into Next.js 13+ (App Router), RSC allows components to execute exclusively on the server, with their output serialized and sent to the client as a special payload rather than HTML.

### The Core Idea

Traditional SSR renders components to HTML on the server, then ships the same component code to the client for hydration. The component JavaScript must be downloaded, parsed, and executed on the client even though the server already did the rendering work. Server Components break this assumption: a Server Component runs only on the server, and its JavaScript is never sent to the client.

```
Traditional SSR:
  Server: renders components → HTML
  Client: downloads same component code → hydrates HTML
  Result: component code in both server AND client bundles

React Server Components:
  Server Component: runs on server → serialized output
  Client Component: runs on client → interactive UI
  Result: Server Component code stays on the server, never in client bundle
```

### How RSC Works

When a request arrives, the server executes the Server Component tree. Instead of producing HTML (as in traditional SSR), the server produces a special serialized format called the **RSC payload** (sometimes called the "flight" format). This payload describes the component tree using a protocol that the client-side React runtime can interpret.

```javascript
// This is a Server Component (the default in Next.js App Router)
// It runs ONLY on the server. Its code is never sent to the client.

// Server Components can directly access databases, file systems,
// and server-only APIs without building an API endpoint.
import { db } from './database';

async function ProductList() {
  // Direct database access; no API route needed
  const products = await db.query('SELECT * FROM products WHERE active = true');

  return (
    <ul>
      {products.map(product => (
        <li key={product.id}>
          <h3>{product.name}</h3>
          <p>{product.description}</p>
          <AddToCartButton productId={product.id} />
        </li>
      ))}
    </ul>
  );
}

export default ProductList;
```

```javascript
// AddToCartButton.js
// This is a Client Component because it needs interactivity (onClick)
'use client';

import { useState } from 'react';

export function AddToCartButton({ productId }) {
  const [added, setAdded] = useState(false);

  async function handleClick() {
    await fetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId })
    });
    setAdded(true);
  }

  return (
    <button onClick={handleClick} disabled={added}>
      {added ? 'Added' : 'Add to Cart'}
    </button>
  );
}
```

In this example, `ProductList` is a Server Component. It accesses the database directly, which is only possible on the server. The `AddToCartButton` is a Client Component (marked with `'use client'`) because it needs `useState` and `onClick`. The key insight: the product list rendering logic (potentially importing a heavy markdown parser, database driver, or formatting library) stays entirely on the server. Only the `AddToCartButton` code is sent to the client.

### The Serialization Boundary

The `'use client'` directive marks a **serialization boundary**. Everything above the boundary (Server Components) runs on the server. Everything at and below the boundary (Client Components) runs on the client.

```
Server Component tree:
┌───────────────────────────────────────────────┐
│  Layout (Server)                              │
│  ├── Header (Server)                          │
│  │   └── Navigation (Server)                  │
│  │       └── SearchBar (Client) ◄── boundary  │
│  ├── ProductList (Server)                     │
│  │   └── AddToCartButton (Client) ◄── boundary│
│  └── Footer (Server)                          │
└───────────────────────────────────────────────┘
```

Props passed from a Server Component to a Client Component must be **serializable**: strings, numbers, booleans, arrays, plain objects, Dates, Maps, Sets, and other JSON-compatible types. Functions, class instances, DOM nodes, and symbols cannot cross the boundary.

```javascript
// VALID: serializable props crossing the boundary
// Server Component
async function ProductPage({ id }) {
  const product = await fetchProduct(id);

  return (
    <div>
      <h1>{product.name}</h1>
      {/* String and number props are serializable */}
      <PriceDisplay price={product.price} currency="USD" />
      {/* Objects with serializable values are fine */}
      <ProductReviews reviews={product.reviews} />
    </div>
  );
}

// INVALID: non-serializable props
async function BadExample() {
  const handleClick = () => console.log('clicked');

  // ERROR: Cannot pass a function from Server Component to Client Component
  return <ClientButton onClick={handleClick} />;
}
```

### Server Components Are Async

One of the most significant differences between Server Components and Client Components is that Server Components can be `async` functions. They can use `await` directly in the component body, a pattern that was impossible in traditional React components.

```javascript
// Server Component: async is allowed
async function UserProfile({ userId }) {
  // Await directly in the component body
  const user = await fetchUser(userId);
  const posts = await fetchUserPosts(userId);

  return (
    <div>
      <h2>{user.name}</h2>
      <p>{user.bio}</p>
      <h3>Recent Posts</h3>
      <ul>
        {posts.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

> **Common Mistake:** Adding `'use client'` to every component because hooks like `useState` or `useEffect` are needed somewhere in the component tree. The `'use client'` directive affects the entire module and all modules it imports. Placing it too high in the tree forces large portions of the component tree to become Client Components, increasing bundle size. Instead, extract the interactive part into a small Client Component and keep the surrounding structure as a Server Component.

---

## 9.5 Server Components vs Client Components: Decision Framework

Choosing between Server Components and Client Components is not about preference; it is about matching component characteristics to the execution environment that best serves them.

### When to Use Server Components

Use a Server Component when the component:

1. **Fetches data** from a database, file system, or internal service
2. **Has no interactivity** (no onClick, onChange, onSubmit handlers)
3. **Uses no React state or effects** (no useState, useReducer, useEffect, useRef for DOM)
4. **Imports heavy dependencies** that should not be in the client bundle (markdown parsers, syntax highlighters, date libraries, ORMs)
5. **Renders static or infrequently changing content** (navigation, footer, page layouts)
6. **Accesses server-only resources** (environment variables with secrets, internal APIs)

### When to Use Client Components

Use a Client Component when the component:

1. **Needs user interaction** (event handlers: onClick, onChange, onSubmit)
2. **Manages state** (useState, useReducer)
3. **Uses lifecycle effects** (useEffect, useLayoutEffect)
4. **Uses browser-only APIs** (window, document, localStorage, IntersectionObserver)
5. **Depends on context** (useContext for theme, auth, or feature flags that change at runtime)
6. **Uses custom hooks** that internally depend on state or effects

### The Decision Flowchart

```
Does the component need interactivity (event handlers)?
├── Yes → Client Component
└── No
    ├── Does it use useState, useReducer, or useEffect?
    │   ├── Yes → Client Component
    │   └── No
    │       ├── Does it access server-only resources (DB, env secrets)?
    │       │   ├── Yes → Server Component (mandatory)
    │       │   └── No
    │       │       ├── Does it import heavy libraries?
    │       │       │   ├── Yes → Server Component (recommended)
    │       │       │   └── No → Server Component (default)
    │       │       └──
    │       └──
    └──
```

### Composition Patterns

A key pattern is keeping Server Components as the outer shell and pushing Client Components to the leaves of the tree:

```javascript
// layout.js (Server Component - the outer shell)
import { Navigation } from './Navigation';
import { Footer } from './Footer';

export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

```javascript
// page.js (Server Component - fetches data)
import { db } from '@/lib/database';
import { ArticleList } from './ArticleList';
import { SearchBar } from './SearchBar';

export default async function ArticlesPage() {
  const articles = await db.articles.findMany({
    orderBy: { publishedAt: 'desc' },
    take: 20
  });

  return (
    <div>
      <h1>Articles</h1>
      {/* SearchBar is a Client Component (needs state for input) */}
      <SearchBar />
      {/* ArticleList is a Server Component (just renders data) */}
      <ArticleList articles={articles} />
    </div>
  );
}
```

```javascript
// SearchBar.js (Client Component - needs interactivity)
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSearch(event) {
    event.preventDefault();
    startTransition(() => {
      router.push(`/articles?q=${encodeURIComponent(query)}`);
    });
  }

  return (
    <form onSubmit={handleSearch}>
      <input
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search articles..."
        aria-label="Search articles"
      />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
```

```javascript
// ArticleList.js (Server Component - pure rendering)
export function ArticleList({ articles }) {
  if (articles.length === 0) {
    return <p>No articles found.</p>;
  }

  return (
    <ul>
      {articles.map(article => (
        <li key={article.id}>
          <a href={`/articles/${article.slug}`}>
            <h2>{article.title}</h2>
            <time dateTime={article.publishedAt}>
              {new Date(article.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </time>
            <p>{article.excerpt}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}
```

### The Children Pattern: Server Components Inside Client Components

A Client Component cannot import a Server Component (because the `'use client'` boundary pushes everything downstream to the client). However, a Client Component can accept Server Components as `children` or other props:

```javascript
// Sidebar.js (Client Component with collapsible behavior)
'use client';

import { useState } from 'react';

export function Sidebar({ children }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside>
      <button onClick={() => setIsOpen(open => !open)}>
        {isOpen ? 'Collapse' : 'Expand'}
      </button>
      {isOpen && <div className="sidebar-content">{children}</div>}
    </aside>
  );
}
```

```javascript
// page.js (Server Component)
import { Sidebar } from './Sidebar';
import { RecentPosts } from './RecentPosts'; // Server Component

export default async function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      {/* RecentPosts is a Server Component passed as children to a Client Component */}
      <Sidebar>
        <RecentPosts />
      </Sidebar>
    </div>
  );
}
```

This works because the Server Component (`RecentPosts`) is rendered on the server and its output is passed as serialized content through the `children` prop. The Client Component (`Sidebar`) never imports or executes `RecentPosts`; it simply renders whatever `children` it receives.

> **See Also:** Part 3, Chapter 3, Section 3.2 for the component composition pattern that underpins this Server/Client Component interleaving strategy.

---

## 9.6 Next.js App Router Patterns

Next.js App Router (introduced in Next.js 13.4+) is the primary framework for building applications with React Server Components. The App Router uses file-system conventions to define routes, layouts, loading states, and error boundaries.

### File Conventions

```
app/
├── layout.js          # Root layout (wraps all pages)
├── page.js            # Home page (/)
├── loading.js         # Loading UI for this segment
├── error.js           # Error boundary for this segment
├── not-found.js       # 404 page
├── blog/
│   ├── layout.js      # Blog layout (wraps all blog pages)
│   ├── page.js        # Blog index (/blog)
│   └── [slug]/
│       ├── page.js    # Individual blog post (/blog/my-post)
│       └── loading.js # Loading UI for blog posts
├── dashboard/
│   ├── layout.js      # Dashboard layout
│   ├── page.js        # Dashboard home (/dashboard)
│   └── settings/
│       └── page.js    # Dashboard settings (/dashboard/settings)
└── api/
    └── route.js       # API route handler
```

### Layouts

Layouts wrap pages and persist across navigations within their segment. The root layout is required and must render `<html>` and `<body>` tags.

```javascript
// app/layout.js - Root Layout (Server Component by default)
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'My Application',
  description: 'Built with Next.js App Router'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header>
          <nav>
            <a href="/">Home</a>
            <a href="/blog">Blog</a>
            <a href="/dashboard">Dashboard</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>Copyright 2026</p>
        </footer>
      </body>
    </html>
  );
}
```

```javascript
// app/dashboard/layout.js - Nested Layout
// This layout wraps all pages under /dashboard/*
// The root layout's <header> and <footer> remain; this adds sidebar navigation.
import { DashboardNav } from './DashboardNav';

export default function DashboardLayout({ children }) {
  return (
    <div style={{ display: 'flex' }}>
      <DashboardNav />
      <section style={{ flex: 1 }}>{children}</section>
    </div>
  );
}
```

Layouts do not re-render when navigating between pages within their segment. If a user navigates from `/dashboard` to `/dashboard/settings`, the `DashboardLayout` component instance is preserved; only the `children` content changes. This makes layouts ideal for persistent UI elements like sidebars and navigation.

### Server Actions

Server Actions allow Client Components to call server-side functions directly, without creating API routes. A Server Action is an async function marked with the `'use server'` directive.

```javascript
// app/actions.js
'use server';

import { db } from '@/lib/database';
import { revalidatePath } from 'next/cache';

export async function createPost(formData) {
  const title = formData.get('title');
  const content = formData.get('content');

  // Validate input
  if (!title || title.length < 3) {
    return { error: 'Title must be at least 3 characters' };
  }

  // Direct database access (runs on the server)
  const post = await db.posts.create({
    data: {
      title,
      content,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      publishedAt: new Date()
    }
  });

  // Revalidate cached data so the post list updates
  revalidatePath('/blog');

  return { success: true, slug: post.slug };
}
```

```javascript
// app/blog/new/page.js (Client Component using a Server Action)
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPost } from '../actions';

export default function NewPostPage() {
  const [error, setError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const formData = new FormData(event.target);
    const result = await createPost(formData);

    if (result.error) {
      setError(result.error);
      setIsPending(false);
    } else {
      router.push(`/blog/${result.slug}`);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required minLength={3} />

      <label htmlFor="content">Content</label>
      <textarea id="content" name="content" rows={10} required />

      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Publishing...' : 'Publish'}
      </button>
    </form>
  );
}
```

Server Actions can also be used with the native `<form>` element's `action` prop for progressive enhancement (forms work even before JavaScript loads):

```javascript
// Progressive enhancement with Server Actions
import { createPost } from './actions';

export default function NewPostForm() {
  return (
    <form action={createPost}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required />

      <label htmlFor="content">Content</label>
      <textarea id="content" name="content" rows={10} required />

      <button type="submit">Publish</button>
    </form>
  );
}
```

### Data Fetching Patterns

In the App Router, Server Components fetch data directly using `async/await`. There is no `getServerSideProps` or `getStaticProps`; data fetching happens inside the component.

```javascript
// app/blog/[slug]/page.js
import { notFound } from 'next/navigation';
import { db } from '@/lib/database';

// Generate static params for SSG
export async function generateStaticParams() {
  const posts = await db.posts.findMany({ select: { slug: true } });
  return posts.map(post => ({ slug: post.slug }));
}

// Generate metadata dynamically
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await db.posts.findUnique({ where: { slug } });

  if (!post) {
    return { title: 'Post Not Found' };
  }

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt
    }
  };
}

// The page component itself
export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await db.posts.findUnique({ where: { slug } });

  if (!post) {
    notFound(); // Renders the closest not-found.js
  }

  return (
    <article>
      <h1>{post.title}</h1>
      <time dateTime={post.publishedAt.toISOString()}>
        {post.publishedAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}
      </time>
      <div dangerouslySetInnerHTML={{ __html: post.htmlContent }} />
    </article>
  );
}
```

### Caching and Revalidation

Next.js App Router provides multiple caching layers. The `fetch` API is extended with caching options:

```javascript
// Default: cached indefinitely (equivalent to SSG behavior)
const data = await fetch('https://api.example.com/products');

// Revalidate every 60 seconds (equivalent to ISR)
const data = await fetch('https://api.example.com/products', {
  next: { revalidate: 60 }
});

// No caching (equivalent to SSR, fresh data every request)
const data = await fetch('https://api.example.com/products', {
  cache: 'no-store'
});
```

For non-fetch data sources (direct database queries, third-party SDKs), Next.js provides the `unstable_cache` function (now stable as of Next.js 15 under the `use cache` directive) and route segment configuration:

```javascript
// Route segment configuration for caching behavior
// app/dashboard/page.js

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic';

// Or set revalidation interval for the entire page
export const revalidate = 300; // Revalidate every 5 minutes

export default async function DashboardPage() {
  const stats = await db.stats.getCurrent();
  return <DashboardView stats={stats} />;
}
```

### Loading and Error States

The App Router uses file conventions for loading and error boundaries, aligning with React's Suspense and Error Boundary patterns:

```javascript
// app/blog/loading.js
// Displayed while the page component is loading (wraps page in <Suspense>)
export default function BlogLoading() {
  return (
    <div role="status" aria-label="Loading blog posts">
      <div className="skeleton-list">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-title" />
            <div className="skeleton-text" />
            <div className="skeleton-text" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

```javascript
// app/blog/error.js
// Must be a Client Component (Error Boundaries use state)
'use client';

export default function BlogError({ error, reset }) {
  return (
    <div role="alert">
      <h2>Something went wrong loading the blog</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

> **Common Mistake:** Fetching data in Client Components when it could be done in Server Components. A common pattern is creating an API route (`/api/posts`) and calling it from a Client Component with `useEffect`. In the App Router, Server Components can fetch data directly, eliminating the API route, the client-side fetch, and the loading state management. Reserve Client Component data fetching for mutations and real-time updates.

> **See Also:** Part 4, Chapter 5, Section 5.1 for Error Boundary patterns that the App Router's `error.js` convention builds upon.

---

## 9.7 Data Fetching in Server Components

Data fetching in Server Components is fundamentally different from the `useEffect`-based patterns used in Client Components. Server Components can access data sources directly, and the data fetching happens during the render on the server, before any HTML or RSC payload is sent to the client.

### Direct Data Access

```javascript
// Server Component: direct database queries
import { pool } from '@/lib/db';

export default async function AnalyticsDashboard() {
  // These queries run on the server, during rendering
  const [visitors, revenue, topPages] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM visitors WHERE date = CURRENT_DATE'),
    pool.query('SELECT SUM(amount) FROM orders WHERE date = CURRENT_DATE'),
    pool.query(`
      SELECT path, COUNT(*) as views
      FROM page_views
      WHERE date = CURRENT_DATE
      GROUP BY path
      ORDER BY views DESC
      LIMIT 10
    `)
  ]);

  return (
    <div>
      <h1>Today's Analytics</h1>
      <div className="stats-grid">
        <StatCard label="Visitors" value={visitors.rows[0].count} />
        <StatCard label="Revenue" value={`$${revenue.rows[0].sum}`} />
      </div>
      <h2>Top Pages</h2>
      <table>
        <thead>
          <tr><th>Page</th><th>Views</th></tr>
        </thead>
        <tbody>
          {topPages.rows.map(page => (
            <tr key={page.path}>
              <td>{page.path}</td>
              <td>{page.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Parallel Data Fetching

When multiple independent data sources are needed, fetch them in parallel using `Promise.all` to avoid sequential waterfalls:

```javascript
// BAD: Sequential fetching (waterfall)
async function ProductPage({ params }) {
  const { id } = await params;
  const product = await fetchProduct(id);      // 200ms
  const reviews = await fetchReviews(id);      // 300ms
  const related = await fetchRelatedProducts(id); // 150ms
  // Total: 650ms

  return <ProductView product={product} reviews={reviews} related={related} />;
}

// GOOD: Parallel fetching
async function ProductPage({ params }) {
  const { id } = await params;
  const [product, reviews, related] = await Promise.all([
    fetchProduct(id),       // 200ms
    fetchReviews(id),       // 300ms ◄── all run simultaneously
    fetchRelatedProducts(id) // 150ms
  ]);
  // Total: 300ms (bounded by the slowest)

  return <ProductView product={product} reviews={reviews} related={related} />;
}
```

### Streaming with Suspense for Progressive Loading

Even with parallel fetching, `Promise.all` waits for all promises to resolve before rendering anything. For pages with data sources of varying speed, combine Server Components with `<Suspense>` to stream content progressively:

```javascript
// app/product/[id]/page.js
import { Suspense } from 'react';
import { ProductDetails } from './ProductDetails';
import { ProductReviews } from './ProductReviews';
import { RelatedProducts } from './RelatedProducts';
import { ReviewsSkeleton, RelatedSkeleton } from './Skeletons';

export default async function ProductPage({ params }) {
  const { id } = await params;

  return (
    <div>
      {/* ProductDetails fetches its own data; blocks initial render */}
      <ProductDetails id={id} />

      {/* Reviews can stream in after the main content */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews productId={id} />
      </Suspense>

      {/* Related products can also stream independently */}
      <Suspense fallback={<RelatedSkeleton />}>
        <RelatedProducts productId={id} />
      </Suspense>
    </div>
  );
}
```

```javascript
// ProductDetails.js (Server Component)
import { db } from '@/lib/database';

export async function ProductDetails({ id }) {
  const product = await db.products.findUnique({ where: { id } });

  return (
    <section>
      <h1>{product.name}</h1>
      <p className="price">${product.price.toFixed(2)}</p>
      <p>{product.description}</p>
    </section>
  );
}
```

```javascript
// ProductReviews.js (Server Component)
import { db } from '@/lib/database';

export async function ProductReviews({ productId }) {
  // This might be slow (fetching from external review service)
  const reviews = await db.reviews.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  return (
    <section>
      <h2>Customer Reviews ({reviews.length})</h2>
      <ul>
        {reviews.map(review => (
          <li key={review.id}>
            <strong>{review.author}</strong>
            <span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
            <p>{review.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

With this pattern, the browser receives and displays `ProductDetails` as soon as it is ready. The `ReviewsSkeleton` and `RelatedSkeleton` appear as placeholders. As each async Server Component resolves, the server streams its HTML to the browser, which replaces the skeleton with the real content. No client-side JavaScript is needed for this progressive loading.

### Avoiding Waterfalls in Component Trees

A common pitfall with Server Components is creating unintentional waterfalls through the component tree:

```javascript
// BAD: Unintentional waterfall
// Parent fetches data, then child fetches data, then grandchild fetches data
async function UserProfile({ userId }) {
  const user = await fetchUser(userId); // 200ms

  return (
    <div>
      <h1>{user.name}</h1>
      {/* UserPosts won't start fetching until UserProfile finishes */}
      <UserPosts userId={userId} />
    </div>
  );
}

async function UserPosts({ userId }) {
  const posts = await fetchPosts(userId); // 300ms, starts AFTER parent finishes

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>
          {post.title}
          {/* PostComments won't start until UserPosts finishes */}
          <PostComments postId={post.id} />
        </li>
      ))}
    </ul>
  );
}
// Total time: 200 + 300 + comment fetch time (sequential waterfall)
```

**Fix:** Use Suspense boundaries to allow parallel rendering:

```javascript
// GOOD: Parallel fetching with Suspense
import { Suspense } from 'react';

async function UserProfile({ userId }) {
  const user = await fetchUser(userId);

  return (
    <div>
      <h1>{user.name}</h1>
      <Suspense fallback={<PostsSkeleton />}>
        <UserPosts userId={userId} />
      </Suspense>
    </div>
  );
}
```

With the Suspense boundary, React does not wait for `UserPosts` to resolve before streaming the `UserProfile` content. Both data fetches can overlap.

> **See Also:** Part 3, Chapter 5, Sections 5.1 and 5.2 for the data fetching waterfall problem in Client Components and how React Query solves it; Server Components provide a fundamentally different solution by moving the fetch to the server render.

---

## 9.8 Streaming SSR and Selective Hydration

Streaming SSR addresses the fundamental bottleneck of `renderToString`: the server must complete the entire render before sending any bytes. With streaming, the server sends HTML progressively as components resolve, and the browser can start rendering the page before the server finishes.

### renderToPipeableStream

React 18 introduced `renderToPipeableStream`, a streaming server rendering API that integrates with Node.js streams:

```javascript
import { renderToPipeableStream } from 'react-dom/server';
import express from 'express';
import { App } from './App';

const app = express();

app.get('*', (req, res) => {
  let didError = false;

  const { pipe, abort } = renderToPipeableStream(
    <App url={req.url} />,
    {
      // Called when the shell (content outside all <Suspense> boundaries) is ready
      onShellReady() {
        res.statusCode = didError ? 500 : 200;
        res.setHeader('Content-Type', 'text/html');
        pipe(res);
      },

      // Called when the entire page, including all Suspense boundaries, is ready
      onAllReady() {
        // Useful for crawlers that need the full page
        // For regular users, onShellReady is sufficient
      },

      // Called if there is an error during rendering
      onShellError(error) {
        res.statusCode = 500;
        res.send('<h1>Something went wrong</h1>');
      },

      onError(error) {
        didError = true;
        console.error('Streaming SSR error:', error);
      }
    }
  );

  // Set a timeout to abort rendering if it takes too long
  setTimeout(() => abort(), 10000);
});
```

### How Streaming Works with Suspense

The streaming pipeline relies on `<Suspense>` boundaries to identify which parts of the page can be deferred:

```javascript
import { Suspense } from 'react';

function App() {
  return (
    <html>
      <body>
        {/* The "shell": renders immediately */}
        <header>
          <h1>My Store</h1>
          <nav>...</nav>
        </header>

        <main>
          {/* Product info: part of the shell, renders immediately */}
          <ProductInfo id={42} />

          {/* Reviews: deferred behind a Suspense boundary */}
          <Suspense fallback={<p>Loading reviews...</p>}>
            <SlowReviews productId={42} />
          </Suspense>

          {/* Recommendations: deferred behind a Suspense boundary */}
          <Suspense fallback={<p>Loading recommendations...</p>}>
            <PersonalizedRecommendations />
          </Suspense>
        </main>

        <footer>...</footer>
      </body>
    </html>
  );
}
```

**The streaming timeline:**

```
Time 0ms: Server starts rendering
         ├── Header renders instantly
         ├── ProductInfo data fetches (100ms)
         ├── SlowReviews data fetches (starts, takes 800ms)
         └── Recommendations data fetches (starts, takes 400ms)

Time 100ms: Shell is ready (onShellReady fires)
         ├── Server sends: <header>...</header>
         ├── Server sends: <main><ProductInfo content>
         ├── Server sends: <p>Loading reviews...</p>  (Suspense fallback)
         └── Server sends: <p>Loading recommendations...</p>  (Suspense fallback)
         Browser starts rendering the shell immediately.

Time 400ms: Recommendations resolve
         └── Server streams: <script> that replaces the fallback
             with the real recommendations content

Time 800ms: Reviews resolve
         └── Server streams: <script> that replaces the fallback
             with the real reviews content

Result: TTFB = 100ms (vs 800ms with renderToString)
```

The server sends inline `<script>` tags that swap the fallback content with the real content as it becomes available. This technique works even before the main JavaScript bundle loads, because the inline scripts use minimal vanilla JavaScript to perform DOM replacements.

### Selective Hydration

Streaming SSR pairs with **selective hydration**, a React 18 feature that allows the browser to hydrate different parts of the page independently and in priority order.

Without selective hydration, React must hydrate the entire page as one synchronous operation. If the page is large, hydration blocks the main thread for a significant duration, during which the page is visible but unresponsive.

With selective hydration:

1. React hydrates the shell first.
2. As streamed Suspense content arrives, React hydrates those sections independently.
3. If the user interacts with a section that has not yet hydrated (e.g., clicking a button inside a Suspense boundary), React **prioritizes** hydrating that section immediately.

```javascript
// This component tree benefits from selective hydration
function App() {
  return (
    <div>
      {/* Hydrated first as part of the shell */}
      <Header />

      {/* Hydrated independently when its HTML arrives */}
      <Suspense fallback={<NavSkeleton />}>
        <HeavyNavigation />
      </Suspense>

      {/* Hydrated independently */}
      <Suspense fallback={<ContentSkeleton />}>
        <MainContent />
      </Suspense>

      {/* If user clicks inside HeavySidebar before it hydrates,
          React prioritizes hydrating it immediately */}
      <Suspense fallback={<SidebarSkeleton />}>
        <HeavySidebar />
      </Suspense>
    </div>
  );
}
```

### Benefits of Streaming SSR

1. **Lower TTFB:** The server sends the initial shell as soon as it is ready, without waiting for slow data sources.
2. **Progressive rendering:** Users see content appear incrementally instead of waiting for a single full page load.
3. **Reduced Time to Interactive (TTI):** Selective hydration allows critical interactive elements to become responsive faster.
4. **Better perceived performance:** Users perceive the page as loading faster because they see content appearing continuously.
5. **Resilience:** If one data source is slow or fails, the rest of the page still loads and becomes interactive.

> **Common Mistake:** Wrapping too many small components in individual Suspense boundaries. Each Suspense boundary introduces a potential visual shift as the fallback is replaced with real content. Group logically related content within a single Suspense boundary to minimize layout shifts and provide a more cohesive loading experience. Use the browser's Cumulative Layout Shift (CLS) metric to evaluate whether your Suspense boundaries create excessive visual instability.

---

## 9.9 Exercise: Convert a CSR App to SSR, Observe the Differences

### Problem Statement

You have a client-side rendered blog application built with React. The application fetches blog posts from an API and renders them in a list. Your task is to convert it to a server-rendered application using Next.js App Router, demonstrating the key differences in architecture, data fetching, and loading behavior.

### Starter Code: The CSR Application

```javascript
// Original CSR application
// src/App.js
import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div className="blog">
      <header>
        <h1>Tech Blog</h1>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
      </header>
      <main>
        <BlogPostList />
      </main>
      <footer>
        <p>Copyright 2026 Tech Blog</p>
      </footer>
    </div>
  );
}

function BlogPostList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPosts() {
      try {
        const response = await fetch('https://jsonplaceholder.typicode.com/posts');
        if (!response.ok) throw new Error('Failed to fetch posts');
        const data = await response.json();

        if (!cancelled) {
          setPosts(data.slice(0, 10));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    loadPosts();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p>Loading posts...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <ul className="post-list">
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </ul>
  );
}

function PostCard({ post }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="post-card">
      <h2>{post.title}</h2>
      <p>{expanded ? post.body : post.body.slice(0, 100) + '...'}</p>
      <button onClick={() => setExpanded(prev => !prev)}>
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </li>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
```

### Solution: The Next.js App Router Version

**Step 1: Create the Root Layout (Server Component)**

```javascript
// app/layout.js
// Server Component: no 'use client' directive, no hooks, no event handlers

export const metadata = {
  title: 'Tech Blog',
  description: 'A server-rendered tech blog built with Next.js'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="blog">
          <header>
            <h1>Tech Blog</h1>
            <nav>
              <a href="/">Home</a>
              <a href="/about">About</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer>
            <p>Copyright 2026 Tech Blog</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
```

**Step 2: Create the Page Component (Server Component)**

```javascript
// app/page.js
// Server Component: fetches data directly, no useEffect, no loading state management.
// This function runs on the server for every request (or is cached, depending on config).

import { PostCard } from './PostCard';

async function fetchPosts() {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
    next: { revalidate: 3600 } // Cache for 1 hour (ISR behavior)
  });

  if (!response.ok) {
    throw new Error('Failed to fetch posts');
  }

  const posts = await response.json();
  return posts.slice(0, 10);
}

export default async function HomePage() {
  // Data fetching happens on the server during rendering.
  // No useState, no useEffect, no loading state.
  // The HTML is generated with the data already embedded.
  const posts = await fetchPosts();

  return (
    <ul className="post-list">
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </ul>
  );
}
```

**Step 3: Extract the Interactive Part as a Client Component**

```javascript
// app/PostCard.js
// Client Component: needs useState for expand/collapse interactivity
'use client';

import { useState } from 'react';

export function PostCard({ post }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="post-card">
      <h2>{post.title}</h2>
      <p>{expanded ? post.body : post.body.slice(0, 100) + '...'}</p>
      <button onClick={() => setExpanded(prev => !prev)}>
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </li>
  );
}
```

**Step 4: Add Loading and Error States Using File Conventions**

```javascript
// app/loading.js
// Displayed automatically while the page's async data is loading.
// Wraps the page in a <Suspense> boundary under the hood.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading blog posts">
      <ul className="post-list">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="post-card skeleton">
            <div className="skeleton-title" style={{ height: 24, background: '#e0e0e0', marginBottom: 8 }} />
            <div className="skeleton-body" style={{ height: 60, background: '#e0e0e0', marginBottom: 8 }} />
            <div className="skeleton-button" style={{ height: 32, width: 100, background: '#e0e0e0' }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```javascript
// app/error.js
'use client';

export default function Error({ error, reset }) {
  return (
    <div role="alert">
      <h2>Failed to load blog posts</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### Key Differences to Observe

```
┌────────────────────────┬──────────────────────────┬──────────────────────────┐
│ Aspect                 │ CSR Version              │ SSR (App Router) Version │
├────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Initial HTML           │ Empty <div id="root">    │ Full post list rendered  │
│ Time to content        │ JS load + fetch + render │ Server fetch + render    │
│ SEO                    │ Crawler sees empty page  │ Crawler sees full content│
│ Data fetching          │ useEffect on client      │ async/await on server    │
│ Loading state          │ Manual useState          │ loading.js convention    │
│ Error handling         │ Manual useState          │ error.js convention      │
│ Bundle size            │ All code in client       │ PostCard only on client  │
│ Interactive elements   │ All components           │ Only PostCard            │
│ State management       │ posts, loading, error    │ Only expanded per card   │
│ Network requests       │ 2 (HTML + API)           │ 1 (full HTML)           │
└────────────────────────┴──────────────────────────┴──────────────────────────┘
```

**To observe these differences in practice:**

1. **View source** in the browser. The CSR version shows an empty `<div id="root">`. The SSR version shows the complete HTML with all post titles and content visible in the source.

2. **Disable JavaScript** in browser DevTools. The CSR version shows nothing. The SSR version shows the full blog post list (though the "Read more" buttons will not work without JavaScript).

3. **Open the Network tab.** The CSR version shows an initial HTML request followed by a separate API request to fetch posts. The SSR version shows a single HTML request containing all the data.

4. **Throttle the network** to "Slow 3G" in DevTools. The CSR version shows a blank page for several seconds, then a loading spinner, then content. The SSR version shows content much sooner because the data was already fetched on the server (close to the data source) and embedded in the HTML.

### Key Takeaway

Converting from CSR to SSR with the Next.js App Router fundamentally changes where and when data fetching and rendering occur. The most impactful change is moving data fetching from client-side `useEffect` to server-side `async/await` in Server Components. This eliminates the client-side waterfall (HTML, then JS, then API call, then render), reduces the client-side JavaScript bundle (only interactive components ship to the client), and produces HTML that is immediately useful for both users and search engines. The architectural discipline of separating Server Components (data, layout, static content) from Client Components (interactivity, state) leads to applications that are faster, smaller, and more maintainable.

---

## Chapter Summary

Server-side React encompasses a spectrum of rendering strategies, each with distinct tradeoffs. CSR maximizes simplicity and interactivity at the cost of initial load performance and SEO. SSR delivers fast visual content at the cost of server infrastructure and the hydration gap. SSG provides the fastest possible delivery for static content. ISR bridges the gap between static and dynamic. React Server Components represent the latest evolution: components that run exclusively on the server, access data directly, and contribute zero bytes to the client bundle. Streaming SSR with Suspense boundaries eliminates the "slowest component determines TTFB" bottleneck of traditional SSR, enabling progressive page loading and selective hydration. The Next.js App Router codifies these patterns into file conventions, making Server Components, streaming, and server-side data fetching accessible through a structured, convention-based architecture.

## Further Reading

- [React Documentation: Server Components](https://react.dev/reference/rsc/server-components) for the official mental model, rules, and API reference for Server Components
- [React Documentation: renderToPipeableStream](https://react.dev/reference/react-dom/server/renderToPipeableStream) for the streaming SSR API reference
- [Next.js Documentation: App Router](https://nextjs.org/docs/app) for comprehensive coverage of file conventions, data fetching, caching, and Server Actions
- [Next.js Documentation: Server Actions and Mutations](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) for the official guide to Server Actions
- [Dan Abramov and the React Team: "React Server Components" RFC](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md) for the original design rationale and architectural decisions behind RSC
- [Josh Comeau: "Making Sense of React Server Components"](https://www.joshwcomeau.com/react/server-components/) for an accessible visual explanation of the RSC mental model
- [Vercel Blog: "Understanding React Server Components"](https://vercel.com/blog/understanding-react-server-components) for practical patterns and performance analysis of RSC in production
