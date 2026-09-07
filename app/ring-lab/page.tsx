'use client';

import { useState } from 'react';
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

function isDefaultHiddenRingside(location: BoardLocation) {
  return location.area === 'ringside' && (
    (location.column === -1 && location.row >= -1 && location.row <= 6)
    || (location.row === -1 && location.column >= 0 && location.column <= 6)
  );
}

function isRotatedHiddenRingside(location: BoardLocation) {
  return location.area === 'ringside' && (
    (location.column === 7 && location.row >= 0 && location.row <= 7)
    || (location.row === 7 && location.column >= 0 && location.column <= 7)
  );
}

function rotationAfterMove(
  current: BoardRotation,
  location: BoardLocation,
  otherLocation: BoardLocation,
): BoardRotation {
  // Once both wrestlers are back on the ring, restore the familiar default
  // viewpoint instead of keeping a ringside-driven half-turn.
  if (location.area === 'ring' && otherLocation.area === 'ring') return 0;
  if (current === 0 && isDefaultHiddenRingside(location)) return 2;
  if (current === 2 && isRotatedHiddenRingside(location)) return 0;
  return current;
}

function isTransparentCorner(row: number, column: number, rotation: BoardRotation) {
  return rotation === 0
    ? row === SIZE - 1 && column === SIZE - 1
    : row === 0 && column === 0;
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

  const flipBoard = () => {
    setBoardRotation((current) => (current === 0 ? 2 : 0));
  };

  const focusWrestler = (id: WrestlerId) => setActiveWrestler(id);

  const moveActiveWrestler = (location: BoardLocation) => {
    const otherWrestler: WrestlerId = activeWrestler === 'red' ? 'blue' : 'red';
    if (isSameLocation(location, wrestlers[otherWrestler].location)) return;

    setWrestlers((current) => ({
      ...current,
      [activeWrestler]: { ...current[activeWrestler], location },
    }));
    setBoardRotation((current) => rotationAfterMove(current, location, wrestlers[otherWrestler].location));
  };

  const setActiveFacing = (facing: RingSide) => {
    setWrestlers((current) => ({
      ...current,
      [activeWrestler]: { ...current[activeWrestler], facing },
    }));
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

  return (
    <main className="ring-lab">
      <p>RING SHAPE STUDY</p>
      <h1>7 × 7 CUBES</h1>
      <div className="movement-controls" aria-label="行動する選手コマ">
        <button
          className={activeWrestler === 'red' ? 'is-active' : undefined}
          onClick={() => focusWrestler('red')}
          type="button"
        >
          赤コマを行動させる
        </button>
        <button
          className={activeWrestler === 'blue' ? 'is-active' : undefined}
          onClick={() => focusWrestler('blue')}
          type="button"
        >
          青コマを行動させる
        </button>
      </div>
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
            key={facing}
            onClick={() => setActiveFacing(facing)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
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
                  disabled={isSameLocation(location, wrestlers[activeWrestler === 'red' ? 'blue' : 'red'].location)}
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
              const isBlocked = isCornerCell(r, c)
                || isSameLocation(location, wrestlers[activeWrestler === 'red' ? 'blue' : 'red'].location);
              const rotated = rotateWorldCell(r, c, boardRotation);
              return (
                <button
                  className="tile-cube"
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
              disabled={isSameLocation(location, wrestlers[activeWrestler === 'red' ? 'blue' : 'red'].location)}
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
            const otherLocation = wrestlers[activeWrestler === 'red' ? 'blue' : 'red'].location;
            return (
              <button
                aria-label={`${String.fromCharCode(66 + c)}${r + 2} コーナーポスト側面：高さ2へ移動`}
                className="corner-access-target"
                disabled={isSameLocation(cornerLocation, otherLocation)}
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
              const otherLocation = wrestlers[activeWrestler === 'red' ? 'blue' : 'red'].location;
              return (
                <button
                  aria-label={`${String.fromCharCode(66 + c)}${r + 2} コーナーポスト天面：高さ2へ移動`}
                  className="corner-top-access-target"
                  disabled={isSameLocation(cornerLocation, otherLocation)}
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
                disabled={isSameLocation(location, wrestlers[activeWrestler === 'red' ? 'blue' : 'red'].location)}
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
          <svg className="rope-layer" viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-far" d="M372 24 L624 150">
                  <animate
                    attributeName="d"
                    begin="indefinite"
                    dur="1.2s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M372 24 L624 150;M372 24 Q507 69 624 150"
                    repeatCount="indefinite"
                  />
                </path>
                <path className="rope rope-far" d="M36 150 L288 24">
                  <animate
                    attributeName="d"
                    begin="indefinite"
                    dur="1.2s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M36 150 L288 24;M36 150 Q153 69 288 24"
                    repeatCount="indefinite"
                  />
                </path>
              </g>
            ))}
          </svg>
          <svg className="rope-layer rope-rebound-layer" viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-rebound" d="M36 150 L330 297">
                  <animate
                    attributeName="d"
                    begin="indefinite"
                    dur="1.2s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M36 150 L330 297;M36 150 Q174 242 330 297"
                    repeatCount="indefinite"
                  />
                </path>
                <path className="rope rope-rebound" d="M330 297 L624 150">
                  <animate
                    attributeName="d"
                    begin="indefinite"
                    dur="1.2s"
                    calcMode="discrete"
                    keyTimes="0;.5"
                    values="M330 297 L624 150;M330 297 Q486 242 624 150"
                    repeatCount="indefinite"
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
