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
          <svg className="rope-layer" viewBox="0 -20 660 420" preserveAspectRatio="none">
            {[-46, -27, -8].map((height) => (
              <g key={height} transform={`translate(0 ${height})`}>
                <path className="rope rope-far" d="M372 24 L624 150">
                  <animate
                    attributeName="d"
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
