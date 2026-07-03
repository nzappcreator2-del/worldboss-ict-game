export type StandaloneGameKind = 'fitness' | 'neck-quiz'

const fitnessBridge = `
<script data-nextgen-world-boss-bridge>
(() => {
  const session = new URLSearchParams(window.location.search).get('session') || '';
  let sent = false;
  const sendResult = () => {
    const victory = document.getElementById('wb-victory-modal');
    if (sent || !victory || victory.classList.contains('hidden')) return;
    const speedrun = bossId === 'WB002_SPEEDRUN';
    const countBased = String(bossId).startsWith('WB002') && !speedrun;
    const finalScore = countBased ? wbRepsCount : Math.round(wbElapsedTime * 100) / 100;
    const bonus = typeof quizBonusCoins === 'number' ? quizBonusCoins : 0;
    window.opener?.postMessage({
      type: 'nextgen:world-boss-result',
      session,
      payload: { bossId: String(bossId), score: finalScore, bonusCoins: bonus }
    }, window.location.origin);
    sent = true;
  };
  const resultTimer = window.setInterval(() => {
    sendResult();
    if (sent) window.clearInterval(resultTimer);
  }, 250);
  sendResult();
})();
</script>`

const neckQuizBridge = `
<script data-nextgen-world-boss-bridge>
(() => {
  const session = new URLSearchParams(window.location.search).get('session') || '';
  let sent = false;
  const sendResult = () => {
    const victory = document.getElementById('victory-screen');
    if (sent || !victory || victory.classList.contains('hidden')) return;
    window.opener?.postMessage({
      type: 'nextgen:world-boss-result',
      session,
      payload: { bossId: String(localBossId || 'WB003'), score: Number(score) || 0, bonusCoins: 0 }
    }, window.location.origin);
    sent = true;
  };
  const resultTimer = window.setInterval(() => {
    sendResult();
    if (sent) window.clearInterval(resultTimer);
  }, 250);
  sendResult();
})();
</script>`

export function prepareStandaloneGame(source: string, kind: StandaloneGameKind) {
  const safeSource = source
    .replace(
      /const\s+webAppUrl\s*=\s*decodeURIComponent\(urlParams\.get\(['"]webAppUrl['"]\)\s*\|\|\s*['"]['"]\);?/,
      "const webAppUrl = ''; // Disabled: results return to React through same-origin postMessage.",
    )
    .replaceAll('Apps Script', 'legacy endpoint')
    .replaceAll('Google Sheets', 'Firestore')
  const closingBody = safeSource.lastIndexOf('</body>')
  if (closingBody < 0) throw new Error('Standalone World Boss game has no closing body')
  const bridge = kind === 'fitness' ? fitnessBridge : neckQuizBridge
  return safeSource.slice(0, closingBody) + bridge + '\n' + safeSource.slice(closingBody)
}
