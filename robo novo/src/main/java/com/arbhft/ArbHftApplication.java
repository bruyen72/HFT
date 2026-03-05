package com.arbhft;

import com.arbhft.arbitrage.ArbitrageEngine;
import com.arbhft.core.BotConfig;
import com.arbhft.server.WebServer;
import com.arbhft.websocket.ExchangeWebSocketManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * ARB-HFT Crypto Arbitrage Engine
 * Supports: SPOT/SPOT, SPOT/FUTURES, FUTURES/FUTURES
 * Exchanges: BingX, MEXC, Gate.io, KuCoin
 */
public class ArbHftApplication {

    private static final Logger log = LoggerFactory.getLogger(ArbHftApplication.class);

    public static void main(String[] args) throws Exception {
        log.info("=== ARB-HFT Engine v1.0.0 Starting ===");

        // Load configuration
        BotConfig config = BotConfig.load();

        // Start arbitrage engine (core)
        ArbitrageEngine engine = new ArbitrageEngine(config);

        // Start WebSocket manager (connects to all exchanges)
        ExchangeWebSocketManager wsManager = new ExchangeWebSocketManager(config, engine);
        wsManager.connectAll();

        // Start engine loop
        engine.start();

        // Start web UI server
        WebServer server = new WebServer(config, engine, wsManager);
        server.start();

        log.info("System ready. Web UI: http://localhost:{}", config.getWebPort());

        // Shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("Shutting down...");
            engine.stop();
            wsManager.disconnectAll();
            server.stop();
        }));
    }
}
