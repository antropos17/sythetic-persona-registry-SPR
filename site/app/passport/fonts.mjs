let ready;
function fontsReady() {
  return (ready ??= loadFonts());
}
async function loadFonts() {
  if (!document.fonts) return;
  const want = [
    '400 21px Archivo',
    '600 31px Archivo',
    '700 34px Archivo',
    '800 36px Archivo',
    'italic 400 30px Archivo',
    '500 32px "IBM Plex Mono"',
    '88px "Mrs Saint Delafield"',
  ];
  let timer;
  try {
    await Promise.race([
      Promise.all(want.map((f) => document.fonts.load(f))),
      new Promise((r) => {
        timer = setTimeout(r, 3000);
      }),
    ]);
  } catch {
  } finally {
    clearTimeout(timer);
  }
}

export { fontsReady };
