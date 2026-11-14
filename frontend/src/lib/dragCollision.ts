import {
  closestCorners,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";

// Decides what a dragged card is over from where the pointer is, not from the
// card's own rectangle. The card's rectangle depends on where it was grabbed, so
// a card grabbed by a corner can overlap the neighbouring column even though the
// pointer is in the middle of the intended one.
//
// A card under the pointer wins over its column, so the drop lands next to it;
// otherwise the column under the pointer is used. Without a pointer (keyboard
// dragging) or between columns, it falls back to the nearest corners.
export const pointerCollision =
  (columnIds: string[]): CollisionDetection =>
  (args) => {
    const underPointer = pointerWithin(args);
    if (underPointer.length === 0) {
      return closestCorners(args);
    }
    const card = underPointer.find(({ id }) => !columnIds.includes(id as string));
    return card ? [card] : underPointer;
  };
