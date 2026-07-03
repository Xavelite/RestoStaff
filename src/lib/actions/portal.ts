// Move a node to <body> so overlay content (modals, dropdowns) escapes any
// clipping or fixed-positioning containing-block ancestor — overflow:hidden/auto
// scroll panels, backdrop-filter/transform topbars, etc. Shared by Dialog and
// FilterMenu so there is one overlay-escape mechanism, not per-component hacks.
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
