// Solmarina 3D: keyboard + mouse input state (browser only).
// WASD/arrows move, Shift run, E enter/exit car, F punch, P pause,
// M mute, Enter start/confirm, C continue, Space handbrake, click shoot.
export function createInput() {
  const keys = {};
  const mouse = { x: 0, y: 0, down: false, clicked: false, dragDX: 0, dragDY: 0 };
  let dragging = false;
  let lastX = 0, lastY = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onMouseDown(e) {
    mouse.down = true; mouse.clicked = true;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  }
  function onMouseUp() { mouse.down = false; dragging = false; }
  function onMouseMove(e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (dragging) {
      mouse.dragDX += e.clientX - lastX;
      mouse.dragDY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    }
  }
  function onBlur() {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.down = false; dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);

  return {
    keys, mouse,
    down(code) { return !!keys[code]; },
    get moveX() {
      return (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
        - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    },
    get moveY() {
      return (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0)
        - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    },
    get run() { return this.down('ShiftLeft') || this.down('ShiftRight'); },
    get handbrake() { return this.down('Space'); },
    // Consume one-shot presses (call once per frame).
    consume(code) {
      if (keys[code]) { keys[code] = false; return true; }
      return false;
    },
    consumeClick() {
      if (mouse.clicked) { mouse.clicked = false; return true; }
      return false;
    },
    consumeDrag() {
      const dx = mouse.dragDX, dy = mouse.dragDY;
      mouse.dragDX = 0; mouse.dragDY = 0;
      return { dx, dy };
    },
  };
}
