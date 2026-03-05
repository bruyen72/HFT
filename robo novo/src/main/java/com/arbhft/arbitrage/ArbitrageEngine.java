package com.arbhft.arbitrage;

import com.arbhft.core.BotConfig;
import com.arbhft.exchange.OrderExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class ArbitrageEngine {

    private static final Logger log = LoggerFactory.getLogger(ArbitrageEngine.class);

    private final BotConfig config;
    private final OrderBookManager orderBookManager;
    private final OrderExecutor executor;
    private final ScheduledExecutorService scannerPool;

    private final List<String> symbols = new CopyOnWriteArrayList<>(List.of("BTC/USDT", "ETH/USDT", "SOL/USDT"));
    private final List<String> exchanges = List.of("BingX", "MEXC", "Gate", "KuCoin");

    private volatile boolean isRunning = false;

    public ArbitrageEngine(BotConfig config) {
        this(config, new OrderBookManager(), new OrderExecutor());
    }

    @Autowired
    public ArbitrageEngine(BotConfig config, OrderBookManager orderBookManager, OrderExecutor executor) {
        this.config = config;
        this.orderBookManager = orderBookManager;
        this.executor = executor;
        this.scannerPool = Executors.newSingleThreadScheduledExecutor();
    }

    public void start() {
        if (isRunning)
            return;
        isRunning = true;
        log.info("Starting Arbitrage Engine Scan (50ms interval)");

        // Main HFT Loop - Check spreads every 50ms
        scannerPool.scheduleAtFixedRate(this::scanMarkets, 0, 50, TimeUnit.MILLISECONDS);
    }

    public void stop() {
        isRunning = false;
        scannerPool.shutdown();
        log.info("Arbitrage Engine Stopped.");
    }

    public void addSymbol(String symbol) {
        if (!symbols.contains(symbol))
            symbols.add(symbol);
    }

    private void scanMarkets() {
        if (!isRunning)
            return;

        for (String symbol : symbols) {
            for (int i = 0; i < exchanges.size(); i++) {
                for (int j = i + 1; j < exchanges.size(); j++) {
                    String exA = exchanges.get(i);
                    String exB = exchanges.get(j);

                    // Check SPOT vs SPOT
                    checkArbitrage(exA, exB, symbol, "SPOT", "SPOT");
                    checkArbitrage(exB, exA, symbol, "SPOT", "SPOT");
                }
            }
        }
    }

    private void checkArbitrage(String buyExch, String sellExch, String symbol, String buyType, String sellType) {
        var ask = orderBookManager.getBestAsk(buyExch, symbol, buyType);
        var bid = orderBookManager.getBestBid(sellExch, symbol, sellType);

        if (ask == null || bid == null)
            return;

        double spread = ((bid.price() - ask.price()) / ask.price()) * 100;

        if (spread >= config.getMinSpread()) {
            double liquidity = Math.min(ask.qty() * ask.price(), bid.qty() * bid.price());

            if (liquidity >= config.getMinLiquidity()) {
                log.info("ARB OPPORTUNITY DETECTED! {} | BUY {} @ {} | SELL {} @ {} | SPREAD: {}%",
                        symbol, buyExch, ask.price(), sellExch, bid.price(), String.format("%.3f", spread));

                // Execute only if autoExecute is on
                if (config.isAutoExecute()) {
                    execute(buyExch, sellExch, symbol, ask.price(), bid.price(), config.getOrderSize(), buyType,
                            sellType);
                }
            }
        }
    }

    private void execute(String buyExch, String sellExch, String symbol, double buyPrice, double sellPrice,
            double sizeUsdt, String buyType, String sellType) {
        double qty = sizeUsdt / buyPrice; // approximate size

        var buyReq = new OrderExecutor.OrderRequest(buyExch, symbol, "BUY", "LIMIT", buyPrice, qty, buyType);
        var sellReq = new OrderExecutor.OrderRequest(sellExch, symbol, "SELL", "LIMIT", sellPrice, qty, sellType);

        // This requires credentials from BotConfig config.getKeys(), handled in a full
        // implementation.
        executor.executeArbitrage(buyReq, sellReq, "", "", "", "", "", "");
    }
}
