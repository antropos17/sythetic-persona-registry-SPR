const React = globalThis.React;
const ReactDOM = globalThis.ReactDOM;
const htm = globalThis.htm;

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const html = htm.bind(React.createElement);

export { REDUCED } from './preferences.mjs';

export { useState, useEffect, useRef, useMemo, useCallback, html, React, ReactDOM };
