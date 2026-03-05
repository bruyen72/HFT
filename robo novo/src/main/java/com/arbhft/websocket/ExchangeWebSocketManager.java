package com.arbhft.websocket;

import com.arbhft.arbitrage.ArbitrageEngine;
import com.arbhft.core.BotConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ExchangeWebSocketManager {

    private static final Logger log = LoggerFactory.getLogger(ExchangeWebSocketManager.class);

    private final BotConfig config;
    private final ArbitrageEngine engine;

    public ExchangeWebSocketManager(BotConfig config, ArbitrageEngine engine) {
        this.config = config;
        this.engine = engine;
    }

    public void connectAll() {
        log.warn("WebSocket manager not implemented yet. Skipping WS connections.");
    }

    public void disconnectAll() {
        log.info("WebSocket manager disconnected.");
    }
}
