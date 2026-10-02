# 同時攻防試遊版の更新

`ring-engine.cjs`が判定、`trial-ui.js`が画面操作、`trial-shell.html`が画面と説明です。

```sh
node scripts/simultaneous-trial/build-trial.cjs
node scripts/simultaneous-trial/check-trial.cjs
node scripts/simultaneous-trial/check-new-rules.cjs
```

生成先は`public/ring-reversal-simultaneous-trial.html`。GitHub Pages公開時に`dist/client`へコピーされます。GitHubの`main`への反映後、既存のPublish gameが公開を行います。

スマホで遊ぶURL：
https://yutakajuli-svg.github.io/ring-reversal-tactics/ring-reversal-simultaneous-trial.html

ルール表は`docs/simultaneous-trial-rules.md`です。従来の立体リング版は引き続きトップ画面から遊べます。
