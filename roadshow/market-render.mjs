export function lineChart(data, name) {
  const x = i => 44 + i / (data.years.length - 1) * 640;
  const y = value => 207 - value / 450 * 177;
  const line = values => values.map((v,i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const grids = [0,150,300,450].map(v => `<path class="gridline" d="M44 ${y(v)}H690"/><text class="axis" x="31" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('');
  const ticks = [2005,2010,2015,2020,2025].map(v => `<text class="axis" x="${x(data.years.indexOf(v))}" y="235" text-anchor="middle">${v}</text>`).join('');
  return `<svg class="market-line-chart" viewBox="0 0 760 245" role="img" aria-labelledby="${name}-title ${name}-desc"><title id="${name}-title">迪士尼与 Netflix 2005—2025 年年末市值</title><desc id="${name}-desc">单位十亿美元。迪士尼从 46.94 至 204.17，Netflix 从 1.48 至 400.29。图表保留 21 个年末观测值及期间波动。</desc>${grids}${ticks}<path class="series disney-series" d="${line(data.disney)}"/><path class="series netflix-series" d="${line(data.netflix)}"/><circle cx="684" cy="${y(204.17)}" r="4" fill="#ad9057"/><circle cx="684" cy="${y(400.29)}" r="4" fill="#6c91a3"/><text class="end-label" fill="#92713b" x="696" y="${y(204.17)+5}">204.17</text><text class="end-label" fill="#5a7e90" x="696" y="${y(400.29)+5}">400.29</text></svg>`;
}
export function revenueChart(data) {
  const values=data.observations.map(v=>({year:v.year,value:v.value*10}));
  const baseline=240, top=29, height=baseline-top;
  return `<svg viewBox="0 0 490 285" role="img" aria-labelledby="revenue-title revenue-desc"><title id="revenue-title">Netflix 全年营业收入对比</title><desc id="revenue-desc">2005 年为 6.82213 亿美元，2025 年为 451.83036 亿美元。</desc><path d="M48 240H460" stroke="#d6c7ab"/>${values.map((v,i)=>{const h=v.value/500*height,x=105+i*220;return `<rect x="${x}" y="${baseline-h}" width="88" height="${h}" rx="2" fill="${i?'#ad9057':'#9db5bd'}"/><text x="${x+44}" y="${baseline-h-14}" text-anchor="middle" fill="#765a2c" font-family="Georgia,serif" font-size="25">${v.value.toFixed(2)}</text><text x="${x+44}" y="270" text-anchor="middle" fill="#7c7262" font-size="17">${v.year}</text>`}).join('')}</svg>`;
}
