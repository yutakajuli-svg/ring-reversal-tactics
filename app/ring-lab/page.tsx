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

// Each wrestler has a world cell, height and facing. Shapes can change later,
// but this board attachment is shared by every piece.
const CPU_LOCATION: BoardLocation = { area: 'ring', row: 0, column: 3 };

type BoardRotation = 0 | 1 | 2 | 3;

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

  return {
    left: `calc(50% + ${(column - row) * 42}px)`,
    top: `${floorTop - standingLevels * 42}px`,
    zIndex: 38 + row + column + standingLevels * 8,
  };
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
}: {
  colorClass: 'corner-red' | 'corner-blue';
  facing: RingSide;
  label: string;
  style: { left: string; top: string; zIndex: number };
}) {
  // Eyes and the gold edge are one decal glued to the token's physical front.
  const frontSurface = rotateSurface(facing, 'front');
  const mark = frontSurface === 'top' || frontSurface === 'bottom'
    ? TOP_SURFACE
    : SCREEN_SURFACES[frontSurface];
  const eyes = FRONT_EYES.map(({ surface, u, v }) => projectCubeObject(facing, surface, u, v))
    .filter((point): point is { x: number; y: number } => point !== null);

  return (
    <i className={`tile-cube wrestler-cube ${colorClass}`} aria-label={label} style={style}>
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
  const [playerLocation, setPlayerLocation] = useState<BoardLocation>(TOKEN_DESTINATIONS.ring);
  const [boardRotation, setBoardRotation] = useState<BoardRotation>(0);

  const turnBoard = (direction: 1 | -1) => {
    setBoardRotation((current) => ((current + direction + 4) % 4) as BoardRotation);
  };

  const movePlayer = (location: BoardLocation, keepVisible = false) => {
    setPlayerLocation(location);

    // A hidden ringside move flips the board 180°. The two colored corners
    // swap to the front, and the piece's world cell stays exactly the same.
    if (keepVisible) {
      setBoardRotation((current) => ((current + 2) % 4) as BoardRotation);
    }
  };

  return (
    <main className="ring-lab">
      <p>RING SHAPE STUDY</p>
      <h1>7 × 7 CUBES</h1>
      <div className="movement-controls" aria-label="選手コマの移動テスト">
        <button
          className={playerLocation.area === 'ring' ? 'is-active' : undefined}
          onClick={() => movePlayer(TOKEN_DESTINATIONS.ring)}
          type="button"
        >
          リング上
        </button>
        <button
          className={playerLocation.area === 'corner' ? 'is-active' : undefined}
          onClick={() => movePlayer(TOKEN_DESTINATIONS.corner)}
          type="button"
        >
          コーナー上
        </button>
        <button
          className={playerLocation.area === 'ringside' ? 'is-active' : undefined}
          onClick={() => movePlayer(TOKEN_DESTINATIONS.ringside)}
          type="button"
        >
          場外
        </button>
        <button onClick={() => movePlayer(HIDDEN_RINGSIDE_DESTINATION, true)} type="button">
          奥側へ場外
        </button>
      </div>
      <div className="board-rotation-controls" aria-label="盤面の回転テスト">
        <button onClick={() => turnBoard(-1)} type="button">
          盤面 ↶
        </button>
        <button onClick={() => turnBoard(1)} type="button">
          盤面 ↷
        </button>
      </div>
      <div className="cube-study" aria-label="立方体を七マスずつ並べたリングの土台">
        <div className="cube-board" aria-hidden="true">
          {ringsideTiles.map(({ r, c }) => (
            (() => {
              const rotated = rotateCell(r, c, RINGSIDE_SIZE, boardRotation);
              return (
                <i
                  className="ringside-tile"
                  key={`ringside-${r}-${c}`}
                  style={{
                    left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                    top: `${18 + (rotated.row + rotated.column) * 21}px`,
                  }}
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
              const rotated = rotateWorldCell(r, c, boardRotation);
              return (
                <i
                  className="tile-cube"
                  key={`${r}-${c}`}
                  style={{
                    left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                    top: `${18 + (rotated.row + rotated.column) * 21}px`,
                    zIndex: 10 + rotated.row + rotated.column,
                  }}
                >
                  <b className="cube-face cube-top" />
                  <b className="cube-face cube-left" />
                  <b className="cube-face cube-right" />
                </i>
              );
            })()
          ))}
          {corners.map(({ r, c }) => {
            const colorClass =
              r === SIZE - 1 && c === 0
                ? 'corner-red'
                : r === 0 && c === SIZE - 1
                  ? 'corner-blue'
                  : 'corner-neutral-dark';

            const rotated = rotateWorldCell(r, c, boardRotation);
            return (
            <i
              className={`tile-cube corner-cube ${colorClass}`}
              key={`corner-${r}-${c}`}
              style={{
                left: `calc(50% + ${(rotated.column - rotated.row) * 42}px)`,
                top: `${18 + (rotated.row + rotated.column) * 21 - 42}px`,
                zIndex: 40 + rotated.row + rotated.column,
              }}
            >
              <b className="cube-face cube-top" />
              <b className="cube-face cube-left" />
              <b className="cube-face cube-right" />
            </i>
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
            facing={rotateFacingWithBoard('left-front', boardRotation)}
            label="プレイヤー選手コマ"
            style={boardPosition(playerLocation, boardRotation)}
          />
          <WrestlerCube
            colorClass="corner-blue"
            facing={rotateFacingWithBoard('left-front', boardRotation)}
            label="CPU選手コマ"
            style={boardPosition(CPU_LOCATION, boardRotation)}
          />
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
        </div>
      </div>
    </main>
  );
}
