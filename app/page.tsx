import RingLab from './ring-lab/page';

const assetBase = import.meta.env.VITE_ASSET_BASE || '';

export default function Home() {
  return (
    <>
      <nav aria-label="試遊版の選択" style={{ padding: '12px 16px', background: '#172034', color: '#fff', textAlign: 'center' }}>
        <a href={`${assetBase}/ring-reversal-simultaneous-trial.html`} style={{ display: 'inline-block', padding: '10px 16px', color: '#ffe09b', fontWeight: 700 }}>
          同時攻防の新しい試遊版を遊ぶ（スマホ対応）
        </a>
      </nav>
      <RingLab />
    </>
  );
}
