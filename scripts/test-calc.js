import fs from 'fs';
import path from 'path';
import YahooFinance from 'yahoo-finance2'; // デフォルトエクスポートを受け取る

// クラスインスタンスの作成
const yahooFinance = new YahooFinance();

// 不要な警告を非表示（オプション）
if (typeof yahooFinance.suppressNotices === 'function') {
  yahooFinance.suppressNotices(['yahooSurvey', 'v2-deprecation']);
}

// レート制限回避用のディレイ関数 (ミリ秒指定)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// エミン式バリュエーション計算関数
function calculateValuation(bsData, price, marketCap) {
  const cash = bsData.cashAndEquivalents || 0;
  const securities = bsData.securities || 0;
  const liabilities = bsData.totalLiabilities || 0;
  const netAssets = bsData.netAssets || 0;

  // 1. ネットキャッシュ = (現金預金 + 有価証券) - 負債合計
  const netCash = (cash + securities) - liabilities;

  // 2. ネットキャッシュ比率 = ネットキャッシュ / 時価総額
  const netCashRatio = marketCap > 0 ? (netCash / marketCap) : 0;

  // 3. 解散価値割れ判定 (ネットキャッシュ比率 > 1.0)
  const isNetCashBargain = netCashRatio > 1.0;

  // 4. PBR = 時価総額 / 純資産
  const pbr = netAssets > 0 ? (marketCap / netAssets) : 0;

  return {
    netCash,
    netCashRatio,
    isNetCashBargain,
    pbr
  };
}

async function runTest() {
  console.log('============ エミン式バリュエーション計算テスト ============');

  const filePath = path.resolve('public/data/financials.json');
  if (!fs.existsSync(filePath)) {
    console.error('エラー: financials.json が見つかりません。');
    return;
  }
  const financials = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const code of Object.keys(financials)) {
    const bs = financials[code];
    try {
      console.log(`\n[取得中] ${bs.name} (${code})...`);
      
      // レート制限回避のため 1.5 秒待機
      await sleep(1500);

      const quote = await yahooFinance.quote(code);
      const price = quote.regularMarketPrice;
      const marketCap = quote.marketCap;

      if (!price || !marketCap) {
        console.warn(`  ⚠️ 株価または時価総額が取得できませんでした: price=${price}, marketCap=${marketCap}`);
        continue;
      }

      const result = calculateValuation(bs, price, marketCap);

      console.log(`  現在株価     : ${price.toLocaleString()} 円`);
      console.log(`  時価総額     : ${(marketCap / 1e8).toFixed(2)} 億円`);
      console.log(`  ネットキャッシュ: ${(result.netCash / 1e8).toFixed(2)} 億円`);
      console.log(`  ネット比率   : ${(result.netCashRatio * 100).toFixed(2)} %`);
      console.log(`  PBR          : ${result.pbr.toFixed(2)} 倍`);
      console.log(`  判定         : ${result.isNetCashBargain ? '★ 解散価値割れ（実質タダ銘柄）' : '通常'}`);
    } catch (err) {
      console.error(`[エラー] ${code} のデータ取得に失敗:`, err.message);
    }
  }
  console.log('\n============================================================');
}

runTest();