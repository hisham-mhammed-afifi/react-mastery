# Part 3, Chapter 7: Routing

## What You Will Learn

- Explain how client-side routing works using the History API (`pushState`, `popstate`) without full page reloads
- Configure React Router with nested routes, layout routes, dynamic parameters, and the `<Outlet />` component
- Implement protected routes that redirect unauthenticated users while handling loading states correctly
- Use route loaders to fetch data before a component renders, eliminating loading spinners on navigation
- Apply route-based code splitting with `React.lazy` and `Suspense` to reduce initial bundle size
- Attach error boundaries to individual routes for granular error recovery
- Build a complete multi-page application with authentication, nested layouts, and lazy-loaded routes

---

## 7.1 Client-Side Routing: How It Works (History API)

Traditional web navigation triggers a full page reload for every URL change. The browser sends a request to the server, receives a new HTML document, tears down the current page, and renders the new one. Client-side routing eliminates this cycle by intercepting navigation events and updating the URL and rendered content without a page reload.

### The History API

The browser's History API provides two methods that enable client-side routing:

```javascript
// pushState: add a new entry to the browser's history stack
// The URL changes but NO page reload occurs
window.history.pushState(
  { page: "products" },    // state object (serializable data)
  "",                       // title (ignored by most browsers)
  "/products"               // new URL path
);

// replaceState: replace the current history entry
// The URL changes but the history stack length stays the same
window.history.replaceState(null, "", "/products?sort=price");
```

When the user clicks the browser's back or forward button, a `popstate` event fires:

```javascript
window.addEventListener("popstate", (event) => {
  // event.state contains the state object from pushState
  console.log("Navigated to:", window.location.pathname);
  console.log("State:", event.state);
  // The application reads the new URL and renders the appropriate content
});
```

### A Minimal Client-Side Router

```javascript
// Conceptual implementation (simplified)
function createRouter(routes) {
  function navigate(path) {
    window.history.pushState(null, "", path);
    render(path);
  }

  function render(path) {
    const route = routes.find((r) => matchPath(r.path, path));
    if (route) {
      document.getElementById("root").innerHTML = "";
      route.render(document.getElementById("root"));
    }
  }

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    render(window.location.pathname);
  });

  // Intercept link clicks
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-link]");
    if (link) {
      e.preventDefault();
      navigate(link.getAttribute("href"));
    }
  });

  // Initial render
  render(window.location.pathname);

  return { navigate };
}
```

React Router abstracts all of this, providing a declarative API where routes are described as components and navigation happens through `<Link>` components and the `useNavigate` hook.

---

## 7.2 React Router v7: Setup and Core Concepts

React Router v7 (the latest major version) consolidates imports into the `react-router` package. It offers three modes of increasing capability: declarative (basic URL matching), data (loaders, actions, fetchers), and framework (file-based routing, SSR). This chapter covers declarative and data modes, which are the standard for single-page applications.

### Basic Setup (Declarative Mode)

```javascript
import { BrowserRouter, Routes, Route, Link } from "react-router";

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/products">Products</Link>
        <Link to="/about">About</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Data Mode Setup (with Loaders and Actions)

```javascript
import { createBrowserRouter, RouterProvider } from "react-router";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      { index: true, element: <Home />, loader: homeLoader },
      { path: "products", element: <Products />, loader: productsLoader },
      { path: "products/:productId", element: <ProductDetail />, loader: productLoader },
      { path: "about", element: <About /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}
```

Data mode uses `createBrowserRouter` with a route configuration object (not JSX). This enables React Router to run loaders before components render, eliminating the render-then-fetch waterfall.

### Core Components and Hooks

| Component/Hook | Purpose |
|---------------|---------|
| `<Link to="/path">` | Declarative navigation (renders an `<a>` tag) |
| `<NavLink>` | Like `<Link>` but adds `active` class when the route matches |
| `<Outlet />` | Renders the matched child route inside a parent layout |
| `useParams()` | Read dynamic route parameters (`/:productId`) |
| `useNavigate()` | Programmatic navigation function |
| `useLocation()` | Current location object (pathname, search, state) |
| `useSearchParams()` | Read and write URL search parameters |
| `useLoaderData()` | Access data returned by the route's loader |

---

## 7.3 Nested Routes and Layouts

Nested routes allow child routes to render inside a parent layout. The parent component renders an `<Outlet />` that serves as a placeholder for the matched child.

```javascript
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      {
        path: "dashboard",
        element: <DashboardLayout />,
        children: [
          { index: true, element: <DashboardOverview /> },
          { path: "analytics", element: <Analytics /> },
          { path: "settings", element: <Settings /> },
        ],
      },
      { path: "about", element: <About /> },
    ],
  },
]);

function AppLayout() {
  return (
    <div className="app">
      <header>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>
      <main>
        <Outlet /> {/* Child routes render here */}
      </main>
      <footer>App Footer</footer>
    </div>
  );
}

function DashboardLayout() {
  return (
    <div className="dashboard">
      <aside className="sidebar">
        <NavLink to="/dashboard" end>Overview</NavLink>
        <NavLink to="/dashboard/analytics">Analytics</NavLink>
        <NavLink to="/dashboard/settings">Settings</NavLink>
      </aside>
      <section className="dashboard-content">
        <Outlet /> {/* Dashboard child routes render here */}
      </section>
    </div>
  );
}
```

When the user navigates to `/dashboard/analytics`:
1. `AppLayout` renders (providing the app header and footer)
2. Inside `AppLayout`'s `<Outlet />`, `DashboardLayout` renders (providing the sidebar)
3. Inside `DashboardLayout`'s `<Outlet />`, `Analytics` renders

### Layout Routes (Pathless Routes)

A route without a `path` serves as a layout wrapper without consuming a URL segment:

```javascript
{
  // No path: this is a layout route
  element: <AuthenticatedLayout />,
  children: [
    { path: "dashboard", element: <Dashboard /> },
    { path: "profile", element: <Profile /> },
    { path: "settings", element: <Settings /> },
  ],
}
```

All three child routes share `AuthenticatedLayout` without the URL containing an extra segment. The URLs are `/dashboard`, `/profile`, and `/settings`, not `/authenticated/dashboard`.

---

## 7.4 Dynamic Routes and Route Parameters

Dynamic segments in route paths capture variable parts of the URL:

```javascript
const router = createBrowserRouter([
  {
    path: "products/:productId",
    element: <ProductDetail />,
    loader: async ({ params }) => {
      // params.productId contains the captured value
      const res = await fetch(`/api/products/${params.productId}`);
      if (!res.ok) throw new Response("Not Found", { status: 404 });
      return res.json();
    },
  },
  {
    path: "users/:userId/posts/:postId",
    element: <UserPost />,
    // Multiple dynamic segments
  },
]);

function ProductDetail() {
  const params = useParams();
  const product = useLoaderData();

  // params.productId is available here
  return (
    <div>
      <h1>{product.name}</h1>
      <p>Product ID: {params.productId}</p>
    </div>
  );
}
```

### Optional Segments and Splat Routes

```javascript
// Optional segment (matches /products and /products/electronics)
{ path: "products/:category?" }

// Splat route: matches everything after /files/
{ path: "files/*" }
// Access via params["*"]: e.g., "documents/2024/report.pdf"
```

---

## 7.5 Protected Routes / Auth Guards

Protected routes redirect unauthenticated users to a login page. The standard pattern uses a layout route that checks authentication state and either renders the child routes or redirects.

```javascript
import { Navigate, Outlet, useLocation } from "react-router";

function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Critical: show a loading state while auth is being verified.
  // Redirecting before auth resolves causes a flash to the login page
  // even for authenticated users.
  if (isLoading) {
    return <div className="auth-loading"><Spinner /></div>;
  }

  if (!user) {
    // Redirect to login, preserving the intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

// Route configuration
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      {
        // Layout route: wraps all protected children
        element: <ProtectedRoute />,
        children: [
          { path: "dashboard", element: <Dashboard /> },
          { path: "profile", element: <Profile /> },
          { path: "settings", element: <Settings /> },
        ],
      },
    ],
  },
]);
```

### Redirecting Back After Login

```javascript
function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleLogin(credentials) {
    await login(credentials);
    // Navigate to the page the user originally requested
    const destination = location.state?.from?.pathname || "/dashboard";
    navigate(destination, { replace: true });
  }

  return <LoginForm onSubmit={handleLogin} />;
}
```

### Role-Based Access Control

```javascript
function RoleGuard({ allowedRoles, children }) {
  const { user } = useAuth();

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

// Usage in routes
{
  element: <ProtectedRoute />,
  children: [
    { path: "dashboard", element: <Dashboard /> },
    {
      element: <RoleGuard allowedRoles={["admin"]} />,
      children: [
        { path: "admin", element: <AdminPanel /> },
        { path: "admin/users", element: <UserManagement /> },
      ],
    },
  ],
}
```

> **Common Mistake:** Redirecting to login before the authentication check completes. When the app first loads, `isLoading` is `true` while the auth token is being validated. If the guard redirects based on `user === null` without checking `isLoading`, authenticated users see a brief flash of the login page before being redirected back to their intended page. Always render a loading state until `isLoading` resolves to `false`.

---

## 7.6 Data Loading with Route Loaders

Route loaders fetch data before the component renders, eliminating the "render then fetch" waterfall where the component mounts, shows a spinner, starts fetching, and re-renders when data arrives.

```javascript
// Define the loader alongside the route
async function productsLoader({ request }) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "all";

  const res = await fetch(`/api/products?category=${category}`);
  if (!res.ok) throw new Response("Failed to load products", { status: res.status });
  return res.json();
}

const router = createBrowserRouter([
  {
    path: "products",
    element: <Products />,
    loader: productsLoader,
    errorElement: <ProductsError />,
  },
]);

// Component: data is already available when it renders
function Products() {
  const products = useLoaderData();

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>
          <Link to={`/products/${p.id}`}>{p.name}</Link>
        </li>
      ))}
    </ul>
  );
}
```

### Loaders Run in Parallel for Nested Routes

When navigating to `/dashboard/analytics`, React Router calls the loaders for both `DashboardLayout` and `Analytics` simultaneously, not sequentially. This eliminates the nested waterfall (parent loads, then child loads).

### Using Loaders for Auth Guards

```javascript
async function protectedLoader({ request }) {
  const user = await getAuthUser();
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?returnTo=${url.pathname}`);
  }
  return user;
}

{
  path: "dashboard",
  element: <Dashboard />,
  loader: protectedLoader,  // Redirects before component even mounts
}
```

---

## 7.7 Programmatic Navigation

```javascript
import { useNavigate } from "react-router";

function SearchForm() {
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const query = formData.get("query");
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="query" placeholder="Search..." />
      <button type="submit">Search</button>
    </form>
  );
}

// Navigation options
navigate("/products");                      // Push new entry
navigate("/products", { replace: true });   // Replace current entry
navigate(-1);                               // Go back one step
navigate("/checkout", { state: { from: "cart" } }); // Pass state
```

### When to Use `<Link>` vs `useNavigate`

| Scenario | Use |
|----------|-----|
| Static navigation links in the UI | `<Link to="/path">` |
| Navigation after a form submission | `useNavigate()` |
| Navigation after an async operation | `useNavigate()` |
| Conditional redirect based on state | `<Navigate to="/path" />` |

> **Common Mistake:** Using `useNavigate()` to create click handlers when `<Link>` would suffice. `<Link>` renders a semantic `<a>` tag, which provides hover previews, right-click "open in new tab", keyboard accessibility, and screen reader support. Reserve `useNavigate()` for programmatic navigation that follows non-link user actions (form submissions, button clicks with side effects, post-authentication redirects).

---

## 7.8 Search Params as State

URL search parameters provide shareable, bookmarkable state that survives page refreshes and browser navigation.

```javascript
import { useSearchParams } from "react-router";

function ProductFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get("category") || "all";
  const sortBy = searchParams.get("sort") || "name";
  const page = parseInt(searchParams.get("page") || "1", 10);

  function updateFilter(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      if (key !== "page") next.set("page", "1"); // Reset page on filter change
      return next;
    });
  }

  return (
    <div>
      <select
        value={category}
        onChange={(e) => updateFilter("category", e.target.value)}
      >
        <option value="all">All Categories</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>

      <select
        value={sortBy}
        onChange={(e) => updateFilter("sort", e.target.value)}
      >
        <option value="name">Name</option>
        <option value="price">Price</option>
        <option value="rating">Rating</option>
      </select>

      <p>Showing {category} products sorted by {sortBy}, page {page}</p>
    </div>
  );
}
// URL: /products?category=electronics&sort=price&page=1
```

> **See Also:** Part 3, Chapter 4, Section 4.10 for URL-as-state patterns and the nuqs library for type-safe search param management.

---

## 7.9 Code Splitting per Route (Lazy Loading)

Route-level code splitting is the highest-impact application of `React.lazy` because routes are natural boundaries where users expect a brief transition.

```javascript
import { lazy, Suspense } from "react";

// Each route component is loaded on demand
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const Analytics = lazy(() => import("./pages/Analytics"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <Home />
          </Suspense>
        ),
      },
      {
        path: "dashboard",
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <Dashboard />
          </Suspense>
        ),
      },
      {
        path: "settings",
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <Settings />
          </Suspense>
        ),
      },
    ],
  },
]);
```

### React Router's `lazy` Property (Data Mode)

In data mode, the `lazy` function on a route object dynamically imports the route module, including its component, loader, and action:

```javascript
const router = createBrowserRouter([
  {
    path: "analytics",
    lazy: async () => {
      const { Analytics, analyticsLoader } = await import("./pages/Analytics");
      return {
        Component: Analytics,
        loader: analyticsLoader,
      };
    },
  },
]);
```

This approach loads both the component code and the data-fetching logic on demand, and React Router can begin loading them in parallel with the route transition.

### Preloading on Hover

```javascript
function PreloadLink({ to, children, importFn, ...props }) {
  function handleMouseEnter() {
    // Start loading the chunk before the user clicks
    importFn();
  }

  return (
    <Link to={to} onMouseEnter={handleMouseEnter} {...props}>
      {children}
    </Link>
  );
}

// Usage
const loadDashboard = () => import("./pages/Dashboard");
const Dashboard = lazy(loadDashboard);

<PreloadLink to="/dashboard" importFn={loadDashboard}>
  Dashboard
</PreloadLink>
```

### Handling Chunk Load Failures

After a deployment, old chunk filenames may no longer exist on the server. The user sees a blank page or a cryptic error. An error boundary with a reload strategy handles this gracefully:

```javascript
class ChunkErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    if (error.name === "ChunkLoadError" || error.message?.includes("Loading chunk")) {
      return { hasError: true };
    }
    throw error; // Re-throw non-chunk errors
  }

  handleRetry = () => {
    // Reload the page to fetch updated chunk manifests
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="chunk-error">
          <p>A new version is available.</p>
          <button onClick={this.handleRetry}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

## 7.10 Route-Based Error Boundaries

React Router's `errorElement` property provides per-route error handling. When a loader, action, or component throws an error, the nearest `errorElement` renders instead of the route's component.

```javascript
import { useRouteError, isRouteErrorResponse, Link } from "react-router";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RootError />,   // Catches errors from all child routes
    children: [
      { index: true, element: <Home /> },
      {
        path: "products/:productId",
        element: <ProductDetail />,
        loader: productLoader,
        errorElement: <ProductError />, // Route-specific error boundary
      },
    ],
  },
]);

function ProductError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    // Thrown Responses (e.g., throw new Response("Not Found", { status: 404 }))
    return (
      <div className="error-page">
        <h2>{error.status} {error.statusText}</h2>
        <p>{error.data}</p>
        <Link to="/products">Back to Products</Link>
      </div>
    );
  }

  // Unexpected errors (runtime exceptions)
  return (
    <div className="error-page">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <Link to="/">Go Home</Link>
    </div>
  );
}

function RootError() {
  const error = useRouteError();

  return (
    <div className="fatal-error">
      <h1>Application Error</h1>
      <p>An unexpected error occurred. Please refresh the page.</p>
      {import.meta.env.DEV && <pre>{error.stack}</pre>}
    </div>
  );
}
```

Error boundaries in React Router are granular: a product detail page can fail without taking down the entire application. The parent layout (with its navigation) remains intact, and only the errored route's area shows the error component.

---

## 7.11 Exercise: Build a Multi-Page App with Auth, Nested Routes, and Lazy Loading

### Problem Statement

Build a small application with: a public home page, a login page, a protected dashboard with three nested sub-pages (overview, analytics, settings), role-based access for an admin page, route-based code splitting for all pages, and proper error boundaries.

### Solution

```javascript
import { createBrowserRouter, RouterProvider } from "react-router";
import { lazy, Suspense } from "react";

// Lazy-loaded pages (code-split per route)
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const DashboardOverview = lazy(() => import("./pages/DashboardOverview"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

// Page wrapper with Suspense
function LazyPage({ children }) {
  return (
    <Suspense fallback={<div className="page-loading"><Spinner /></div>}>
      {children}
    </Suspense>
  );
}

// Auth guard (layout route)
function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

// Role guard
function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

// Route configuration
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RootError />,
    children: [
      // Public routes
      {
        index: true,
        element: <LazyPage><Home /></LazyPage>,
      },
      {
        path: "login",
        element: <LazyPage><Login /></LazyPage>,
      },

      // Protected routes (require authentication)
      {
        element: <RequireAuth />,
        children: [
          {
            path: "dashboard",
            element: <DashboardLayout />,
            children: [
              {
                index: true,
                element: <LazyPage><DashboardOverview /></LazyPage>,
              },
              {
                path: "analytics",
                element: <LazyPage><Analytics /></LazyPage>,
                errorElement: <RouteError />,
              },
              {
                path: "settings",
                element: <LazyPage><Settings /></LazyPage>,
              },
            ],
          },

          // Admin-only routes
          {
            element: <RequireRole roles={["admin"]} />,
            children: [
              {
                path: "admin",
                element: <LazyPage><AdminPanel /></LazyPage>,
              },
            ],
          },
        ],
      },

      // Catch-all
      { path: "*", element: <NotFound /> },
    ],
  },
]);

// App entry point
function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

// Shared layout with navigation
function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header>
        <nav>
          <Link to="/">Home</Link>
          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              {user.role === "admin" && <Link to="/admin">Admin</Link>}
              <button onClick={logout}>Logout</button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

// Dashboard sub-layout with sidebar navigation
function DashboardLayout() {
  return (
    <div className="dashboard-layout">
      <aside>
        <NavLink to="/dashboard" end>Overview</NavLink>
        <NavLink to="/dashboard/analytics">Analytics</NavLink>
        <NavLink to="/dashboard/settings">Settings</NavLink>
      </aside>
      <section className="dashboard-content">
        <Outlet />
      </section>
    </div>
  );
}

// Route-specific error boundary
function RouteError() {
  const error = useRouteError();
  return (
    <div className="route-error">
      <h3>Failed to load this section</h3>
      <p>{error.message}</p>
      <Link to="/dashboard">Back to Dashboard</Link>
    </div>
  );
}
```

### Architecture Decisions Explained

| Decision | Reasoning |
|----------|-----------|
| `createBrowserRouter` (data mode) | Enables `errorElement` per route and future loader adoption |
| `RequireAuth` as a layout route | All protected children share one auth check; no repetition |
| `RequireRole` as a nested layout route | Role checks compose naturally with auth checks |
| `React.lazy` for every page | Each route is a separate chunk; initial load includes only the landing page |
| `<Suspense>` wrapped in `LazyPage` | Consistent loading experience across all lazy routes |
| `errorElement` on specific routes | Analytics can fail without breaking the rest of the dashboard |
| `location.state.from` in auth redirect | Users return to their intended page after login |
| `NavLink` in sidebar | Active route gets highlighted automatically via the `active` class |

### Key Takeaway

A well-structured routing architecture layers three concerns: layout (nested routes with `<Outlet />`), access control (layout routes for auth and role guards), and performance (lazy loading per route with Suspense). Each concern is handled by a separate mechanism (route nesting, guard components, `React.lazy`), and they compose without conflicting. The `errorElement` property provides granular error recovery, ensuring that a failure in one section does not take down the entire application.

---

## Chapter Summary

Client-side routing intercepts navigation via the History API, updating the URL and rendered content without page reloads. React Router v7 provides three modes; data mode adds loaders and actions that fetch data before components mount, eliminating the render-then-fetch waterfall. Nested routes with `<Outlet />` create composable layouts, and layout routes (pathless routes) enable cross-cutting concerns like authentication guards. Protected routes check auth state and redirect, with careful attention to loading states to prevent flash-of-login-page bugs. Route-based code splitting via `React.lazy` and `Suspense` reduces initial bundle size, and per-route `errorElement` provides granular error recovery. Search parameters serve as shareable, bookmarkable state for filters, pagination, and configuration.

## Further Reading

- [Picking a Mode (React Router Documentation)](https://reactrouter.com/start/modes) — official guide to declarative, data, and framework modes
- [Route Object (React Router Documentation)](https://reactrouter.com/start/data/route-object) — complete route configuration reference
- [Protected Routes and Authentication (UI.dev)](https://ui.dev/react-router-protected-routes-authentication) — the canonical auth guard tutorial
- [Code Splitting with React.lazy and Suspense (web.dev)](https://web.dev/articles/code-splitting-suspense) — route-based splitting patterns
- [TanStack Router Comparison (TanStack Documentation)](https://tanstack.com/router/latest/docs/framework/react/comparison) — how TanStack Router compares to React Router
- [React Router 7: Private Routes (Robin Wieruch)](https://www.robinwieruch.de/react-router-private-routes/) — practical protected route patterns for v7
