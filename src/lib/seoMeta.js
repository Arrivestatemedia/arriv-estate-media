import { useEffect } from 'react';

// Applies a page's SEO head tags from server-provided values and removes them on unmount, so a
// client-side navigation never leaves one page's canonical or robots directive on another.
export default function useSeoMeta(seo) {
  useEffect(() => {
    if (!seo) return undefined;
    const created = [];

    const setMeta = (name, content, attr = 'name') => {
      if (!content) return;
      const el = document.createElement('meta');
      el.setAttribute(attr, name);
      el.setAttribute('content', String(content));
      document.head.appendChild(el);
      created.push(el);
    };

    const setLink = (rel, href) => {
      if (!href) return;
      const el = document.createElement('link');
      el.setAttribute('rel', rel);
      el.setAttribute('href', String(href));
      document.head.appendChild(el);
      created.push(el);
    };

    const previousTitle = document.title;
    if (seo.title) document.title = seo.title;
    setMeta('description', seo.meta_description);
    setMeta('robots', seo.robots);
    setLink('canonical', seo.canonical_url);

    const social = seo.social || {};
    Object.entries(social).forEach(([key, value]) => {
      if (!value) return;
      setMeta(key, value, 'property');
    });

    if (seo.structured_data) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(seo.structured_data);
      document.head.appendChild(script);
      created.push(script);
    }

    return () => {
      document.title = previousTitle;
      created.forEach((el) => el.parentNode && el.parentNode.removeChild(el));
    };
  }, [seo && seo.canonical_url, seo && seo.robots, seo && seo.title]);
}

// Marks a public page that genuinely does not exist, for crawlers and the app router alike.
export function useNotFoundStatus(active) {
  useEffect(() => {
    if (!active) return undefined;
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'prerender-status-code');
    meta.setAttribute('content', '404');
    document.head.appendChild(meta);
    return () => {
      if (meta.parentNode) meta.parentNode.removeChild(meta);
    };
  }, [active]);
}