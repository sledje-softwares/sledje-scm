// jest-dom adds custom matchers for asserting on DOM nodes, e.g.
//   expect(element).toHaveTextContent(/react/i)
// https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom does not implement these browser APIs. Animation/layout libraries used
// across the app (gsap ScrollTrigger, framer-motion) touch them at module load
// or on mount, so without these shims importing App.js throws before any
// assertion runs. Browsers provide all of them natively; test-env only.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver ||= NoopObserver;
  window.ResizeObserver ||= NoopObserver;
  globalThis.IntersectionObserver ||= NoopObserver;
  globalThis.ResizeObserver ||= NoopObserver;

  window.scrollTo ||= () => {};
}
