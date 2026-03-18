import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description?: string;
  path?: string;
  type?: string;
}

const BASE_URL = "https://reactjsmastery.vercel.app";
const SITE_NAME = "React.js Mastery";
const DEFAULT_IMAGE = `${BASE_URL}/screenshot.png`;

function setMetaTag(property: string, content: string, isName = false) {
  const attr = isName ? "name" : "property";
  let el = document.querySelector(`meta[${attr}="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useSEO({ title, description, path = "/", type = "website" }: SEOOptions) {
  useEffect(() => {
    const fullTitle = path === "/" ? title : `${title} | ${SITE_NAME}`;
    const desc = description ?? "A free, book-quality guide with 40+ chapters across 5 parts: JavaScript foundations, React internals, core patterns (hooks, state, data fetching, forms, routing), senior architecture (testing, performance, SSR), and 100 dos and don'ts.";
    const url = `${BASE_URL}${path}`;

    // Title
    document.title = fullTitle;

    // Primary meta
    setMetaTag("description", desc, true);

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    // Open Graph
    setMetaTag("og:title", fullTitle);
    setMetaTag("og:description", desc);
    setMetaTag("og:url", url);
    setMetaTag("og:type", type);
    setMetaTag("og:image", DEFAULT_IMAGE);
    setMetaTag("og:site_name", SITE_NAME);

    // Twitter
    setMetaTag("twitter:title", fullTitle, true);
    setMetaTag("twitter:description", desc, true);
    setMetaTag("twitter:image", DEFAULT_IMAGE, true);
  }, [title, description, path, type]);
}
