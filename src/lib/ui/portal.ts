/** Moves a floating surface to the document layer so sticky grids cannot cover it. */
export function portal(node: HTMLElement) {
  document.body.append(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
