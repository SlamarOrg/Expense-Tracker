// Tiny DOM helpers used by every renderer.
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
