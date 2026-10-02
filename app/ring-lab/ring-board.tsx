'use client';
import { useEffect, useRef } from 'react';


import './ring-lab.css';

const SIZE = 7;
const RINGSIDE_SIZE = 9;
const BOARD_CENTER_SIZE = RINGSIDE_SIZE;
// Vite embeds VITE_ values in both the rendered page and client updates.
// GITHUB_ACTIONS is only available to the server build, so using it here
// made newly rendered down images request /assets on GitHub Pages.
const ASSET_BASE = import.meta.env.VITE_ASSET_BASE || '';
const cubes = Array.from({ length: SIZE * SIZE }, (_, index) => ({
  r: Math.floor(index / SIZE),
  c: index % SIZE,
}));
const ringsideTiles = Array.from({ length: RINGSIDE_SIZE * RINGSIDE_SIZE }, (_, index) => ({
  r: Math.floor(index / RINGSIDE_SIZE),
  c: index % RINGSIDE_SIZE,
}));
const corners = [
  { r: 0, c: 0 },
  { r: 0, c: SIZE - 1 },
  { r: SIZE - 1, c: 0 },
  { r: SIZE - 1, c: SIZE - 1 },
];

function isCornerCell(row: number, column: number) {
  return corners.some((corner) => corner.r === row && corner.c === column);
}
function isRingsidePerimeter(row: number, column: number) {
  return row === 0 || column === 0 || row === RINGSIDE_SIZE - 1 || column === RINGSIDE_SIZE - 1;
}

const TURN_ORDER = ['right-front', 'right-back', 'left-back', 'left-front'] as const;
export type RingSide = (typeof TURN_ORDER)[number];
type CubeSurface = 'front' | 'right' | 'back' | 'left' | 'top' | 'bottom';

const SURFACE_TURNS: Record<CubeSurface, number | null> = {
  front: 0,
  right: 1,
  back: 2,
  left: 3,
  top: null,
  bottom: null,
};

const SCREEN_SURFACES = {
  'right-front': {
    edge: 'M42 42 L84 21',
  },
  'right-back': { edge: 'M42 0 L84 21' },
  'left-back': { edge: 'M0 21 L42 0' },
  'left-front': {
    edge: 'M0 21 L42 42',
  },
} as const;

const TOP_SURFACE = { edge: 'M42 0 L84 21' } as const;
const FRONT_EYES = [
  { surface: 'front' as const, u: 0.357, v: 0.321 },
  { surface: 'front' as const, u: 0.619, v: 0.333 },
];

export type BoardLocation =
  | { area: 'ring'; row: number; column: number }
  | { area: 'corner'; row: number; column: number }
  | { area: 'ringside'; row: number; column: number };

const HIDDEN_RINGSIDE_DESTINATION: BoardLocation = {
  area: 'ringside',
  // C1: the far-side mat behind the default B2 red corner.
  row: -1,
  column: 1,
};

type WrestlerId = 'red' | 'blue';
export type WrestlerState = { location: BoardLocation; facing: RingSide; stance: 'standing' | 'down' };
type VisibilityMark = 'visible' | 'hidden' | 'corner-shadow';
type RopeEdge = 'top' | 'right' | 'bottom' | 'left';
type AttackKind = 'strike' | 'knockback' | 'swap' | 'dive' | 'pull-down' | 'knock-down';
type AttackTest =
  | { phase: 'idle'; message: string }
  | { phase: 'choose-result'; kind: AttackKind; attacker: WrestlerId; defender: WrestlerId };
type CombatResultCue = {
  outcome: 'hit' | 'miss';
  actor: WrestlerId;
  subject: WrestlerId;
  run: number;
};
type RopeThrowParticipants = { attacker: WrestlerId; defender: WrestlerId };
type RopeThrowTest =
  | { phase: 'idle'; message: string }
  | ({ phase: 'choose-direction' } & RopeThrowParticipants)
  | ({ phase: 'choose-result'; direction: RingSide } & RopeThrowParticipants)
  | ({ phase: 'travelling'; direction: RingSide; outcome: 'success' | 'failure' } & RopeThrowParticipants)
  | ({
      phase: 'awaiting-intercept';
      direction: RingSide;
      returnLocation: Extract<BoardLocation, { area: 'ring' }>;
      ropeLocation: Extract<BoardLocation, { area: 'ring' }>;
    } & RopeThrowParticipants);

const ROPE_THROW_DIRECTIONS = [
  { facing: 'right-back', label: '右奥', row: -1, column: 0, edge: 'top' },
  { facing: 'right-front', label: '右手前', row: 0, column: 1, edge: 'right' },
  { facing: 'left-front', label: '左手前', row: 1, column: 0, edge: 'bottom' },
  { facing: 'left-back', label: '左奥', row: 0, column: -1, edge: 'left' },
] as const satisfies readonly {
  facing: RingSide;
  label: string;
  row: number;
  column: number;
  edge: RopeEdge;
}[];

const INITIAL_WRESTLERS: Record<WrestlerId, WrestlerState> = {
  // D5 and F5: both wrestlers begin near center with E5 between them.
  red: { location: { area: 'ring', row: 3, column: 2 }, facing: 'right-front', stance: 'standing' },
  blue: { location: { area: 'ring', row: 3, column: 4 }, facing: 'left-back', stance: 'standing' },
};

// There are only two camera views: the normal view and its 180° opposite.
// Keeping this to a half-turn prevents the board from ever entering a
// diagonal 90° view that is not used by the game.
export type BoardRotation = 0 | 2;

function rotateCell(row: number, column: number, size: number, rotation: BoardRotation) {
  let rotatedRow = row;
  let rotatedColumn = column;

  for (let turn = 0; turn < rotation; turn += 1) {
    [rotatedRow, rotatedColumn] = [rotatedColumn, size - 1 - rotatedRow];
  }

  return { row: rotatedRow, column: rotatedColumn };
}

// Everything on the ring uses one 9×9 world coordinate system. The ring is
// the inner 7×7 cells (world coordinates 0–6); ringside is the outer border.
function rotateWorldCell(row: number, column: number, rotation: BoardRotation) {
  const rotated = rotateCell(row + 1, column + 1, BOARD_CENTER_SIZE, rotation);
  return { row: rotated.row - 1, column: rotated.column - 1 };
}

function boardPosition(location: BoardLocation, rotation: BoardRotation) {
  const { row, column } = rotateWorldCell(location.row, location.column, rotation);
  // A piece is positioned by its feet, not by the top-left of its cube image.
  // Ring cells begin at 18; the 9×9 ringside floor is one rendered level lower.
  const floorTop = (location.area === 'ringside' ? 60 : 18) + (row + column) * 21;
  const standingLevels = location.area === 'corner' ? 2 : 1;
  const depth = row + column;
  // All solid objects on the ring share the same depth scale. This lets a
  // nearer post cover a farther wrestler, while a nearer wrestler correctly
  // covers a farther post. Height only lifts the token into its own band.
  const zIndex = location.area === 'ringside'
    ? (depth < SIZE - 1 ? 20 + depth : 90 + depth)
    : location.area === 'corner'
      ? 80 + depth
      : 60 + depth;

  return {
    left: `calc(50% + ${(column - row) * 42}px)`,
    top: `${floorTop - standingLevels * 42}px`,
    zIndex,
  };
}

function isSameLocation(left: BoardLocation, right: BoardLocation) {
  return left.area === right.area && left.row === right.row && left.column === right.column;
}

function otherWrestler(id: WrestlerId): WrestlerId {
  return id === 'red' ? 'blue' : 'red';
}

function isAdjacentForRopeThrow(left: BoardLocation, right: BoardLocation) {
  return left.area === right.area
    && (left.area === 'ring' || left.area === 'ringside')
    && Math.abs(left.row - right.row) + Math.abs(left.column - right.column) === 1;
}

function isMovementAllowedByEngagement(
  from: BoardLocation,
  to: BoardLocation,
  opponent: BoardLocation,
  stance: WrestlerState['stance'],
) {
  const distance = Math.abs(from.row - to.row) + Math.abs(from.column - to.column);
  if (stance === 'down') return distance <= 1;
  if (!isAdjacentForRopeThrow(from, opponent)) return distance <= 2;

  // While engaged, a wrestler may step away by one cell or circle one quarter
  // around the opponent. Crossing directly from front to rear is not allowed.
  if (distance <= 1) return true;
  if (!isAdjacentForRopeThrow(to, opponent)) return false;
  const fromRow = from.row - opponent.row;
  const fromColumn = from.column - opponent.column;
  const toRow = to.row - opponent.row;
  const toColumn = to.column - opponent.column;
  return fromRow * toRow + fromColumn * toColumn === 0;
}

function oppositeFacing(facing: RingSide): RingSide {
  return TURN_ORDER[(TURN_ORDER.indexOf(facing) + 2) % TURN_ORDER.length];
}

function turnFacing(facing: RingSide, amount: -1 | 1): RingSide {
  const index = TURN_ORDER.indexOf(facing);
  return TURN_ORDER[(index + amount + TURN_ORDER.length) % TURN_ORDER.length];
}

function facingToward(from: BoardLocation, to: BoardLocation): RingSide {
  const rowDistance = to.row - from.row;
  const columnDistance = to.column - from.column;
  if (Math.abs(columnDistance) > Math.abs(rowDistance)) {
    return columnDistance > 0 ? 'right-front' : 'left-back';
  }
  return rowDistance > 0 ? 'left-front' : 'right-back';
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

function locationHeight(location: BoardLocation) {
  return location.area === 'ringside' ? 0 : location.area === 'ring' ? 1 : 2;
}

function directionVector(facing: RingSide) {
  return ROPE_THROW_DIRECTIONS.find((direction) => direction.facing === facing)!;
}

function forwardDistance(from: BoardLocation, to: BoardLocation, facing: RingSide) {
  const vector = directionVector(facing);
  const rowDistance = to.row - from.row;
  const columnDistance = to.column - from.column;
  if (vector.row !== 0 && columnDistance === 0 && rowDistance * vector.row > 0) {
    return Math.abs(rowDistance);
  }
  if (vector.column !== 0 && rowDistance === 0 && columnDistance * vector.column > 0) {
    return Math.abs(columnDistance);
  }
  return null;
}

function cornerTopAttackVector(from: BoardLocation, to: BoardLocation) {
  if (from.area !== 'corner' || to.area !== 'ring') return null;
  const rowDistance = to.row - from.row;
  const columnDistance = to.column - from.column;
  const range = Math.max(Math.abs(rowDistance), Math.abs(columnDistance));
  if (
    range < 1
    || range > 2
    || (rowDistance === 0 && columnDistance === 0)
  ) {
    return null;
  }
  return { row: Math.sign(rowDistance), column: Math.sign(columnDistance) };
}

function isPlayableLocation(location: BoardLocation) {
  if (location.area === 'ring') {
    return location.row >= 0 && location.row < SIZE
      && location.column >= 0 && location.column < SIZE
      && !isCornerCell(location.row, location.column);
  }
  if (location.area === 'corner') return isCornerCell(location.row, location.column);
  return location.row >= -1 && location.row <= SIZE
    && location.column >= -1 && location.column <= SIZE
    && (location.row === -1 || location.row === SIZE || location.column === -1 || location.column === SIZE);
}

function locationForWorldCell(row: number, column: number): BoardLocation | null {
  if (row >= 0 && row < SIZE && column >= 0 && column < SIZE && !isCornerCell(row, column)) {
    return { area: 'ring', row, column };
  }
  const ringside = { area: 'ringside', row, column } as const;
  return isPlayableLocation(ringside) ? ringside : null;
}

function randomChoice<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function locationLabel(location: BoardLocation) {
  return `${String.fromCharCode(66 + location.column)}${location.row + 2}`;
}

function sameAreaLandingCandidates(
  center: BoardLocation,
  area: 'ring' | 'ringside',
  occupied: readonly BoardLocation[],
) {
  const candidates: BoardLocation[] = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const candidate = {
        area,
        row: center.row + rowOffset,
        column: center.column + columnOffset,
      } as BoardLocation;
      if (isPlayableLocation(candidate) && !occupied.some((location) => isSameLocation(location, candidate))) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function ropeThrowGeometry(attacker: BoardLocation, direction: RingSide, defender?: BoardLocation) {
  if (attacker.area !== 'ring') return null;
  const vector = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction)!;
  const frontRow = attacker.row + vector.row;
  const frontColumn = attacker.column + vector.column;

  // When the defender is already against the selected rope, the outward throw
  // begins from their square rather than the attacker's square.
  const defenderOutRow = defender?.area === 'ring' ? defender.row + vector.row : null;
  const defenderOutColumn = defender?.area === 'ring' ? defender.column + vector.column : null;
  const defenderFallsOut = defenderOutRow !== null
    && defenderOutColumn !== null
    && (defenderOutRow < 0
      || defenderOutRow >= SIZE
      || defenderOutColumn < 0
      || defenderOutColumn >= SIZE);

  // Throwing outward from a rope-side square sends the defender directly to
  // ringside. There is no return or interception phase after a fall.
  if (defenderFallsOut || frontRow < 0 || frontRow >= SIZE || frontColumn < 0 || frontColumn >= SIZE) {
    return {
      fellOut: true as const,
      destination: {
        area: 'ringside',
        row: defenderFallsOut ? defenderOutRow : frontRow,
        column: defenderFallsOut ? defenderOutColumn : frontColumn,
      } as BoardLocation,
      edge: vector.edge,
    };
  }

  const returnLocation = { area: 'ring', row: frontRow, column: frontColumn } as const;
  let ropeRow = frontRow;
  let ropeColumn = frontColumn;
  while (
    ropeRow + vector.row >= 0
    && ropeRow + vector.row < SIZE
    && ropeColumn + vector.column >= 0
    && ropeColumn + vector.column < SIZE
  ) {
    ropeRow += vector.row;
    ropeColumn += vector.column;
  }

  if (isCornerCell(ropeRow, ropeColumn)) {
    return {
      fellOut: false as const,
      cornerImpact: true as const,
      cornerLocation: { area: 'corner', row: ropeRow, column: ropeColumn } as BoardLocation,
      destination: {
        area: 'ring',
        row: ropeRow - vector.row,
        column: ropeColumn - vector.column,
      } as BoardLocation,
      edge: vector.edge,
    };
  }

  return {
    fellOut: false as const,
    cornerImpact: false as const,
    returnLocation,
    ropeLocation: { area: 'ring', row: ropeRow, column: ropeColumn } as const,
    edge: vector.edge,
  };
}

function ringsideThrowGeometry(attacker: BoardLocation, direction: RingSide) {
  if (attacker.area !== 'ringside') return null;
  const vector = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction)!;
  const nextRow = attacker.row + vector.row;
  const nextColumn = attacker.column + vector.column;

  const cornerImpact = corners.find((corner) => {
    const distance = Math.abs(attacker.row - corner.r) + Math.abs(attacker.column - corner.c);
    const nextDistance = Math.abs(nextRow - corner.r) + Math.abs(nextColumn - corner.c);
    return distance <= 2
      && Math.max(Math.abs(attacker.row - corner.r), Math.abs(attacker.column - corner.c)) === 1
      && nextDistance < distance;
  });

  if (cornerImpact) {
    return { kind: 'corner-impact' as const, corner: cornerImpact };
  }

  if (nextRow >= 0 && nextRow < SIZE && nextColumn >= 0 && nextColumn < SIZE) {
    return {
      kind: 'ring-return' as const,
      destination: { area: 'ring', row: nextRow, column: nextColumn } as BoardLocation,
    };
  }

  if (nextRow < -1 || nextRow > SIZE || nextColumn < -1 || nextColumn > SIZE) {
    return { kind: 'barrier-impact' as const };
  }

  let destinationRow = attacker.row;
  let destinationColumn = attacker.column;
  while (
    destinationRow + vector.row >= -1
    && destinationRow + vector.row <= SIZE
    && destinationColumn + vector.column >= -1
    && destinationColumn + vector.column <= SIZE
  ) {
    destinationRow += vector.row;
    destinationColumn += vector.column;
  }

  return {
    kind: 'barrier-run' as const,
    destination: {
      area: 'ringside',
      row: destinationRow,
      column: destinationColumn,
    } as BoardLocation,
  };
}

function ropeDirectionTarget(attacker: BoardLocation, direction: RingSide, defender?: BoardLocation) {
  if (attacker.area === 'ring') {
    const geometry = ropeThrowGeometry(attacker, direction, defender);
    if (!geometry) return null;
    if (geometry.fellOut) return { location: geometry.destination, kind: 'outside' as const };
    if (geometry.cornerImpact) return { location: geometry.cornerLocation, kind: 'corner' as const };
    return { location: geometry.ropeLocation, kind: 'rope' as const };
  }

  if (attacker.area === 'ringside') {
    const geometry = ringsideThrowGeometry(attacker, direction);
    if (!geometry) return null;
    if (geometry.kind === 'corner-impact') {
      return {
        location: { area: 'corner', row: geometry.corner.r, column: geometry.corner.c } as BoardLocation,
        kind: 'corner' as const,
      };
    }
    if ('destination' in geometry) {
      return {
        location: geometry.destination,
        kind: geometry.kind === 'ring-return' ? 'rope' as const : 'barrier' as const,
      };
    }

    const vector = directionVector(direction);
    return {
      location: {
        area: 'ringside',
        row: attacker.row + vector.row,
        column: attacker.column + vector.column,
      } as BoardLocation,
      kind: 'barrier' as const,
    };
  }

  return null;
}

function reboundPath(
  ropeLocation: Extract<BoardLocation, { area: 'ring' }>,
  returnLocation: Extract<BoardLocation, { area: 'ring' }>,
  direction: RingSide,
) {
  const vector = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction)!;
  const path: Extract<BoardLocation, { area: 'ring' }>[] = [];
  let row = ropeLocation.row;
  let column = ropeLocation.column;
  while (row !== returnLocation.row || column !== returnLocation.column) {
    row -= vector.row;
    column -= vector.column;
    path.push({ area: 'ring', row, column });
  }
  return path;
}

const CORNER_MOVEMENT_RULES = [
  { ring: [0, 0], outer: [-1, -1], sides: [[-1, 0], [0, -1]] },
  { ring: [0, SIZE - 1], outer: [-1, SIZE], sides: [[-1, SIZE - 1], [0, SIZE]] },
  { ring: [SIZE - 1, 0], outer: [SIZE, -1], sides: [[SIZE, 0], [SIZE - 1, -1]] },
  { ring: [SIZE - 1, SIZE - 1], outer: [SIZE, SIZE], sides: [[SIZE, SIZE - 1], [SIZE - 1, SIZE]] },
] as const;

const RINGSIDE_GAP_TARGETS = {
  0: [
    { label: 'A8', side: 'left', location: { area: 'ringside', row: 6, column: -1 } },
    { label: 'H1', side: 'right', location: { area: 'ringside', row: -1, column: 6 } },
  ],
  2: [
    { label: 'I2', side: 'left', location: { area: 'ringside', row: 0, column: SIZE } },
    { label: 'B9', side: 'right', location: { area: 'ringside', row: SIZE, column: 0 } },
  ],
} as const satisfies Record<BoardRotation, readonly {
  label: string;
  side: 'left' | 'right';
  location: BoardLocation;
}[]>;

function isAt(location: BoardLocation, area: BoardLocation['area'], [row, column]: readonly [number, number]) {
  return location.area === area && location.row === row && location.column === column;
}

function isBlockedCornerMove(from: BoardLocation, to: BoardLocation, rotation: BoardRotation) {
  // A wrestler may drop from a height-2 post to ringside, but cannot climb
  // directly from height 0 back onto any post.
  if (from.area === 'ringside' && to.area === 'corner') return true;

  return CORNER_MOVEMENT_RULES.some(({ ring, outer, sides }) => {
    const fromRingCorner = isAt(from, 'ring', ring);
    const toRingCorner = isAt(to, 'ring', ring);
    const toOuterCorner = isAt(to, 'ringside', outer);
    const fromSide = sides.some((side) => isAt(from, 'ringside', side));
    const toSide = sides.some((side) => isAt(to, 'ringside', side));
    const outerCornerIsHidden = rotation === 0
      ? outer[0] === -1 && outer[1] === -1
      : outer[0] === SIZE && outer[1] === SIZE;

    // The post and ropes block movement between the height-1 ring corner and
    // its two adjacent height-0 squares. At floor level only the outer corner
    // hidden by the current view is exit-only; the other three remain open.
    return (fromRingCorner && toSide)
      || (fromSide && toRingCorner)
      || (outerCornerIsHidden && fromSide && toOuterCorner);
  });
}

function isDefaultHiddenRingside(location: BoardLocation) {
  // A1 keeps the current view until the wrestler chooses B1 or A2.
  if (isAt(location, 'ringside', [-1, -1])) return false;
  return location.area === 'ringside' && (
    (location.column === -1 && location.row >= -1 && location.row <= 6)
    || (location.row === -1 && location.column >= 0 && location.column <= 6)
  );
}

function isRotatedHiddenRingside(location: BoardLocation) {
  // I9 likewise waits for the next step before deciding whether to turn back.
  if (isAt(location, 'ringside', [SIZE, SIZE])) return false;
  return location.area === 'ringside' && (
    (location.column === 7 && location.row >= 0 && location.row <= 7)
    || (location.row === 7 && location.column >= 0 && location.column <= 7)
  );
}

function rotationAfterMove(
  current: BoardRotation,
  from: BoardLocation,
  location: BoardLocation,
  otherLocation: BoardLocation,
): BoardRotation {
  // Once both wrestlers are back on the ring, restore the familiar default
  // viewpoint instead of keeping a ringside-driven half-turn.
  if (location.area === 'ring' && otherLocation.area === 'ring') return 0;

  // A1 and I9 are the two view-dependent outer corners. Which exit turns the
  // board depends on the current view; the other exit stays in that view.
  const viewCorner = ([
    { corner: [-1, -1], normalExit: [-1, 0], rotatedExit: [0, -1] },
    { corner: [SIZE, SIZE], normalExit: [SIZE - 1, SIZE], rotatedExit: [SIZE, SIZE - 1] },
  ] as const).find(({ corner }) => isAt(from, 'ringside', corner));

  if (viewCorner) {
    const leavesByNormalExit = isAt(location, 'ringside', viewCorner.normalExit as readonly [number, number]);
    const leavesByRotatedExit = isAt(location, 'ringside', viewCorner.rotatedExit as readonly [number, number]);
    if (leavesByNormalExit || leavesByRotatedExit) {
      if (current === 0 && leavesByNormalExit) return 2;
      if (current === 2 && leavesByRotatedExit) return 0;
      return current;
    }
  }

  if (current === 0 && isDefaultHiddenRingside(location)) return 2;
  if (current === 2 && isRotatedHiddenRingside(location)) return 0;
  return current;
}

function isTransparentCorner(row: number, column: number, rotation: BoardRotation) {
  return rotation === 0
    ? row === SIZE - 1 && column === SIZE - 1
    : row === 0 && column === 0;
}

// Leaving a rope-side square counts as using the rope only when the move
// carries the wrestler at least two cells inward, perpendicular to that rope.
// Moving along the rope or one cell inward does not trigger the rebound.
function ropeUsedForMove(from: BoardLocation, to: BoardLocation): RopeEdge | null {
  if (from.area !== 'ring' || to.area !== 'ring') return null;
  if (from.column === 0 && to.column >= 2) return 'left';
  if (from.column === SIZE - 1 && to.column <= SIZE - 3) return 'right';
  if (from.row === 0 && to.row >= 2) return 'top';
  if (from.row === SIZE - 1 && to.row <= SIZE - 3) return 'bottom';
  return null;
}

function rotateFacingWithBoard(facing: RingSide, rotation: BoardRotation): RingSide {
  return TURN_ORDER[(TURN_ORDER.indexOf(facing) + rotation) % TURN_ORDER.length];
}

function rotateSurface(facing: RingSide, surface: CubeSurface): RingSide | 'top' | 'bottom' {
  const surfaceTurns = SURFACE_TURNS[surface];
  if (surface === 'top' || surface === 'bottom') return surface;
  const facingTurn = TURN_ORDER.indexOf(facing);
  return TURN_ORDER[(facingTurn + (surfaceTurns ?? 0)) % TURN_ORDER.length];
}

function projectCubeObject(
  facing: RingSide,
  surface: CubeSurface,
  u: number,
  v: number,
): { x: number; y: number } | null {
  const targetSurface = rotateSurface(facing, surface);

  if (targetSurface === 'right-front') {
    return { x: 42 + 42 * u, y: 42 - 21 * u + 42 * v };
  }
  if (targetSurface === 'left-front') {
    return { x: 42 - 42 * u, y: 42 - 21 * u + 42 * v };
  }
  if (targetSurface === 'top') {
    const turn = TURN_ORDER.indexOf(facing);
    const topU = turn % 2 === 0 ? u : 1 - v;
    const topV = turn % 2 === 0 ? v : u;
    return { x: 42 + 42 * (topU - topV), y: 21 + 21 * (topU + topV) };
  }

  // A decal on the far or underside face remains attached, but is hidden by the cube.
  return null;
}

export type CharacterFacing = RingSide | 'front' | 'back' | 'profile-left' | 'profile-right';
const CARDINAL_SPRITES = {
  front: {position:'0% 0%', transform:'translate(-7px, calc(-10px - 5%))'},
  back: {position:'100% 0%', transform:'translate(7px, calc(-10px - 5%))'},
  'profile-left': {position:'0% 100%', transform:'translate(-8px, -7px) scale(.99)'},
  'profile-right': {position:'100% 100%', transform:'translate(8px, -7px) scale(.99)'},
} as const;
function previewFacing(facing:CharacterFacing,rotation:BoardRotation):CharacterFacing {
  if(facing in CARDINAL_SPRITES)return rotation===2?({front:'back',back:'front','profile-left':'profile-right','profile-right':'profile-left'} as const)[facing as keyof typeof CARDINAL_SPRITES]:facing;
  return rotateFacingWithBoard(facing as RingSide,rotation);
}
function WrestlerCube({
  characterSprite = false,
  spriteFacing,
  colorClass,
  down = false,
  downPose = 'prone',
  facing,
  label,
  reaction,
  style,
  translucent = false,
}: {
  characterSprite?: false | 'red' | 'blue';
  spriteFacing?: CharacterFacing;
  colorClass: 'corner-red' | 'corner-blue';
  down?: boolean;
  downPose?: 'prone' | 'supine';
  facing: RingSide;
  label: string;
  reaction?: 'hit' | 'miss';
  style: { left: string; top: string; zIndex: number };
  translucent?: boolean;
}) {
  // Eyes and the gold edge are one decal glued to the token's physical front.
  const frontSurface = rotateSurface(facing, 'front');
  const mark = frontSurface === 'top' || frontSurface === 'bottom'
    ? TOP_SURFACE
    : SCREEN_SURFACES[frontSurface];
  const eyes = FRONT_EYES.map(({ surface, u, v }) => projectCubeObject(facing, surface, u, v))
    .filter((point): point is { x: number; y: number } => point !== null);
  const spritePosition: Record<RingSide, string> = {
    'right-back': '100% 0%',
    'right-front': '0% 0%',
    'left-front': '100% 100%',
    'left-back': '0% 100%',
  };
  // Each generated frame has slightly different transparent margins. Move the
  // whole visual layer so the feet land at the centre of the isometric cell;
  // the wrapper itself remains at the original board coordinate.
  const spriteTransform: Record<RingSide, string> = {
    'right-back': 'translate(7px, -10px)',
    'right-front': 'translate(-7px, -10px)',
    'left-front': 'translate(10px, -8px)',
    'left-back': 'translate(-6px, -8px)',
  };

  const displayedFacing=spriteFacing||facing;
  const cardinal=displayedFacing in CARDINAL_SPRITES?CARDINAL_SPRITES[displayedFacing as keyof typeof CARDINAL_SPRITES]:null;
  return (
    <i className={`tile-cube wrestler-cube ${colorClass}${characterSprite ? ' has-character-sprite' : ''}${translucent ? ' is-translucent' : ''}${down ? ' is-down' : ''}${reaction ? ` is-${reaction}` : ''}`} aria-label={`${label}${down ? '（ダウン）' : ''}`} style={style}>
      <b className="cube-face cube-top" />
      <b className="cube-face cube-left" />
      <b className="cube-face cube-right" />
      <svg className="cube-facing-mark" viewBox="0 0 84 84" aria-hidden="true">
        <path className="cube-facing-edge" d={mark.edge} />
        {eyes.map(({ x, y }) => (
          <circle className="cube-facing-eye" cx={x} cy={y} key={`${x}-${y}`} r="3" />
        ))}
      </svg>
      {characterSprite && down && (
        <img
          alt=""
          aria-hidden="true"
          className="wrestler-character-sprite wrestler-character-sprite--down"
          decoding="sync"
          draggable={false}
          src={`${ASSET_BASE}/assets/wrestler-${characterSprite}-down${downPose === 'supine' ? '-supine' : ''}.png`}
        />
      )}
      {characterSprite && !down && (
        <b
          aria-hidden="true"
          className={`wrestler-character-sprite${cardinal?' wrestler-character-sprite--cardinal':''}`}
          data-facing={displayedFacing}
          style={{
            backgroundImage: `url(${ASSET_BASE}/assets/wrestler-${characterSprite}-${cardinal?'cardinal':'rounded'}-sprites.png)`,
            backgroundPosition: cardinal?.position||spritePosition[displayedFacing as RingSide],
            transform: cardinal?.transform||spriteTransform[displayedFacing as RingSide],
          }}
        />
      )}
    </i>
  );
}

function MenkoAttackIcon() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const icon = canvasRef.current;
    const context = icon?.getContext('2d');
    if (!icon || !context) return;

    // Keep the MENKO fist silhouette, but use the ring UI's gold accent and a
    // dedicated dark outline so it stays legible inside a white speech bubble.
    const source = document.createElement('canvas');
    source.width = 96;
    source.height = 96;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) return;
    sourceContext.font = '72px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    sourceContext.textAlign = 'center';
    sourceContext.textBaseline = 'middle';
    sourceContext.fillText('\u{1F91C}', 48, 51);

    const sample = document.createElement('canvas');
    sample.width = 24;
    sample.height = 24;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) return;
    sampleContext.imageSmoothingEnabled = true;
    sampleContext.drawImage(source, 0, 0, 24, 24);
    const pixels = sampleContext.getImageData(0, 0, 24, 24).data;

    context.clearRect(0, 0, 24, 24);
    context.fillStyle = '#111';
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const offset = (y * 24 + x) * 4;
        const alpha = pixels[offset + 3] / 255;
        if (alpha < .08) continue;
        context.globalAlpha = alpha;
        context.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const offset = (y * 24 + x) * 4;
        const alpha = pixels[offset + 3] / 255;
        if (alpha < .08) continue;
        const lightness = (
          pixels[offset] * .2126
          + pixels[offset + 1] * .7152
          + pixels[offset + 2] * .0722
        ) / 255;
        context.globalAlpha = alpha;
        context.fillStyle = lightness >= .68 ? '#ffe79a' : lightness >= .3 ? '#f6c443' : '#8c5a00';
        context.fillRect(x, y, 1, 1);
      }
    }
    context.globalAlpha = 1;
  }, []);

  return <canvas aria-hidden="true" height="24" ref={canvasRef} width="24" />;
}


type BoardProps = {
  wrestlers: Record<WrestlerId, WrestlerState>;
  poses: Record<WrestlerId, 'prone' | 'supine'>;
  rotation: BoardRotation;
  reachable: (location: BoardLocation) => boolean;
  onSelect: (location: BoardLocation) => void;
  reserved: BoardLocation | null;
  reservedFacing: RingSide;
  onTurn: ((facing: RingSide) => void) | null;
  directionTargets: {key:string;label:string;kind?:string;location:BoardLocation}[];
  onDirection: (key:string) => void;
  runPath: {row:number;column:number}[];
  combatResult: CombatResultCue | null;
  combatResults?: CombatResultCue[];
  cpuAttack?: boolean;
  spritePreview?: CharacterFacing | null;
  runningFacing?: Partial<Record<WrestlerId,CharacterFacing>>;
  ropeAnimation: {run:number;edge:RopeEdge|null};
};
export function RingBoard({wrestlers, poses, rotation:boardRotation, reachable:isMoveReachable, onSelect:moveActiveWrestler, reserved, reservedFacing, onTurn, directionTargets, onDirection, runPath, combatResult, combatResults=[],cpuAttack=false,spritePreview=null,runningFacing={},ropeAnimation}: BoardProps) {
  const results=combatResults.length?combatResults:combatResult?[combatResult]:[];
  const destinationIsBlocked = (location:BoardLocation) => !isMoveReachable(location);
  const reboundPreviewKeys = new Set(runPath.map(p => p.row+'-'+p.column));
  const reboundTargetKey = reserved ? reserved.row+'-'+reserved.column : '';
  const rules = {vitals:{red:{pose:poses.red},blue:{pose:poses.blue}}};
  return (      <div className="cube-study" aria-label="立方体を七マスずつ並べたリングの土台">
        <div className="cube-board">
          {ringsideTiles.map(({ r, c }) => (
            (() => {
              const location: BoardLocation = { area: 'ringside', row: r - 1, column: c - 1 };
              const rotated = rotateCell(r, c, RINGSIDE_SIZE, boardRotation);
              const style = {
                left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                top: `${18 + (rotated.row + rotated.column) * 21}px`,
              };

              // The 9×9 base remains drawn in full, but only its outer edge
              // is ringside. The inner 7×7 is covered by the actual ring.
              if (!isRingsidePerimeter(r, c)) {
                return <i aria-hidden="true" className="ringside-tile" key={`foundation-${r}-${c}`} style={style} />;
              }

              return (
                <button
                  className={`ringside-tile${isMoveReachable(location) ? ' is-move-reachable' : ''}`}
                  key={`ringside-${r}-${c}`}
                  aria-label={`場外 ${r + 1} 行 ${String.fromCharCode(65 + c)}`}
                  disabled={destinationIsBlocked(location)}
                  onClick={() => moveActiveWrestler(location)}
                  style={style}
                />
              );
            })()
          ))}
          <svg className="ringside-grid-layer" viewBox="0 0 660 420" preserveAspectRatio="none">
            {Array.from({ length: RINGSIDE_SIZE - 1 }, (_, index) => {
              const boundary = index + 1;
              const startX = 330 - boundary * 42;
              const startY = 18 + boundary * 21;
              const endX = startX + RINGSIDE_SIZE * 42;
              const endY = startY + RINGSIDE_SIZE * 21;

              return (
                <path
                  className="ringside-grid-line"
                  d={`M${startX} ${startY} L${endX} ${endY}`}
                  key={`ringside-grid-a-${index}`}
                />
              );
            })}
            {Array.from({ length: RINGSIDE_SIZE - 1 }, (_, index) => {
              const boundary = index + 1;
              const startX = 330 + boundary * 42;
              const startY = 18 + boundary * 21;
              const endX = startX - RINGSIDE_SIZE * 42;
              const endY = startY + RINGSIDE_SIZE * 21;

              return (
                <path
                  className="ringside-grid-line"
                  d={`M${startX} ${startY} L${endX} ${endY}`}
                  key={`ringside-grid-b-${index}`}
                />
              );
            })}
          </svg>
          {cubes.map(({ r, c }) => (
            (() => {
              const location: BoardLocation = { area: 'ring', row: r, column: c };
              const isBlocked = isCornerCell(r, c) || destinationIsBlocked(location);
              const rotated = rotateWorldCell(r, c, boardRotation);
              return (
                <button
                  className={`tile-cube${isMoveReachable(location) ? ' is-move-reachable' : ''}${reboundPreviewKeys.has(`${r}-${c}`) ? ' is-rebound-path' : ''}${reboundTargetKey === `${r}-${c}` ? ' is-rebound-target' : ''}`}
                  key={`${r}-${c}`}
                  aria-label={`リング ${r + 1} 行 ${String.fromCharCode(65 + c)}`}
                  aria-disabled={isBlocked}
                  disabled={isBlocked}
                  onClick={() => moveActiveWrestler(location)}
                  style={{
                    left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                    top: `${18 + (rotated.row + rotated.column) * 21}px`,
                    zIndex: 10 + rotated.row + rotated.column,
                  }}
                >
                  <b className="cube-face cube-top" />
                  <b className="cube-face cube-left" />
                  <b className="cube-face cube-right" />
                </button>
              );
            })()
          ))}
          {corners.map(({ r, c }) => {
            const location: BoardLocation = { area: 'corner', row: r, column: c };
            const translucent = isTransparentCorner(r, c, boardRotation);
            const colorClass =
              r === SIZE - 1 && c === 0
                ? 'corner-red'
                : r === 0 && c === SIZE - 1
                  ? 'corner-blue'
                  : 'corner-neutral-dark';

            const rotated = rotateWorldCell(r, c, boardRotation);
            return (
            <button
              className={`tile-cube corner-cube ${colorClass}${translucent ? ' is-translucent' : ''}${isMoveReachable(location) ? ' is-move-reachable' : ''}`}
              key={`corner-${r}-${c}`}
              aria-label="コーナー上へ移動"
              disabled={destinationIsBlocked(location)}
              onClick={() => moveActiveWrestler(location)}
              style={{
                left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                top: `${18 + (rotated.row + rotated.column) * 21 - 42}px`,
                // Posts and ring wrestlers use the same depth band. Opacity
                // changes visibility, never the physical front/back order.
                zIndex: 60 + (rotated.row + rotated.column),
              }}
            >
              <b className="cube-face cube-top" />
              <b className="cube-face cube-left" />
              <b className="cube-face cube-right" />
            </button>
            );
          })}
          {/* A corner post is selected from either of its vertical faces.
              Its projected top can occupy the exact same pixels as an inward
              ring square (G7 at the foreground H8 post), so the top remains
              available to the ring while the post body means "climb". */}
          {corners.map(({ r, c }) => {
            const cornerLocation: BoardLocation = { area: 'corner', row: r, column: c };
            const rotated = rotateWorldCell(r, c, boardRotation);
            return (
              <button
                aria-label={`${String.fromCharCode(66 + c)}${r + 2} コーナーポスト側面：高さ2へ移動`}
                className="corner-access-target"
                disabled={destinationIsBlocked(cornerLocation)}
                key={`corner-access-${r}-${c}`}
                onClick={() => moveActiveWrestler(cornerLocation)}
                style={{
                  left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                  top: `${18 + (rotated.row + rotated.column) * 21 - 42}px`,
                }}
                type="button"
              />
            );
          })}
          {/* B2, H2 and B8 can also be selected directly from the post top.
              H8 deliberately has no top target because that same projected
              diamond belongs to G7; H8 remains selectable from its sides. */}
          {corners
            .filter(({ r, c }) => r !== SIZE - 1 || c !== SIZE - 1)
            .map(({ r, c }) => {
              const cornerLocation: BoardLocation = { area: 'corner', row: r, column: c };
              const rotated = rotateWorldCell(r, c, boardRotation);
              return (
                <button
                  aria-label={`${String.fromCharCode(66 + c)}${r + 2} コーナーポスト天面：高さ2へ移動`}
                  className="corner-top-access-target"
                  disabled={destinationIsBlocked(cornerLocation)}
                  key={`corner-top-access-${r}-${c}`}
                  onClick={() => moveActiveWrestler(cornerLocation)}
                  style={{
                    left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                    top: `${18 + (rotated.row + rotated.column) * 21 - 42}px`,
                  }}
                  type="button"
                />
              );
            })}
          {cubes.filter(({ r, c }) => !isCornerCell(r, c)).map(({ r, c }) => {
            const location: BoardLocation = { area: 'ring', row: r, column: c };
            const rotated = rotateWorldCell(r, c, boardRotation);
            return (
              <button
                aria-label={`リング ${r + 1} 行 ${String.fromCharCode(65 + c)}`}
                className="ring-access-target"
                disabled={destinationIsBlocked(location)}
                key={`ring-access-${r}-${c}`}
                onClick={() => moveActiveWrestler(location)}
                style={{
                  left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                  top: `${18 + (rotated.row + rotated.column) * 21}px`,
                }}
                type="button"
              />
            );
          })}
          {/* At these four side squares, the floor diamond is easy to miss next
              to a corner post. The empty diamond where a wrestler's top would
              appear is a second, non-overlapping way to choose that same
              destination. Only the two targets exposed by the current view are
              present, and occupied or illegal destinations do not intercept
              clicks. */}
          {RINGSIDE_GAP_TARGETS[boardRotation]
            .filter(({ location }) => !destinationIsBlocked(location))
            .map(({ label, location, side }) => {
              const position = boardPosition(location, boardRotation);
              return (
                <button
                  aria-label={`${label} 手前の空白：${label}へ移動`}
                  className={`ringside-gap-access-target is-${side}`}
                  data-ringside-gap-target={label}
                  key={`ringside-gap-access-${label}`}
                  onClick={() => moveActiveWrestler(location)}
                  style={{ left: position.left, top: position.top }}
                  type="button"
                />
              );
            })}
          <svg className="grid-layer" viewBox="0 0 660 420" preserveAspectRatio="none">
            {Array.from({ length: SIZE - 1 }, (_, index) => {
              const boundary = index + 1;
              const startX = 330 - boundary * 42;
              const startY = 18 + boundary * 21;
              const endX = startX + SIZE * 42;
              const endY = startY + SIZE * 21;

              return (
                <path
                  className="grid-line"
                  d={`M${startX} ${startY} L${endX} ${endY}`}
                  key={`grid-a-${index}`}
                />
              );
            })}
            {Array.from({ length: SIZE - 1 }, (_, index) => {
              const boundary = index + 1;
              const startX = 330 + boundary * 42;
              const startY = 18 + boundary * 21;
              const endX = startX - SIZE * 42;
              const endY = startY + SIZE * 21;

              return (
                <path
                  className="grid-line"
                  d={`M${startX} ${startY} L${endX} ${endY}`}
                  key={`grid-b-${index}`}
                />
              );
            })}
          </svg>
          {directionTargets.map(({key,label,kind='rope',location})=>{
            const rotated=rotateWorldCell(location.row,location.column,boardRotation);
            const floorTop=(location.area==='ringside'?60:18)+(rotated.row+rotated.column)*21-(location.area==='corner'?42:0);
            return <button key={key} type="button" aria-label={label} className={`rope-direction-target is-${kind}`} onClick={()=>onDirection(key)} style={{left:`calc(50% + ${(rotated.column-rotated.row)*42}px)`,top:`${floorTop}px`}}/>;
          })}
          {reserved && !isSameLocation(reserved, wrestlers.red.location) && <WrestlerCube characterSprite="red" colorClass="corner-red" facing={rotateFacingWithBoard(reservedFacing, boardRotation)} label="赤の移動予約" style={boardPosition(reserved, boardRotation)} translucent />}
          {reserved && onTurn && <div className="piece-turn-controls" style={{...boardPosition(reserved,boardRotation),zIndex:145}} aria-label="予約した向きを回転">
            <button type="button" aria-label="右へ90度回転" onClick={()=>onTurn(turnFacing(reservedFacing,-1))}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
            <button type="button" aria-label="左へ90度回転" onClick={()=>onTurn(turnFacing(reservedFacing,1))}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
          </div>}
          <WrestlerCube
            characterSprite="red"
            spriteFacing={spritePreview?previewFacing(spritePreview,boardRotation):runningFacing.red?previewFacing(runningFacing.red,boardRotation):undefined}
            colorClass="corner-red"
            down={wrestlers.red.stance === 'down'}
            downPose={rules.vitals.red.pose}
            facing={rotateFacingWithBoard(wrestlers.red.facing, boardRotation)}
            label="プレイヤー選手コマ"
            reaction={results.find(r=>r.subject==='red')?.outcome}
            style={boardPosition(wrestlers.red.location, boardRotation)}
            translucent={
              wrestlers.red.location.area === 'corner'
              && isTransparentCorner(wrestlers.red.location.row, wrestlers.red.location.column, boardRotation)
            }
          />
          <WrestlerCube
            characterSprite="blue"
            spriteFacing={spritePreview?previewFacing(spritePreview,boardRotation):runningFacing.blue?previewFacing(runningFacing.blue,boardRotation):undefined}
            colorClass="corner-blue"
            down={wrestlers.blue.stance === 'down'}
            downPose={rules.vitals.blue.pose}
            facing={rotateFacingWithBoard(wrestlers.blue.facing, boardRotation)}
            label="CPU選手コマ"
            reaction={results.find(r=>r.subject==='blue')?.outcome}
            style={boardPosition(wrestlers.blue.location, boardRotation)}
            translucent={
              wrestlers.blue.location.area === 'corner'
              && isTransparentCorner(wrestlers.blue.location.row, wrestlers.blue.location.column, boardRotation)
            }
          />
          {cpuAttack&&<div aria-label="CPUの公開行動：攻撃" className="cpu-action-bubble" role="status" style={{...boardPosition(wrestlers.blue.location,boardRotation),zIndex:148}}><MenkoAttackIcon/></div>}
          {results.map(combatResult => (
            <div
              aria-live="assertive"
              className={`combat-result-cue is-${combatResult.outcome}`}
              key={`${combatResult.run}-${combatResult.actor}`}
              role="status"
              style={{ ...boardPosition(wrestlers[combatResult.subject].location, boardRotation), zIndex: 149 }}
            >
              <i aria-hidden="true" />
              <strong>{combatResult.outcome === 'hit' ? 'HIT!' : 'MISS'}</strong>
            </div>
          ))}
          {/* The ring's near apron is a separate visual surface. It can cover
              only the lower part of a piece at the edge without making that
              cell unavailable or changing the piece's board coordinate. */}
          {cubes.map(({ r, c }) => {
            const rotated = rotateWorldCell(r, c, boardRotation);
            if (isCornerCell(r, c) || (rotated.row !== SIZE - 1 && rotated.column !== SIZE - 1)) {
              return null;
            }
            return (
              <i
                aria-hidden="true"
                className="ring-apron"
                key={`apron-${r}-${c}`}
                style={{
                  left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                  top: `${18 + (rotated.row + rotated.column) * 21}px`,
                }}
              >
                {rotated.row === SIZE - 1 && <b className="cube-face cube-left" />}
                {rotated.column === SIZE - 1 && <b className="cube-face cube-right" />}
              </i>
            );
          })}
          <svg className="rope-layer" key={`rope-far-${ropeAnimation.run}`} viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-far" d="M372 24 L624 150">
                  <animate
                    attributeName="d"
                    begin={ropeAnimation.edge === 'top' ? '0s' : 'indefinite'}
                    dur=".6s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M372 24 Q507 69 624 150;M372 24 L624 150"
                    repeatCount="1"
                  />
                </path>
                <path className="rope rope-far" d="M36 150 L288 24">
                  <animate
                    attributeName="d"
                    begin={ropeAnimation.edge === 'left' ? '0s' : 'indefinite'}
                    dur=".6s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M36 150 Q153 69 288 24;M36 150 L288 24"
                    repeatCount="1"
                  />
                </path>
              </g>
            ))}
          </svg>
          <svg className="rope-layer rope-rebound-layer" key={`rope-near-${ropeAnimation.run}`} viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-rebound" d="M36 150 L330 297">
                  <animate
                    attributeName="d"
                    begin={ropeAnimation.edge === 'bottom' ? '0s' : 'indefinite'}
                    dur=".6s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M36 150 Q174 242 330 297;M36 150 L330 297"
                    repeatCount="1"
                  />
                </path>
                <path className="rope rope-rebound" d="M330 297 L624 150">
                  <animate
                    attributeName="d"
                    begin={ropeAnimation.edge === 'right' ? '0s' : 'indefinite'}
                    dur=".6s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M330 297 Q486 242 624 150;M330 297 L624 150"
                    repeatCount="1"
                  />
                </path>
              </g>
            ))}
          </svg>
        </div>
      </div>
);
}
