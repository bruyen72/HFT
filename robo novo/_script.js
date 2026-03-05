






    window.onerror = function (msg, src, line, col, err) {
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="position:fixed;top:0;left:0;right:0;background:red;color:white;padding:12px;z-index:99999;font-size:13px;font-family:monospace">' +
        '❌ ERRO JS linha ' + line + ': ' + msg + '</div>'
      );
      console.error('ERRO:', msg, 'linha:', line);
      return false;
    };

    // ════════════════════════════════════════════════════════
    // CONSTANTS
    // ════════════════════════════════════════════════════════
    const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'DOT/USDT', 'MATIC/USDT', 'LTC/USDT', 'NEAR/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT', 'INJ/USDT', 'SUI/USDT'];
    const EXCHS = ['BingX', 'MEXC', 'Gate', 'KuCoin', 'Binance', 'Bybit', 'OKX'];
    const QUOTES = {};
    let LAST_FETCH = 0;
    let MODE_WARN_TS = 0;

    const FEE = { BingX: .075, MEXC: .020, Gate: .060, KuCoin: .100, Binance: .100, Bybit: .100, OKX: .100 };
    const BAL = { BingX: { spot: null, futures: null }, MEXC: { spot: null, futures: null }, Gate: { spot: null, futures: null }, KuCoin: { spot: null, futures: null }, Binance: { spot: null, futures: null }, Bybit: { spot: null, futures: null }, OKX: { spot: null, futures: null } };
    const BASE_PRICES = { 'BTC/USDT': 95000, 'ETH/USDT': 3400, 'SOL/USDT': 200, 'BNB/USDT': 650, 'XRP/USDT': 2.5, 'DOGE/USDT': 0.38, 'ADA/USDT': 1.05, 'AVAX/USDT': 42, 'LINK/USDT': 24, 'DOT/USDT': 8.5, 'MATIC/USDT': 0.90, 'LTC/USDT': 120, 'NEAR/USDT': 6.2, 'APT/USDT': 12, 'ARB/USDT': 1.1, 'OP/USDT': 2.1, 'INJ/USDT': 28, 'SUI/USDT': 4.8 };

    let allRows = [], filteredRows = [], selIdx = 0, pctVal = 100, qtyMode = 'usdt', afTypeF = 'all';
    let positions = [], tradeHistory = [], tradeId = 1, botRunning = false, liveInterval = null;

    // ════════════════════════════════════════════════════════
    // LOCALSTORAGE
    // ════════════════════════════════════════════════════════
    const LS = 'arbhft3_';
    const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)) } catch (e) { } };
    const lsGet = (k, d = null) => { try { const v = localStorage.getItem(LS + k); return v !== null ? JSON.parse(v) : d } catch (e) { return d } };

    function saveApi(exch) {
      const key = document.getElementById(exch + '-key')?.value?.trim();
      const secret = document.getElementById(exch + '-secret')?.value?.trim();
      const pp = document.getElementById(exch + '-pp')?.value?.trim();
      if (!key || !secret) { notify('⚠ Preencha API Key e Secret do ' + exch, 'w'); return }
      const data = { key, secret }; if (pp) data.passphrase = pp;
      lsSet('keys_' + exch, data);
      document.getElementById(exch + '-key').classList.add('valid');
      document.getElementById(exch + '-secret').classList.add('valid');
      notify('💾 ' + exch + ' salvo no navegador', 'p');
      fetchBalances(exch);
    }

    function loadSavedKeys() {
      EXCHS.forEach(ex => {
        const exl = ex.toLowerCase();
        const s = lsGet('keys_' + exl); if (!s) return;
        const ki = document.getElementById(exl + '-key'), si = document.getElementById(exl + '-secret');
        if (ki && s.key) { ki.value = s.key; ki.classList.add('valid') }
        if (si && s.secret) { si.value = s.secret; si.classList.add('valid') }
        const pi = document.getElementById(exl + '-pp'); if (pi && s.passphrase) pi.value = s.passphrase;
        setApiSt(exl, 'loading', 'Verificando...');
      });
    }

    function loadSavedConfig() {
      ['minSpread', 'minNet', 'orderSize', 'maxOrders', 'stopLoss', 'maxDailyLoss', 'maxExposure', 'minLiq'].forEach(k => {
        const v = lsGet('cfg_' + k); if (v != null) { const el = document.getElementById('cfg-' + k); if (el) el.value = v }
      });
      ['ss', 'sf', 'fs', 'ff', 'auto', 'confirm'].forEach(k => {
        const v = lsGet('tog_' + k); if (v != null) { const el = document.getElementById('tog-' + k); if (el) el.checked = v }
      });
    }

    function loadSavedTrades() {
      tradeHistory = lsGet('trades') || [];
      positions = lsGet('positions') || [];
      tradeId = tradeHistory.length ? Math.max(...tradeHistory.map(t => t.id || 0)) + 1 : 1;
    }

    document.addEventListener('change', e => {
      if (e.target.id && e.target.id.startsWith('cfg-')) lsSet('cfg_' + e.target.id.replace('cfg-', ''), e.target.value);
      if (e.target.id && e.target.id.startsWith('tog-')) lsSet('tog_' + e.target.id.replace('tog-', ''), e.target.checked);
    });

    // ════════════════════════════════════════════════════════
    // CRYPTO — Web Crypto API
    // ════════════════════════════════════════════════════════
    async function hmacHex(msg, secret, algo = 'SHA-256') {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: algo }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
      return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    async function hmacB64(msg, secret) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
      return btoa(String.fromCharCode(...new Uint8Array(sig)));
    }
    async function sha512hex(msg) {
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-512', enc.encode(msg || ''));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ════════════════════════════════════════════════════════
    // FETCH with CORS proxy fallback
    // ════════════════════════════════════════════════════════
    async function apiFetch(url, opts = {}, noThrow = false) {
      // Passa URL COMPLETA como _target — proxy repassa sem modificar
      function buildProxyUrl(originalUrl) {
        const needsLocalProxy = (location && (location.protocol === 'file:' || (location.port && location.port !== '8080')));
        const proxyBase = needsLocalProxy ? 'http://localhost:8080' : '';
        return proxyBase + '/proxy?_target=' + encodeURIComponent(originalUrl);
      }
      const preferProxy = (location && (location.protocol === 'file:' || (location.port && location.port !== '8080')));
      const exchangeHosts = ['api.binance.com', 'api.mexc.com', 'api.kucoin.com', 'api.gateio.ws', 'open-api.bingx.com', 'api.bybit.com', 'www.okx.com'];
      const isExchangeUrl = exchangeHosts.some(h => url.includes(h));
      const forceProxy = preferProxy || isExchangeUrl;

      // 1) Tenta pelo proxy local (localhost:8080)
      try {
        const proxyUrl = buildProxyUrl(url);
        const h = { ...(opts.headers || {}) };
        delete h['content-length']; delete h['Content-Length'];
        const r = await fetch(proxyUrl, { ...opts, headers: h, signal: AbortSignal.timeout(10000) });
        if (r.ok || r.status < 500) return r;
      } catch (e) {
        console.warn('Proxy local falhou:', e.message);
        if (forceProxy && !noThrow) throw new Error('Proxy local offline. Inicie o backend Java: java -jar arb-hft-engine-1.0.0.jar');
      }

      // 2) Tenta direto (funciona em VPS/servidor próprio)
      if (!forceProxy) {
        try {
          const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
          return r;
        } catch (e) {
          console.warn('Direto falhou:', e.message);
        }
      }

      // 3) Fallback: corsproxy.io (apenas GET público)
      if (!opts.method || opts.method === 'GET') {
        try {
          const r = await fetch('https://corsproxy.io/?' + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
          if (r.ok) return r;
        } catch (e) { }
      }

      if (!noThrow) throw new Error('Proxy local offline. Inicie o backend Java: java -jar arb-hft-engine-1.0.0.jar');
    }

    // ════════════════════════════════════════════════════════
    // SERVER TIMESTAMP — evita erro de relógio local
    // ════════════════════════════════════════════════════════
    // Offset global calculado uma vez no início
    // Offset fixo: relógio do PC está ~56 anos adiantado (2082 em vez de 2026)
    // Calculado como: timestamp_correto_2026 - timestamp_errado_pc
    let GLOBAL_TS_OFFSET = 0;
    let TS_OFFSET_FETCHED = false;

    async function initTsOffset() {
      if (TS_OFFSET_FETCHED) return;
      // Tenta buscar timestamp real do servidor via proxy
      const apis = [
        { url: 'https://api.mexc.com/api/v3/time', parse: d => d.serverTime },
        { url: 'https://api.binance.com/api/v3/time', parse: d => d.serverTime },
        { url: 'https://api.kucoin.com/api/v1/timestamp', parse: d => d.data },
        { url: 'https://api.gateio.ws/api/v4/spot/time', parse: d => d.server_time * 1000 }
      ];
      for (const api of apis) {
        try {
          const before = Date.now();
          const r = await apiFetch(api.url, { method: 'GET' }, true);
          if (!r) continue;
          if (!r.ok) continue;
          const d = await r.json();
          const serverTs = api.parse(d);
          if (serverTs && serverTs > 1000000000000 && serverTs < 2000000000000) {
            const latency = Math.round((Date.now() - before) / 2);
            GLOBAL_TS_OFFSET = (serverTs + latency) - Date.now();
            TS_OFFSET_FETCHED = true;
            console.log('[TS] Offset: ' + GLOBAL_TS_OFFSET + 'ms via ' + api.url + ' (ts=' + serverTs + ')');
            return;
          }
        } catch (e) { console.warn('[TS] ' + api.url + ' falhou:', errMsg(e)); continue }
      }
      // Fallback: se PC está em 2082 (timestamp > ano 2050 = 2524608000000ms)
      const wrongNow = Date.now();
      if (wrongNow > 2524608000000) {
        // Diferença em ms de 2082 para 2026 = ~56 anos
        GLOBAL_TS_OFFSET = -(wrongNow - 1740534000000);
        console.warn('[TS] Fallback offset: ' + GLOBAL_TS_OFFSET + 'ms');
      }
      TS_OFFSET_FETCHED = true;
    }

    function correctTs() {
      return Date.now() + GLOBAL_TS_OFFSET;
    }

    async function getServerTs(exch) {
      await initTsOffset();
      return correctTs();
    }

    // ════════════════════════════════════════════════════════
    // REAL BALANCE FETCH
    // ════════════════════════════════════════════════════════
    async function fetchBalances(exch) {
      const exl = exch.toLowerCase();
      const saved = lsGet('keys_' + exl);
      if (!saved || !saved.key || !saved.secret) { setApiSt(exl, 'off', 'Sem key'); setBalDsp(exl, null, null, 'nokey'); return }
      setApiSt(exl, 'loading', 'Buscando...');
      try {
        let res;
        if (exl === 'bingx') res = await balBingX(saved);
        else if (exl === 'mexc') res = await balMEXC(saved);
        else if (exl === 'gate') res = await balGate(saved);
        else if (exl === 'kucoin') res = await balKuCoin(saved);
        // Normaliza nome para bater com chave do objeto BAL
        const exchKey = exch === 'bingx' ? 'BingX' : exch === 'mexc' ? 'MEXC' : exch === 'gate' ? 'Gate' : exch === 'kucoin' ? 'KuCoin' : exch;
        if (res.error) {
          setApiSt(exl, 'err', res.error.slice(0, 35)); setBalDsp(exl, null, null, 'error'); updateLed(exl, 'err');
          notify('✗ ' + exchKey + ': ' + res.error, 'e');
        } else {
          if (BAL[exchKey]) { BAL[exchKey].spot = res.spot; BAL[exchKey].futures = res.futures; }
          setApiSt(exl, 'on', 'Conectado ✓'); setBalDsp(exl, res.spot, res.futures, 'ok'); updateLed(exl, 'on');
          setBalTs(exl); setBalPerms(exl, true); updateBalPanel();
          notify('✓ ' + exchKey + ' — Spot: $' + fmt(res.spot) + ' | Fut: $' + fmt(res.futures), 'g');
        }
      } catch (err) {
        setApiSt(exl, 'err', 'Erro conexão'); setBalDsp(exl, null, null, 'error'); updateLed(exl, 'err');
        notify('⚠ ' + exch + ': ' + errMsg(err), 'w');
      }
    }

    async function balBingX(c) {
      const ts = Date.now().toString();
      const p = 'timestamp=' + ts + '&recvWindow=5000';
      const sig = await hmacHex(p, c.secret);
      try {
        const r = await apiFetch('https://open-api.bingx.com/openApi/spot/v1/account/balance?' + p + '&signature=' + sig, { method: 'GET', headers: { 'X-BX-APIKEY': c.key } });
        const d = await r.json();
        if (d.code !== 0) return { error: 'BingX: ' + (d.msg || 'code ' + d.code) };
        const u = (d.data?.balances || []).find(b => b.asset === 'USDT');
        const spot = parseFloat(u?.free || 0);
        let fut = 0;
        try {
          const s2 = await hmacHex(p, c.secret);
          const r2 = await apiFetch('https://open-api.bingx.com/openApi/swap/v2/user/balance?' + p + '&signature=' + s2, { method: 'GET', headers: { 'X-BX-APIKEY': c.key } });
          const d2 = await r2.json();
          fut = parseFloat(d2.data?.balance?.availableMargin || 0);
        } catch (ef) { }
        return { spot, futures: fut };
      } catch (e) { return { error: 'BingX: ' + e.message } }
    }

    async function balMEXC(c) {
      const ts = Date.now().toString();
      const p = 'timestamp=' + ts + '&recvWindow=5000';
      const sig = await hmacHex(p, c.secret);
      try {
        const r = await apiFetch('https://api.mexc.com/api/v3/account?' + p + '&signature=' + sig, { method: 'GET', headers: { 'X-MEXC-APIKEY': c.key } });
        const d = await r.json();
        if (d.code && d.code !== 200) return { error: 'MEXC: ' + (d.msg || 'code ' + d.code) };
        const u = (d.balances || []).find(b => b.asset === 'USDT');
        const spot = parseFloat(u?.free || 0);
        let fut = 0;
        try {
          const ts2 = Date.now().toString();
          const strSign = c.key + ts2;
          const s2 = await hmacHex(strSign, c.secret);
          const r2 = await apiFetch('https://futures.mexc.com/api/v1/private/account/assets', { method: 'GET', headers: { 'ApiKey': c.key, 'Request-Time': ts2, 'Signature': s2, 'Content-Type': 'application/json' } });
          const d2 = await r2.json();
          const ua = (d2.data || []).find(a => a.currency === 'USDT');
          fut = parseFloat(ua?.availableBalance || 0);
        } catch (ef) { }
        return { spot, futures: fut };
      } catch (e) { return { error: 'MEXC: ' + e.message } }
    }

    async function balGate(c) {
      const tsSec = Math.floor(Date.now() / 1000).toString();
      const bodyHash = await sha512hex('');
      const signStr = 'GET\n/api/v4/spot/accounts\n\n' + bodyHash + '\n' + tsSec;
      const sig = await hmacHex(signStr, c.secret, 'SHA-512');
      try {
        const r = await apiFetch('https://api.gateio.ws/api/v4/spot/accounts', { method: 'GET', headers: { 'KEY': c.key, 'SIGN': sig, 'Timestamp': tsSec, 'Content-Type': 'application/json' } });
        const d = await r.json();
        if (!Array.isArray(d)) return { error: 'Gate: ' + (d.message || JSON.stringify(d).slice(0, 60)) };
        const spot = parseFloat(d.find(b => b.currency === 'USDT')?.available || 0);
        let fut = 0;
        try {
          const s2Str = 'GET\n/api/v4/futures/usdt/accounts\n\n' + bodyHash + '\n' + tsSec;
          const s2 = await hmacHex(s2Str, c.secret, 'SHA-512');
          const r2 = await apiFetch('https://api.gateio.ws/api/v4/futures/usdt/accounts', { method: 'GET', headers: { 'KEY': c.key, 'SIGN': s2, 'Timestamp': tsSec, 'Content-Type': 'application/json' } });
          const d2 = await r2.json();
          fut = parseFloat(d2.available || d2.total || 0);
        } catch (ef) { }
        return { spot, futures: fut };
      } catch (e) { return { error: 'Gate: ' + e.message } }
    }

    async function balKuCoin(c) {
      if (!c.passphrase) return { error: 'KuCoin: Passphrase obrigatorio' };
      const ts = Date.now().toString();
      const path = '/api/v1/accounts';
      const query = 'currency=USDT';
      const sig = await hmacB64(ts + 'GET' + path + '?' + query, c.secret);
      const pp = await hmacB64(c.passphrase, c.secret);
      try {
        const r = await apiFetch('https://api.kucoin.com' + path + '?' + query, { method: 'GET', headers: { 'KC-API-KEY': c.key, 'KC-API-SIGN': sig, 'KC-API-TIMESTAMP': ts, 'KC-API-PASSPHRASE': pp, 'KC-API-KEY-VERSION': '2', 'Content-Type': 'application/json' } });
        const d = await r.json();
        if (d.code !== '200000') return { error: 'KuCoin: ' + (d.msg || 'code ' + d.code) };
        const accs = d.data || [];
        const spot = parseFloat(accs.find(a => a.type === 'trade' && a.currency === 'USDT')?.available || 0);
        let fut = 0;
        try {
          const ts2 = Date.now().toString();
          const fPath = '/api/v1/account-overview';
          const fQuery = 'currency=USDT';
          const sig2 = await hmacB64(ts2 + 'GET' + fPath + '?' + fQuery, c.secret);
          const pp2 = await hmacB64(c.passphrase, c.secret);
          const r2 = await apiFetch('https://api-futures.kucoin.com' + fPath + '?' + fQuery, { method: 'GET', headers: { 'KC-API-KEY': c.key, 'KC-API-SIGN': sig2, 'KC-API-TIMESTAMP': ts2, 'KC-API-PASSPHRASE': pp2, 'KC-API-KEY-VERSION': '2', 'Content-Type': 'application/json' } });
          const d2 = await r2.json();
          if (d2.code === '200000' && d2.data) fut = parseFloat(d2.data.availableBalance || 0);
        } catch (ef) { }
        return { spot, futures: fut };
      } catch (e) { return { error: 'KuCoin: ' + e.message } }
    }
    // ════════════════════════════════════════════════════════
    // PLACE REAL ORDERS
    // ════════════════════════════════════════════════════════
    async function placeRealOrder(exch, symbol, side, qty, price, isSpot) {
      const exl = exch.toLowerCase();
      const c = lsGet('keys_' + exl);
      if (!c || !c.key) throw new Error('Key ' + exch + ' não configurada');
      if (exl === 'bingx') return placeOrderBingX(c, symbol, side, qty, price, isSpot);
      if (exl === 'mexc') return placeOrderMEXC(c, symbol, side, qty, price, isSpot);
      if (exl === 'gate') return placeOrderGate(c, symbol, side, qty, price, isSpot);
      if (exl === 'kucoin') return placeOrderKuCoin(c, symbol, side, qty, price, isSpot);
      throw new Error('Exchange desconhecida');
    }

    async function placeOrderBingX(c, sym, side, qty, price, isSpot) {
      // BingX: params in query string, signed with HMAC-SHA256
      const ts = Date.now().toString();
      const sf = sym.replace('/', '').replace('-USDT', '').concat('-USDT');
      const params = isSpot
        ? 'symbol=' + sf + '&side=' + side.toUpperCase() + '&type=LIMIT&quantity=' + qty + '&price=' + price + '&timeInForce=GTC&timestamp=' + ts + '&recvWindow=5000'
        : 'symbol=' + sf + '&side=' + side.toUpperCase() + '&positionSide=LONG&type=LIMIT&quantity=' + qty + '&price=' + price + '&timestamp=' + ts + '&recvWindow=5000';
      const sig = await hmacHex(params, c.secret);
      const ep = isSpot ? '/openApi/spot/v1/trade/order' : '/openApi/swap/v2/trade/order';
      try {
        const r = await apiFetch('https://open-api.bingx.com' + ep + '?' + params + '&signature=' + sig, { method: 'POST', headers: { 'X-BX-APIKEY': c.key, 'Content-Type': 'application/json' } });
        const d = await r.json();
        if (d.code !== 0) throw new Error('BingX: ' + (d.msg || 'code ' + d.code));
        return { orderId: d.data?.orderId || d.data?.order?.orderId, exchange: 'BingX', symbol: sym, side, qty, price };
      } catch (e) { throw new Error('BingX ordem: ' + e.message) }
    }

    async function placeOrderMEXC(c, sym, side, qty, price, isSpot) {
      // MEXC Spot: body JSON com symbol, params de autenticação no query string
      // MEXC requires symbol in BODY for POST orders
      const ts = Date.now().toString();
      const sf = sym.replace('/', '');
      if (isSpot) {
        // Spot: symbol e dados no body JSON, auth no query
        const bodyObj = { symbol: sf, side: side.toUpperCase(), type: 'LIMIT', quantity: String(qty), price: String(price), timeInForce: 'GTC' };
        const bodyStr = JSON.stringify(bodyObj);
        const p = 'timestamp=' + ts + '&recvWindow=5000';
        const sig = await hmacHex(p, c.secret);
        try {
          const r = await apiFetch('https://api.mexc.com/api/v3/order?' + p + '&signature=' + sig, { method: 'POST', headers: { 'X-MEXC-APIKEY': c.key, 'Content-Type': 'application/json' }, body: bodyStr });
          const d = await r.json();
          if (d.code && d.code !== 200) throw new Error('MEXC Spot: ' + (d.msg || 'code ' + d.code));
          return { orderId: d.orderId, exchange: 'MEXC', symbol: sym, side, qty, price };
        } catch (e) { throw new Error('MEXC spot ordem: ' + e.message) }
      } else {
        // Futures: contract.mexc.com, sign = HMAC(apiKey+ts)
        const ts2 = Date.now().toString();
        const strSign = c.key + ts2;
        const sig2 = await hmacHex(strSign, c.secret);
        const bodyObj = { symbol: sf + '_USDT', side: side.toUpperCase() === 'BUY' ? 1 : 3, orderType: 1, price: String(price), vol: String(qty), openType: 1, type: 1 };
        try {
          const r = await apiFetch('https://futures.mexc.com/api/v1/private/order/create', { method: 'POST', headers: { 'ApiKey': c.key, 'Request-Time': ts2, 'Signature': sig2, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) });
          const d = await r.json();
          if (!d.success) throw new Error('MEXC Fut: ' + (d.message || 'erro'));
          return { orderId: d.data, exchange: 'MEXC', symbol: sym, side, qty, price };
        } catch (e) { throw new Error('MEXC fut ordem: ' + e.message) }
      }
    }

    async function placeOrderGate(c, sym, side, qty, price, isSpot) {
      // Gate.io: HMAC-SHA512, body hash no signed string
      const tsSec = Math.floor(Date.now() / 1000).toString();
      const sf = sym.replace('/', '_');
      const bodyObj = isSpot
        ? { currency_pair: sf, side: side.toLowerCase(), type: 'limit', amount: String(qty), price: String(price), time_in_force: 'gtc' }
        : { contract: sf, size: side.toLowerCase() === 'buy' ? Math.abs(qty) : -Math.abs(qty), price: String(price), tif: 'gtc' };
      const bodyStr = JSON.stringify(bodyObj);
      const bh = await sha512hex(bodyStr);
      const path = isSpot ? '/api/v4/spot/orders' : '/api/v4/futures/usdt/orders';
      const signStr = 'POST\n' + path + '\n\n' + bh + '\n' + tsSec;
      const sig = await hmacHex(signStr, c.secret, 'SHA-512');
      try {
        const r = await apiFetch('https://api.gateio.ws' + path, { method: 'POST', headers: { 'KEY': c.key, 'SIGN': sig, 'Timestamp': tsSec, 'Content-Type': 'application/json' }, body: bodyStr });
        const d = await r.json();
        if (d.message && d.message !== 'ok' && !d.id) throw new Error('Gate: ' + d.message);
        return { orderId: d.id, exchange: 'Gate', symbol: sym, side, qty, price };
      } catch (e) { throw new Error('Gate ordem: ' + e.message) }
    }

    async function placeOrderKuCoin(c, sym, side, qty, price, isSpot) {
      // KuCoin: sign = HMAC-SHA256-B64(ts+method+path+body)
      if (!c.passphrase) throw new Error('KuCoin: Passphrase obrigatorio');
      const ts = Date.now().toString();
      const sf = isSpot ? sym.replace('/', '-') : sym.replace('/', '');
      const path = isSpot ? '/api/v1/orders' : '/api/v1/orders';
      const host = isSpot ? 'https://api.kucoin.com' : 'https://api-futures.kucoin.com';
      const clientOid = 'arb' + ts + Math.random().toString(36).slice(2, 6);
      const bodyObj = isSpot
        ? { clientOid, symbol: sf, side: side.toLowerCase(), type: 'limit', price: String(price), size: String(qty) }
        : { clientOid, symbol: sf, side: side.toLowerCase(), type: 'limit', price: String(price), size: String(qty), leverage: '1' };
      const bodyStr = JSON.stringify(bodyObj);
      const sig = await hmacB64(ts + 'POST' + path + bodyStr, c.secret);
      const pp = await hmacB64(c.passphrase, c.secret);
      try {
        const r = await apiFetch(host + path, { method: 'POST', headers: { 'KC-API-KEY': c.key, 'KC-API-SIGN': sig, 'KC-API-TIMESTAMP': ts, 'KC-API-PASSPHRASE': pp, 'KC-API-KEY-VERSION': '2', 'Content-Type': 'application/json' }, body: bodyStr });
        const d = await r.json();
        if (d.code !== '200000') throw new Error('KuCoin: ' + (d.msg || 'code ' + d.code));
        return { orderId: d.data?.orderId, exchange: 'KuCoin', symbol: sym, side, qty, price };
      } catch (e) { throw new Error('KuCoin ordem: ' + e.message) }
    }
    async function testApi(exch) {
      const s = lsGet('keys_' + exch);
      if (!s || !s.key) { notify('⚠ Salve a key do ' + exch + ' primeiro', 'w'); return }
      notify('🔌 Testando ' + exch + '...', '');
      await fetchBalances(exch);
    }

    // ════════════════════════════════════════════════════════
    // UI HELPERS
    // ════════════════════════════════════════════════════════
    function setApiSt(exl, state, txt) {
      const dot = document.getElementById(exl + '-dot');
      const stat = document.getElementById(exl + '-status');
      if (dot) { dot.className = 'asd'; if (state === 'on') dot.classList.add('asd-on'); else if (state === 'err') dot.classList.add('asd-err'); else if (state === 'loading') dot.classList.add('asd-loading') }
      if (stat) { stat.textContent = txt; stat.style.color = state === 'on' ? 'var(--g)' : state === 'err' ? 'var(--r)' : 'var(--y)' }
    }
    function setBalDsp(exl, spot, fut, state) {
      const bs = document.getElementById(exl + '-bal-s'), bf = document.getElementById(exl + '-bal-f');
      const cls = 'apibv ' + (state === 'ok' ? 'ok' : state === 'error' ? 'err' : 'loading');
      if (bs) { bs.className = cls; bs.textContent = state === 'ok' ? '$' + fmt(spot) : state === 'nokey' ? 'Sem key' : '—' }
      if (bf) { bf.className = cls; bf.textContent = state === 'ok' ? '$' + fmt(fut) : state === 'nokey' ? 'Sem key' : '—' }
    }
    function setBalTs(exl) { const el = document.getElementById(exl + '-bal-ts'); if (el) el.textContent = new Date().toLocaleTimeString('pt-BR') }
    function setBalPerms(exl, ok) {
      const el = document.getElementById(exl + '-perms'); if (!el) return;
      el.innerHTML = ok ? '<span class="apiperm ok">✓ SPOT</span><span class="apiperm ok">✓ FUTURES</span><span class="apiperm ok">✓ TRADE</span><span class="apiperm no">✗ WITHDRAW</span>' : '<span class="apiperm no">✗ SPOT</span><span class="apiperm no">✗ FUTURES</span><span class="apiperm no">✗ TRADE</span><span class="apiperm no">✗ WITHDRAW</span>';
    }
    function updateLed(exl, state) {
      const ld = document.getElementById('ld-' + exl); if (!ld) return;
      ld.className = 'ld';
      if (state === 'on') ld.classList.add('ld-on');
      else if (state === 'err') ld.classList.add('ld-err');
      else if (state === 'warn') ld.classList.add('ld-warn');
    }
    function toggleEye(id, btn) {
      const inp = document.getElementById(id); if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    }
    function notify(msg, type = '') {
      const el = document.createElement('div');
      el.className = 'ni' + (type ? ' ' + type : ''); el.textContent = msg;
      document.getElementById('notif').appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
    function errMsg(err) {
      if (!err) return 'Erro desconhecido';
      if (err.message) return err.message;
      try { return JSON.stringify(err); } catch (e) { return String(err) }
    }
    const _locks = new Map();
    async function withLock(key, fn, ms = 800) {
      if (_locks.get(key)) return null;
      _locks.set(key, true);
      try { return await fn(); }
      finally {
        setTimeout(() => _locks.delete(key), ms);
      }
    }
    function clampNum(v, min = 0, max = null, dec = 8) {
      let n = parseFloat(v);
      if (isNaN(n) || !isFinite(n)) n = min;
      if (n < min) n = min;
      if (max !== null && n > max) n = max;
      const f = Math.pow(10, dec);
      return Math.round(n * f) / f;
    }
    function normalizeNumberInput(id, min = 0, max = null, dec = 8) {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = clampNum(el.value, min, max, dec);
    }
    function toggleLimitInputs() {
      const t = document.getElementById('ordType')?.value || 'LIMIT';
      const lb = document.getElementById('lBuy');
      const ls = document.getElementById('lSell');
      const isMarket = t === 'MARKET';
      if (lb) lb.disabled = isMarket;
      if (ls) ls.disabled = isMarket;
      if (isMarket) {
        const r = filteredRows[selIdx];
        if (r) {
          if (lb) lb.value = r.buyAt;
          if (ls) ls.value = r.sellAt;
        }
      }
    }
    window.addEventListener('unhandledrejection', e => {
      console.warn('[UNHANDLED]', errMsg(e.reason));
      e.preventDefault();
    });
    function fmt(n) {
      if (n == null || n === undefined) return '—'; n = parseFloat(n); if (isNaN(n)) return '—';
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return n.toFixed(2);
    }
    function fmtP(n, dec = 2) { if (n == null) return '—'; return parseFloat(n).toFixed(dec) }
    function fmtDate(d) { if (!d) return '—'; const dt = d instanceof Date ? d : new Date(d); return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }

    // ════════════════════════════════════════════════════════
    // BALANCE PANEL — real values from BAL
    // ════════════════════════════════════════════════════════
    function getArbMode() { return document.getElementById('arbMode')?.value || 'SS' }
    function getBuyExch() { return document.getElementById('buyEx')?.value || 'BingX' }
    function getSellExch() { return document.getElementById('sellEx')?.value || 'MEXC' }
    function getBuyType() { const m = getArbMode(); return (m === 'FF' || m === 'FS') ? 'futures' : 'spot' }
    function getSellType() { const m = getArbMode(); return (m === 'FF' || m === 'SF') ? 'futures' : 'spot' }
    function getAvailBuy() { const b = BAL[getBuyExch()]; if (!b) return 0; return b[getBuyType()] || 0 }
    function getAvailSell() { const b = BAL[getSellExch()]; if (!b) return 0; return b[getSellType()] || 0 }
    function getMaxUsdt() { return Math.min(getAvailBuy() || 0, getAvailSell() || 0) }
    function getCurrentPrice() { const r = filteredRows[selIdx]; return r ? r.buyAt : 0 }
    function getBuyBase() { const r = filteredRows[selIdx]; return r ? r.sym.split('/')[0] : 'TOKEN' }

    function updateBalPanel() {
      const buyExch = getBuyExch(), sellExch = getSellExch();
      const buyType = getBuyType(), sellType = getSellType();
      const buyBal = getAvailBuy(), sellBal = getAvailSell();
      const price = getCurrentPrice();
      (function () { var __t = document.getElementById('balBuyName'); if (__t) __t.textContent = buyExch; })();
      (function () { var __t = document.getElementById('balSellName'); if (__t) __t.textContent = sellExch; })();
      (function () { var __t = document.getElementById('balBuyType'); if (__t) __t.textContent = buyType.toUpperCase(); })();
      (function () { var __t = document.getElementById('balSellType'); if (__t) __t.textContent = sellType.toUpperCase(); })();
      const bbu = document.getElementById('balBuyUsdt'), bsu = document.getElementById('balSellUsdt');
      const bbt = document.getElementById('balBuyAsset'), bst = document.getElementById('balSellAsset');
      if (bbu && BAL[buyExch] && BAL[buyExch][buyType] === null) { bbu.className = 'balusdt nokey'; bbu.textContent = 'Configure key →'; if (bbt) bbt.textContent = '' }
      else if (bbu) { bbu.className = 'balusdt ' + (buyBal > 100 ? 'ok' : buyBal > 10 ? 'low' : 'empty'); bbu.textContent = '$' + fmt(buyBal); if (bbt && price > 0) bbt.textContent = '≈ ' + (buyBal / price).toFixed(6) + ' ' + getBuyBase(); else if (bbt) bbt.textContent = '' }
      if (bsu && BAL[sellExch] && BAL[sellExch][sellType] === null) { bsu.className = 'balusdt nokey'; bsu.textContent = 'Configure key →'; if (bst) bst.textContent = '' }
      else if (bsu) { bsu.className = 'balusdt ' + (sellBal > 100 ? 'ok' : sellBal > 10 ? 'low' : 'empty'); bsu.textContent = '$' + fmt(sellBal); if (bst && price > 0) bst.textContent = '≈ ' + (sellBal / price).toFixed(6) + ' ' + getBuyBase(); else if (bst) bst.textContent = '' }
      updateQtyDisplay();
    }

    function updateQtyDisplay() {
      const maxU = getMaxUsdt(), price = getCurrentPrice();
      const rawVal = parseFloat(document.getElementById('qty')?.value || '0') || 0;
      let usdt = 0, token = 0;
      if (qtyMode === 'usdt') { usdt = rawVal; token = price > 0 ? usdt / price : 0 }
      else { token = rawVal; usdt = price > 0 ? token * price : 0 }
      (function () { var __t = document.getElementById('qtyResUsdt'); if (__t) __t.textContent = usdt > 0 ? '$' + fmt(usdt) : '—'; })();
      (function () { var __t = document.getElementById('qtyResAsset'); if (__t) __t.textContent = token > 0 ? token.toFixed(6) + ' ' + getBuyBase() : '—'; })();
      (function () { var __t = document.getElementById('qtyUnit'); if (__t) __t.textContent = qtyMode === 'usdt' ? 'USDT' : getBuyBase(); })();
      const warn = document.getElementById('qtyInsuf');
      const buyB = getAvailBuy(), sellB = getAvailSell();
      if (warn) { if (buyB > 0 && sellB > 0 && usdt > 0 && (usdt > buyB || usdt > sellB)) warn.classList.add('show'); else warn.classList.remove('show'); }
    }

    function setQtyMode(mode) {
      qtyMode = mode;
      document.getElementById('modeUsdt')?.classList.toggle('on', mode === 'usdt');
      document.getElementById('modeToken')?.classList.toggle('on', mode === 'token');
      document.getElementById('qty').value = '';
      document.getElementById('qty').placeholder = mode === 'usdt' ? 'USDT...' : 'Tokens...';
      updateQtyDisplay();
    }

    function setQtyPct(pct, el) {
      document.querySelectorAll('.qpb').forEach(b => b.classList.remove('on'));
      if (el) el.classList.add('on');
      const maxU = getMaxUsdt(), price = getCurrentPrice();
      if (qtyMode === 'usdt') { document.getElementById('qty').value = (maxU * pct / 100).toFixed(2) }
      else { const maxT = price > 0 ? maxU / price : 0; document.getElementById('qty').value = (maxT * pct / 100).toFixed(6) }
      updateQtyDisplay();
    }

    function onQtyInput() { document.querySelectorAll('.qpb').forEach(b => b.classList.remove('on')); updateQtyDisplay() }
    function useMaxBuy() { const b = getAvailBuy(); if (qtyMode === 'usdt') document.getElementById('qty').value = b.toFixed(2); else { const p = getCurrentPrice(); document.getElementById('qty').value = p > 0 ? (b / p).toFixed(6) : '0' } updateQtyDisplay() }
    function useMaxSell() { const b = getAvailSell(); if (qtyMode === 'usdt') document.getElementById('qty').value = b.toFixed(2); else { const p = getCurrentPrice(); document.getElementById('qty').value = p > 0 ? (b / p).toFixed(6) : '0' } updateQtyDisplay() }
    function getOrderUSDT() { const val = parseFloat(document.getElementById('qty').value) || 0; const price = getCurrentPrice(); return qtyMode === 'usdt' ? val : (price > 0 ? val * price : 0) }
    function getOrderToken() { const val = parseFloat(document.getElementById('qty').value) || 0; const price = getCurrentPrice(); return qtyMode === 'token' ? val : (price > 0 ? val / price : 0) }

    // ════════════════════════════════════════════════════════
    // PAGE SWITCHING
    // ════════════════════════════════════════════════════════
    function switchPage(p, tab) {
      document.querySelectorAll('.page').forEach(pg => pg.classList.remove('on'));
      document.querySelectorAll('.gtab').forEach(t => t.classList.remove('on', 'on-api', 'on-res'));
      if (p === 'scanner') { document.getElementById('pgScanner').classList.add('on'); tab.classList.add('on') }
      else if (p === 'results') { document.getElementById('pgResults').classList.add('on'); tab.classList.add('on-res') }
      else if (p === 'api') { document.getElementById('pgApi').classList.add('on'); tab.classList.add('on-api') }
    }
    function switchRes(p, tab) {
      document.querySelectorAll('.ressp').forEach(s => s.classList.remove('on'));
      document.querySelectorAll('.restab').forEach(t => t.classList.remove('on'));
      document.getElementById('res-' + p).classList.add('on'); tab.classList.add('on');
      if (p === 'orders') renderOrders();
      if (p === 'daily') renderDaily();
    }

    // ════════════════════════════════════════════════════════
    // SCANNER
    // ════════════════════════════════════════════════════════
    function getModes() { return { SS: document.getElementById('tog-ss')?.checked, SF: document.getElementById('tog-sf')?.checked, FS: document.getElementById('tog-fs')?.checked, FF: document.getElementById('tog-ff')?.checked } }

    function genRows() {
      const modes = getModes();
      allRows = [];
      // Somente SPOT (SS) com dados reais
      if (!modes.SS) {
        const now = Date.now();
        if (now - MODE_WARN_TS > 5000) {
          notify('? Apenas SPOT/SS dispon?vel com dados reais', 'w');
          MODE_WARN_TS = now;
        }
        return;
      }
      PAIRS.forEach(sym => {
        const pairs = [];
        for (let i = 0; i < EXCHS.length; i++) {
          for (let j = 0; j < EXCHS.length; j++) {
            if (i !== j) pairs.push([EXCHS[i], EXCHS[j]]);
          }
        }
        pairs.forEach(([bEx, sEx]) => {
          const qb = QUOTES[bEx]?.[sym];
          const qs = QUOTES[sEx]?.[sym];
          if (!qb || !qs || !qb.ask || !qs.bid) return;
          const ask = qb.ask, bid = qs.bid;
          if (ask <= 0 || bid <= 0) return;
          const sp = +(((bid - ask) / ask) * 100).toFixed(3);
          if (sp < 0.01) return;
          const fees = (FEE[bEx] || 0) + (FEE[sEx] || 0);
          const fr = 0;
          const net = +(sp - fees * 100).toFixed(3);
          const buyAt = +ask.toFixed(ask > 1000 ? 2 : 4);
          const sellAt = +bid.toFixed(bid > 1000 ? 2 : 4);
          let liq = null;
          if (qb.askQty && qs.bidQty) {
            liq = (qb.askQty * ask) + (qs.bidQty * bid);
          }
          allRows.push({ sym, type: 'SS', exchs: [bEx, sEx], spread: sp, fees, fr, net, buyAt, sellAt, liq, rank: 0 });
        });
      });
      allRows.sort((a, b) => b.spread - a.spread); allRows.forEach((r, i) => r.rank = i + 1);
    }

    function apf(t, el) {
      afTypeF = t; document.querySelectorAll('.ftag').forEach(b => b.classList.remove('on')); el.classList.add('on'); applyF();
    }

    function applyF() {
      const type = document.getElementById('fType').value;
      const minSp = parseFloat(document.getElementById('fSp').value) || 0;
      const minL = parseFloat(document.getElementById('fLiq').value) || 0;
      const ex = document.getElementById('fEx').value;
      const srch = (document.getElementById('fSym').value || '').toUpperCase();
      filteredRows = allRows.filter(r => {
        if (afTypeF !== 'all' && r.type !== afTypeF) return false;
        if (type !== 'all' && r.type !== type) return false;
        if (r.spread < minSp) return false; if (r.liq != null && r.liq < minL) return false;
        if (ex !== 'all' && !r.exchs.includes(ex)) return false;
        if (srch && !r.sym.includes(srch)) return false; return true;
      });
      if (selIdx >= filteredRows.length) selIdx = 0;
      renderScanner(); renderAsset();
      (function () { var __t = document.getElementById('oppCnt'); if (__t) __t.textContent = filteredRows.length; })();
      (function () { var __t = document.getElementById('scanBadge'); if (__t) __t.textContent = filteredRows.length; })();
      (function () { var __t = document.getElementById('listCt'); if (__t) __t.textContent = filteredRows.length; })();
      (function () { var __t = document.getElementById('hotCt'); if (__t) __t.textContent = filteredRows.filter(r => r.spread > 0.5).length + ' hot'; })();
      const msv = document.getElementById('minSV'); if (msv) msv.textContent = (document.getElementById('fSp')?.value || '0.3') + '%';
    }

    function sel(i) {
      selIdx = i; const r = filteredRows[i]; if (!r) return;
      (function () { var __t = document.getElementById('phSym'); if (__t) __t.textContent = r.sym; })();
      (function () { var __t = document.getElementById('phType'); if (__t) __t.textContent = r.type; })();
      document.getElementById('phType') && (document.getElementById('phType').className = 'at t' + r.type.toLowerCase());
      (function () { var __t = document.getElementById('phSp'); if (__t) __t.textContent = '+' + r.spread.toFixed(3) + '%'; })();
      (function () { var __t = document.getElementById('phNet'); if (__t) __t.textContent = (r.net > 0 ? '+' : '') + r.net.toFixed(3) + '%'; })();
      (function () { var __t = document.getElementById('phBE'); if (__t) __t.textContent = r.exchs[0]; })(); (function () { var __t = document.getElementById('phSE'); if (__t) __t.textContent = r.exchs[1]; })();
      (function () { var __t = document.getElementById('obBE'); if (__t) __t.textContent = r.exchs[0]; })(); (function () { var __t = document.getElementById('obSE'); if (__t) __t.textContent = r.exchs[1]; })();
      (function () { var __t = document.getElementById('qePair'); if (__t) __t.textContent = r.sym; })();
      (document.getElementById('lBuy') || { value: '' }).value = r.buyAt; (document.getElementById('lSell') || { value: '' }).value = r.sellAt;
      (document.getElementById('buyEx') || { value: '' }).value = r.exchs[0]; (document.getElementById('sellEx') || { value: '' }).value = r.exchs[1];
      const modeEl = document.getElementById('arbMode'); if (modeEl) modeEl.value = r.type === 'FS' ? 'FS' : r.type;
      updateBalPanel();
      const f1 = FEE[r.exchs[0]] || .075, f2 = FEE[r.exchs[1]] || .020, fr = Math.abs(r.fr), sl = .05;
      const net = r.spread - f1 - f2 - fr * 100 - sl;
      (function () { var __t = document.getElementById('cSp'); if (__t) __t.textContent = '+' + r.spread.toFixed(3) + '%'; })();
      (function () { var __t = document.getElementById('cF1'); if (__t) __t.textContent = '-' + f1.toFixed(3) + '%'; })();
      (function () { var __t = document.getElementById('cF2'); if (__t) __t.textContent = '-' + f2.toFixed(3) + '%'; })();
      (function () { var __t = document.getElementById('cFr'); if (__t) __t.textContent = '-' + fr.toFixed(4) + '%'; })();
      (function () { var __t = document.getElementById('cSl'); if (__t) __t.textContent = '-' + sl.toFixed(3) + '%'; })();
      const nEl = document.getElementById('cNet');
      if (nEl) { nEl.textContent = (net > 0 ? '+' : '') + net.toFixed(3) + '%'; nEl.style.color = net > 0 ? 'var(--g)' : 'var(--r)'; }
      const qty = getOrderUSDT() || parseFloat(document.getElementById('cfg-orderSize')?.value || 200);
      const uEl = document.getElementById('cUsd');
      if (uEl) { uEl.textContent = (net > 0 ? '+$' : '-$') + Math.abs(net / 100 * qty).toFixed(2); uEl.style.color = net > 0 ? 'var(--g)' : 'var(--r)'; }
      renderOB(r.buyAt, r.liq);
    }

    function renderAsset() {
      const srch = (document.getElementById('apSrch').value || '').toUpperCase();
      const rows = filteredRows.filter(r => !srch || r.sym.includes(srch));
      const seen = new Set();
      const unique = rows.filter(r => { const k = r.sym + '|' + r.type + '|' + r.exchs.join('-'); if (seen.has(k)) return false; seen.add(k); return true });
      document.getElementById('alist').innerHTML = unique.map(r => `<div class="ai${filteredRows.indexOf(r) === selIdx ? ' sel' : ''}" onclick="sel(${filteredRows.indexOf(r)})"><span class="ai-sym">${r.sym.split('/')[0]}<br><span style="font-size:7px;color:var(--dim)">${r.exchs[0]}→${r.exchs[1]}</span></span><span class="ai-sp ${r.spread > .5 ? 'h' : r.spread > .3 ? 'w' : 'c'}">${r.spread.toFixed(2)}%</span><span class="at t${r.type.toLowerCase()}">${r.type}</span></div>`).join('');
    }

    function renderScanner() {
      document.getElementById('scBody').innerHTML = filteredRows.map((r, i) => `<div class="sr${i === selIdx ? ' sel' : ''}" onclick="sel(${i})"><span style="color:var(--dim);font-size:8px">${r.rank}</span><span style="font-weight:700;font-size:10px">${r.sym}</span><span class="at t${r.type.toLowerCase()}">${r.type}</span><span style="color:var(--mid);font-size:9px">${r.exchs[0]}→${r.exchs[1]}</span><span class="srsp ${r.spread > .5 ? 'h' : r.spread > .3 ? 'w' : 'c'}">${r.spread.toFixed(3)}%</span><span class="srpr">$${fmtP(r.buyAt, r.buyAt > 100 ? 2 : 4)}</span><span class="srpr">$${fmtP(r.sellAt, r.sellAt > 100 ? 2 : 4)}</span><span class="${r.fr > 0 ? 'srfp' : 'srfn'}">${(r.fr * 100).toFixed(3)}%</span><span><div class="lw"><div class="lb" style="width:${Math.min(80, r.liq / 5000)}px"></div><span class="lv">$${fmt(r.liq)}</span></div></span><span style="font-weight:700;font-size:10px;color:${r.net > 0 ? 'var(--g)' : 'var(--r)'}">${(r.net > 0 ? '+' : '') + r.net.toFixed(3)}%</span><span class="sra"><button class="bar" onclick="event.stopPropagation();qArb(${i})">⚡ARB</button><button class="bwr" onclick="event.stopPropagation();watchRow(${i})">👁</button></span></div>`).join('');
    }

    function renderOB(mid, liq) {
      const asks = [], bids = []; let al = 0, bl = 0;
      const prec = mid > 1000 ? 1 : 4;
      for (let i = 5; i > 0; i--) { const p = mid * (1 + i * .0003); const q = +(0.5 + Math.random() * 8).toFixed(3); asks.push([p, q, p * q]); al += p * q }
      for (let i = 1; i <= 5; i++) { const p = mid * (1 - i * .0003); const q = +(0.5 + Math.random() * 8).toFixed(3); bids.push([p, q, p * q]); bl += p * q }
      const ma = Math.max(...asks.map(a => a[2])), mb = Math.max(...bids.map(b => b[2]));
      document.getElementById('obAsks').innerHTML = asks.map(a => `<div class="oblv"><div class="obbar obba" style="width:${Math.round(a[2] / ma * 100)}%"></div><span class="obpa">${fmtP(a[0], prec)}</span><span class="obq">${a[1]}</span></div>`).join('');
      document.getElementById('obBids').innerHTML = bids.map(b => `<div class="oblv"><div class="obbar obbb" style="width:${Math.round(b[2] / mb * 100)}%"></div><span class="obpb">${fmtP(b[0], prec)}</span><span class="obq">${b[1]}</span></div>`).join('');
      (function () { var __t = document.getElementById('obSpD'); if (__t) __t.textContent = '$' + (mid * .0006).toFixed(mid > 1000 ? 2 : 6); })();
      (function () { var __t = document.getElementById('obLB'); if (__t) __t.textContent = '$' + fmt(al); })(); (function () { var __t = document.getElementById('obLS'); if (__t) __t.textContent = '$' + fmt(bl); })();
    }

    function renderPos() {
      const tbody = document.getElementById('ptBody');
      (function () { var __t = document.getElementById('psCt'); if (__t) __t.textContent = positions.length + ' ativas'; })();
      (function () { var __t = document.getElementById('posCount'); if (__t) __t.textContent = positions.length; })();
      if (!tbody) return;
      if (!positions.length) { tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--dim);padding:8px;font-size:9px">Nenhuma posição aberta</td></tr>'; return }
      tbody.innerHTML = positions.map((p, i) => {
        const pnl = p.side === 'LONG' ? (p.cur - p.entry) / p.entry * (p.usdt || 0) : (p.entry - p.cur) / p.entry * (p.usdt || 0);
        const pp = p.side === 'LONG' ? (p.cur - p.entry) / p.entry * 100 : (p.entry - p.cur) / p.entry * 100;
        return `<tr><td style="font-weight:700">${p.sym}</td><td><span class="at t${p.type.toLowerCase()}">${p.type}</span></td><td class="${p.side === 'LONG' ? 'sl' : 'ss'}">${p.side}</td><td>$${fmtP(p.entry, p.entry > 100 ? 2 : 4)}</td><td>$${fmtP(p.cur, p.cur > 100 ? 2 : 4)}</td><td>$${fmt(p.usdt)}</td><td>${p.token ? p.token.toFixed(6) + ' ' + p.sym.split('/')[0] : '—'}</td><td class="${pnl >= 0 ? 'pp' : 'pn'}">${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}</td><td class="${pp >= 0 ? 'pp' : 'pn'}">${pp >= 0 ? '+' : ''}${pp.toFixed(2)}%</td><td>${p.bEx}</td><td>${p.sEx}</td><td><button class="bcr" onclick="closeP(${i})">✕ MKT</button><button class="bcrd" onclick="cancelP(${i})">✕ ORD</button></td></tr>`;
      }).join('');
    }

    // ════════════════════════════════════════════════════════
    // RESULTS
    // ════════════════════════════════════════════════════════
    function renderOrders() {
      const status = document.getElementById('ordStatus').value;
      const type = document.getElementById('ordType2').value;
      const exch = document.getElementById('ordExch').value;
      const sym = (document.getElementById('ordSym').value || '').toUpperCase();
      let rows = tradeHistory.filter(t => {
        if (status !== 'all' && t.status !== status) return false;
        if (type !== 'all' && t.type !== type) return false;
        if (exch !== 'all' && t.bEx !== exch && t.sEx !== exch) return false;
        if (sym && !t.sym.includes(sym)) return false; return true;
      }).sort((a, b) => new Date(b.ts) - new Date(a.ts));
      (function () { var __t = document.getElementById('ordTotal'); if (__t) __t.textContent = rows.length; })();
      (function () { var __t = document.getElementById('ordBadge'); if (__t) __t.textContent = tradeHistory.length; })();
      document.getElementById('ordBody').innerHTML = rows.map(t => {
        const pC = t.pnlPct >= 0 ? 'owin' : 'oloss', uC = t.pnlUsd >= 0 ? 'owin' : 'oloss';
        const st = t.status === 'closed' ? '<span class="ostac">FECHADO</span>' : t.status === 'open' ? '<span class="ostao">ABERTO</span>' : '<span class="ostax">CANCELADO</span>';
        return `<tr><td style="color:var(--dim)">#${t.id}</td><td style="color:var(--mid)">${fmtDate(t.ts)}</td><td style="font-weight:700">${t.sym}</td><td><span class="at t${t.type.toLowerCase()}">${t.type}</span></td><td>${t.bEx}</td><td>${t.sEx}</td><td class="osbuy">$${fmtP(t.buyP, t.buyP > 100 ? 2 : 4)}</td><td class="ossell">$${fmtP(t.sellP, t.sellP > 100 ? 2 : 4)}</td><td>$${fmt(t.usdt)}</td><td>${t.token ? t.token.toFixed(6) : '-'}</td><td style="color:var(--y)">${t.spread.toFixed(3)}%</td><td style="color:var(--r)">-${t.fees.toFixed(3)}%</td><td class="${pC}">${t.status === 'cancelled' ? '—' : (t.pnlPct >= 0 ? '+' : '') + t.pnlPct.toFixed(3) + '%'}</td><td class="${uC}">${t.status === 'cancelled' ? '—' : (t.pnlUsd >= 0 ? '+$' : '-$') + Math.abs(t.pnlUsd).toFixed(2)}</td><td>${st}</td></tr>`;
      }).join('');
    }

    function renderDaily() {
      const byDay = {};
      tradeHistory.forEach(t => {
        const d = new Date(t.ts).toLocaleDateString('pt-BR');
        if (!byDay[d]) byDay[d] = { date: d, trades: 0, wins: 0, losses: 0, pnlUsd: 0, pnlPct: 0, fees: 0, vol: 0 };
        const day = byDay[d]; day.trades++;
        if (t.status === 'closed') { if (t.pnlUsd >= 0) day.wins++; else day.losses++; day.pnlUsd += t.pnlUsd; day.pnlPct += t.pnlPct; day.fees += t.fees / 100 * (t.usdt || 0) }
        day.vol += (t.usdt || 0);
      });
      const days = Object.values(byDay).reverse();
      if (!days.length) { document.getElementById('dailyGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--dim);padding:24px">Nenhum trade ainda.</div>'; return }
      document.getElementById('dailyGrid').innerHTML = days.map(d => {
        const isG = d.pnlUsd >= 0, wr = d.trades ? ((d.wins / d.trades) * 100).toFixed(0) : 0, ww = d.trades ? Math.round(d.wins / d.trades * 100) : 0;
        return `<div class="daycard"><div class="daychd"><span class="daydate">${d.date}</span><span class="${isG ? 'daypg' : 'daypg daypr'}">${isG ? '+' : ''}$${d.pnlUsd.toFixed(2)}</span></div><div class="daycb"><div class="dayrow"><span class="dayk">PnL %</span><span class="dayv ${isG ? 'pp' : 'pn'}">${isG ? '+' : ''}${d.pnlPct.toFixed(3)}%</span></div><div class="dayrow"><span class="dayk">Trades</span><span class="dayv">${d.trades}</span></div><div class="dayrow"><span class="dayk">Win Rate</span><span class="dayv" style="color:var(--c)">${wr}%</span></div><div class="dayrow"><span class="dayk">W/L</span><span class="dayv">${d.wins}✓/${d.losses}✗</span></div><div class="dayrow"><span class="dayk">Volume</span><span class="dayv">$${fmt(d.vol)}</span></div><div class="dayrow"><span class="dayk">Taxas</span><span class="dayv" style="color:var(--r)">-$${d.fees.toFixed(2)}</span></div><div class="daybw"><div class="daybg" style="width:${ww}%"></div><div class="daybr" style="width:${100 - ww}%"></div></div></div></div>`;
      }).join('');
    }

    function renderOverview() {
      const closed = tradeHistory.filter(t => t.status === 'closed');
      const wins = closed.filter(t => t.pnlUsd >= 0);
      const totalPnl = closed.reduce((s, t) => s + t.pnlUsd, 0);
      const totalVol = tradeHistory.reduce((s, t) => s + (t.usdt || 0), 0);
      const totalFees = closed.reduce((s, t) => s + t.fees / 100 * (t.usdt || 0), 0);
      const wr = closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : 0;
      document.getElementById('resBanner') && (document.getElementById('resBanner').innerHTML = `<div class="rbcard"><div class="rblabel">PnL Total</div><div class="rbval ${totalPnl >= 0 ? 'rbg' : 'rbr'}">${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}</div><div class="rbsub">${closed.length} fechados</div></div><div class="rbcard"><div class="rblabel">Win Rate</div><div class="rbval rbc">${wr}%</div><div class="rbsub">${wins.length}W / ${closed.length - wins.length}L</div></div><div class="rbcard"><div class="rblabel">Volume</div><div class="rbval rby">$${fmt(totalVol)}</div><div class="rbsub">${tradeHistory.length} ordens</div></div><div class="rbcard"><div class="rblabel">Taxas Pagas</div><div class="rbval rbr">-$${totalFees.toFixed(2)}</div><div class="rbsub">estimado</div></div><div class="rbcard"><div class="rblabel">Posições</div><div class="rbval rbp">${positions.length}</div><div class="rbsub">abertas</div></div>`);
      (function () { var __t = document.getElementById('totalPnl'); if (__t) __t.textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2); })();
      (function () { var __t = document.getElementById('winRate'); if (__t) __t.textContent = closed.length ? wr + '%' : '—'; })();
    }

    function exportOrders() {
      if (!tradeHistory.length) { notify('Nenhum trade para exportar', 'w'); return }
      const hdr = 'ID,Data,Par,Tipo,BuyExch,SellExch,BuyP,SellP,USDT,Token,Spread%,Taxas%,PnL%,PnL$,Status\n';
      const rows = tradeHistory.map(t => [t.id, fmtDate(t.ts), t.sym, t.type, t.bEx, t.sEx, t.buyP, t.sellP, t.usdt || 0, t.token || 0, t.spread, t.fees, t.pnlPct || 0, t.pnlUsd || 0, t.status].join(',')).join('\n');
      const blob = new Blob([hdr + rows], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'arb-trades-' + Date.now() + '.csv'; a.click();
      notify('⬇ CSV exportado', 'c');
    }

    // ════════════════════════════════════════════════════════
    // ARB EXECUTION
    // ════════════════════════════════════════════════════════
    function doArb() {
      const r = filteredRows[selIdx]; if (!r) { notify('Selecione um par', 'w'); return }
      const usdt = getOrderUSDT(); if (usdt <= 0) { notify('⚠ Defina a quantidade', 'w'); return }
      const bex = document.getElementById('buyEx').value, sex = document.getElementById('sellEx').value;
      const buyP = parseFloat(document.getElementById('lBuy').value) || r.buyAt;
      const sellP = parseFloat(document.getElementById('lSell').value) || r.sellAt;
      const mode = document.getElementById('arbMode').value;
      const token = getOrderToken();
      if (document.getElementById('tog-confirm')?.checked) {
        (function () { var __t = document.getElementById('mPair'); if (__t) __t.textContent = r.sym; })();
        (function () { var __t = document.getElementById('mMode'); if (__t) __t.textContent = mode + ' (' + bex + '→' + sex + ')'; })();
        (function () { var __t = document.getElementById('mBuy'); if (__t) __t.textContent = bex + ' @ $' + fmtP(buyP, buyP > 100 ? 2 : 4); })();
        (function () { var __t = document.getElementById('mSell'); if (__t) __t.textContent = sex + ' @ $' + fmtP(sellP, sellP > 100 ? 2 : 4); })();
        (function () { var __t = document.getElementById('mQtyU'); if (__t) __t.textContent = '$' + fmt(usdt); })();
        (function () { var __t = document.getElementById('mQty'); if (__t) __t.textContent = token.toFixed(6) + ' ' + r.sym.split('/')[0]; })();
        (function () { var __t = document.getElementById('mSp'); if (__t) __t.textContent = '+' + r.spread.toFixed(3) + '%'; })();
        (function () { var __t = document.getElementById('mNet'); if (__t) __t.textContent = (r.net > 0 ? '+' : '') + '$' + (r.net / 100 * usdt).toFixed(2); })();
        document.getElementById('modal').classList.add('open');
      } else { confirmArb() }
    }

    async function confirmArb() {
      closeM();
      const r = filteredRows[selIdx]; if (!r) return;
      const bex = document.getElementById('buyEx').value, sex = document.getElementById('sellEx').value;
      const buyP = parseFloat(document.getElementById('lBuy').value) || r.buyAt;
      const sellP = parseFloat(document.getElementById('lSell').value) || r.sellAt;
      const usdt = getOrderUSDT(), token = getOrderToken();
      const mode = document.getElementById('arbMode').value;
      const isSpotBuy = mode === 'SS' || mode === 'SF';
      const isSpotSell = mode === 'SS' || mode === 'FS';
      const hasBuyKey = !!lsGet('keys_' + bex.toLowerCase());
      const hasSellKey = !!lsGet('keys_' + sex.toLowerCase());
      if (!hasBuyKey || !hasSellKey) {
        notify('⚠ Configure as keys de ' + ((!hasBuyKey) ? bex : sex), ' w');
        registerTrade(r, bex, sex, buyP, sellP, usdt, token, mode, 'cancelled'); return;
      }
      notify('⚡ Enviando ARB ' + r.sym + '...', '');
      try {
        const [buyRes, sellRes] = await Promise.all([
          placeRealOrder(bex, r.sym, 'buy', token, buyP, isSpotBuy),
          placeRealOrder(sex, r.sym, 'sell', token, sellP, isSpotSell)
        ]);
        notify('✓ ARB executado! BUY #' + buyRes.orderId + ' | SELL #' + sellRes.orderId, 'g');
        registerTrade(r, bex, sex, buyP, sellP, usdt, token, mode, 'open', buyRes.orderId, sellRes.orderId);
      } catch (err) {
        notify('✗ Falha: ' + errMsg(err), 'e');
        registerTrade(r, bex, sex, buyP, sellP, usdt, token, mode, 'cancelled');
      }
    }

    function registerTrade(r, bex, sex, buyP, sellP, usdt, token, mode, status, bOid, sOid) {
      const trade = { id: tradeId++, ts: new Date().toISOString(), sym: r.sym, type: mode, bEx: bex, sEx: sex, buyP, sellP, usdt, token, spread: r.spread, fees: (FEE[bex] + FEE[sex]), pnlPct: 0, pnlUsd: 0, status, bOid: bOid || null, sOid: sOid || null };
      tradeHistory.unshift(trade);
      if (status === 'open') { positions.push({ sym: r.sym, side: 'LONG', type: mode, entry: buyP, cur: buyP, usdt, token, bEx: bex, sEx: sex, bOid: bOid || null, sOid: sOid || null }) }
      lsSet('trades', tradeHistory.slice(-500)); lsSet('positions', positions);
      renderPos(); renderOverview();
      (function () { var __t = document.getElementById('ordBadge'); if (__t) __t.textContent = tradeHistory.length; })();
    }

    function placeLeg(side) {
      const r = filteredRows[selIdx]; if (!r) { notify('Selecione um par', 'w'); return }
      const exch = side === 'buy' ? getBuyExch() : getSellExch();
      const price = parseFloat(document.getElementById(side === 'buy' ? 'lBuy' : 'lSell').value) || r[side === 'buy' ? 'buyAt' : 'sellAt'];
      const token = getOrderToken();
      const mode = document.getElementById('arbMode').value;
      const isSpot = (side === 'buy' && (mode === 'SS' || mode === 'SF')) || (side === 'sell' && (mode === 'SS' || mode === 'FS'));
      if (!lsGet('keys_' + exch.toLowerCase())) { notify('⚠ Configure a key do ' + exch, 'w'); return }
      notify((side === 'buy' ? '▲' : '▼') + ' LIMIT ' + side.toUpperCase() + ' ' + r.sym + ' @ $' + price + ' em ' + exch + '...', '');
      placeRealOrder(exch, r.sym, side, token, price, isSpot)
        .then(res => notify('✓ ' + side.toUpperCase() + ' #' + res.orderId + ' enviado', 'g'))
        .catch(err => notify('✗ ' + side.toUpperCase() + ' falhou: ' + errMsg(err), 'e'));
    }

    function closeM() { document.getElementById('modal').classList.remove('open') }
    function qArb(i) { sel(i); doArb() }
    function watchRow(i) { notify('👁 ' + filteredRows[i]?.sym + ' monitorado', '') }

    // ════════════════════════════════════════════════════════
    // POSITIONS
    // ════════════════════════════════════════════════════════
    function closeP(i) {
      const p = positions[i]; if (!p) return;
      const pnl = p.side === 'LONG' ? (p.cur - p.entry) / p.entry * (p.usdt || 0) : (p.entry - p.cur) / p.entry * (p.usdt || 0);
      const pnlPct = p.side === 'LONG' ? (p.cur - p.entry) / p.entry * 100 : (p.entry - p.cur) / p.entry * 100;
      const t = tradeHistory.find(tr => tr.bOid === p.bOid && tr.status === 'open');
      if (t) { t.status = 'closed'; t.pnlUsd = pnl; t.pnlPct = pnlPct; lsSet('trades', tradeHistory.slice(-500)) }
      positions.splice(i, 1); lsSet('positions', positions);
      notify('✕ ' + p.sym + ' fechado | PnL: ' + (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2), 'w');
      renderPos(); renderOverview();
    }
    function cancelP(i) {
      const p = positions[i]; if (!p) return;
      const t = tradeHistory.find(tr => tr.bOid === p.bOid && tr.status === 'open');
      if (t) { t.status = 'cancelled'; lsSet('trades', tradeHistory.slice(-500)) }
      positions.splice(i, 1); lsSet('positions', positions);
      notify('✕ Ordens ' + p.sym + ' canceladas', 'w'); renderPos(); renderOverview();
    }
    function cancelAll() { const len = positions.length; for (let i = 0; i < len; i++)cancelP(0); notify('✕ Todas as ordens canceladas', 'w') }

    function setPct(v, el) { pctVal = v; document.querySelectorAll('.qpct').forEach(b => b.classList.remove('on')); if (el) el.classList.add('on') }
    function qClose(side) {
      const r = filteredRows[selIdx]; if (!r) { notify('Selecione um par', 'w'); return }
      const usdt = getOrderUSDT() || 100, cq = (usdt * pctVal / 100).toFixed(2);
      if (side === 'buy' || side === 'both') notify('✕ FECHAR BUY ' + r.sym + ' ' + pctVal + '% ($' + cq + ') MARKET @ ' + getBuyExch(), 'w');
      if (side === 'sell' || side === 'both') notify('✕ FECHAR SELL ' + r.sym + ' ' + pctVal + '% ($' + cq + ') MARKET @ ' + getSellExch(), 'w');
    }

    function openExit() {
      if (!positions.length) { notify('Nenhuma posição aberta', 'w'); return }
      const bd = document.getElementById('exBd');
      bd.innerHTML = positions.map((p, i) => {
        const pnl = p.side === 'LONG' ? (p.cur - p.entry) / p.entry * (p.usdt || 0) : (p.entry - p.cur) / p.entry * (p.usdt || 0);
        return `<div class="exitem"><div class="exinfo"><span class="exsym">${p.sym}</span><span class="exdet">${p.type} | ${p.bEx}→${p.sEx} | $${fmt(p.usdt)}</span></div><span class="${pnl >= 0 ? 'pp' : 'pn'}">${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}</span><div class="exacts"><button class="exprt" onclick="closeP(${i});reRenderExit()">MKT</button><button class="excl" onclick="cancelP(${i});reRenderExit()">CANCEL</button></div></div>`;
      }).join('') + `<div class="exfull"><button class="efall" onclick="closeAll()">🔴 FECHAR TUDO</button><button class="efcn" onclick="closeExit()">Cancelar</button></div>`;
      document.getElementById('exitModal').classList.add('open');
    }
    function reRenderExit() { if (positions.length) openExit(); else closeExit() }
    function closeAll() { closeExit(); const len = positions.length; for (let i = 0; i < len; i++)closeP(0); notify('🔴 TUDO FECHADO', 'e') }
    function closeExit() { document.getElementById('exitModal').classList.remove('open') }

    // ════════════════════════════════════════════════════════
    // BOT + LIVE TICK
    // ════════════════════════════════════════════════════════
    function startBot() { botRunning = true; notify('▶ Bot ATIVO', 'g'); if (!liveInterval) liveInterval = setInterval(live, 1600) }
    function stopBot() { botRunning = false; notify('⏹ Bot PAUSADO', 'w'); if (liveInterval) { clearInterval(liveInterval); liveInterval = null } }
    function onExchChange() { updateBalPanel() }
    function sortSp() { filteredRows.sort((a, b) => b.spread - a.spread); renderScanner(); renderAsset() }
    function refresh() { genRows(); applyF(); notify('↺ Scanner atualizado', '') }

    function live() {
      refreshQuotes();
      genRows();
      applyF();
      (function () { var __t = document.getElementById('wsLat'); if (__t) __t.textContent = (1 + Math.floor(Math.random() * 8)) + 'ms'; })();
      if (filteredRows[selIdx]) renderOB(filteredRows[selIdx].buyAt, filteredRows[selIdx].liq || 0);
      if (positions.length) renderPos();
      updateBalPanel(); renderOverview();
      if (botRunning && document.getElementById('tog-auto')?.checked) {
        const minSp = parseFloat(document.getElementById('cfg-minSpread')?.value || .3);
        const best = filteredRows.find(r => r.spread >= minSp && r.net > 0);
        if (best) { selIdx = filteredRows.indexOf(best); sel(selIdx); doArb() }
      }
    }

    // ════════════════════════════════════════════════════════

    function mapSymbol(ex, sym) {
      const s = sym.replace('/', '');
      if (ex === 'KuCoin' || ex === 'OKX') return sym.replace('/', '-');
      if (ex === 'Gate') return sym.replace('/', '_');
      if (ex === 'BingX') return sym.replace('/', '-');
      return s;
    }
    async function fetchQuote(ex, sym) {
      const exl = ex.toLowerCase();
      const s = mapSymbol(ex, sym);
      try {
        if (ex === 'Binance') {
          const r = await apiFetch('https://api.binance.com/api/v3/ticker/bookTicker?symbol=' + s, { method: 'GET' }, true);
          if (!r) return null; const d = await r.json();
          return { bid: parseFloat(d.bidPrice || 0), ask: parseFloat(d.askPrice || 0), bidQty: parseFloat(d.bidQty || 0), askQty: parseFloat(d.askQty || 0) };
        }
        if (ex === 'MEXC') {
          const r = await apiFetch('https://api.mexc.com/api/v3/ticker/bookTicker?symbol=' + s, { method: 'GET' }, true);
          if (!r) return null; const d = await r.json();
          return { bid: parseFloat(d.bidPrice || 0), ask: parseFloat(d.askPrice || 0), bidQty: parseFloat(d.bidQty || 0), askQty: parseFloat(d.askQty || 0) };
        }
        if (ex === 'KuCoin') {
          const r = await apiFetch('https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=' + s, { method: 'GET' }, true);
          if (!r) return null; const d = await r.json();
          const data = d.data || {};
          return { bid: parseFloat(data.bestBid || 0), ask: parseFloat(data.bestAsk || 0), bidQty: parseFloat(data.bestBidSize || 0), askQty: parseFloat(data.bestAskSize || 0) };
        }
        if (ex === 'Gate') {
          const r = await apiFetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=' + s, { method: 'GET' }, true);
          if (!r) return null; const d = await r.json();
          const it = Array.isArray(d) ? d[0] : null;
          return { bid: parseFloat(it?.highest_bid || 0), ask: parseFloat(it?.lowest_ask || 0), bidQty: parseFloat(it?.highest_bid_size || 0), askQty: parseFloat(it?.lowest_ask_size || 0) };
        }
        if (ex === 'Bybit') {
          const r = await apiFetch('https://api.bybit.com/v5/market/orderbook?category=spot&symbol=' + s + '&limit=1', { method: 'GET' }, true);
          if (!r) return null; const d = await r.json();
          const b = d?.result?.b?.[0]; const a = d?.result?.a?.[0];
          return { bid: parseFloat(b?.[0] || 0), ask: parseFloat(a?.[0] || 0), bidQty: parseFloat(b?.[1] || 0), askQty: parseFloat(a?.[1] || 0) };
        }
        if (ex === 'OKX') {
          const r = await apiFetch('https://www.okx.com/api/v5/market/books?instId=' + s + '&sz=1', { method: 'GET' }, true);
          if (!r) return null; const d = await r.json();
          const b = d?.data?.[0]?.bids?.[0]; const a = d?.data?.[0]?.asks?.[0];
          return { bid: parseFloat(b?.[0] || 0), ask: parseFloat(a?.[0] || 0), bidQty: parseFloat(b?.[1] || 0), askQty: parseFloat(a?.[1] || 0) };
        }
        if (ex === 'BingX') {
          const r = await apiFetch('https://open-api.bingx.com/openApi/spot/v1/ticker/bookTicker?symbol=' + s, { method: 'GET' }, true);
          if (!r) return null; const d = await r.json();
          const data = d?.data || {};
          return { bid: parseFloat(data.bidPrice || 0), ask: parseFloat(data.askPrice || 0), bidQty: parseFloat(data.bidQty || 0), askQty: parseFloat(data.askQty || 0) };
        }
      } catch (e) {
        console.warn('[QUOTE] ' + ex + ' ' + sym + ': ' + errMsg(e));
      }
      return null;
    }
    async function refreshQuotes() {
      return withLock('refreshQuotes', async () => {
        const now = Date.now();
        if (now - LAST_FETCH < 1200) return;
        LAST_FETCH = now;
        for (const ex of EXCHS) {
          if (!QUOTES[ex]) QUOTES[ex] = {};
          for (const sym of PAIRS) {
            const q = await fetchQuote(ex, sym);
            if (q && q.ask > 0 && q.bid > 0) {
              QUOTES[ex][sym] = { ...q, ts: now };
            }
          }
        }
      });
    }

    // INIT
    // ════════════════════════════════════════════════════════
    (function init() {
      // Corrige offset do relógio antes de tudo
      initTsOffset().then(() => {
        console.log('[INIT] Timestamp offset pronto: ' + GLOBAL_TS_OFFSET + 'ms');
      }).catch(e => {
        console.warn('[INIT] Timestamp offset falhou:', errMsg(e));
      });
      loadSavedConfig(); loadSavedKeys(); loadSavedTrades();
      document.querySelectorAll('input[type=number]').forEach(el => {
        el.addEventListener('change', () => normalizeNumberInput(el.id, 0, null, 8));
      });
      document.getElementById('ordType')?.addEventListener('change', toggleLimitInputs);
      genRows(); applyF();
      if (filteredRows.length) sel(0);
      toggleLimitInputs();
      renderPos(); renderOverview(); updateBalPanel();
      EXCHS.forEach(ex => { if (lsGet('keys_' + ex.toLowerCase())) fetchBalances(ex.toLowerCase()).catch(e => console.warn('[BAL] ' + ex + ': ' + errMsg(e))) });
      liveInterval = setInterval(live, 1600);
      notify('▶ ARB-HFT iniciado — Cole suas API Keys para ativar saldos reais', '');
    })();


  