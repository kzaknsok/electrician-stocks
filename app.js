let financialsData = {};

const TARGET_STOCKS = [
  { code: '5803.T', name: 'フジクラ' },
  { code: '5802.T', name: '住友電気工業' },
  { code: '5801.T', name: '古河電気工業' },
  { code: '5805.T', name: 'SWCC' },
  { code: '9824.T', name: '泉州電業' }
];

const MOCK_QUOTES = {
  '5803.T': { price: 5388, marketCap: 892091400000 },
  '5802.T': { price: 2203.5, marketCap: 687421400000 },
  '5801.T': { price: 4005, marketCap: 281750300000 },
  '5805.T': { price: 14840, marketCap: 43968400000 },
  '9824.T': { price: 7180, marketCap: 12244200000 }
};

// --- 日本時間 (JST) フォーマット関数 -----------------------------------
function formatJST(isoString) {
  if (!isoString) return '---';
  const date = new Date(isoString);
  
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  return formatter.format(date);
}

// 1. データ読み込み（JST日時反映ロジック含む）
async function loadFinancials() {
  try {
    const res = await fetch('./public/data/financials.json');
    financialsData = await res.json();
  } catch (err) {
    try {
      const resFallback = await fetch('./data/financials.json');
      financialsData = await resFallback.json();
    } catch (e) {
      console.error('financials.json 取得失敗', e);
    }
  }

  // 取得したJSONデータ内の updatedAt を日本時間 (JST) に変換して表示
  const sampleCode = Object.keys(financialsData)[0];
  if (sampleCode && financialsData[sampleCode].updatedAt) {
    const jstFormatted = formatJST(financialsData[sampleCode].updatedAt);
    const timeEl = document.getElementById('last-updated-time');
    if (timeEl) {
      timeEl.innerText = jstFormatted;
    }
  }
}

// 投資シグナル・コメント判定関数
function getValuationSignal(netCashRatio, pbr) {
  if (netCashRatio >= 1.0) {
    return {
      tagClass: 'tag-strong-buy',
      label: '★解散価値割れ',
      comment: '手元純現金が時価総額を上回る実質タダ銘柄。極めて高い安全域（絶好の買い増し好機）。'
    };
  } else if (netCashRatio >= 0.3 || pbr < 1.0) {
    return {
      tagClass: 'tag-buy',
      label: '割安 (仕込み期)',
      comment: '資産価値に対して株価が低評価。株価下落局面での買い増し・押し目買い検討ゾーン。'
    };
  } else if (pbr > 5.0 && netCashRatio < 0) {
    return {
      tagClass: 'tag-sell',
      label: '高騰 (利確検討)',
      comment: '将来期待が大きく先行して株価高騰。割高感が強いため、一部利益確定の検討ライン。'
    };
  } else {
    return {
      tagClass: 'tag-hold',
      label: '適正水準 (静観)',
      comment: '実態業績と株価のバランスが取れている状態。静観推奨。'
    };
  }
}

// 個別計算ロジック
function computeValuation(code) {
  const bs = financialsData[code] || {};
  const quote = MOCK_QUOTES[code] || { price: 0, marketCap: 0 };

  const cash = bs.cashAndEquivalents || 0;
  const securities = bs.securities || 0;
  const liabilities = bs.totalLiabilities || 0;
  const netAssets = bs.netAssets || 1;

  const netCash = (cash + securities) - liabilities;
  const netCashRatio = quote.marketCap > 0 ? (netCash / quote.marketCap) : 0;
  const pbr = quote.marketCap / netAssets;

  const signal = getValuationSignal(netCashRatio, pbr);

  return {
    code,
    name: bs.name || code,
    price: quote.price,
    marketCap: quote.marketCap,
    cash,
    securities,
    liabilities,
    netAssets,
    netCash,
    netCashRatio,
    pbr,
    signal
  };
}

// ページ1: 市場全体
function renderMarketView() {
  const tbody = document.getElementById('market-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalCap = 0;
  let totalNetCash = 0;
  let buyCandidateCount = 0;

  TARGET_STOCKS.forEach(stock => {
    const d = computeValuation(stock.code);
    
    totalCap += d.marketCap;
    totalNetCash += d.netCash;
    if (d.signal.tagClass === 'tag-strong-buy' || d.signal.tagClass === 'tag-buy') {
      buyCandidateCount++;
    }

    const tr = document.createElement('tr');
    tr.onclick = () => {
      window.location.hash = `#detail?code=${d.code}`;
    };

    const netCashClass = d.netCash >= 0 ? 'val-positive' : 'val-negative';

    tr.innerHTML = `
      <td><strong>${d.name}</strong> (${d.code})</td>
      <td>¥${d.price.toLocaleString()}</td>
      <td>${(d.marketCap / 1e8).toFixed(1)} 億円</td>
      <td class="${netCashClass}">${(d.netCash / 1e8).toFixed(1)} 億円</td>
      <td class="${netCashClass}">${(d.netCashRatio * 100).toFixed(2)} %</td>
      <td>${d.pbr.toFixed(2)} 倍</td>
      <td style="text-align: center;">
        <span class="status-tag ${d.signal.tagClass}">${d.signal.label}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('market-total-count').innerText = `${TARGET_STOCKS.length} 銘柄`;
  document.getElementById('market-total-cap').innerText = `${(totalCap / 1e8).toFixed(1)} 億円`;
  document.getElementById('market-total-netcash').innerText = `${(totalNetCash / 1e8).toFixed(1)} 億円`;
  document.getElementById('market-bargain-count').innerText = `${buyCandidateCount} 銘柄`;
}

// ページ2: 銘柄別詳細
function renderDetailView(code) {
  const d = computeValuation(code);

  const select = document.getElementById('detail-stock-select');
  if (select.children.length === 0) {
    TARGET_STOCKS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.innerText = `${s.name} (${s.code})`;
      select.appendChild(opt);
    });
    select.onchange = (e) => {
      window.location.hash = `#detail?code=${e.target.value}`;
    };
  }
  select.value = code;

  document.getElementById('detail-stock-title').innerText = `2. 銘柄別詳細数値分析：${d.name}`;
  document.getElementById('detail-price').innerText = `¥${d.price.toLocaleString()}`;
  document.getElementById('detail-market-cap').innerText = `${(d.marketCap / 1e8).toFixed(1)} 億円`;
  
  const ratioEl = document.getElementById('detail-netcash-ratio');
  ratioEl.innerText = `${(d.netCashRatio * 100).toFixed(2)} %`;
  ratioEl.className = `num-val ${d.netCash >= 0 ? 'val-positive' : 'val-negative'}`;

  document.getElementById('detail-pbr').innerText = `${d.pbr.toFixed(2)} 倍`;

  // 投資判定コメントの挿入
  document.getElementById('detail-comment-title').innerHTML = `投資判断: <span class="status-tag ${d.signal.tagClass}">${d.signal.label}</span>`;
  document.getElementById('detail-comment-text').innerText = d.signal.comment;

  // B/Sテーブル
  const cap = d.marketCap || 1;
  document.getElementById('detail-bs-cash').innerText = (d.cash / 1e8).toFixed(1);
  document.getElementById('detail-bs-cash-ratio').innerText = ((d.cash / cap) * 100).toFixed(1);

  document.getElementById('detail-bs-sec').innerText = (d.securities / 1e8).toFixed(1);
  document.getElementById('detail-bs-sec-ratio').innerText = ((d.securities / cap) * 100).toFixed(1);

  document.getElementById('detail-bs-liab').innerText = (d.liabilities / 1e8).toFixed(1);
  document.getElementById('detail-bs-liab-ratio').innerText = ((d.liabilities / cap) * 100).toFixed(1);

  const netCashEl = document.getElementById('detail-bs-netcash');
  netCashEl.innerText = (d.netCash / 1e8).toFixed(1);
  netCashEl.className = d.netCash >= 0 ? 'val-positive' : 'val-negative';
  
  const netCashRatioTd = document.getElementById('detail-bs-netcash-ratio-td');
  netCashRatioTd.innerText = ((d.netCash / cap) * 100).toFixed(1);
  netCashRatioTd.className = d.netCash >= 0 ? 'val-positive' : 'val-negative';

  document.getElementById('detail-bs-assets').innerText = (d.netAssets / 1e8).toFixed(1);
  document.getElementById('detail-bs-assets-ratio').innerText = ((d.netAssets / cap) * 100).toFixed(1);
}

// 4. ナビゲーション・ルーティング
function navigateTo() {
  const hash = window.location.hash || '#market';
  const views = document.querySelectorAll('.view');
  views.forEach(el => el.classList.add('hidden'));

  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));

  if (hash.startsWith('#detail')) {
    const params = new URLSearchParams(hash.split('?')[1]);
    const code = params.get('code') || TARGET_STOCKS[0].code;
    document.getElementById('view-detail').classList.remove('hidden');
    document.getElementById('nav-detail').classList.add('active');
    renderDetailView(code);
  } else if (hash === '#guide') {
    document.getElementById('view-guide').classList.remove('hidden');
    document.getElementById('nav-guide').classList.add('active');
  } else {
    document.getElementById('view-market').classList.remove('hidden');
    document.getElementById('nav-market').classList.add('active');
    renderMarketView();
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadFinancials();
  navigateTo();
});

window.addEventListener('hashchange', navigateTo);