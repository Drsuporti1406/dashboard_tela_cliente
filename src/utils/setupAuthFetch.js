// Patches window.fetch to include x-api-key header from localStorage (development helper)
(function() {
  if (typeof window === 'undefined' || !window.fetch) return;
  try {
    const originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init = {}) {
      try {
        const apiKey = localStorage.getItem('DEV_API_KEY');
        if (apiKey) {
          init.headers = init.headers || {};
          // support Headers instance
          if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
            init.headers.set('x-api-key', apiKey);
          } else if (init.headers && typeof init.headers === 'object') {
            init.headers['x-api-key'] = apiKey;
          } else {
            init.headers = { 'x-api-key': apiKey };
          }
        }
      } catch (e) {}
      return originalFetch(input, init);
    };
  } catch (e) {}
})();
