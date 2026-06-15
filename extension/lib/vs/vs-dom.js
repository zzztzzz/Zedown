/* vs-dom.js — tiny DOM helpers shared by the Visual Diagram Studio editors
   (vs-graph.js / vs-mindmap.js / vs-forms.js / vs-studio.js). Vanilla, no deps.
     VS_el(tag, attrs, ...children)   HTML element
     VS_svg(tag, attrs, ...children)  SVG element (createElementNS)
   attrs: { style:{...} | string, class, dataset:{...}, on<event>:fn, *:attr }. */
(function () {
  var SVGNS = 'http://www.w3.org/2000/svg';

  function apply(node, attrs) {
    if (!attrs) return;
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') { for (var p in v) node.style[p] = v[p]; }
      else if (k === 'style') node.setAttribute('style', v);
      else if (k === 'class') node.setAttribute('class', v);
      else if (k === 'dataset' && typeof v === 'object') { for (var d in v) node.dataset[d] = v[d]; }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
  }
  function append(node, kids) {
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) { append(node, c); continue; }
      node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    apply(node, attrs);
    append(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }
  function svg(tag, attrs) {
    var node = document.createElementNS(SVGNS, tag);
    apply(node, attrs);
    append(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  window.VS_el = el;
  window.VS_svg = svg;
})();
