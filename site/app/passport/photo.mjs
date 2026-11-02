function loadPhoto(p) {
  if (p.photo && p.photo.complete) return Promise.resolve();
  if (p.photoPromise) return p.photoPromise;
  const im = new Image();
  p.photo = im;
  p.photoPromise = new Promise((resolve) => {
    im.onload = im.onerror = () => {
      p.photoPromise = null;
      resolve();
    };
    im.src = p.src;
  });
  return p.photoPromise;
}

export { loadPhoto };
