/** Tiny DOM helpers. Text is always set via textContent, never innerHTML (file data is untrusted). */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el: Element, attrs: Attrs | undefined): void {
  if (!attrs) return;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') {
      el.addEventListener(name.replace(/^on/, '').toLowerCase(), value);
    } else {
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
}

function append(el: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'number' ? String(child) : child);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

/** querySelector that fails loudly if the markup and the code drift apart. */
export function $<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
