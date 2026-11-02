// One optional download per page session. Forms and case pages never load WebGL.
let libraryPromise;
export function loadThree() {
  if (globalThis.THREE) return Promise.resolve(globalThis.THREE);
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../assets/vendor/three.min.js';
    if (location.protocol !== 'file:') {
      script.integrity = __THREE_INTEGRITY__;
      script.crossOrigin = 'anonymous';
    }
    const finish = (error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve(globalThis.THREE);
    };
    const timer = setTimeout(() => finish(new Error('3D library timed out')), 10000);
    script.onload = () => finish(globalThis.THREE ? null : new Error('3D library unavailable'));
    script.onerror = () => finish(new Error('3D library failed to load'));
    document.head.appendChild(script);
  }).catch((error) => {
    libraryPromise = null;
    throw error;
  });
  return libraryPromise;
}
