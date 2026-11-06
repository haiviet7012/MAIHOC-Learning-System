import katex from '../vendor/katex.js';

// Native MathML output needs neither a remote CDN nor a font/CSS download.
// Treat author content as text; only KaTeX's untrusted MathML output becomes markup.
export function renderQuestionMath(root) {
  if (!root?.isConnected) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('math, .katex, script, style, textarea, input, select, code, pre')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const source = node.textContent;
    const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
    let match, offset = 0, changed = false;
    const fragment = document.createDocumentFragment();
    while ((match = pattern.exec(source))) {
      changed = true;
      fragment.append(document.createTextNode(source.slice(offset, match.index)));
      const wrapper = document.createElement('span');
      wrapper.className = 'qb-formula';
      wrapper.innerHTML = katex.renderToString(match[1] ?? match[2] ?? match[3] ?? match[4], {
        output: 'mathml', displayMode: match[1] !== undefined || match[4] !== undefined,
        throwOnError: false, strict: 'ignore', trust: false,
      });
      fragment.append(wrapper); offset = pattern.lastIndex;
    }
    if (changed) { fragment.append(document.createTextNode(source.slice(offset))); node.replaceWith(fragment); }
  }
}
