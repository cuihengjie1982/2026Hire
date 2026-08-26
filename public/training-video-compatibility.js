(function (root) {
  'use strict';
  var projectHost = 'eqdfyhqeqkbjvivscjau.supabase.co';
  var storagePrefix = '/storage/v1/object/public/training-materials/';
  var proxyPrefix = '/training-media/';
  var variantPrefix = 'materials/ios-compatible/';

  function variantObjectName(path) {
    if (typeof path !== 'string' || path.indexOf('materials/') !== 0 ||
        path.indexOf(variantPrefix) === 0 || /(^|\/)\.\.?($|\/)|[\\\x00-\x1f]/.test(path) ||
        !/\.(mp4|m4v|mov|webm|avi|mkv)$/i.test(path)) {
      throw new Error('Not an original training video object');
    }
    var name = path.slice('materials/'.length);
    return variantPrefix + name + (/\.mp4$/i.test(name) ? '' : '.mp4');
  }

  function objectName(url, origin) {
    try {
      var parsed = new URL(url, origin);
      var path = '';
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      if ((parsed.hostname === projectHost || parsed.hostname === projectHost.replace('.supabase.co', '.storage.supabase.co')) &&
          parsed.pathname.indexOf(storagePrefix) === 0) {
        path = parsed.pathname.slice(storagePrefix.length);
      } else if (parsed.origin === origin && parsed.pathname.indexOf(proxyPrefix) === 0) {
        path = parsed.pathname.slice(proxyPrefix.length);
      }
      return path ? decodeURIComponent(path) : '';
    } catch (_) { return ''; }
  }

  function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function originalUrl(path) {
    return 'https://' + projectHost + storagePrefix + encodePath(path);
  }

  function variantUrl(url, origin) {
    try { return originalUrl(variantObjectName(objectName(url, origin))); }
    catch (_) { return ''; }
  }

  function candidates(url, options) {
    if (!url) return [];
    var path = objectName(url, options.origin);
    var raw = path ? originalUrl(path) : url;
    var proxy = path ? options.origin + proxyPrefix + encodePath(path) : url;
    var compatible = variantUrl(raw, options.origin);
    var ua = options.userAgent || '';
    var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && options.touchPoints > 1);
    var ordered = ios ? [compatible, raw, proxy] :
      (/MicroMessenger/i.test(ua) ? [proxy, raw, compatible] : [raw, proxy, compatible]);
    return ordered.filter(function (value, index) { return value && ordered.indexOf(value) === index; });
  }

  root.TrainingVideoCompatibility = {
    variantObjectName: variantObjectName,
    variantUrl: variantUrl,
    objectName: objectName,
    originalUrl: originalUrl,
    candidates: candidates
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
