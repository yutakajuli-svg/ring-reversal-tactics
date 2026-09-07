'use client';

import { useEffect, useRef, useState } from 'react';
import './ring-lab.css';

const SIZE = 7;
const RINGSIDE_SIZE = 9;
const BOARD_CENTER_SIZE = RINGSIDE_SIZE;
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
type RingSide = (typeof TURN_ORDER)[number];
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

type BoardLocation =
  | { area: 'ring'; row: number; column: number }
  | { area: 'corner'; row: number; column: number }
  | { area: 'ringside'; row: number; column: number };

const TOKEN_DESTINATIONS: Record<'ring' | 'corner' | 'ringside', BoardLocation> = {
  ring: { area: 'ring', row: 3, column: 0 },
  corner: { area: 'corner', row: 6, column: 0 },
  ringside: { area: 'ringside', row: 6, column: -1 },
};

const HIDDEN_RINGSIDE_DESTINATION: BoardLocation = {
  area: 'ringside',
  // C1: the far-side mat behind the default B2 red corner.
  row: -1,
  column: 1,
};

type WrestlerId = 'red' | 'blue';
type WrestlerState = { location: BoardLocation; facing: RingSide };
type VisibilityMark = 'visible' | 'hidden' | 'corner-shadow';
type RopeEdge = 'top' | 'right' | 'bottom' | 'left';
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
  red: { location: TOKEN_DESTINATIONS.ring, facing: 'left-front' },
  blue: { location: { area: 'ring', row: 0, column: 3 }, facing: 'left-front' },
};

// There are only two camera views: the normal view and its 180° opposite.
// Keeping this to a half-turn prevents the board from ever entering a
// diagonal 90° view that is not used by the game.
type BoardRotation = 0 | 2;

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

function oppositeFacing(facing: RingSide): RingSide {
  return TURN_ORDER[(TURN_ORDER.indexOf(facing) + 2) % TURN_ORDER.length];
}

function ropeThrowGeometry(attacker: BoardLocation, direction: RingSide) {
  if (attacker.area !== 'ring') return null;
  const vector = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction)!;
  const frontRow = attacker.row + vector.row;
  const frontColumn = attacker.column + vector.column;

  // Throwing outward from a rope-side square sends the defender directly to
  // ringside. There is no return or interception phase after a fall.
  if (frontRow < 0 || frontRow >= SIZE || frontColumn < 0 || frontColumn >= SIZE) {
    return {
      fellOut: true as const,
      destination: { area: 'ringside', row: frontRow, column: frontColumn } as BoardLocation,
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

  return {
    fellOut: false as const,
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
  const viewCorner = [
    { corner: [-1, -1], normalExit: [-1, 0], rotatedExit: [0, -1] },
    { corner: [SIZE, SIZE], normalExit: [SIZE - 1, SIZE], rotatedExit: [SIZE, SIZE - 1] },
  ].find(({ corner }) => isAt(from, 'ringside', corner as readonly [number, number]));

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
  if (surfaceTurns === null) return surface;
  const facingTurn = TURN_ORDER.indexOf(facing);
  return TURN_ORDER[(facingTurn + surfaceTurns) % TURN_ORDER.length];
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

function WrestlerCube({
  colorClass,
  facing,
  label,
  style,
  translucent = false,
}: {
  colorClass: 'corner-red' | 'corner-blue';
  facing: RingSide;
  label: string;
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

  return (
    <i className={`tile-cube wrestler-cube ${colorClass}${translucent ? ' is-translucent' : ''}`} aria-label={label} style={style}>
      <b className="cube-face cube-top" />
      <b className="cube-face cube-left" />
      <b className="cube-face cube-right" />
      <svg className="cube-facing-mark" viewBox="0 0 84 84" aria-hidden="true">
        <path className="cube-facing-edge" d={mark.edge} />
        {eyes.map(({ x, y }) => (
          <circle className="cube-facing-eye" cx={x} cy={y} key={`${x}-${y}`} r="3" />
        ))}
      </svg>
    </i>
  );
}

export default function RingLabPage() {
  const [wrestlers, setWrestlers] = useState<Record<WrestlerId, WrestlerState>>(INITIAL_WRESTLERS);
  const [activeWrestler, setActiveWrestler] = useState<WrestlerId>('red');
  const [boardRotation, setBoardRotation] = useState<BoardRotation>(0);
  const [showVisibilityMap, setShowVisibilityMap] = useState(false);
  const [visibilityMarks, setVisibilityMarks] = useState<Record<string, VisibilityMark>>({});
  const [showCoordinateAtlas, setShowCoordinateAtlas] = useState(false);
  const [ropeAnimation, setRopeAnimation] = useState<{ run: number; edge: RopeEdge | null }>({
    run: 0,
    edge: null,
  });
  const [ropeThrowTest, setRopeThrowTest] = useState<RopeThrowTest>({
    phase: 'idle',
    message: 'リング上または場外で2人を隣接させ、実行するコマを選んでください。',
  });
  const [pendingTurnSkip, setPendingTurnSkip] = useState<Record<WrestlerId, boolean>>({
    red: false,
    blue: false,
  });
  const ropeThrowTimers = useRef<number[]>([]);

  useEffect(() => () => {
    ropeThrowTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const queueRopeThrowStep = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    ropeThrowTimers.current.push(timer);
  };

  const flipBoard = () => {
    setBoardRotation((current) => (current === 0 ? 2 : 0));
  };

  const ropeThrowLocksBoard = ropeThrowTest.phase !== 'idle';

  const focusWrestler = (id: WrestlerId) => {
    if (!ropeThrowLocksBoard) setActiveWrestler(id);
  };

  const moveActiveWrestler = (location: BoardLocation) => {
    if (ropeThrowLocksBoard) return;
    if (pendingTurnSkip[activeWrestler]) {
      setRopeThrowTest({
        phase: 'idle',
        message: `${activeWrestler === 'red' ? '赤' : '青'}コマは場外へ落ちた次のターンのため、行動できません。`,
      });
      return;
    }
    const otherId = otherWrestler(activeWrestler);
    const from = wrestlers[activeWrestler].location;
    if (isSameLocation(location, wrestlers[otherId].location)) return;
    if (isBlockedCornerMove(from, location, boardRotation)) return;

    const usedRope = ropeUsedForMove(from, location);
    if (usedRope) {
      setRopeAnimation((current) => ({ run: current.run + 1, edge: usedRope }));
    }

    setWrestlers((current) => ({
      ...current,
      [activeWrestler]: { ...current[activeWrestler], location },
    }));
    setBoardRotation((current) => rotationAfterMove(current, from, location, wrestlers[otherId].location));
  };

  const setActiveFacing = (facing: RingSide) => {
    if (ropeThrowLocksBoard) return;
    if (pendingTurnSkip[activeWrestler]) {
      setRopeThrowTest({
        phase: 'idle',
        message: `${activeWrestler === 'red' ? '赤' : '青'}コマは場外へ落ちた次のターンのため、行動できません。`,
      });
      return;
    }
    setWrestlers((current) => ({
      ...current,
      [activeWrestler]: { ...current[activeWrestler], facing },
    }));
  };

  const beginRopeThrowTest = () => {
    const attacker = activeWrestler;
    const defender = otherWrestler(attacker);
    if (pendingTurnSkip[attacker]) {
      setRopeThrowTest({
        phase: 'idle',
        message: `${attacker === 'red' ? '赤' : '青'}コマは場外へ落ちた次のターンのため、行動できません。`,
      });
      return;
    }
    if (!isAdjacentForRopeThrow(wrestlers[attacker].location, wrestlers[defender].location)) {
      setRopeThrowTest({
        phase: 'idle',
        message: 'ロープスローは、同じ高さのリング上または場外で上下左右に隣接している相手にだけ実行できます。',
      });
      return;
    }
    setRopeThrowTest({ phase: 'choose-direction', attacker, defender });
  };

  const chooseRopeThrowDirection = (direction: RingSide) => {
    if (ropeThrowTest.phase !== 'choose-direction') return;
    setRopeThrowTest({ ...ropeThrowTest, phase: 'choose-result', direction });
  };

  const executeRopeThrowTest = (outcome: 'success' | 'failure') => {
    if (ropeThrowTest.phase !== 'choose-result') return;
    const { attacker, defender, direction } = ropeThrowTest;
    const attackerLocation = wrestlers[attacker].location;

    if (attackerLocation.area === 'ringside') {
      const geometry = ringsideThrowGeometry(attackerLocation, direction);
      if (!geometry) return;
      const affected = outcome === 'success' ? defender : attacker;
      const affectedFrom = wrestlers[affected].location;
      const destination = 'destination' in geometry ? geometry.destination : affectedFrom;
      const affectedLabel = affected === defender ? '相手' : '実行側';

      setRopeThrowTest({ phase: 'travelling', attacker, defender, direction, outcome });
      setWrestlers((current) => ({
        ...current,
        [attacker]: { ...current[attacker], facing: direction },
        [defender]: { ...current[defender], facing: direction },
        [affected]: { ...current[affected], facing: direction, location: destination },
      }));

      queueRopeThrowStep(() => {
        setBoardRotation((current) => rotationAfterMove(
          current,
          affectedFrom,
          destination,
          wrestlers[otherWrestler(affected)].location,
        ));
        setActiveWrestler(outcome === 'success' ? attacker : defender);
        const message = geometry.kind === 'corner-impact'
          ? `${outcome === 'success' ? '成功' : '失敗'}。${affectedLabel}がコーナーポストへ衝突し、その場でダメージ。`
          : geometry.kind === 'ring-return'
            ? `${outcome === 'success' ? '成功' : '失敗'}。${affectedLabel}がリング内ロープ際へ強制移動。`
            : geometry.kind === 'barrier-run'
              ? `${outcome === 'success' ? '成功' : '失敗'}。${affectedLabel}が場外列の端まで強制移動し、鉄柵ダメージ。`
              : `${outcome === 'success' ? '成功' : '失敗'}。${affectedLabel}がその場で鉄柵ダメージ。`;
        setRopeThrowTest({ phase: 'idle', message });
      }, 320);
      return;
    }

    const geometry = ropeThrowGeometry(attackerLocation, direction);
    if (!geometry) return;

    setRopeThrowTest({ phase: 'travelling', attacker, defender, direction, outcome });

    if (geometry.fellOut) {
      const affected = outcome === 'success' ? defender : attacker;
      const affectedFrom = wrestlers[affected].location;
      setWrestlers((current) => ({
        ...current,
        [attacker]: { ...current[attacker], facing: direction },
        [defender]: { ...current[defender], facing: direction },
        [affected]: { ...current[affected], facing: direction, location: geometry.destination },
      }));
      queueRopeThrowStep(() => {
        setBoardRotation((current) => rotationAfterMove(
          current,
          affectedFrom,
          geometry.destination,
          wrestlers[otherWrestler(affected)].location,
        ));
        setPendingTurnSkip((current) => ({ ...current, [affected]: true }));
        setActiveWrestler(outcome === 'success' ? attacker : defender);
        setRopeThrowTest({
          phase: 'idle',
          message: outcome === 'success'
            ? 'ロープスロー成功。相手が場外へ落下し、次の自分のターンは行動不能です。'
            : 'ロープスロー失敗。実行側が場外へ落下し、次の自分のターンは行動不能です。',
        });
      }, 320);
      return;
    }

    setWrestlers((current) => ({
      ...current,
      [attacker]: { ...current[attacker], facing: direction },
      [defender]: {
        ...current[defender],
        facing: direction,
        location: geometry.returnLocation,
      },
    }));

    queueRopeThrowStep(() => {
      setBoardRotation(0);
      setWrestlers((current) => ({
        ...current,
        [defender]: { ...current[defender], location: geometry.ropeLocation },
      }));
      setRopeAnimation((current) => ({ run: current.run + 1, edge: geometry.edge }));

      if (outcome === 'success') {
        setActiveWrestler(attacker);
        setRopeThrowTest({
          phase: 'awaiting-intercept',
          attacker,
          defender,
          direction,
          returnLocation: geometry.returnLocation,
          ropeLocation: geometry.ropeLocation,
        });
      } else {
        setActiveWrestler(defender);
        setRopeThrowTest({
          phase: 'idle',
          message: 'ロープスローを切り返しました。投げられた側がロープ際から自由に移動・行動できます。',
        });
      }
    }, 320);
  };

  const resolveInterceptTest = (outcome: 'hit' | 'miss' | 'skip') => {
    if (ropeThrowTest.phase !== 'awaiting-intercept') return;
    const { attacker, defender, direction, returnLocation } = ropeThrowTest;
    setWrestlers((current) => ({
      ...current,
      [attacker]: { ...current[attacker], facing: direction },
      [defender]: {
        ...current[defender],
        facing: oppositeFacing(direction),
        location: returnLocation,
      },
    }));
    const edge = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction)!.edge;
    setRopeAnimation((current) => ({ run: current.run + 1, edge }));
    queueRopeThrowStep(() => {
      const message = outcome === 'hit'
        ? '迎撃成功。戻ってきた側にダメージ。'
        : outcome === 'miss'
          ? '迎撃失敗。ロープスローを実行した側にダメージ。'
          : '迎撃を見送り。両者ノーダメージで正面1マスに戻りました。';
      setRopeThrowTest({ phase: 'idle', message });
      setActiveWrestler(attacker);
    }, 320);
  };

  const cancelRopeThrowTest = () => {
    if (ropeThrowTest.phase === 'travelling' || ropeThrowTest.phase === 'awaiting-intercept') return;
    setRopeThrowTest({ phase: 'idle', message: 'ロープスロー検証を中止しました。' });
  };

  const consumeTurnSkip = (id: WrestlerId) => {
    setPendingTurnSkip((current) => ({ ...current, [id]: false }));
    setRopeThrowTest({
      phase: 'idle',
      message: `${id === 'red' ? '赤' : '青'}コマの行動不能ターンを消化しました。次のターンから行動できます。`,
    });
  };

  const cycleVisibilityMark = (key: string) => {
    const next: Record<VisibilityMark | 'clear', VisibilityMark | undefined> = {
      clear: 'visible',
      visible: 'hidden',
      hidden: 'corner-shadow',
      'corner-shadow': undefined,
    };

    setVisibilityMarks((current) => {
      const mark = next[current[key] ?? 'clear'];
      if (!mark) {
        const { [key]: _, ...remaining } = current;
        return remaining;
      }
      return { ...current, [key]: mark };
    });
  };

  const activeLocation = wrestlers[activeWrestler].location;
  const otherLocation = wrestlers[otherWrestler(activeWrestler)].location;
  const destinationIsBlocked = (location: BoardLocation) => (
    ropeThrowLocksBoard
    || isSameLocation(location, otherLocation)
    || isBlockedCornerMove(activeLocation, location, boardRotation)
  );
  const reboundPreview = ropeThrowTest.phase === 'awaiting-intercept'
    ? reboundPath(ropeThrowTest.ropeLocation, ropeThrowTest.returnLocation, ropeThrowTest.direction)
    : [];
  const reboundPreviewKeys = new Set(reboundPreview.map(({ row, column }) => `${row}-${column}`));
  const reboundTargetKey = ropeThrowTest.phase === 'awaiting-intercept'
    ? `${ropeThrowTest.returnLocation.row}-${ropeThrowTest.returnLocation.column}`
    : '';

  return (
    <main className="ring-lab">
      <p>RING SHAPE STUDY</p>
      <h1>7 × 7 CUBES</h1>
      <div className="movement-controls" aria-label="行動する選手コマ">
        <button
          className={activeWrestler === 'red' ? 'is-active' : undefined}
          disabled={ropeThrowLocksBoard}
          onClick={() => focusWrestler('red')}
          type="button"
        >
          赤コマを行動させる
        </button>
        <button
          className={activeWrestler === 'blue' ? 'is-active' : undefined}
          disabled={ropeThrowLocksBoard}
          onClick={() => focusWrestler('blue')}
          type="button"
        >
          青コマを行動させる
        </button>
      </div>
      {(pendingTurnSkip.red || pendingTurnSkip.blue) && (
        <div className="turn-skip-controls" aria-label="場外落下による行動不能">
          <span>次の自分のターンは行動不能：</span>
          {(['red', 'blue'] as const).map((id) => pendingTurnSkip[id] && (
            <button key={id} onClick={() => consumeTurnSkip(id)} type="button">
              {id === 'red' ? '赤' : '青'}の行動不能を消化
            </button>
          ))}
        </div>
      )}
      <div className="facing-controls" aria-label="行動するコマの向き">
        <span>向き：</span>
        {([
          ['left-front', '左手前ロープ'],
          ['right-front', '右手前ロープ'],
          ['right-back', '右奥ロープ'],
          ['left-back', '左奥ロープ'],
        ] as const).map(([facing, label]) => (
          <button
            className={wrestlers[activeWrestler].facing === facing ? 'is-active' : undefined}
            disabled={ropeThrowLocksBoard}
            key={facing}
            onClick={() => setActiveFacing(facing)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <section className="rope-throw-controls" aria-label="ロープスロー検証">
        <strong>ロープスロー検証</strong>
        {ropeThrowTest.phase === 'idle' && (
          <button onClick={beginRopeThrowTest} type="button">ロープスローを実行</button>
        )}
        {ropeThrowTest.phase === 'choose-direction' && (
          <>
            <span>方向：</span>
            {ROPE_THROW_DIRECTIONS.map(({ facing, label }) => (
              <button key={facing} onClick={() => chooseRopeThrowDirection(facing)} type="button">
                {label}
              </button>
            ))}
            <button className="is-subtle" onClick={cancelRopeThrowTest} type="button">中止</button>
          </>
        )}
        {ropeThrowTest.phase === 'choose-result' && (
          <>
            <span>1回目の判定：</span>
            <button onClick={() => executeRopeThrowTest('success')} type="button">成功として進める</button>
            <button onClick={() => executeRopeThrowTest('failure')} type="button">失敗として進める</button>
            <button className="is-subtle" onClick={cancelRopeThrowTest} type="button">中止</button>
          </>
        )}
        {ropeThrowTest.phase === 'travelling' && <span>ロープスロー処理中…</span>}
        {ropeThrowTest.phase === 'awaiting-intercept' && (
          <>
            <span>正面1マスへ迎撃予約：</span>
            <button onClick={() => resolveInterceptTest('hit')} type="button">迎撃成功</button>
            <button onClick={() => resolveInterceptTest('miss')} type="button">迎撃失敗</button>
            <button className="is-subtle" onClick={() => resolveInterceptTest('skip')} type="button">迎撃しない</button>
          </>
        )}
        {ropeThrowTest.phase === 'idle' && <output aria-live="polite">{ropeThrowTest.message}</output>}
      </section>
      <div className="board-rotation-controls" aria-label="盤面の回転テスト">
        <button onClick={flipBoard} type="button">
          盤面を180°反転
        </button>
      </div>
      <div className="visibility-controls" aria-label="見え方の確認モード">
        <button
          className={showVisibilityMap ? 'is-active' : undefined}
          onClick={() => setShowVisibilityMap((current) => !current)}
          type="button"
        >
          座標・見え方を確認
        </button>
        {showVisibilityMap && (
          <>
            <span>マスを押す：緑 → 黒 → 黄 → 解除</span>
            <button onClick={() => setVisibilityMarks({})} type="button">色を消す</button>
          </>
        )}
        <button
          className={showCoordinateAtlas ? 'is-active' : undefined}
          onClick={() => setShowCoordinateAtlas((current) => !current)}
          type="button"
        >
          {showCoordinateAtlas ? '3D座標見取り図を隠す' : '3D座標見取り図を表示'}
        </button>
      </div>
      <div className="cube-study" aria-label="立方体を七マスずつ並べたリングの土台">
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
                  className="ringside-tile"
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
                  className={`tile-cube${reboundPreviewKeys.has(`${r}-${c}`) ? ' is-rebound-path' : ''}${reboundTargetKey === `${r}-${c}` ? ' is-rebound-target' : ''}`}
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
              className={`tile-cube corner-cube ${colorClass}${translucent ? ' is-translucent' : ''}`}
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
          <WrestlerCube
            colorClass="corner-red"
            facing={rotateFacingWithBoard(wrestlers.red.facing, boardRotation)}
            label="プレイヤー選手コマ"
            style={boardPosition(wrestlers.red.location, boardRotation)}
            translucent={
              wrestlers.red.location.area === 'corner'
              && isTransparentCorner(wrestlers.red.location.row, wrestlers.red.location.column, boardRotation)
            }
          />
          <WrestlerCube
            colorClass="corner-blue"
            facing={rotateFacingWithBoard(wrestlers.blue.facing, boardRotation)}
            label="CPU選手コマ"
            style={boardPosition(wrestlers.blue.location, boardRotation)}
            translucent={
              wrestlers.blue.location.area === 'corner'
              && isTransparentCorner(wrestlers.blue.location.row, wrestlers.blue.location.column, boardRotation)
            }
          />
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
          {showVisibilityMap && (
            <div className="visibility-map" aria-label="見え方を色で記録するマップ">
              {ringsideTiles
                .filter(({ r, c }) => isRingsidePerimeter(r, c))
                .map(({ r, c }) => {
                  const rotated = rotateCell(r, c, RINGSIDE_SIZE, boardRotation);
                  const key = `ringside-${r}-${c}`;
                  return (
                    <button
                      aria-label={`場外 ${String.fromCharCode(65 + c)}${r + 1}`}
                      className={`visibility-cell ${visibilityMarks[key] ?? ''}`}
                      key={key}
                      onClick={() => cycleVisibilityMark(key)}
                      style={{
                        left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                        top: `${18 + (rotated.row + rotated.column) * 21}px`,
                      }}
                      type="button"
                    >
                      {String.fromCharCode(65 + c)}{r + 1}
                    </button>
                  );
                })}
              {cubes.map(({ r, c }) => {
                const rotated = rotateWorldCell(r, c, boardRotation);
                const key = `ring-${r}-${c}`;
                return (
                  <button
                    aria-label={`リング ${String.fromCharCode(66 + c)}${r + 2}`}
                    className={`visibility-cell ring-cell ${visibilityMarks[key] ?? ''}`}
                    key={key}
                    onClick={() => cycleVisibilityMark(key)}
                    style={{
                      left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                      top: `${18 + (rotated.row + rotated.column) * 21}px`,
                    }}
                    type="button"
                  >
                    {String.fromCharCode(66 + c)}{r + 2}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {showCoordinateAtlas && (
        <section className="coordinate-atlas" aria-labelledby="coordinate-atlas-title">
          <h2 id="coordinate-atlas-title">3D座標見取り図</h2>
          <p>同じ画面位置に重なって見えても、ここでは高さごとに分けて確認します。</p>
          <div className="atlas-layers">
            <article className="atlas-layer atlas-mat">
              <h3>高さ 0　場外マット</h3>
              <div className="atlas-grid atlas-grid-9">
                {ringsideTiles.map(({ r, c }) => (
                  <i key={`atlas-mat-${r}-${c}`}>{String.fromCharCode(65 + c)}{r + 1}</i>
                ))}
              </div>
            </article>
            <article className="atlas-layer atlas-ring">
              <h3>高さ 1　リング天面</h3>
              <div className="atlas-grid atlas-grid-9">
                {cubes.map(({ r, c }) => (
                  <i
                    key={`atlas-ring-${r}-${c}`}
                    style={{ gridColumn: c + 2, gridRow: r + 2 }}
                  >
                    {String.fromCharCode(66 + c)}{r + 2}
                  </i>
                ))}
              </div>
            </article>
            <article className="atlas-layer atlas-post">
              <h3>高さ 2　コーナー天面</h3>
              <div className="atlas-grid atlas-grid-9">
                {corners.map(({ r, c }) => (
                  <i
                    className={
                      r === SIZE - 1 && c === 0
                        ? 'atlas-post-red'
                        : r === 0 && c === SIZE - 1
                          ? 'atlas-post-blue'
                          : 'atlas-post-neutral'
                    }
                    key={`atlas-post-${r}-${c}`}
                    style={{ gridColumn: c + 2, gridRow: r + 2 }}
                  >
                    {String.fromCharCode(66 + c)}{r + 2}
                  </i>
                ))}
              </div>
            </article>
          </div>
          <p className="atlas-note">この3枚は重なりを外した見取り図です。実際の画面では、別の住所でも投影によって重なって見えることがあります。</p>
        </section>
      )}
    </main>
  );
}
