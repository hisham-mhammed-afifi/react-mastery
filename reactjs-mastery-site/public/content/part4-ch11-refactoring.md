# Part 4, Chapter 11: Real-World Refactoring Case Studies

## What You Will Learn

- Decompose a monolithic "god component" into focused, composable units using a systematic extraction process
- Migrate a Redux-based state layer to Zustand with a store-by-store incremental strategy that avoids a full rewrite
- Eliminate prop drilling through component composition and context, selecting the right technique based on the depth and frequency of the drilled data
- Diagnose and resolve list rendering performance cliffs using profiling, key optimization, memoization, and virtualization
- Add offline support to an existing application by layering service workers, cache strategies, and optimistic UI on top of existing data fetching code
- Convert a hand-rolled REST data layer to TanStack Query, replacing imperative fetch-and-setState patterns with declarative cache management
- Implement a feature flag system that supports gradual rollout, A/B testing, and clean flag removal

---

## 11.1 Case Study: Refactoring a 2000-Line God Component

### The Problem

A "god component" is a single component that has accumulated too many responsibilities over time. It manages multiple pieces of state, handles several API calls, contains complex conditional rendering logic, and mixes business logic with presentation. The component below represents a typical e-commerce product page that has grown out of control.

```javascript
// ProductPage.js — BEFORE (abbreviated, representing ~2000 lines)
// This component does everything: fetching, state, forms, modals, analytics, layout.

function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [cartError, setCartError] = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [activeTab, setActiveTab] = useState('description');
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [wishlistStatus, setWishlistStatus] = useState(false);
  // ... 15 more useState calls ...

  useEffect(() => {
    async function fetchProduct() {
      const res = await fetch(`/api/products/${productId}`);
      const data = await res.json();
      setProduct(data);
      setSelectedVariant(data.variants[0]);
      // Track page view
      analytics.track('product_viewed', { id: productId, name: data.name });
    }
    fetchProduct();
  }, [productId]);

  useEffect(() => {
    async function fetchReviews() {
      const res = await fetch(`/api/products/${productId}/reviews`);
      setReviews(await res.json());
    }
    fetchReviews();
  }, [productId]);

  useEffect(() => {
    async function fetchRelated() {
      const res = await fetch(`/api/products/${productId}/related`);
      setRelatedProducts(await res.json());
    }
    fetchRelated();
  }, [productId]);

  async function handleAddToCart() {
    setIsAddingToCart(true);
    setCartError(null);
    try {
      await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          variantId: selectedVariant.id,
          quantity,
        }),
      });
      analytics.track('product_added_to_cart', { productId, quantity });
    } catch (err) {
      setCartError('Failed to add to cart');
    } finally {
      setIsAddingToCart(false);
    }
  }

  async function handleSubmitReview() {
    setIsSubmittingReview(true);
    try {
      await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reviewText, rating: reviewRating }),
      });
      // Re-fetch reviews
      const res = await fetch(`/api/products/${productId}/reviews`);
      setReviews(await res.json());
      setShowReviewForm(false);
      setReviewText('');
      setReviewRating(5);
    } finally {
      setIsSubmittingReview(false);
    }
  }

  // ... 200+ more lines of event handlers, computed values, conditional logic ...

  if (!product) return <LoadingSpinner />;

  return (
    <div className="product-page">
      {/* 500+ lines of JSX mixing layout, modals, forms, tabs, galleries */}
      {/* Image gallery with zoom */}
      {/* Variant selector */}
      {/* Add to cart form */}
      {/* Tabs: description, specifications, reviews */}
      {/* Review form modal */}
      {/* Related products carousel */}
      {/* Size guide modal */}
      {/* Wishlist toggle */}
    </div>
  );
}
```

### Step 1: Inventory the Responsibilities

Before writing any code, list every distinct concern the component manages:

```
Responsibilities of ProductPage:
1. Product data fetching and loading state
2. Image gallery with zoom modal
3. Variant selection (size, color)
4. Add-to-cart logic with error handling
5. Review listing and submission
6. Tab navigation (description, specs, reviews)
7. Related products fetching and display
8. Size guide modal
9. Wishlist toggle
10. Analytics tracking
```

Each numbered item is a candidate for extraction into its own component or custom hook.

### Step 2: Extract Custom Hooks for Data and Logic

Separate data-fetching and business logic from the component using custom hooks.

```javascript
// hooks/useProduct.js
import { useState, useEffect } from 'react';

function useProduct(productId) {
  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/products/${productId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load product');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setProduct(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [productId]);

  return { product, isLoading, error };
}

export { useProduct };
```

```javascript
// hooks/useReviews.js
import { useState, useEffect, useCallback } from 'react';

function useReviews(productId) {
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`);
      setReviews(await res.json());
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const submitReview = useCallback(async (text, rating) => {
    await fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rating }),
    });
    await fetchReviews(); // Re-fetch after submission
  }, [productId, fetchReviews]);

  return { reviews, isLoading, submitReview };
}

export { useReviews };
```

```javascript
// hooks/useCart.js
import { useState, useCallback } from 'react';

function useCart() {
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState(null);

  const addToCart = useCallback(async (productId, variantId, quantity) => {
    setIsAdding(true);
    setError(null);
    try {
      await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, variantId, quantity }),
      });
    } catch (err) {
      setError('Failed to add to cart');
      throw err;
    } finally {
      setIsAdding(false);
    }
  }, []);

  return { addToCart, isAdding, error };
}

export { useCart };
```

### Step 3: Extract Presentation Components

Each visual section becomes its own component that receives only the data it needs.

```javascript
// components/ImageGallery.js
import { useState } from 'react';

function ImageGallery({ images }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showZoom, setShowZoom] = useState(false);

  return (
    <div className="image-gallery">
      <img
        src={images[selectedIndex]?.url}
        alt={images[selectedIndex]?.alt}
        onClick={() => setShowZoom(true)}
        className="gallery-main"
      />

      <div className="gallery-thumbnails">
        {images.map((image, index) => (
          <button
            key={image.id}
            onClick={() => setSelectedIndex(index)}
            className={index === selectedIndex ? 'thumbnail active' : 'thumbnail'}
            aria-label={`View image ${index + 1}`}
          >
            <img src={image.thumbnailUrl} alt="" />
          </button>
        ))}
      </div>

      {showZoom && (
        <div className="zoom-modal" onClick={() => setShowZoom(false)} role="dialog">
          <img src={images[selectedIndex]?.fullUrl} alt={images[selectedIndex]?.alt} />
        </div>
      )}
    </div>
  );
}

export { ImageGallery };
```

```javascript
// components/VariantSelector.js
function VariantSelector({ variants, selectedVariant, onSelect }) {
  return (
    <div className="variant-selector">
      {variants.map((variant) => (
        <button
          key={variant.id}
          onClick={() => onSelect(variant)}
          className={variant.id === selectedVariant?.id ? 'variant active' : 'variant'}
          disabled={!variant.inStock}
        >
          {variant.label}
          {!variant.inStock && ' (Out of Stock)'}
        </button>
      ))}
    </div>
  );
}

export { VariantSelector };
```

```javascript
// components/AddToCartForm.js
import { useState } from 'react';

function AddToCartForm({ selectedVariant, onAddToCart, isAdding, error }) {
  const [quantity, setQuantity] = useState(1);

  function handleSubmit(event) {
    event.preventDefault();
    onAddToCart(selectedVariant.id, quantity);
  }

  return (
    <form onSubmit={handleSubmit} className="add-to-cart">
      <label htmlFor="quantity">Quantity</label>
      <input
        id="quantity"
        type="number"
        min={1}
        max={10}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />

      <button type="submit" disabled={isAdding || !selectedVariant?.inStock}>
        {isAdding ? 'Adding...' : 'Add to Cart'}
      </button>

      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

export { AddToCartForm };
```

### Step 4: Reassemble with Composition

The refactored ProductPage is now a thin orchestrator that composes hooks and components.

```javascript
// ProductPage.js — AFTER (~60 lines)
import { useState } from 'react';
import { useProduct } from '../hooks/useProduct';
import { useReviews } from '../hooks/useReviews';
import { useCart } from '../hooks/useCart';
import { ImageGallery } from '../components/ImageGallery';
import { VariantSelector } from '../components/VariantSelector';
import { AddToCartForm } from '../components/AddToCartForm';
import { ReviewList } from '../components/ReviewList';
import { ReviewForm } from '../components/ReviewForm';
import { RelatedProducts } from '../components/RelatedProducts';
import { ProductTabs } from '../components/ProductTabs';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

function ProductPage({ productId }) {
  const { product, isLoading, error } = useProduct(productId);
  const { reviews, submitReview } = useReviews(productId);
  const { addToCart, isAdding, error: cartError } = useCart();
  const [selectedVariant, setSelectedVariant] = useState(null);

  // Set the default variant once the product loads
  const variant = selectedVariant || product?.variants[0];

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="product-page">
      <div className="product-main">
        <ImageGallery images={product.images} />

        <div className="product-details">
          <h1>{product.name}</h1>
          <p className="price">${variant?.price}</p>

          <VariantSelector
            variants={product.variants}
            selectedVariant={variant}
            onSelect={setSelectedVariant}
          />

          <AddToCartForm
            selectedVariant={variant}
            onAddToCart={(variantId, quantity) =>
              addToCart(productId, variantId, quantity)
            }
            isAdding={isAdding}
            error={cartError}
          />
        </div>
      </div>

      <ProductTabs
        description={product.description}
        specifications={product.specifications}
        reviews={reviews}
        onSubmitReview={submitReview}
      />

      <RelatedProducts productId={productId} />
    </div>
  );
}

export { ProductPage };
```

The component went from roughly 2000 lines to 60. Each extracted piece is independently testable, reusable, and comprehensible.

> **Common Mistake:** Extracting components too early in the process, before understanding the full scope of responsibilities. Start by listing all responsibilities (Step 1), then extract hooks for logic (Step 2), then extract presentational components (Step 3). Reversing the order often leads to components with tangled dependencies that need to be re-extracted.

> **See Also:** Part 3, Chapter 1, Section on component decomposition strategies, and Part 4, Chapter 2 for custom hook architecture patterns.

---

## 11.2 Case Study: Migrating from Redux to Zustand

### The Problem

A project management application uses Redux (classic pattern with action types, action creators, reducers, and `connect`) for all state management. The codebase has grown to include 15+ slices, many of which manage only local UI state. The Redux boilerplate slows down development, and new team members struggle with the indirection between actions, reducers, and selectors.

### The Migration Strategy: Store by Store

A full rewrite is risky and unnecessary. The recommended approach migrates one Redux slice at a time while both systems coexist.

```
Migration Order:
1. Start with isolated, leaf-node slices (UI state, modals, toasts)
2. Move to data-fetching slices (replace with TanStack Query where possible)
3. Migrate core business logic slices last
4. Remove Redux dependency when no slices remain
```

### Before: Redux Slice

```javascript
// store/projectsSlice.js — Redux (classic pattern)

// Action types
const FETCH_PROJECTS_START = 'projects/fetchStart';
const FETCH_PROJECTS_SUCCESS = 'projects/fetchSuccess';
const FETCH_PROJECTS_ERROR = 'projects/fetchError';
const ADD_PROJECT = 'projects/add';
const UPDATE_PROJECT = 'projects/update';
const SET_FILTER = 'projects/setFilter';

// Action creators
function fetchProjectsStart() {
  return { type: FETCH_PROJECTS_START };
}

function fetchProjectsSuccess(projects) {
  return { type: FETCH_PROJECTS_SUCCESS, payload: projects };
}

function fetchProjectsError(error) {
  return { type: FETCH_PROJECTS_ERROR, payload: error };
}

function addProject(project) {
  return { type: ADD_PROJECT, payload: project };
}

function updateProject(project) {
  return { type: UPDATE_PROJECT, payload: project };
}

function setFilter(filter) {
  return { type: SET_FILTER, payload: filter };
}

// Thunk
function fetchProjects() {
  return async (dispatch) => {
    dispatch(fetchProjectsStart());
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      dispatch(fetchProjectsSuccess(data));
    } catch (err) {
      dispatch(fetchProjectsError(err.message));
    }
  };
}

// Reducer
const initialState = {
  items: [],
  isLoading: false,
  error: null,
  filter: 'all',
};

function projectsReducer(state = initialState, action) {
  switch (action.type) {
    case FETCH_PROJECTS_START:
      return { ...state, isLoading: true, error: null };
    case FETCH_PROJECTS_SUCCESS:
      return { ...state, isLoading: false, items: action.payload };
    case FETCH_PROJECTS_ERROR:
      return { ...state, isLoading: false, error: action.payload };
    case ADD_PROJECT:
      return { ...state, items: [...state.items, action.payload] };
    case UPDATE_PROJECT:
      return {
        ...state,
        items: state.items.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };
    case SET_FILTER:
      return { ...state, filter: action.payload };
    default:
      return state;
  }
}

// Selectors
function selectProjects(state) {
  return state.projects.items;
}

function selectFilteredProjects(state) {
  const { items, filter } = state.projects;
  if (filter === 'all') return items;
  return items.filter((p) => p.status === filter);
}

export {
  fetchProjects, addProject, updateProject, setFilter,
  projectsReducer, selectProjects, selectFilteredProjects,
};
```

```javascript
// components/ProjectList.js — Redux connected component
import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchProjects, setFilter, selectFilteredProjects } from '../store/projectsSlice';

function ProjectList() {
  const dispatch = useDispatch();
  const projects = useSelector(selectFilteredProjects);
  const isLoading = useSelector((state) => state.projects.isLoading);
  const error = useSelector((state) => state.projects.error);

  useEffect(() => {
    dispatch(fetchProjects());
  }, [dispatch]);

  if (isLoading) return <p>Loading projects...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <select onChange={(e) => dispatch(setFilter(e.target.value))}>
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>

      <ul>
        {projects.map((project) => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### After: Zustand Store

```javascript
// stores/useProjectStore.js — Zustand
import { create } from 'zustand';

const useProjectStore = create((set, get) => ({
  // State
  items: [],
  isLoading: false,
  error: null,
  filter: 'all',

  // Actions
  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      set({ items: data, isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  addProject: (project) => {
    set((state) => ({ items: [...state.items, project] }));
  },

  updateProject: (updated) => {
    set((state) => ({
      items: state.items.map((p) => (p.id === updated.id ? updated : p)),
    }));
  },

  setFilter: (filter) => {
    set({ filter });
  },

  // Derived data (computed inline, not a selector)
  getFilteredProjects: () => {
    const { items, filter } = get();
    if (filter === 'all') return items;
    return items.filter((p) => p.status === filter);
  },
}));

export { useProjectStore };
```

```javascript
// components/ProjectList.js — Zustand consumer
import { useEffect } from 'react';
import { useProjectStore } from '../stores/useProjectStore';

function ProjectList() {
  const items = useProjectStore((state) => state.items);
  const filter = useProjectStore((state) => state.filter);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const setFilter = useProjectStore((state) => state.setFilter);

  // Derive filtered list in the component (or use getFilteredProjects)
  const filteredProjects = filter === 'all'
    ? items
    : items.filter((p) => p.status === filter);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (isLoading) return <p>Loading projects...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>

      <ul>
        {filteredProjects.map((project) => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Key Differences

| Aspect | Redux (classic) | Zustand |
|---|---|---|
| Boilerplate | Action types, creators, reducer, thunks | Single store object |
| File count | 1 slice + selectors + thunks | 1 store file |
| Provider required | Yes (`<Provider store={store}>`) | No |
| Devtools | Redux DevTools (built-in) | Zustand devtools middleware |
| Async actions | Thunks or sagas (middleware) | Async functions directly in store |
| Selector pattern | `useSelector(selectFn)` | `useStore((state) => state.field)` |

### Coexistence During Migration

Both Redux and Zustand can run simultaneously. Components that have been migrated use Zustand; others continue using Redux. No wrapper or bridge is needed.

```javascript
// App.js during migration — both systems coexist
import { Provider as ReduxProvider } from 'react-redux';
import { reduxStore } from './store/reduxStore';

function App() {
  return (
    // Redux Provider still wraps the app for un-migrated slices
    <ReduxProvider store={reduxStore}>
      {/* Zustand stores need no provider; they work anywhere */}
      <AppRoutes />
    </ReduxProvider>
  );
}
```

> **Common Mistake:** Migrating all slices at once in a single pull request. This creates an enormous, unreviewable changeset and makes it nearly impossible to isolate regressions. Migrate one slice per pull request, verify that the feature works identically, and merge before starting the next slice.

> **See Also:** Part 3, Chapter 4 for state management decision criteria that help determine whether Zustand, context, or another solution is the best fit for each slice.

---

## 11.3 Case Study: Eliminating Prop Drilling in a Deep Component Tree

### The Problem

A settings panel passes user preferences through six levels of nesting. Every intermediate component accepts and forwards props it does not use.

```javascript
// BEFORE: Props drilled through 6 levels
function SettingsPage({ user, preferences, onUpdatePreference }) {
  return (
    <SettingsLayout
      user={user}
      preferences={preferences}
      onUpdatePreference={onUpdatePreference}
    />
  );
}

function SettingsLayout({ user, preferences, onUpdatePreference }) {
  return (
    <div className="settings-layout">
      <SettingsSidebar user={user} />
      <SettingsContent
        preferences={preferences}
        onUpdatePreference={onUpdatePreference}
      />
    </div>
  );
}

function SettingsContent({ preferences, onUpdatePreference }) {
  return (
    <div className="settings-content">
      <NotificationSettings
        preferences={preferences}
        onUpdatePreference={onUpdatePreference}
      />
    </div>
  );
}

function NotificationSettings({ preferences, onUpdatePreference }) {
  return (
    <div>
      <h2>Notifications</h2>
      <NotificationChannels
        channels={preferences.notifications}
        onUpdatePreference={onUpdatePreference}
      />
    </div>
  );
}

function NotificationChannels({ channels, onUpdatePreference }) {
  return (
    <div>
      {channels.map((channel) => (
        <ChannelToggle
          key={channel.id}
          channel={channel}
          onToggle={(value) =>
            onUpdatePreference(`notifications.${channel.id}`, value)
          }
        />
      ))}
    </div>
  );
}

function ChannelToggle({ channel, onToggle }) {
  return (
    <label>
      <input
        type="checkbox"
        checked={channel.enabled}
        onChange={(e) => onToggle(e.target.checked)}
      />
      {channel.label}
    </label>
  );
}
```

The intermediate components (`SettingsLayout`, `SettingsContent`, `NotificationSettings`) exist only to forward data they do not use.

### Solution A: Component Composition (Children Pattern)

When the drilled data is consumed by a specific leaf component, lift the consumer up and pass it as children.

```javascript
// AFTER: Composition eliminates drilling through intermediaries
function SettingsPage({ user }) {
  const [preferences, setPreferences] = useState(initialPreferences);

  function handleUpdatePreference(path, value) {
    setPreferences((prev) => updateNestedValue(prev, path, value));
  }

  return (
    <SettingsLayout sidebar={<SettingsSidebar user={user} />}>
      <NotificationSettings
        channels={preferences.notifications}
        onUpdatePreference={handleUpdatePreference}
      />
    </SettingsLayout>
  );
}

// SettingsLayout no longer needs to know about preferences
function SettingsLayout({ sidebar, children }) {
  return (
    <div className="settings-layout">
      {sidebar}
      <div className="settings-content">{children}</div>
    </div>
  );
}

// NotificationSettings receives its data directly from SettingsPage
function NotificationSettings({ channels, onUpdatePreference }) {
  return (
    <div>
      <h2>Notifications</h2>
      {channels.map((channel) => (
        <ChannelToggle
          key={channel.id}
          channel={channel}
          onToggle={(value) =>
            onUpdatePreference(`notifications.${channel.id}`, value)
          }
        />
      ))}
    </div>
  );
}
```

The key insight: `SettingsLayout` was never a consumer of preferences. By using composition (`children` and named slots like `sidebar`), the layout becomes a structural shell that does not need to know about the data flowing through it.

### Solution B: Context for Widely Shared Data

When data is consumed by many components at various depths, context is the right choice.

```javascript
// PreferencesContext.js
import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const PreferencesContext = createContext(null);

function PreferencesProvider({ initialPreferences, children }) {
  const [preferences, setPreferences] = useState(initialPreferences);

  const updatePreference = useCallback((path, value) => {
    setPreferences((prev) => updateNestedValue(prev, path, value));
  }, []);

  const value = useMemo(
    () => ({ preferences, updatePreference }),
    [preferences, updatePreference]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === null) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}

// Helper: update a nested value by dot-separated path
function updateNestedValue(obj, path, value) {
  const keys = path.split('.');
  const result = { ...obj };
  let current = result;

  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = Array.isArray(current[keys[i]])
      ? [...current[keys[i]]]
      : { ...current[keys[i]] };
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;
  return result;
}

export { PreferencesProvider, usePreferences };
```

```javascript
// Now any deeply nested component can access preferences directly
function ChannelToggle({ channel }) {
  const { updatePreference } = usePreferences();

  return (
    <label>
      <input
        type="checkbox"
        checked={channel.enabled}
        onChange={(e) =>
          updatePreference(`notifications.${channel.id}.enabled`, e.target.checked)
        }
      />
      {channel.label}
    </label>
  );
}
```

### When to Use Each Solution

| Criterion | Composition | Context |
|---|---|---|
| Few consumers, clear hierarchy | Preferred | Overkill |
| Many consumers at various depths | Awkward | Preferred |
| Data changes frequently | Preferred (no re-render cascade) | Needs memoization or splitting |
| Layout components involved | Preferred | Acceptable |

> **See Also:** Part 3, Chapter 3, Section on composition patterns, and Part 3, Chapter 4 for context splitting strategies.

---

## 11.4 Case Study: Fixing a Performance Cliff (List Rendering)

### The Problem

A CRM application renders a table of customer contacts. With 50 contacts, performance is acceptable. At 500 contacts, scrolling becomes janky. At 5000, the page is unusable.

```javascript
// BEFORE: Naive list rendering
function ContactList({ contacts, onSelect, selectedId }) {
  return (
    <div className="contact-list">
      {contacts.map((contact) => (
        <ContactRow
          key={contact.id}
          contact={contact}
          isSelected={contact.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ContactRow({ contact, isSelected, onSelect }) {
  // This formatting runs on every render of every row
  const formattedPhone = formatPhoneNumber(contact.phone);
  const lastContactedAgo = getRelativeTime(contact.lastContacted);

  return (
    <div
      className={`contact-row ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(contact.id)}
    >
      <img src={contact.avatarUrl} alt="" className="avatar" />
      <div className="contact-info">
        <span className="name">{contact.name}</span>
        <span className="email">{contact.email}</span>
      </div>
      <span className="phone">{formattedPhone}</span>
      <span className="last-contact">{lastContactedAgo}</span>
    </div>
  );
}
```

### Step 1: Profile Before Optimizing

Use the React DevTools Profiler to identify the bottleneck. In this case, selecting a contact causes every `ContactRow` to re-render because a new `onSelect` function reference is created on each render of the parent, and `isSelected` changes for two rows but the entire list re-renders.

> **See Also:** Part 4, Chapter 1, Section on React DevTools Profiler for profiling techniques.

### Step 2: Memoize the Row Component

```javascript
// ContactRow is now memoized; it only re-renders when its props change
const ContactRow = memo(function ContactRow({ contact, isSelected, onSelect }) {
  const formattedPhone = formatPhoneNumber(contact.phone);
  const lastContactedAgo = getRelativeTime(contact.lastContacted);

  return (
    <div
      className={`contact-row ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(contact.id)}
    >
      <img src={contact.avatarUrl} alt="" className="avatar" />
      <div className="contact-info">
        <span className="name">{contact.name}</span>
        <span className="email">{contact.email}</span>
      </div>
      <span className="phone">{formattedPhone}</span>
      <span className="last-contact">{lastContactedAgo}</span>
    </div>
  );
});
```

```javascript
// Stabilize the onSelect callback in the parent
function ContactList({ contacts, onSelect, selectedId }) {
  // useCallback ensures onSelect has a stable reference
  const handleSelect = useCallback(
    (contactId) => {
      onSelect(contactId);
    },
    [onSelect]
  );

  return (
    <div className="contact-list">
      {contacts.map((contact) => (
        <ContactRow
          key={contact.id}
          contact={contact}
          isSelected={contact.id === selectedId}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
}
```

This optimization reduces re-renders from 5000 rows per selection to 2 rows (the previously selected and the newly selected). For lists of 500 or fewer items, this is often sufficient.

### Step 3: Virtualize for Large Lists

When the list can reach thousands of items, rendering all DOM nodes is wasteful. Virtualization renders only the visible rows plus a small overscan buffer.

```javascript
// ContactListVirtualized.js
import { FixedSizeList } from 'react-window';
import { memo, useCallback } from 'react';

function ContactListVirtualized({ contacts, onSelect, selectedId }) {
  const handleSelect = useCallback(
    (contactId) => onSelect(contactId),
    [onSelect]
  );

  // react-window requires a Row renderer that receives index and style
  const Row = useCallback(
    ({ index, style }) => {
      const contact = contacts[index];
      return (
        <div style={style}>
          <ContactRow
            contact={contact}
            isSelected={contact.id === selectedId}
            onSelect={handleSelect}
          />
        </div>
      );
    },
    [contacts, selectedId, handleSelect]
  );

  return (
    <FixedSizeList
      height={600}           // Visible area height
      itemCount={contacts.length}
      itemSize={72}          // Each row is 72px tall
      width="100%"
      overscanCount={10}     // Render 10 extra rows above/below viewport
    >
      {Row}
    </FixedSizeList>
  );
}

const ContactRow = memo(function ContactRow({ contact, isSelected, onSelect }) {
  return (
    <div
      className={`contact-row ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(contact.id)}
    >
      <img src={contact.avatarUrl} alt="" className="avatar" />
      <div className="contact-info">
        <span className="name">{contact.name}</span>
        <span className="email">{contact.email}</span>
      </div>
    </div>
  );
});
```

### Performance Comparison

```
5000 contacts, measured with React DevTools Profiler:

                         | DOM Nodes | Initial Render | Selection Update
-------------------------+-----------+----------------+-----------------
No optimization          |   5000    |    ~1200ms     |    ~800ms
memo + useCallback       |   5000    |    ~1200ms     |    ~5ms
Virtualization           |    ~25    |      ~30ms     |    ~5ms
```

Memoization fixes the selection update cost but not the initial render. Virtualization fixes both by keeping the DOM small.

> **Common Mistake:** Adding `memo` to a component without stabilizing the callbacks and objects passed to it. If the parent creates a new `onSelect` function on every render, `memo` performs a prop comparison, finds the reference has changed, and re-renders anyway. The `memo` call adds overhead without benefit. Always stabilize callback props with `useCallback` when memoizing child components.

---

## 11.5 Case Study: Adding Offline Support to an Existing App

### The Problem

A field inspection application works well with network access but fails completely when inspectors enter areas with poor connectivity. The goal is to add offline support without rewriting the data layer.

### Architecture Overview

```
Offline Support Architecture:

  +--------------------+
  |   React App        |
  |  (existing code)   |
  +---------+----------+
            |
  +---------v----------+
  | Offline-Aware      |
  | Data Layer         |
  +---------+----------+
            |
  +---------v----------+     +-----------------+
  | Service Worker     |<--->| Cache Storage   |
  | (network proxy)    |     | (API responses) |
  +---------+----------+     +-----------------+
            |
  +---------v----------+
  | Network            |
  +--------------------+
```

### Step 1: Register a Service Worker

```javascript
// src/serviceWorkerRegistration.js
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration.scope);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    });
  }
}

export { registerServiceWorker };
```

```javascript
// public/sw.js — The service worker
const CACHE_NAME = 'inspection-app-v1';
const API_CACHE_NAME = 'inspection-api-v1';

// Precache the app shell on install
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/static/js/main.js',
  '/static/css/main.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
});

// Clean up old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

// Network-first strategy for API calls; cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.url.includes('/api/')) {
    // API requests: network first, fall back to cache
    event.respondWith(networkFirstWithCache(request));
  } else {
    // Static assets: cache first, fall back to network
    event.respondWith(cacheFirstWithNetwork(request));
  }
});

async function networkFirstWithCache(request) {
  const cache = await caches.open(API_CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    // Cache successful GET responses
    if (request.method === 'GET' && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Network failed; try the cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Nothing in cache either; return an offline response
    return new Response(
      JSON.stringify({ error: 'Offline', offline: true }),
      { headers: { 'Content-Type': 'application/json' }, status: 503 }
    );
  }
}

async function cacheFirstWithNetwork(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  return fetch(request);
}
```

### Step 2: Detect Online/Offline Status

```javascript
// hooks/useOnlineStatus.js
import { useState, useEffect } from 'react';

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export { useOnlineStatus };
```

### Step 3: Queue Mutations for Sync

When the user submits data offline, store the mutation in IndexedDB and sync when connectivity returns.

```javascript
// offlineQueue.js
// A simple queue that stores pending mutations in IndexedDB

const DB_NAME = 'inspection-offline';
const STORE_NAME = 'pending-mutations';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueueMutation(mutation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add({
      ...mutation,
      timestamp: Date.now(),
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getPendingMutations() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeMutation(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function syncPendingMutations() {
  const mutations = await getPendingMutations();

  for (const mutation of mutations) {
    try {
      const response = await fetch(mutation.url, {
        method: mutation.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation.body),
      });

      if (response.ok) {
        await removeMutation(mutation.id);
      }
    } catch (error) {
      // Still offline or server error; stop syncing, will retry later
      break;
    }
  }
}

export { enqueueMutation, getPendingMutations, removeMutation, syncPendingMutations };
```

### Step 4: Integrate with Existing Components

```javascript
// hooks/useOfflineMutation.js
import { useState, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { enqueueMutation } from '../offlineQueue';

function useOfflineMutation(url, method = 'POST') {
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState('idle'); // idle | pending | success | queued | error

  const mutate = useCallback(
    async (body) => {
      setStatus('pending');

      if (isOnline) {
        try {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (!response.ok) throw new Error('Request failed');
          setStatus('success');
          return await response.json();
        } catch (error) {
          // Network failed mid-request; queue it
          await enqueueMutation({ url, method, body });
          setStatus('queued');
          return null;
        }
      } else {
        // Known offline; queue immediately
        await enqueueMutation({ url, method, body });
        setStatus('queued');
        return null;
      }
    },
    [url, method, isOnline]
  );

  return { mutate, status };
}

export { useOfflineMutation };
```

```javascript
// Using the hook in an existing inspection form
function InspectionForm({ siteId }) {
  const { mutate, status } = useOfflineMutation(`/api/sites/${siteId}/inspections`);
  const isOnline = useOnlineStatus();

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    await mutate({
      notes: formData.get('notes'),
      rating: Number(formData.get('rating')),
      timestamp: new Date().toISOString(),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {!isOnline && (
        <div className="offline-banner" role="status">
          You are offline. Submissions will be saved and synced when connectivity returns.
        </div>
      )}

      <textarea name="notes" required placeholder="Inspection notes..." />

      <select name="rating">
        <option value="5">Excellent</option>
        <option value="4">Good</option>
        <option value="3">Acceptable</option>
        <option value="2">Needs Improvement</option>
        <option value="1">Critical</option>
      </select>

      <button type="submit" disabled={status === 'pending'}>
        {status === 'pending' ? 'Submitting...' : 'Submit Inspection'}
      </button>

      {status === 'queued' && (
        <p className="info">Saved offline. Will sync automatically.</p>
      )}
      {status === 'success' && <p className="success">Submitted successfully.</p>}
    </form>
  );
}
```

### Step 5: Trigger Sync on Reconnection

```javascript
// SyncManager.js — placed near the root of the app
import { useEffect } from 'react';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { syncPendingMutations } from './offlineQueue';

function SyncManager() {
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (isOnline) {
      syncPendingMutations().catch((err) =>
        console.error('Sync failed:', err)
      );
    }
  }, [isOnline]);

  return null; // Renders nothing; purely a side-effect component
}

export { SyncManager };
```

> **Common Mistake:** Assuming `navigator.onLine` is fully reliable. The `onLine` property and the `online`/`offline` events only detect whether the device has a network connection, not whether that connection can reach your server. A device connected to a captive portal or a network with DNS issues will report `online: true` but fail to reach the API. Always design your offline queue to handle network errors even when `navigator.onLine` is `true`.

---

## 11.6 Case Study: Converting a REST Data Layer to React Query

### The Problem

An application fetches data using `useEffect` + `fetch` + `useState` in every component that needs server data. This pattern leads to duplicated loading/error state management, no caching (the same data is re-fetched on every mount), no background refetching, and manual cache invalidation that is error-prone.

### Before: Manual Fetch Pattern

```javascript
// BEFORE: Every component manually manages fetch state
function TeamMemberList({ teamId }) {
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/teams/${teamId}/members`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch members');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setMembers(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [teamId]);

  if (isLoading) return <p>Loading members...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <ul>
      {members.map((member) => (
        <li key={member.id}>{member.name} — {member.role}</li>
      ))}
    </ul>
  );
}
```

```javascript
// BEFORE: Adding a member requires manual re-fetch
function AddMemberForm({ teamId, onMemberAdded }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(event.target);
    await fetch(`/api/teams/${teamId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name'),
        role: formData.get('role'),
      }),
    });

    setIsSubmitting(false);
    onMemberAdded(); // Parent must somehow trigger a re-fetch
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required placeholder="Name" />
      <input name="role" required placeholder="Role" />
      <button type="submit" disabled={isSubmitting}>Add Member</button>
    </form>
  );
}
```

### Step 1: Set Up the Query Client

```javascript
// queryClient.js
import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // Data is fresh for 5 minutes
      gcTime: 10 * 60 * 1000,      // Unused cache entries are garbage-collected after 10 minutes
      retry: 2,                      // Retry failed requests twice
      refetchOnWindowFocus: true,    // Refetch when the user returns to the tab
    },
  },
});

export { queryClient };
```

```javascript
// App.js — wrap the app with QueryClientProvider
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './queryClient';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Step 2: Define API Functions

Separate the fetch logic from React entirely. These are plain async functions.

```javascript
// api/teams.js
async function fetchTeamMembers(teamId) {
  const response = await fetch(`/api/teams/${teamId}/members`);
  if (!response.ok) {
    throw new Error('Failed to fetch team members');
  }
  return response.json();
}

async function addTeamMember(teamId, memberData) {
  const response = await fetch(`/api/teams/${teamId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memberData),
  });
  if (!response.ok) {
    throw new Error('Failed to add team member');
  }
  return response.json();
}

export { fetchTeamMembers, addTeamMember };
```

### Step 3: Replace useState/useEffect with useQuery

```javascript
// AFTER: TeamMemberList with React Query
import { useQuery } from '@tanstack/react-query';
import { fetchTeamMembers } from '../api/teams';

function TeamMemberList({ teamId }) {
  const {
    data: members,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['teams', teamId, 'members'],
    queryFn: () => fetchTeamMembers(teamId),
  });

  if (isLoading) return <p>Loading members...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {members.map((member) => (
        <li key={member.id}>{member.name} — {member.role}</li>
      ))}
    </ul>
  );
}
```

### Step 4: Replace Manual Re-fetch with useMutation

```javascript
// AFTER: AddMemberForm with React Query mutation
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addTeamMember } from '../api/teams';

function AddMemberForm({ teamId }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (memberData) => addTeamMember(teamId, memberData),
    onSuccess: () => {
      // Invalidate the cache so the member list refetches automatically
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'members'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    mutation.mutate({
      name: formData.get('name'),
      role: formData.get('role'),
    });
    event.target.reset();
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required placeholder="Name" />
      <input name="role" required placeholder="Role" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Adding...' : 'Add Member'}
      </button>
      {mutation.isError && (
        <p className="error" role="alert">{mutation.error.message}</p>
      )}
    </form>
  );
}
```

### What Changed

| Aspect | Before (manual) | After (React Query) |
|---|---|---|
| Loading/error state | 3 `useState` per component | Built-in `isLoading`, `error` |
| Caching | None; re-fetch on every mount | Automatic; data shared across components |
| Cache invalidation | Manual callback chains | `invalidateQueries` by key |
| Background refetch | Not implemented | Built-in on window focus, interval, etc. |
| Race conditions | Manual `cancelled` flag | Handled internally |
| Retry logic | Not implemented | Configurable retry with backoff |
| Devtools | None | React Query Devtools |

### Step 5: Optimistic Updates (Advanced)

For a snappier user experience, update the UI before the server responds and roll back on failure.

```javascript
function AddMemberForm({ teamId }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (memberData) => addTeamMember(teamId, memberData),

    onMutate: async (newMember) => {
      // Cancel in-flight refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['teams', teamId, 'members'] });

      // Snapshot the previous value for rollback
      const previousMembers = queryClient.getQueryData(['teams', teamId, 'members']);

      // Optimistically add the new member
      queryClient.setQueryData(['teams', teamId, 'members'], (old) => [
        ...old,
        { id: `temp-${Date.now()}`, ...newMember },
      ]);

      return { previousMembers };
    },

    onError: (err, newMember, context) => {
      // Roll back to the previous state on error
      queryClient.setQueryData(
        ['teams', teamId, 'members'],
        context.previousMembers
      );
    },

    onSettled: () => {
      // Refetch to ensure the cache matches the server
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'members'] });
    },
  });

  // ... same form JSX ...
}
```

> **See Also:** Part 3, Chapter 5, Section on data fetching patterns for a deeper treatment of React Query's query key design and caching strategies.

---

## 11.7 Case Study: Building Feature Flags Into an Existing App

### The Problem

A SaaS application needs the ability to gradually roll out new features, run A/B tests, and instantly disable problematic features without deploying new code. The team wants to start with a lightweight, custom solution before evaluating third-party services.

### Architecture

```
Feature Flag Architecture:

  +-----------------+     +-----------------+
  | Flag Config     |     | Flag Config     |
  | (remote API)    |     | (local default) |
  +--------+--------+     +--------+--------+
           |                        |
           +----------+-------------+
                      |
           +----------v-----------+
           | FeatureFlagProvider   |
           | (merges remote +     |
           |  local configs)      |
           +----------+-----------+
                      |
           +----------v-----------+
           | useFeatureFlag hook  |
           | <FeatureGate />      |
           +----------------------+
```

### Step 1: Define the Flag Configuration

```javascript
// flags/defaultFlags.js
// Local defaults ensure the app works even if the flag API is unavailable

const defaultFlags = {
  'new-dashboard': {
    enabled: false,
    description: 'Redesigned dashboard with charts',
  },
  'bulk-export': {
    enabled: false,
    description: 'Allow exporting multiple records as CSV',
  },
  'ai-suggestions': {
    enabled: false,
    description: 'AI-powered content suggestions',
    rolloutPercentage: 0, // 0-100, for gradual rollout
  },
  'dark-mode': {
    enabled: true,
    description: 'Dark mode theme toggle',
  },
};

export { defaultFlags };
```

### Step 2: Build the Feature Flag Provider

```javascript
// flags/FeatureFlagContext.js
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { defaultFlags } from './defaultFlags';

const FeatureFlagContext = createContext(null);

function FeatureFlagProvider({ children, userId }) {
  const [flags, setFlags] = useState(defaultFlags);
  const [isLoaded, setIsLoaded] = useState(false);

  // Fetch remote flag configuration
  useEffect(() => {
    let cancelled = false;

    async function fetchFlags() {
      try {
        const response = await fetch('/api/feature-flags', {
          headers: { 'X-User-Id': userId },
        });

        if (response.ok) {
          const remoteFlags = await response.json();

          if (!cancelled) {
            // Merge remote flags over local defaults
            setFlags((localFlags) => ({
              ...localFlags,
              ...remoteFlags,
            }));
          }
        }
      } catch (error) {
        // Remote fetch failed; continue with local defaults
        console.warn('Failed to fetch feature flags, using defaults:', error);
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    }

    fetchFlags();
    return () => { cancelled = true; };
  }, [userId]);

  const isEnabled = useCallback(
    (flagName) => {
      const flag = flags[flagName];
      if (!flag) return false;
      if (!flag.enabled) return false;

      // Handle percentage-based rollout
      if (typeof flag.rolloutPercentage === 'number') {
        // Deterministic: same user always gets the same result for the same flag
        const hash = simpleHash(`${userId}-${flagName}`);
        const bucket = hash % 100;
        return bucket < flag.rolloutPercentage;
      }

      return true;
    },
    [flags, userId]
  );

  const value = useMemo(
    () => ({ flags, isEnabled, isLoaded }),
    [flags, isEnabled, isLoaded]
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

function useFeatureFlag(flagName) {
  const context = useContext(FeatureFlagContext);
  if (context === null) {
    throw new Error('useFeatureFlag must be used within a FeatureFlagProvider');
  }
  return context.isEnabled(flagName);
}

function useFeatureFlags() {
  const context = useContext(FeatureFlagContext);
  if (context === null) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  return context;
}

// Deterministic hash for consistent rollout assignment
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export { FeatureFlagProvider, useFeatureFlag, useFeatureFlags };
```

### Step 3: Create a Declarative Gate Component

```javascript
// flags/FeatureGate.js
import { useFeatureFlag } from './FeatureFlagContext';

function FeatureGate({ flag, fallback = null, children }) {
  const isEnabled = useFeatureFlag(flag);
  return isEnabled ? children : fallback;
}

export { FeatureGate };
```

### Step 4: Integrate with Existing Components

```javascript
// Using the hook for conditional logic
import { useFeatureFlag } from '../flags/FeatureFlagContext';

function Dashboard() {
  const hasNewDashboard = useFeatureFlag('new-dashboard');

  if (hasNewDashboard) {
    return <NewDashboard />;
  }

  return <LegacyDashboard />;
}
```

```javascript
// Using the gate component for conditional rendering
import { FeatureGate } from '../flags/FeatureGate';

function Toolbar() {
  return (
    <div className="toolbar">
      <button onClick={handleSave}>Save</button>

      <FeatureGate flag="bulk-export">
        <button onClick={handleBulkExport}>Export CSV</button>
      </FeatureGate>

      <FeatureGate
        flag="ai-suggestions"
        fallback={<span className="badge">Coming Soon</span>}
      >
        <button onClick={handleAiSuggest}>AI Suggest</button>
      </FeatureGate>
    </div>
  );
}
```

### Step 5: Feature Flag Cleanup

Stale flags (features that are fully rolled out or permanently disabled) create technical debt. A cleanup process should be part of the workflow.

```javascript
// flags/auditFlags.js
// Run this script periodically (e.g., in CI) to detect stale flags

import { defaultFlags } from './defaultFlags';

function auditFlags() {
  const issues = [];

  for (const [name, config] of Object.entries(defaultFlags)) {
    // Flag has been enabled with 100% rollout for a long time
    if (config.enabled && (!config.rolloutPercentage || config.rolloutPercentage === 100)) {
      issues.push({
        flag: name,
        issue: 'Fully enabled. Consider removing the flag and keeping the feature code.',
      });
    }

    // Flag has been disabled; if the feature was abandoned, remove the code
    if (!config.enabled && config.deprecated) {
      issues.push({
        flag: name,
        issue: 'Deprecated and disabled. Remove the flag and its associated code.',
      });
    }
  }

  return issues;
}

export { auditFlags };
```

The cleanup process:

1. When a feature is fully rolled out, mark the flag as a cleanup candidate.
2. Create a pull request that removes the `<FeatureGate>` wrapper and the `useFeatureFlag` check, keeping only the new code path.
3. Remove the flag from `defaultFlags` and the remote configuration.
4. Delete any fallback or legacy code that was gated behind the flag.

> **Common Mistake:** Leaving feature flags in the codebase indefinitely after a feature is fully rolled out. Over time, this leads to deeply nested conditional logic, confusing code paths, and an ever-growing flag configuration. Every flag should have an owner and a cleanup date. When the feature is stable, remove the flag and commit the code path permanently.

> **See Also:** Part 4, Chapter 7, Section on project architecture for strategies on organizing feature-specific code in a way that makes flag cleanup straightforward.

---

## Chapter Summary

Real-world refactoring is rarely about rewriting from scratch. Each case study in this chapter demonstrates a systematic, incremental approach: decomposing god components by inventorying responsibilities and extracting hooks before components; migrating state management solutions one store at a time with both systems coexisting; solving prop drilling through composition before reaching for context; profiling before optimizing and applying memoization before virtualization; layering offline support on top of existing data patterns using service workers and mutation queues; replacing imperative fetch-and-setState with declarative cache management through TanStack Query; and building feature flags as first-class infrastructure with a cleanup process to prevent accumulation of dead code.

## Further Reading

- [Common Sense Refactoring of a Messy React Component](https://alexkondov.com/refactoring-a-messy-react-component/) by Alex Kondov for a practical walkthrough of component decomposition
- [Zustand GitHub Discussion: How to Approach Moving from Redux](https://github.com/pmndrs/zustand/discussions/1461) for community-sourced migration strategies
- [Components Composition: How to Get It Right](https://www.developerway.com/posts/components-composition-how-to-get-it-right) by Nadia Makarevich for advanced composition patterns that eliminate prop drilling
- [react-window documentation](https://react-window.vercel.app/) for the complete API reference of the recommended virtualization library
- [Offline and Background Operation (MDN)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) for the authoritative guide on service worker caching strategies
- [TanStack Query v5 Migration Guide](https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5) for the official migration documentation
- [Feature Flags for React (LaunchDarkly)](https://launchdarkly.com/feature-flags-react/) for patterns on integrating feature flags at scale
