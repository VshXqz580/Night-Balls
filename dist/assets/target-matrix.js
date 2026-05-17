const root = document.querySelector("[data-target-matrix]");

if (root) {
  const svg = root.querySelector(".target-svg");
  const handle = root.querySelector("[data-target-handle]");
  const handleGlow = root.querySelector("[data-target-handle-glow]");
  const progressPaths = Array.from(root.querySelectorAll("[data-progress-ring]"));
  const tailPaths = Array.from(root.querySelectorAll("[data-tail-ring]"));
  const cometTrailPaths = Array.from(root.querySelectorAll("[data-comet-trail]"));
  const cometGlows = Array.from(root.querySelectorAll("[data-comet-glow]"));
  const cometHeads = Array.from(root.querySelectorAll("[data-comet-head]"));

  const viewBox = svg.viewBox.baseVal;

  const RINGS = [
    { cx: 180, cy: 132, rx: 144, ry: 92 },
    { cx: 180, cy: 132, rx: 114, ry: 70 },
    { cx: 180, cy: 132, rx: 78, ry: 46 },
  ];

  const COMET_CONFIGS = [
    { ringIndex: 0, angle: -0.36, speed: 0.00038, trail: 0.92 },
    { ringIndex: 1, angle: 1.94, speed: -0.00048, trail: 0.82 },
    { ringIndex: 2, angle: 3.08, speed: 0.00064, trail: 0.7 },
  ];

  const INITIAL_RING_INDEX = 1;
  const INITIAL_ANGLE = -0.78;
  const SMOOTHING = 0.24;
  const SETTLE_EPSILON = 0.0015;

  const state = {
    handleRingIndex: INITIAL_RING_INDEX,
    handleAngleRaw: INITIAL_ANGLE,
    handleAngleUnwrapped: INITIAL_ANGLE,
    displayHandleAngleUnwrapped: INITIAL_ANGLE,
    drag: null,
    frameId: 0,
    lastFrameTime: 0,
    comets: COMET_CONFIGS.map((config) => ({
      ...config,
      currentAngle: config.angle,
    })),
  };

  function pointOnRing(ring, angle) {
    return {
      x: ring.cx + ring.rx * Math.cos(angle),
      y: ring.cy + ring.ry * Math.sin(angle),
    };
  }

  function projectPointToRing(ring, point) {
    const normalizedX = (point.x - ring.cx) / ring.rx;
    const normalizedY = (point.y - ring.cy) / ring.ry;
    const angle = Math.atan2(normalizedY, normalizedX);
    const projected = pointOnRing(ring, angle);

    return {
      angle,
      point: projected,
      distance: Math.hypot(projected.x - point.x, projected.y - point.y),
    };
  }

  function getNearestRing(point) {
    let best = null;

    RINGS.forEach((ring, ringIndex) => {
      const projection = projectPointToRing(ring, point);

      if (!best || projection.distance < best.distance) {
        best = {
          ringIndex,
          ...projection,
        };
      }
    });

    return best;
  }

  function getPointerPoint(event) {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * viewBox.width;
    const y = ((event.clientY - rect.top) / rect.height) * viewBox.height;

    return { x, y };
  }

  function unwrapDelta(nextAngle, previousAngle) {
    let delta = nextAngle - previousAngle;

    if (delta > Math.PI) {
      delta -= Math.PI * 2;
    } else if (delta < -Math.PI) {
      delta += Math.PI * 2;
    }

    return delta;
  }

  function normalizeLoopAngle(angle) {
    const loop = Math.PI * 2;

    if (angle > loop || angle < -loop) {
      return angle % loop;
    }

    return angle;
  }

  function buildArcPath(ring, fromAngle, toAngle) {
    const delta = toAngle - fromAngle;

    if (Math.abs(delta) < 0.001) {
      return "";
    }

    const steps = Math.max(6, Math.ceil(Math.abs(delta) / (Math.PI / 28)));
    const points = [];

    for (let step = 0; step <= steps; step += 1) {
      const angle = fromAngle + (delta * step) / steps;
      points.push(pointOnRing(ring, angle));
    }

    return points
      .map((point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      )
      .join(" ");
  }

  function clearActivePaths() {
    progressPaths.forEach((path) => {
      path.setAttribute("d", "");
      path.classList.remove("is-active");
    });

    tailPaths.forEach((path) => {
      path.setAttribute("d", "");
      path.classList.remove("is-active");
    });
  }

  function smoothValue(current, target) {
    const delta = target - current;

    if (Math.abs(delta) <= SETTLE_EPSILON) {
      return target;
    }

    return current + delta * SMOOTHING;
  }

  function setCirclePosition(node, point) {
    node.setAttribute("cx", point.x.toFixed(2));
    node.setAttribute("cy", point.y.toFixed(2));
  }

  function renderHandle() {
    const ring = RINGS[state.handleRingIndex];
    const point = pointOnRing(ring, state.displayHandleAngleUnwrapped);

    setCirclePosition(handle, point);
    setCirclePosition(handleGlow, point);
  }

  function renderComets() {
    state.comets.forEach((comet, index) => {
      const ring = RINGS[comet.ringIndex];
      const direction = Math.sign(comet.speed) || 1;
      const trailStart = comet.currentAngle - direction * comet.trail;
      const point = pointOnRing(ring, comet.currentAngle);

      cometTrailPaths[index].setAttribute(
        "d",
        buildArcPath(ring, trailStart, comet.currentAngle),
      );
      setCirclePosition(cometGlows[index], point);
      setCirclePosition(cometHeads[index], point);
    });
  }

  function renderDrag() {
    clearActivePaths();

    if (!state.drag) {
      return;
    }

    const { ringIndex, startAngleUnwrapped, displayCurrentAngleUnwrapped } = state.drag;
    const ring = RINGS[ringIndex];
    const totalDelta = displayCurrentAngleUnwrapped - startAngleUnwrapped;

    if (Math.abs(totalDelta) < 0.001) {
      return;
    }

    const progressPath = progressPaths[ringIndex];
    const tailPath = tailPaths[ringIndex];
    const tailLength = Math.min(Math.abs(totalDelta), 0.62);
    const direction = Math.sign(totalDelta) || 1;
    const tailStart = displayCurrentAngleUnwrapped - direction * tailLength;

    progressPath.setAttribute(
      "d",
      buildArcPath(ring, startAngleUnwrapped, displayCurrentAngleUnwrapped),
    );
    progressPath.classList.add("is-active");

    tailPath.setAttribute("d", buildArcPath(ring, tailStart, displayCurrentAngleUnwrapped));
    tailPath.classList.add("is-active");
  }

  function render() {
    renderComets();
    renderHandle();
    renderDrag();
  }

  function updateComets(deltaMs) {
    state.comets.forEach((comet) => {
      comet.currentAngle = normalizeLoopAngle(comet.currentAngle + comet.speed * deltaMs);
    });
  }

  function renderFrame(now) {
    const elapsed = state.lastFrameTime ? now - state.lastFrameTime : 16;
    const deltaMs = Math.min(34, Math.max(12, elapsed));

    state.lastFrameTime = now;
    updateComets(deltaMs);
    state.displayHandleAngleUnwrapped = smoothValue(
      state.displayHandleAngleUnwrapped,
      state.handleAngleUnwrapped,
    );

    if (state.drag) {
      state.drag.displayCurrentAngleUnwrapped = smoothValue(
        state.drag.displayCurrentAngleUnwrapped,
        state.drag.currentAngleUnwrapped,
      );
    }

    render();
    state.frameId = window.requestAnimationFrame(renderFrame);
  }

  function scheduleRender() {
    if (state.frameId) {
      return;
    }

    state.frameId = window.requestAnimationFrame(renderFrame);
  }

  function setDragFromNearest(nearest, pointerId) {
    state.handleRingIndex = nearest.ringIndex;
    state.handleAngleRaw = nearest.angle;
    state.handleAngleUnwrapped = nearest.angle;
    state.displayHandleAngleUnwrapped = nearest.angle;
    state.drag = {
      pointerId,
      ringIndex: nearest.ringIndex,
      startAngleRaw: nearest.angle,
      startAngleUnwrapped: nearest.angle,
      currentAngleRaw: nearest.angle,
      currentAngleUnwrapped: nearest.angle,
      displayCurrentAngleUnwrapped: nearest.angle,
    };
  }

  function onPointerDown(event) {
    event.preventDefault();

    const nearest = getNearestRing(getPointerPoint(event));
    setDragFromNearest(nearest, event.pointerId);
    root.classList.add("is-dragging");
    svg.setPointerCapture?.(event.pointerId);
    render();
  }

  function onPointerMove(event) {
    if (!state.drag || state.drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const nearest = getNearestRing(getPointerPoint(event));

    if (nearest.ringIndex !== state.drag.ringIndex) {
      state.handleRingIndex = nearest.ringIndex;
      state.handleAngleRaw = nearest.angle;
      state.handleAngleUnwrapped = nearest.angle;
      state.displayHandleAngleUnwrapped = nearest.angle;
      state.drag.ringIndex = nearest.ringIndex;
      state.drag.startAngleRaw = nearest.angle;
      state.drag.startAngleUnwrapped = nearest.angle;
      state.drag.currentAngleRaw = nearest.angle;
      state.drag.currentAngleUnwrapped = nearest.angle;
      state.drag.displayCurrentAngleUnwrapped = nearest.angle;
      render();
      return;
    }

    const delta = unwrapDelta(nearest.angle, state.drag.currentAngleRaw);

    state.drag.currentAngleRaw = nearest.angle;
    state.drag.currentAngleUnwrapped += delta;
    state.handleRingIndex = nearest.ringIndex;
    state.handleAngleRaw = nearest.angle;
    state.handleAngleUnwrapped = state.drag.currentAngleUnwrapped;
  }

  function stopDrag(event) {
    if (!state.drag || state.drag.pointerId !== event.pointerId) {
      return;
    }

    state.handleRingIndex = state.drag.ringIndex;
    state.handleAngleRaw = state.drag.currentAngleRaw;
    state.handleAngleUnwrapped = state.drag.currentAngleUnwrapped;
    state.drag = null;
    root.classList.remove("is-dragging");
    svg.releasePointerCapture?.(event.pointerId);
    render();
  }

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", stopDrag);
  svg.addEventListener("pointercancel", stopDrag);
  svg.addEventListener("lostpointercapture", (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) {
      return;
    }

    state.handleRingIndex = state.drag.ringIndex;
    state.handleAngleRaw = state.drag.currentAngleRaw;
    state.handleAngleUnwrapped = state.drag.currentAngleUnwrapped;
    state.drag = null;
    root.classList.remove("is-dragging");
    render();
  });

  render();
  scheduleRender();
}
