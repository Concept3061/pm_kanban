import { pointerCollision } from "@/lib/dragCollision";

type Rect = { left: number; top: number; width: number; height: number };

const rect = ({ left, top, width, height }: Rect) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

// Two columns side by side, each holding one card near its top.
const droppables: Record<string, Rect> = {
  "col-a": { left: 0, top: 0, width: 200, height: 600 },
  "col-b": { left: 220, top: 0, width: 200, height: 600 },
  "card-a": { left: 10, top: 40, width: 180, height: 80 },
  "card-b": { left: 230, top: 40, width: 180, height: 80 },
};

const detect = (
  pointer: { x: number; y: number } | null,
  // The dragged card's own rectangle, which may overlap another column.
  dragged: Rect = { left: 150, top: 300, width: 180, height: 80 }
) => {
  const droppableRects = new Map(
    Object.entries(droppables).map(([id, r]) => [id, rect(r)])
  );
  const droppableContainers = Object.keys(droppables).map((id) => ({
    id,
    key: id,
    data: { current: {} },
    disabled: false,
    node: { current: null },
    rect: { current: droppableRects.get(id) ?? null },
  }));
  const collisions = pointerCollision(["col-a", "col-b"])({
    active: { id: "dragged", data: { current: {} }, rect: { current: { initial: null, translated: null } } },
    collisionRect: rect(dragged) as never,
    droppableRects: droppableRects as never,
    droppableContainers: droppableContainers as never,
    pointerCoordinates: pointer,
  });
  return collisions.map((collision) => collision.id);
};

describe("pointerCollision", () => {
  it("uses the column under the pointer, whatever the dragged card overlaps", () => {
    // The card's rectangle sticks into column A, but the pointer is in column B.
    expect(detect({ x: 320, y: 400 })).toEqual(["col-b"]);
    expect(detect({ x: 100, y: 400 })).toEqual(["col-a"]);
  });

  it("prefers the card under the pointer to its column", () => {
    expect(detect({ x: 320, y: 80 })).toEqual(["card-b"]);
    expect(detect({ x: 100, y: 80 })).toEqual(["card-a"]);
  });

  it("falls back to the nearest corners in the gap between columns", () => {
    const result = detect({ x: 210, y: 300 }, { left: 215, top: 300, width: 180, height: 80 });
    expect(result.length).toBeGreaterThan(0);
  });

  it("falls back to the nearest corners without a pointer, as when dragging by keyboard", () => {
    const result = detect(null, { left: 230, top: 40, width: 180, height: 80 });
    expect(result[0]).toBe("card-b");
  });
});
