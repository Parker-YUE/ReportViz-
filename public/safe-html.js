(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReportVizSafeHtml = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeHtmlDeep(value) {
    if (typeof value === 'string') return escapeHtml(value);
    if (Array.isArray(value)) return value.map(escapeHtmlDeep);
    if (value && typeof value === 'object') {
      var result = {};
      Object.keys(value).forEach(function(key) {
        result[key] = escapeHtmlDeep(value[key]);
      });
      return result;
    }
    return value;
  }

  return {
    escapeHtml: escapeHtml,
    escapeHtmlDeep: escapeHtmlDeep,
  };
});
