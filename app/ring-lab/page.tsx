import './ring-lab.css';

const SIZE = 7;
const RINGSIDE_SIZE = 9;
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

export default function RingLabPage() {
  return (
    <main className="ring-lab">
      <p>RING SHAPE STUDY</p>
      <h1>7 × 7 CUBES</h1>
      <div className="cube-study" aria-label="立方体を七マスずつ並べたリングの土台">
        <div className="cube-board" aria-hidden="true">
          {ringsideTiles.map(({ r, c }) => (
            <i
              className="ringside-tile"
              key={`ringside-${r}-${c}`}
              style={{
                left: `calc(50% + ${(c - r) * 42}px)`,
                top: `${18 + (r + c) * 21}px`,
              }}
            />
          ))}
          {cubes.map(({ r, c }) => (
            <i
              className="tile-cube"
              key={`${r}-${c}`}
              style={{
                left: `calc(50% + ${(c - r) * 42}px)`,
                top: `${18 + (r + c) * 21}px`,
                zIndex: 10 + r + c,
              }}
            >
              <b className="cube-face cube-top" />
              <b className="cube-face cube-left" />
              <b className="cube-face cube-right" />
            </i>
          ))}
          {corners.map(({ r, c }) => {
            const colorClass =
              r === SIZE - 1 && c === 0
                ? 'corner-red'
                : r === 0 && c === SIZE - 1
                  ? 'corner-blue'
                  : 'corner-neutral-dark';

            return (
            <i
              className={`tile-cube corner-cube ${colorClass}`}
              key={`corner-${r}-${c}`}
              style={{
                left: `calc(50% + ${(c - r) * 42}px)`,
                top: `${18 + (r + c) * 21 - 42}px`,
                zIndex: 40 + r + c,
              }}
            >
              <b className="cube-face cube-top" />
              <b className="cube-face cube-left" />
              <b className="cube-face cube-right" />
            </i>
            );
          })}
          <svg className="rope-layer" viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-far" d="M372 24 L624 150" />
                <path className="rope rope-far" d="M36 150 L288 24" />
                <path className="rope rope-far" d="M120 192 L288 276" />
                <path className="rope rope-far" d="M372 276 L540 192" />
              </g>
            ))}
          </svg>
          <svg className="rope-layer rope-left-wrap-layer" viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-far" d="M36 150 L120 192" />
              </g>
            ))}
          </svg>
          <svg className="rope-layer rope-front-wrap-layer" viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-far" d="M288 276 L330 297 L372 276" />
              </g>
            ))}
          </svg>
          <svg className="rope-layer rope-right-wrap-layer" viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-far" d="M540 192 L624 150" />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </main>
  );
}
