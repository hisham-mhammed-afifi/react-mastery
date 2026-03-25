# Part 4, Chapter 7: Project Architecture

## What You Will Learn

- Design a feature-based folder structure that scales from a single developer to a large team without requiring reorganization
- Evaluate barrel files (index.js re-exports) and determine when they improve developer experience versus when they degrade build performance and editor tooling
- Implement a layered architecture (UI, Hooks, Services, API) that enforces separation of concerns and makes each layer independently testable
- Enforce dependency boundaries using ESLint rules so that architectural violations surface as lint errors during development
- Choose between Turborepo, Nx, and pnpm workspaces for monorepo management based on team size, project complexity, and tooling requirements
- Architect a centralized, mockable API layer that integrates cleanly with TanStack Query and supports environment-specific configuration
- Configure path aliases across Vite, Next.js, and testing tools so that imports remain clean and refactoring remains safe

---

## 7.1 Feature-Based Folder Structure (vs File-Type Based)

### The File-Type Approach and Its Limits

Most React tutorials introduce a structure organized by file type:

```
src/
  components/
    Header.js
    Footer.js
    UserProfile.js
    UserAvatar.js
    ProductCard.js
    ProductList.js
    CartItem.js
    CartSummary.js
    CheckoutForm.js
    CheckoutConfirmation.js
  hooks/
    useAuth.js
    useCart.js
    useProducts.js
    useUser.js
  services/
    authService.js
    cartService.js
    productService.js
    userService.js
  utils/
    formatCurrency.js
    validateEmail.js
```

This structure works for small applications with fewer than 20 components. It breaks down as the application grows for three reasons. First, a single `components/` folder becomes a flat list of hundreds of files with no indication of which components belong together. Second, understanding a feature requires jumping between `components/`, `hooks/`, `services/`, and `utils/` directories. Third, deleting a feature means hunting through every directory to find and remove the relevant files.

### The Feature-Based Approach

A feature-based structure groups files by the business capability they serve:

```
src/
  features/
    auth/
      components/
        LoginForm.js
        RegisterForm.js
        PasswordResetForm.js
      hooks/
        useAuth.js
        useSession.js
      services/
        authService.js
      utils/
        tokenStorage.js
      index.js
    cart/
      components/
        CartItem.js
        CartSummary.js
        CartBadge.js
      hooks/
        useCart.js
        useCartTotal.js
      services/
        cartService.js
      index.js
    products/
      components/
        ProductCard.js
        ProductList.js
        ProductDetail.js
        ProductFilters.js
      hooks/
        useProducts.js
        useProductSearch.js
      services/
        productService.js
      index.js
  shared/
    components/
      Button.js
      Input.js
      Modal.js
      Spinner.js
    hooks/
      useDebounce.js
      useMediaQuery.js
    utils/
      formatCurrency.js
      formatDate.js
  app/
    App.js
    routes.js
    providers.js
```

The structure communicates architecture. A developer joining the team can immediately see the application's business domains. Deleting the `cart/` feature means removing a single directory. The `shared/` directory contains only code that is genuinely used across multiple features.

### Practical Rules for Feature Boundaries

Deciding where one feature ends and another begins is the hardest part of this approach. Apply these guidelines:

1. **A feature maps to a user-facing capability.** "Authentication," "Shopping Cart," and "Product Catalog" are features. "Buttons" and "Formatters" are not; they belong in `shared/`.

2. **A feature owns its data.** If a feature needs data from another feature, it should receive that data through props, context, or a shared state manager. It should not import another feature's service or hook directly.

3. **When two features share a component, lift it to `shared/`.** Do not let features import from each other's internal directories.

4. **Keep features shallow.** Two levels of nesting within a feature (`features/auth/components/LoginForm.js`) is ideal. Three levels is acceptable. Four or more levels signals that the feature should be split.

```javascript
// features/auth/index.js
// Public API of the auth feature.
// Other features import ONLY through this file.
export { LoginForm } from './components/LoginForm';
export { RegisterForm } from './components/RegisterForm';
export { useAuth } from './hooks/useAuth';
export { useSession } from './hooks/useSession';
```

```javascript
// features/cart/components/CartSummary.js
// CORRECT: Importing from the auth feature's public API
import { useAuth } from '../../auth';

// WRONG: Reaching into auth's internal structure
// import { useAuth } from '../../auth/hooks/useAuth';

export function CartSummary({ items }) {
  const { user } = useAuth();

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div>
      <h2>Cart for {user.name}</h2>
      <p>Total: ${total.toFixed(2)}</p>
    </div>
  );
}
```

> **Common Mistake:** Developers often create a `components/common/` folder inside a feature for "shared" components that are only used by that feature. If a component is only used within one feature, it is not shared; keep it in the feature's `components/` directory. Move it to `shared/` only when a second feature needs it.

### The Hybrid Approach for Mid-Size Projects

For applications with 5 to 15 features and 3 to 10 developers, a hybrid approach often works best. Core business features use the feature-based pattern, while pages or routes serve as the top-level organizational unit:

```
src/
  features/
    auth/
    cart/
    products/
  pages/
    HomePage.js
    ProductPage.js
    CheckoutPage.js
    AccountPage.js
  shared/
    components/
    hooks/
    utils/
  app/
    App.js
    routes.js
```

Pages compose features. A `CheckoutPage` assembles components from `cart/` and `auth/` without containing business logic itself.

> **See Also:** Part 3, Chapter 1, Section 1.1 for component decomposition principles that inform how to split features into components.

---

## 7.2 Barrel Files: Pros, Cons, and When They Hurt

### What Barrel Files Are

A barrel file is an `index.js` that re-exports symbols from other files in the same directory:

```javascript
// features/auth/index.js (a barrel file)
export { LoginForm } from './components/LoginForm';
export { RegisterForm } from './components/RegisterForm';
export { useAuth } from './hooks/useAuth';
export { useSession } from './hooks/useSession';
```

This allows consumers to write:

```javascript
import { LoginForm, useAuth } from '../auth';
```

instead of:

```javascript
import { LoginForm } from '../auth/components/LoginForm';
import { useAuth } from '../auth/hooks/useAuth';
```

### The Benefits

Barrel files provide three genuine benefits when used correctly:

1. **Encapsulation.** The barrel file becomes the feature's public API. Internal file organization can change without breaking consumers.

2. **Cleaner imports.** A single import statement replaces several, reducing visual noise in the consuming file.

3. **Discoverability.** The barrel file serves as documentation of what the feature exposes.

### The Performance Problem

Barrel files can silently degrade both build-time and runtime performance. When a bundler encounters `import { LoginForm } from '../auth'`, it must load and parse the barrel file, which in turn loads every module that the barrel re-exports. If the barrel re-exports 50 symbols, the bundler must process all 50 modules to determine which are actually used.

```javascript
// A deeply nested barrel chain
// shared/index.js re-exports from:
//   shared/components/index.js which re-exports from:
//     shared/components/Button.js
//     shared/components/Modal.js
//     shared/components/Input.js
//     shared/components/Toast.js
//     ... 40 more components

// When you write:
import { Button } from '../shared';

// The bundler must traverse:
// shared/index.js -> shared/components/index.js -> all 40+ component files
// Even though you only need Button.
```

The impact compounds in several ways:

**Build time.** Projects with extensive barrel files report build tools needing to parse 30,000 to 60,000 modules when only a fraction are actually used. One engineering team at Vercel documented that barrel file optimization in Next.js reduced compile times significantly for applications using large component libraries.

**Test runner startup.** Jest and Vitest follow the same import resolution as the bundler. Importing a single utility through a barrel file that re-exports an entire library forces the test runner to parse the full module graph before executing a single test.

**IDE performance.** When every import resolves to an `index.js`, "Go to Definition" lands on the barrel file instead of the actual implementation. Auto-import suggestions may slow down as the language server processes large barrel files.

**Tree-shaking limitations.** While modern bundlers like Vite (using Rollup) and webpack 5 can tree-shake unused exports in many cases, barrel files make this harder. Side effects in any module within the barrel's graph can prevent the bundler from eliminating unused code.

### Guidelines for Barrel File Usage

Use barrel files at feature boundaries, where the encapsulation benefit is highest and the re-export count is manageable (fewer than 15 to 20 exports). Avoid barrel files for:

- The `shared/` directory if it contains more than 30 modules
- Nested barrel files that re-export other barrel files (barrel chains)
- Directories where every file is typically imported individually

```javascript
// GOOD: Feature-level barrel with a small surface area
// features/auth/index.js
export { LoginForm } from './components/LoginForm';
export { useAuth } from './hooks/useAuth';

// BAD: Shared-level barrel that re-exports everything
// shared/index.js
export * from './components';    // 40+ components
export * from './hooks';         // 20+ hooks
export * from './utils';         // 30+ utilities
// Importing one utility forces the bundler to process 90+ modules.
```

```javascript
// PREFERRED: Direct imports for large shared directories
import { Button } from '@/shared/components/Button';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatCurrency } from '@/shared/utils/formatCurrency';
```

> **Common Mistake:** Using `export * from './module'` in barrel files instead of named re-exports. The wildcard syntax makes it impossible to determine the barrel's public API by reading the file, and it re-exports every symbol from the module, including internal helpers that were never intended to be public.

Next.js introduced the `optimizePackageImports` configuration option to address barrel file performance for third-party libraries. When a package is listed in this option, Next.js transforms barrel imports into direct imports at build time:

```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material', 'lodash-es'],
  },
};
```

> **See Also:** Part 4, Chapter 1, Section 1.10 for bundle analysis techniques that reveal barrel file impact on bundle size.

---

## 7.3 Layer Architecture: UI > Hooks > Services > API

### The Four Layers

A layered architecture separates concerns into distinct tiers, where each layer has a clear responsibility and a defined set of allowed dependencies:

```
┌─────────────────────────────────────┐
│            UI Layer                 │  React components (JSX, styling, layout)
│  Depends on: Hooks                 │
├─────────────────────────────────────┤
│           Hooks Layer              │  Custom hooks (state, effects, composition)
│  Depends on: Services              │
├─────────────────────────────────────┤
│         Services Layer             │  Business logic (pure functions, transformations)
│  Depends on: API                   │
├─────────────────────────────────────┤
│           API Layer                │  Network calls (fetch, axios, endpoints)
│  Depends on: nothing internal      │
└─────────────────────────────────────┘
```

**UI Layer.** Components receive data through props or hooks and render JSX. They contain no business logic, no direct API calls, and no data transformation beyond simple display formatting.

**Hooks Layer.** Custom hooks compose built-in hooks (`useState`, `useEffect`, `useMemo`) and call into the Services layer. They manage the interaction between React's lifecycle and the application's business logic.

**Services Layer.** Pure JavaScript functions and classes that implement business rules, data transformations, and validation. This layer has no awareness of React; it can be tested with plain JavaScript tests.

**API Layer.** Functions that make network requests and return raw data. This layer handles endpoint URLs, HTTP methods, headers, and request/response serialization.

### Implementation Example

Consider a feature that displays a user's order history with computed totals:

```javascript
// features/orders/api/ordersApi.js
// API Layer: Raw network calls, no business logic.
const BASE_URL = '/api/v1';

export async function fetchOrders(userId, { signal } = {}) {
  const response = await fetch(`${BASE_URL}/users/${userId}/orders`, {
    signal,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch orders: ${response.status}`);
  }

  return response.json();
}

export async function fetchOrderById(orderId, { signal } = {}) {
  const response = await fetch(`${BASE_URL}/orders/${orderId}`, {
    signal,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch order: ${response.status}`);
  }

  return response.json();
}
```

```javascript
// features/orders/services/orderService.js
// Services Layer: Pure business logic, no React, no network calls.

export function computeOrderTotal(order) {
  return order.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
}

export function groupOrdersByMonth(orders) {
  const groups = {};

  for (const order of orders) {
    const date = new Date(order.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(order);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthOrders]) => ({
      month,
      orders: monthOrders,
      total: monthOrders.reduce(
        (sum, order) => sum + computeOrderTotal(order),
        0
      ),
    }));
}

export function filterOrdersByStatus(orders, status) {
  if (status === 'all') return orders;
  return orders.filter((order) => order.status === status);
}
```

```javascript
// features/orders/hooks/useOrders.js
// Hooks Layer: Bridges React lifecycle with business logic.
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOrders } from '../api/ordersApi';
import {
  groupOrdersByMonth,
  filterOrdersByStatus,
} from '../services/orderService';

export function useOrders(userId) {
  const [statusFilter, setStatusFilter] = useState('all');

  const {
    data: orders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['orders', userId],
    queryFn: ({ signal }) => fetchOrders(userId, { signal }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const filteredOrders = useMemo(
    () => (orders ? filterOrdersByStatus(orders, statusFilter) : []),
    [orders, statusFilter]
  );

  const groupedOrders = useMemo(
    () => groupOrdersByMonth(filteredOrders),
    [filteredOrders]
  );

  return {
    groupedOrders,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
  };
}
```

```javascript
// features/orders/components/OrderHistory.js
// UI Layer: Rendering only. No business logic, no API calls.
import { useOrders } from '../hooks/useOrders';
import { OrderGroup } from './OrderGroup';
import { StatusFilter } from './StatusFilter';
import { Spinner } from '@/shared/components/Spinner';
import { ErrorMessage } from '@/shared/components/ErrorMessage';

export function OrderHistory({ userId }) {
  const { groupedOrders, isLoading, error, statusFilter, setStatusFilter } =
    useOrders(userId);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage message={error.message} />;

  return (
    <section>
      <h2>Order History</h2>
      <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      {groupedOrders.map((group) => (
        <OrderGroup key={group.month} group={group} />
      ))}
    </section>
  );
}
```

### Why This Layering Matters

**Testability.** The Services layer can be tested with plain `describe`/`it` blocks and no React rendering. The Hooks layer can be tested with `renderHook`. The UI layer can be tested with React Testing Library. Each layer's tests are simpler because they test less.

```javascript
// features/orders/services/__tests__/orderService.test.js
import { computeOrderTotal, groupOrdersByMonth } from '../orderService';

describe('computeOrderTotal', () => {
  it('sums item prices multiplied by quantities', () => {
    const order = {
      items: [
        { unitPrice: 10, quantity: 2 },
        { unitPrice: 5, quantity: 3 },
      ],
    };

    expect(computeOrderTotal(order)).toBe(35);
  });
});

describe('groupOrdersByMonth', () => {
  it('groups orders by year-month and sorts descending', () => {
    const orders = [
      { createdAt: '2025-01-15', items: [{ unitPrice: 10, quantity: 1 }] },
      { createdAt: '2025-02-20', items: [{ unitPrice: 20, quantity: 1 }] },
      { createdAt: '2025-01-25', items: [{ unitPrice: 30, quantity: 1 }] },
    ];

    const result = groupOrdersByMonth(orders);

    expect(result).toHaveLength(2);
    expect(result[0].month).toBe('2025-02');
    expect(result[1].month).toBe('2025-01');
    expect(result[1].orders).toHaveLength(2);
  });
});
```

**Replaceability.** Switching from `fetch` to `axios`, or from a REST API to GraphQL, requires changes only in the API layer. The Services layer, Hooks layer, and UI layer remain untouched.

**Reusability across frameworks.** The Services and API layers contain no React code. If the team builds a React Native companion app or migrates to a different framework, these layers transfer directly.

> **See Also:** Part 4, Chapter 6, Section 6.4 for how React Testing Library's philosophy aligns with testing each layer at the appropriate level of abstraction.

---

## 7.4 Dependency Boundaries: What Can Import What

### The Import Rules

A well-architected codebase enforces directional dependencies. Violations of these rules create circular dependencies, tight coupling, and features that cannot be modified or deleted independently.

```
Allowed dependency direction:

  pages/ ──→ features/ ──→ shared/
    │            │             │
    │            ▼             │
    │         features/       │
    │       (via public API)   │
    ▼                          ▼
  app/                       (nothing)

Layer dependencies (within a feature):
  UI ──→ Hooks ──→ Services ──→ API

Forbidden:
  ✗ shared/ cannot import from features/
  ✗ features/ cannot import from pages/
  ✗ API layer cannot import from Hooks layer
  ✗ Services layer cannot import from UI layer
```

### Enforcing with ESLint

The `eslint-plugin-boundaries` package turns architectural rules into lint errors. Install it alongside `eslint-plugin-import`:

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'app', pattern: 'src/app/*' },
      { type: 'pages', pattern: 'src/pages/*' },
      { type: 'features', pattern: 'src/features/*' },
      { type: 'shared', pattern: 'src/shared/*' },
    ],
    'boundaries/ignore': ['**/*.test.js', '**/*.spec.js'],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          {
            // App can import from anywhere
            from: 'app',
            allow: ['pages', 'features', 'shared'],
          },
          {
            // Pages can import from features and shared
            from: 'pages',
            allow: ['features', 'shared'],
          },
          {
            // Features can import from other features (public API) and shared
            from: 'features',
            allow: ['features', 'shared'],
          },
          {
            // Shared can only import from other shared modules
            from: 'shared',
            allow: ['shared'],
          },
        ],
      },
    ],
  },
};
```

With this configuration, any import that violates the dependency rules produces an ESLint error:

```javascript
// shared/components/Button.js
import { useAuth } from '../../features/auth';
// ESLint error: "shared" elements are not allowed to import "features" elements.
```

### Using ESLint's Built-In no-restricted-imports

For simpler enforcement without an additional plugin, ESLint's built-in `no-restricted-imports` rule can block specific patterns:

```javascript
// .eslintrc.js (within overrides for shared/)
module.exports = {
  overrides: [
    {
      files: ['src/shared/**/*.js'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/features/**'],
                message: 'Shared modules cannot import from features.',
              },
              {
                group: ['**/pages/**'],
                message: 'Shared modules cannot import from pages.',
              },
            ],
          },
        ],
      },
    },
  ],
};
```

### Nx Module Boundary Enforcement

For monorepos using Nx, the `@nx/enforce-module-boundaries` rule provides even richer boundary enforcement using tags:

```javascript
// Each project in the monorepo gets tags in project.json
// libs/shared/ui/project.json
{
  "tags": ["scope:shared", "type:ui"]
}

// libs/features/auth/project.json
{
  "tags": ["scope:auth", "type:feature"]
}

// .eslintrc.json at the root
{
  "rules": {
    "@nx/enforce-module-boundaries": [
      "error",
      {
        "depConstraints": [
          {
            "sourceTag": "type:feature",
            "onlyDependOnLibsWithTags": ["type:feature", "type:ui", "type:util"]
          },
          {
            "sourceTag": "scope:shared",
            "notDependOnLibsWithTags": ["type:feature"]
          }
        ]
      }
    ]
  }
}
```

> **Common Mistake:** Setting up dependency boundaries but never running the lint check in CI. Boundaries only work if they are enforced on every pull request. Add `eslint --max-warnings 0` to your CI pipeline so that boundary violations fail the build.

---

## 7.5 Monorepo with Turborepo/Nx: When and Why

### When a Monorepo Is the Right Choice

A monorepo houses multiple packages or applications in a single repository. It is the right choice when:

- Multiple applications share code (a marketing site and a web app share a component library)
- A design system is developed alongside the applications that consume it
- Backend and frontend share validation logic, types, or configuration
- The team wants atomic commits that span multiple packages (change the API and the client in one commit)

A monorepo is the wrong choice when the projects are genuinely independent (different teams, different release cycles, no shared code) or when the team lacks the tooling maturity to manage it.

### Turborepo: Speed and Simplicity

Turborepo focuses on one problem: running package scripts fast. It analyzes the dependency graph defined by `package.json` files, runs tasks in the correct order, parallelizes independent tasks, and caches results.

```
my-monorepo/
  apps/
    web/
      package.json
    docs/
      package.json
  packages/
    ui/
      package.json
    config/
      package.json
    utils/
      package.json
  turbo.json
  package.json
```

```javascript
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

The `^build` syntax means "run the `build` task of all dependencies first." If `web` depends on `ui`, Turborepo builds `ui` before `web`. If `ui` has not changed since the last build, Turborepo replays the cached output.

```javascript
// packages/ui/package.json
{
  "name": "@myapp/ui",
  "version": "0.0.0",
  "main": "./dist/index.js",
  "scripts": {
    "build": "vite build",
    "lint": "eslint ."
  },
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

```javascript
// apps/web/package.json
{
  "name": "@myapp/web",
  "version": "0.0.0",
  "dependencies": {
    "@myapp/ui": "workspace:*",
    "@myapp/utils": "workspace:*",
    "react": "^19.0.0"
  },
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "eslint ."
  }
}
```

**Key Turborepo strengths:**

- Setup takes under 10 minutes on an existing monorepo
- No restructuring required; it works with standard npm/pnpm/yarn workspaces
- Remote caching (via Vercel or self-hosted) shares build caches across CI and developer machines
- Migrated from Go to Rust for better performance

### Nx: Power and Structure

Nx provides a richer feature set at the cost of additional complexity:

```javascript
// nx.json
{
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "cache": true,
      "outputs": ["{projectRoot}/dist"]
    },
    "test": {
      "cache": true
    },
    "lint": {
      "cache": true
    }
  },
  "affected": {
    "defaultBase": "main"
  }
}
```

**Key Nx strengths:**

- **Code generators.** `nx generate @nx/react:component Button --project=ui` scaffolds components, hooks, and tests with consistent patterns.
- **Affected commands.** `nx affected --target=test` runs tests only for projects that changed since the base branch, reducing CI time.
- **Module boundary enforcement.** The `@nx/enforce-module-boundaries` lint rule prevents unauthorized imports between projects.
- **Distributed task execution.** Nx Cloud can distribute build and test tasks across multiple CI machines.
- **Visual dependency graph.** `nx graph` renders an interactive visualization of the project dependency graph.

### pnpm Workspaces: The Lightweight Foundation

Both Turborepo and Nx can run on top of pnpm workspaces. For teams that need shared packages but not task orchestration, pnpm workspaces alone may suffice:

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

pnpm's strict dependency resolution (packages can only access dependencies listed in their own `package.json`) prevents the phantom dependency problem that plagues npm and yarn workspaces.

### Decision Framework

| Factor | Turborepo | Nx | pnpm Workspaces Only |
|--------|-----------|-----|---------------------|
| Setup time | Minutes | Hours | Minutes |
| Learning curve | Low | Medium-High | Minimal |
| Task caching | Yes (local + remote) | Yes (local + Nx Cloud) | No |
| Code generation | No | Yes | No |
| Boundary enforcement | No (use eslint-plugin-boundaries) | Built-in | No |
| Affected commands | Limited | Comprehensive | No |
| Distributed execution | No | Yes (Nx Cloud) | No |
| Best for | Small to mid teams, startups | Large teams, enterprise, multi-app | Minimal sharing needs |

> **Common Mistake:** Adopting a monorepo tool before the project actually needs one. A single application with no shared packages does not benefit from monorepo tooling. The overhead of maintaining workspace configurations, managing cross-package dependencies, and debugging build caching issues outweighs the benefits when there is nothing to share.

---

## 7.6 Shared Package Architecture (Design System, Utils, Config)

### Structuring Shared Packages

In a monorepo, shared code lives in dedicated packages. Each package has a clear responsibility and a well-defined public API:

```
packages/
  ui/                    # Design system components
    src/
      Button.js
      Input.js
      Modal.js
      index.js
    package.json
  utils/                 # Pure utility functions
    src/
      formatCurrency.js
      formatDate.js
      validateEmail.js
      index.js
    package.json
  config/                # Shared configuration
    eslint/
      base.js
      react.js
    prettier/
      index.js
    tsconfig/             # Even in a JS project, jsconfig bases can be shared
      base.json
      react.json
    package.json
  hooks/                 # Shared React hooks
    src/
      useDebounce.js
      useMediaQuery.js
      useLocalStorage.js
      index.js
    package.json
```

### Package API Design

Each shared package exposes a clear entry point. Internal files are not part of the public API:

```javascript
// packages/utils/package.json
{
  "name": "@myapp/utils",
  "version": "0.0.0",
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./formatCurrency": "./src/formatCurrency.js",
    "./formatDate": "./src/formatDate.js",
    "./validateEmail": "./src/validateEmail.js"
  }
}
```

The `exports` field serves two purposes. The `"."` entry defines the default import path. The named entries (`"./formatCurrency"`) allow direct imports that bypass the barrel file, which is critical for large utility packages:

```javascript
// Importing through the barrel (convenient for small packages)
import { formatCurrency, formatDate } from '@myapp/utils';

// Direct import (better for large packages, avoids barrel overhead)
import { formatCurrency } from '@myapp/utils/formatCurrency';
```

### Shared Configuration Packages

Configuration sharing eliminates drift between projects. A common pattern is to publish ESLint and Prettier configurations as packages:

```javascript
// packages/config/eslint/react.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

```javascript
// apps/web/.eslintrc.js
module.exports = {
  extends: [require.resolve('@myapp/config/eslint/react')],
  // Project-specific overrides
  rules: {
    'no-console': 'warn',
  },
};
```

### Versioning Strategy

Within a monorepo, shared packages typically use a fixed version (`"0.0.0"` or `"1.0.0"`) and are referenced via workspace protocol:

```javascript
// apps/web/package.json
{
  "dependencies": {
    "@myapp/ui": "workspace:*",
    "@myapp/utils": "workspace:*"
  }
}
```

The `workspace:*` protocol tells the package manager to resolve the dependency from the local workspace, not from the npm registry. Changes to `@myapp/ui` are immediately available to `apps/web` without publishing.

For packages that are also published to npm (such as a public design system), use tools like Changesets to manage versioning and changelogs:

```
packages/
  ui/
    .changeset/
    CHANGELOG.md
    package.json
```

> **See Also:** Part 4, Chapter 8 for comprehensive design system architecture, including component API design and Storybook integration.

---

## 7.7 Environment Configuration and Feature Flags

### Environment Variables

React applications running in the browser cannot access `process.env` directly. Build tools replace environment variable references at build time with their literal values.

**Vite** exposes variables prefixed with `VITE_`:

```javascript
// .env
VITE_API_BASE_URL=https://api.example.com
VITE_FEATURE_NEW_CHECKOUT=true

// .env.development
VITE_API_BASE_URL=http://localhost:3001

// .env.production
VITE_API_BASE_URL=https://api.example.com
```

```javascript
// src/config/env.js
// Centralize environment variable access in one file.
// This prevents import.meta.env references from scattering across the codebase.

export const config = Object.freeze({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  isProduction: import.meta.env.PROD,
  isDevelopment: import.meta.env.DEV,
  features: {
    newCheckout: import.meta.env.VITE_FEATURE_NEW_CHECKOUT === 'true',
  },
});
```

**Next.js** uses the `NEXT_PUBLIC_` prefix for client-side variables:

```javascript
// .env.local
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
DATABASE_URL=postgresql://localhost:5432/mydb  // Server-only, no prefix

// src/config/env.js
export const config = Object.freeze({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  features: {
    newCheckout: process.env.NEXT_PUBLIC_FEATURE_NEW_CHECKOUT === 'true',
  },
});
```

### Validation at Startup

Failing fast when a required environment variable is missing prevents cryptic runtime errors:

```javascript
// src/config/env.js
function requireEnv(key) {
  const value = import.meta.env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Check your .env file and ensure it is prefixed with VITE_.`
    );
  }
  return value;
}

export const config = Object.freeze({
  apiBaseUrl: requireEnv('VITE_API_BASE_URL'),
  sentryDsn: import.meta.env.VITE_SENTRY_DSN || null, // Optional
  features: {
    newCheckout: import.meta.env.VITE_FEATURE_NEW_CHECKOUT === 'true',
  },
});
```

### Feature Flags: Build-Time vs Runtime

**Build-time flags** (environment variables) are baked into the bundle at build time. Changing a flag requires a new deployment. They are appropriate for flags that change infrequently and affect the build output (such as enabling server-side rendering or switching API providers).

**Runtime flags** are evaluated when the application runs. They can be changed without redeployment, targeted to specific users, and gradually rolled out. They are appropriate for A/B tests, gradual feature rollouts, and kill switches.

### Implementing Runtime Feature Flags

A simple runtime feature flag system uses a React context:

```javascript
// shared/features/FeatureFlagProvider.js
import { createContext, useContext, useState, useEffect } from 'react';

const FeatureFlagContext = createContext({});

export function FeatureFlagProvider({ children, initialFlags = {} }) {
  const [flags, setFlags] = useState(initialFlags);

  useEffect(() => {
    // Fetch flags from your feature flag service.
    // This could be LaunchDarkly, Unleash, Flagsmith, or a custom endpoint.
    async function loadFlags() {
      try {
        const response = await fetch('/api/feature-flags');
        if (response.ok) {
          const remoteFlags = await response.json();
          setFlags((prev) => ({ ...prev, ...remoteFlags }));
        }
      } catch (error) {
        // Silently fall back to initial flags on error.
        console.error('Failed to load feature flags:', error);
      }
    }

    loadFlags();
  }, []);

  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlag(flagName) {
  const flags = useContext(FeatureFlagContext);
  return flags[flagName] ?? false;
}
```

```javascript
// features/checkout/components/CheckoutPage.js
import { useFeatureFlag } from '@/shared/features/FeatureFlagProvider';
import { NewCheckoutFlow } from './NewCheckoutFlow';
import { LegacyCheckoutFlow } from './LegacyCheckoutFlow';

export function CheckoutPage() {
  const useNewCheckout = useFeatureFlag('new-checkout-flow');

  // Render the entire component tree based on the flag.
  // Avoid sprinkling flag checks deep inside components.
  return useNewCheckout ? <NewCheckoutFlow /> : <LegacyCheckoutFlow />;
}
```

### Feature Flag Best Practices

1. **Check flags at the highest possible level.** A single flag check at the page or feature level is easier to remove than dozens of checks scattered throughout child components.

2. **Give flags descriptive names and expiration dates.** Every flag should have an owner and a planned removal date. Stale flags accumulate as dead code.

3. **Remove flags promptly.** After a feature has been fully rolled out and validated in production, remove the flag and the old code path. Do not leave both paths indefinitely.

```javascript
// BAD: Flag checks scattered throughout the component tree
function CartItem({ item }) {
  const useNewPricing = useFeatureFlag('new-pricing');
  const useNewLayout = useFeatureFlag('new-cart-layout');

  return (
    <div className={useNewLayout ? 'cart-item-v2' : 'cart-item'}>
      <span>{item.name}</span>
      {useNewPricing ? (
        <PriceWithDiscount price={item.price} discount={item.discount} />
      ) : (
        <span>${item.price}</span>
      )}
    </div>
  );
}

// BETTER: Single flag check at the feature boundary
function CartPage() {
  const useNewCart = useFeatureFlag('new-cart-experience');
  return useNewCart ? <NewCartPage /> : <LegacyCartPage />;
}
```

> **Common Mistake:** Using feature flags as a permanent branching mechanism. Feature flags are temporary by nature. If a "flag" has been in the codebase for over six months, it is likely a configuration option and should be modeled as one, stored in a settings service rather than a feature flag system.

---

## 7.8 API Layer Design: Centralized, Typed, Mockable

### The Centralized API Client

A well-designed API layer provides a single place to configure base URLs, authentication headers, error handling, and request/response interceptors:

```javascript
// shared/api/apiClient.js
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

async function handleResponse(response) {
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`API Error ${response.status}: ${body}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function buildUrl(path, params) {
  const url = new URL(path, config.apiBaseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const apiClient = {
  async get(path, { params, signal } = {}) {
    const response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { ...DEFAULT_HEADERS, ...getAuthHeaders() },
      signal,
    });
    return handleResponse(response);
  },

  async post(path, { body, signal } = {}) {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: { ...DEFAULT_HEADERS, ...getAuthHeaders() },
      body: JSON.stringify(body),
      signal,
    });
    return handleResponse(response);
  },

  async put(path, { body, signal } = {}) {
    const response = await fetch(buildUrl(path), {
      method: 'PUT',
      headers: { ...DEFAULT_HEADERS, ...getAuthHeaders() },
      body: JSON.stringify(body),
      signal,
    });
    return handleResponse(response);
  },

  async delete(path, { signal } = {}) {
    const response = await fetch(buildUrl(path), {
      method: 'DELETE',
      headers: { ...DEFAULT_HEADERS, ...getAuthHeaders() },
      signal,
    });
    return handleResponse(response);
  },
};
```

```javascript
// Import the centralized config
import { config } from '@/config/env';
```

### Feature-Specific API Modules

Each feature defines its own API module that uses the centralized client:

```javascript
// features/products/api/productsApi.js
import { apiClient } from '@/shared/api/apiClient';

export const productsApi = {
  getAll({ page = 1, limit = 20, category, signal } = {}) {
    return apiClient.get('/products', {
      params: { page, limit, category },
      signal,
    });
  },

  getById(productId, { signal } = {}) {
    return apiClient.get(`/products/${productId}`, { signal });
  },

  search(query, { signal } = {}) {
    return apiClient.get('/products/search', {
      params: { q: query },
      signal,
    });
  },

  create(productData) {
    return apiClient.post('/products', { body: productData });
  },

  update(productId, productData) {
    return apiClient.put(`/products/${productId}`, { body: productData });
  },

  remove(productId) {
    return apiClient.delete(`/products/${productId}`);
  },
};
```

### Integration with TanStack Query

TanStack Query (React Query) has changed how teams structure their API layer. The query options pattern bundles the query key, query function, and default options into a reusable object:

```javascript
// features/products/api/productQueries.js
import { productsApi } from './productsApi';

export const productQueries = {
  all: ({ page, limit, category } = {}) => ({
    queryKey: ['products', { page, limit, category }],
    queryFn: ({ signal }) =>
      productsApi.getAll({ page, limit, category, signal }),
    staleTime: 2 * 60 * 1000, // 2 minutes
  }),

  detail: (productId) => ({
    queryKey: ['products', productId],
    queryFn: ({ signal }) => productsApi.getById(productId, { signal }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!productId,
  }),

  search: (query) => ({
    queryKey: ['products', 'search', query],
    queryFn: ({ signal }) => productsApi.search(query, { signal }),
    staleTime: 30 * 1000, // 30 seconds
    enabled: query.length >= 2,
  }),
};
```

```javascript
// features/products/hooks/useProducts.js
import { useQuery } from '@tanstack/react-query';
import { productQueries } from '../api/productQueries';

export function useProducts({ page, limit, category } = {}) {
  return useQuery(productQueries.all({ page, limit, category }));
}

export function useProductDetail(productId) {
  return useQuery(productQueries.detail(productId));
}
```

This pattern yields several benefits:

- Query keys are defined once, eliminating key inconsistencies
- Query options can be reused in `prefetchQuery`, `ensureQueryData`, and `useQueries`
- The API module (`productsApi`) remains a plain object with no React dependencies, making it easy to mock in tests

### Mocking the API Layer for Tests

Because the API layer is isolated, mocking it for tests is straightforward. Use MSW (Mock Service Worker) to intercept network requests at the service worker level:

```javascript
// test/mocks/handlers.js
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/v1/products', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;

    return HttpResponse.json({
      products: [
        { id: 1, name: 'Widget', price: 9.99 },
        { id: 2, name: 'Gadget', price: 19.99 },
      ],
      page,
      totalPages: 5,
    });
  }),

  http.get('/api/v1/products/:id', ({ params }) => {
    return HttpResponse.json({
      id: Number(params.id),
      name: 'Widget',
      price: 9.99,
      description: 'A fine widget',
    });
  }),
];
```

> **See Also:** Part 3, Chapter 5, Section 5.7 for TanStack Query patterns including cache invalidation, optimistic updates, and prefetching strategies.

---

## 7.9 Path Aliases and Module Resolution

### The Problem with Relative Imports

Deep nesting produces unwieldy relative paths:

```javascript
// features/orders/components/OrderDetail.js

// Without aliases: fragile and hard to read
import { Button } from '../../../shared/components/Button';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { useAuth } from '../../auth/hooks/useAuth';
import { config } from '../../../config/env';
```

Moving `OrderDetail.js` to a different directory breaks every relative import. Path aliases solve this by mapping a prefix to a directory:

```javascript
// With aliases: stable and readable
import { Button } from '@/shared/components/Button';
import { formatCurrency } from '@/shared/utils/formatCurrency';
import { useAuth } from '@/features/auth';
import { config } from '@/config/env';
```

### Configuring Path Aliases in Vite

Vite supports aliases natively through `resolve.alias`, but the `vite-tsconfig-paths` plugin provides a more maintainable approach by reading aliases from `jsconfig.json` (or `tsconfig.json`):

```javascript
// jsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["src/shared/*"],
      "@features/*": ["src/features/*"]
    }
  }
}
```

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
});
```

With this setup, `@/shared/components/Button` resolves to `src/shared/components/Button.js`. The `jsconfig.json` serves as the single source of truth for aliases; Vite, the editor, and the language server all read from the same file.

### Configuring Path Aliases in Next.js

Next.js has built-in support for path aliases via `jsconfig.json` (no additional plugins needed):

```javascript
// jsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@lib/*": ["src/lib/*"]
    }
  }
}
```

Next.js reads these paths automatically and applies them during compilation.

### Aligning Aliases with Test Runners

Test runners must also resolve the same aliases. For Vitest, the `vite-tsconfig-paths` plugin handles this automatically because Vitest uses the Vite configuration. For Jest, configure `moduleNameMapper`:

```javascript
// jest.config.js
module.exports = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
  },
};
```

### Guidelines for Alias Design

1. **Use one canonical alias prefix.** `@/` mapping to `src/` is the most common convention. Adding more aliases (`@shared/`, `@features/`) is optional and only worthwhile if the team finds them significantly more convenient.

2. **Do not alias within a feature.** Inside `features/orders/`, files should use relative imports to reference sibling files (`./OrderItem`, `../hooks/useOrders`). Aliases are for crossing feature boundaries.

3. **Keep aliases consistent across all tools.** If `@/` works in Vite but not in Jest or Storybook, developers will encounter confusing errors. Test your aliases in every tool in the chain.

> **Common Mistake:** Defining aliases in `vite.config.js` using `resolve.alias` and separately in `jsconfig.json` using `paths`, then letting them drift apart. When the editor resolves `@/foo` to one location and the bundler resolves it to another, imports appear valid in the editor but fail at build time. Use `jsconfig.json` as the single source of truth and configure tools to read from it.

---

## 7.10 Exercise: Restructure a Messy Codebase into a Clean Architecture

### Problem Statement

You are given a React application with a flat, file-type-based structure. The application is an e-commerce platform with authentication, product browsing, a shopping cart, and an order history. All code lives in `components/`, `hooks/`, `services/`, and `utils/` directories with no feature boundaries.

Your task is to restructure this codebase into a feature-based architecture with proper layering, dependency boundaries, a centralized API client, path aliases, and environment configuration.

### Starter Code: The Messy Structure

```
src/
  components/
    App.js
    Header.js
    Footer.js
    LoginForm.js
    RegisterForm.js
    ProductCard.js
    ProductList.js
    ProductDetail.js
    ProductSearch.js
    CartIcon.js
    CartPage.js
    CartItem.js
    OrderList.js
    OrderDetail.js
    ProtectedRoute.js
    Spinner.js
    ErrorMessage.js
    Button.js
    Input.js
    Modal.js
  hooks/
    useAuth.js
    useProducts.js
    useCart.js
    useOrders.js
    useDebounce.js
    useLocalStorage.js
  services/
    api.js            // One giant file with all API calls
    authService.js
    cartHelpers.js
    productFilters.js
    orderCalculations.js
  utils/
    formatCurrency.js
    formatDate.js
    validateEmail.js
    constants.js
```

Key problems with this structure:
- `api.js` contains every endpoint for every feature in one 300-line file
- `CartPage.js` directly imports `authService.js` and `productFilters.js` (cross-feature coupling)
- `useProducts.js` makes direct `fetch` calls instead of using a service
- `Header.js` imports from `hooks/useCart.js` and `hooks/useAuth.js`, tightly coupling a shared component to specific features
- No environment configuration; API URLs are hardcoded

### Solution

**Step 1: Identify Features and Shared Code**

Features: `auth`, `products`, `cart`, `orders`
Shared: `Button`, `Input`, `Modal`, `Spinner`, `ErrorMessage`, `useDebounce`, `useLocalStorage`, `formatCurrency`, `formatDate`
App-level: `App.js`, `Header.js`, `Footer.js`, `ProtectedRoute.js`, routes

**Step 2: Create the New Structure**

```
src/
  app/
    App.js
    routes.js
    providers.js
  config/
    env.js
  features/
    auth/
      api/
        authApi.js
        authQueries.js
      components/
        LoginForm.js
        RegisterForm.js
      hooks/
        useAuth.js
        useSession.js
      services/
        authService.js
      index.js
    products/
      api/
        productsApi.js
        productQueries.js
      components/
        ProductCard.js
        ProductList.js
        ProductDetail.js
        ProductSearch.js
      hooks/
        useProducts.js
        useProductSearch.js
      services/
        productFilters.js
      index.js
    cart/
      api/
        cartApi.js
        cartQueries.js
      components/
        CartIcon.js
        CartPage.js
        CartItem.js
      hooks/
        useCart.js
        useCartTotal.js
      services/
        cartHelpers.js
      index.js
    orders/
      api/
        ordersApi.js
        orderQueries.js
      components/
        OrderList.js
        OrderDetail.js
      hooks/
        useOrders.js
      services/
        orderCalculations.js
      index.js
  layouts/
    Header.js
    Footer.js
  shared/
    api/
      apiClient.js
    components/
      Button.js
      Input.js
      Modal.js
      Spinner.js
      ErrorMessage.js
      ProtectedRoute.js
    hooks/
      useDebounce.js
      useLocalStorage.js
    utils/
      formatCurrency.js
      formatDate.js
      validateEmail.js
      constants.js
```

**Step 3: Implement the Centralized API Client**

```javascript
// src/config/env.js
function requireEnv(key) {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = Object.freeze({
  apiBaseUrl: requireEnv('VITE_API_BASE_URL'),
  isProduction: import.meta.env.PROD,
});
```

```javascript
// src/shared/api/apiClient.js
import { config } from '@/config/env';

async function request(method, path, { body, params, signal } = {}) {
  const url = new URL(path, config.apiBaseUrl);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, String(value));
    });
  }

  const token = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    signal,
    ...(body && { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`${response.status}: ${text}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

export const apiClient = {
  get: (path, options) => request('GET', path, options),
  post: (path, options) => request('POST', path, options),
  put: (path, options) => request('PUT', path, options),
  delete: (path, options) => request('DELETE', path, options),
};
```

**Step 4: Extract Feature API Modules from the Monolithic `api.js`**

```javascript
// src/features/products/api/productsApi.js
import { apiClient } from '@/shared/api/apiClient';

export const productsApi = {
  getAll({ page, limit, category, signal } = {}) {
    return apiClient.get('/products', { params: { page, limit, category }, signal });
  },
  getById(id, { signal } = {}) {
    return apiClient.get(`/products/${id}`, { signal });
  },
  search(query, { signal } = {}) {
    return apiClient.get('/products/search', { params: { q: query }, signal });
  },
};
```

```javascript
// src/features/products/api/productQueries.js
import { productsApi } from './productsApi';

export const productQueries = {
  all: (filters = {}) => ({
    queryKey: ['products', filters],
    queryFn: ({ signal }) => productsApi.getAll({ ...filters, signal }),
    staleTime: 2 * 60 * 1000,
  }),
  detail: (id) => ({
    queryKey: ['products', id],
    queryFn: ({ signal }) => productsApi.getById(id, { signal }),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  }),
};
```

**Step 5: Fix the Cross-Feature Coupling**

The original `Header.js` directly imported `useCart` and `useAuth`. In the new architecture, the Header is a layout component that receives data through props or composition:

```javascript
// src/layouts/Header.js
// The Header no longer imports feature hooks directly.
// It accepts the data it needs through props.
export function Header({ userName, cartItemCount, onLogout }) {
  return (
    <header>
      <nav>
        <a href="/">Home</a>
        <a href="/products">Products</a>
      </nav>
      <div>
        {userName && <span>Hello, {userName}</span>}
        <a href="/cart">Cart ({cartItemCount})</a>
        {userName && <button onClick={onLogout}>Log Out</button>}
      </div>
    </header>
  );
}
```

```javascript
// src/app/App.js
// The App component wires features into layouts.
import { Header } from '@/layouts/Header';
import { useAuth } from '@/features/auth';
import { useCart } from '@/features/cart';
import { AppRoutes } from './routes';

export function App() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();

  return (
    <>
      <Header
        userName={user?.name}
        cartItemCount={itemCount}
        onLogout={logout}
      />
      <main>
        <AppRoutes />
      </main>
    </>
  );
}
```

**Step 6: Write Feature Barrel Files**

```javascript
// src/features/auth/index.js
export { LoginForm } from './components/LoginForm';
export { RegisterForm } from './components/RegisterForm';
export { useAuth } from './hooks/useAuth';
```

```javascript
// src/features/products/index.js
export { ProductCard } from './components/ProductCard';
export { ProductList } from './components/ProductList';
export { ProductDetail } from './components/ProductDetail';
export { ProductSearch } from './components/ProductSearch';
export { useProducts } from './hooks/useProducts';
export { useProductSearch } from './hooks/useProductSearch';
```

```javascript
// src/features/cart/index.js
export { CartIcon } from './components/CartIcon';
export { CartPage } from './components/CartPage';
export { useCart } from './hooks/useCart';
```

```javascript
// src/features/orders/index.js
export { OrderList } from './components/OrderList';
export { OrderDetail } from './components/OrderDetail';
export { useOrders } from './hooks/useOrders';
```

**Step 7: Configure Path Aliases**

```javascript
// jsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
});
```

**Step 8: Add Dependency Boundary Rules**

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'app', pattern: 'src/app/*' },
      { type: 'layouts', pattern: 'src/layouts/*' },
      { type: 'features', pattern: 'src/features/*' },
      { type: 'shared', pattern: 'src/shared/*' },
      { type: 'config', pattern: 'src/config/*' },
    ],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'app', allow: ['features', 'shared', 'layouts', 'config'] },
          { from: 'layouts', allow: ['shared', 'config'] },
          { from: 'features', allow: ['features', 'shared', 'config'] },
          { from: 'shared', allow: ['shared', 'config'] },
          { from: 'config', allow: [] },
        ],
      },
    ],
  },
};
```

### Key Takeaway

Restructuring a codebase is not primarily about moving files. It is about establishing clear boundaries between features, enforcing directional dependencies, and ensuring that each piece of the architecture (UI, hooks, services, API) has a single responsibility. The mechanical work of moving files is straightforward; the intellectual work is deciding which code belongs to which feature, what belongs in `shared/`, and how features should communicate. A well-restructured codebase makes it possible to delete an entire feature by removing one directory, to onboard a new developer by pointing them at one feature folder, and to modify a service layer without touching any component.

---

## Chapter Summary

Project architecture determines how easily a codebase scales with team size and feature count. Feature-based folder structures organize code by business capability rather than file type, making features self-contained and independently removable. Barrel files provide encapsulation at feature boundaries but degrade build performance when overused, particularly in large shared directories or when chained across multiple layers. A four-layer architecture (UI, Hooks, Services, API) enforces separation of concerns and makes each layer independently testable and replaceable. Dependency boundaries, enforced through ESLint rules, prevent the architectural erosion that accumulates over months of development. Monorepo tools like Turborepo and Nx become valuable when multiple applications share code, with Turborepo favoring simplicity and Nx favoring comprehensive tooling. A centralized API client, combined with TanStack Query's query options pattern, produces a data layer that is mockable, cacheable, and consistent. Path aliases eliminate fragile relative imports, but they must be configured consistently across every tool in the development chain.

## Further Reading

- [Bulletproof React: A simple, scalable, and powerful architecture for building production-ready React applications](https://github.com/alan2207/bulletproof-react)
- [Robin Wieruch: React Folder Structure in 5 Steps](https://www.robinwieruch.de/react-folder-structure/)
- [Vercel: How We Optimized Package Imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [Marvin Hagemeister: Speeding Up the JavaScript Ecosystem, Part 7: The Barrel File Debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)
- [eslint-plugin-boundaries: ESLint plugin checking architecture boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)
- [Nx Documentation: Enforce Module Boundaries](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries)
- [TanStack Query Documentation: Overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [vite-tsconfig-paths: TypeScript path mapping support for Vite](https://github.com/aleclarson/vite-tsconfig-paths)
