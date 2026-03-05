package com.arbhft.server;

import com.arbhft.arbitrage.ArbitrageEngine;
import com.arbhft.core.BotConfig;
import com.arbhft.websocket.ExchangeWebSocketManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

import java.util.HashMap;
import java.util.Map;

@SpringBootApplication(scanBasePackages = "com.arbhft")
public class WebServer {

    private static final Logger log = LoggerFactory.getLogger(WebServer.class);

    private final BotConfig config;
    private final ArbitrageEngine engine;
    private final ExchangeWebSocketManager wsManager;
    private ConfigurableApplicationContext context;

    public WebServer(BotConfig config, ArbitrageEngine engine, ExchangeWebSocketManager wsManager) {
        this.config = config;
        this.engine = engine;
        this.wsManager = wsManager;
    }

    public synchronized void start() {
        if (context != null) {
            return;
        }
        SpringApplication app = new SpringApplication(WebServer.class);
        Map<String, Object> defaults = new HashMap<>();
        defaults.put("server.port", String.valueOf(config.getWebPort()));
        defaults.put("spring.main.banner-mode", "off");
        app.setDefaultProperties(defaults);
        context = app.run();
        log.info("Web server started on port {}", config.getWebPort());
    }

    public synchronized void stop() {
        if (context != null) {
            context.close();
            context = null;
            log.info("Web server stopped");
        }
    }
}
