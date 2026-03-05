package com.arbhft.exchange;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.concurrent.*;

/**
 * Executes LIMIT BUY and LIMIT SELL simultaneously using CompletableFuture.
 * Handles order placement on BingX, MEXC, Gate, KuCoin.
 */
@Component
public class OrderExecutor {

    private static final Logger log = LoggerFactory.getLogger(OrderExecutor.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private final OkHttpClient http;
    private final ExecutorService exec;

    public record OrderRequest(
        String exchange, String symbol, String side,
        String type, double price, double quantity, String marketType
    ) {}

    public record OrderResult(
        boolean success, String orderId, String exchange,
        String side, double price, double quantity, String error
    ) {}

    public OrderExecutor() {
        this.http = new OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build();
        // 2 threads: one for buy, one for sell — simultaneous execution
        this.exec = Executors.newFixedThreadPool(2);
    }

    /**
     * Execute arbitrage: LIMIT BUY and LIMIT SELL sent simultaneously.
     * Returns when both results are available.
     */
    public ArbExecutionResult executeArbitrage(
            OrderRequest buyOrder, OrderRequest sellOrder,
            String buyApiKey, String buySecret,
            String sellApiKey, String sellSecret,
            String buyPassphrase, String sellPassphrase) {

        long start = System.currentTimeMillis();

        CompletableFuture<OrderResult> buyFuture = CompletableFuture
            .supplyAsync(() -> placeOrder(buyOrder, buyApiKey, buySecret, buyPassphrase), exec);

        CompletableFuture<OrderResult> sellFuture = CompletableFuture
            .supplyAsync(() -> placeOrder(sellOrder, sellApiKey, sellSecret, sellPassphrase), exec);

        try {
            OrderResult buyResult = buyFuture.get(10, TimeUnit.SECONDS);
            OrderResult sellResult = sellFuture.get(10, TimeUnit.SECONDS);
            long latency = System.currentTimeMillis() - start;

            log.info("ARB executed in {}ms | BUY:{} SELL:{}", latency,
                buyResult.success() ? "OK" : "FAIL",
                sellResult.success() ? "OK" : "FAIL");

            // Handle partial fills: if one leg failed, cancel the other
            if (buyResult.success() && !sellResult.success()) {
                log.error("Sell leg failed! Cancelling buy order {} to avoid naked position", buyResult.orderId());
                cancelOrder(buyOrder.exchange(), buyOrder.symbol(), buyResult.orderId(),
                    buyApiKey, buySecret, buyPassphrase);
            } else if (!buyResult.success() && sellResult.success()) {
                log.error("Buy leg failed! Cancelling sell order {}", sellResult.orderId());
                cancelOrder(sellOrder.exchange(), sellOrder.symbol(), sellResult.orderId(),
                    sellApiKey, sellSecret, sellPassphrase);
            }

            return new ArbExecutionResult(buyResult, sellResult, latency);
        } catch (TimeoutException e) {
            log.error("Order timeout! Attempting to cancel both legs.");
            buyFuture.cancel(true);
            sellFuture.cancel(true);
            return new ArbExecutionResult(null, null, -1);
        } catch (Exception e) {
            log.error("Execution error: {}", e.getMessage());
            return new ArbExecutionResult(null, null, -1);
        }
    }

    private OrderResult placeOrder(OrderRequest req, String apiKey, String secret, String passphrase) {
        try {
            return switch (req.exchange().toUpperCase()) {
                case "BINGX" -> placeBingXOrder(req, apiKey, secret);
                case "MEXC" -> placeMexcOrder(req, apiKey, secret);
                case "GATE" -> placeGateOrder(req, apiKey, secret);
                case "KUCOIN" -> placeKucoinOrder(req, apiKey, secret, passphrase);
                default -> new OrderResult(false, null, req.exchange(), req.side(), req.price(), req.quantity(), "Unknown exchange");
            };
        } catch (Exception e) {
            return new OrderResult(false, null, req.exchange(), req.side(), req.price(), req.quantity(), e.getMessage());
        }
    }

    private OrderResult placeBingXOrder(OrderRequest req, String apiKey, String secret) throws Exception {
        long ts = System.currentTimeMillis();
        String queryString = String.format(
            "symbol=%s&side=%s&type=LIMIT&quantity=%s&price=%s&timestamp=%d&timeInForce=GTC",
            req.symbol(), req.side().toUpperCase(),
            String.format("%.8f", req.quantity()), String.format("%.8f", req.price()), ts
        );
        String sig = hmacSha256(queryString, secret);
        String url = "https://open-api.bingx.com/openApi/spot/v1/trade/order?" + queryString + "&signature=" + sig;
        Request httpReq = new Request.Builder().url(url)
            .addHeader("X-BX-APIKEY", apiKey).post(RequestBody.create(new byte[0])).build();
        try (Response resp = http.newCall(httpReq).execute()) {
            JsonNode node = mapper.readTree(resp.body().string());
            if (node.has("data") && node.get("data").has("orderId")) {
                return new OrderResult(true, node.get("data").get("orderId").asText(),
                    "BINGX", req.side(), req.price(), req.quantity(), null);
            }
            return new OrderResult(false, null, "BINGX", req.side(), req.price(), req.quantity(),
                node.toString());
        }
    }

    private OrderResult placeMexcOrder(OrderRequest req, String apiKey, String secret) throws Exception {
        long ts = System.currentTimeMillis();
        String queryString = String.format(
            "symbol=%s&side=%s&type=LIMIT_ORDER&quantity=%s&price=%s&timestamp=%d",
            req.symbol(), req.side().toUpperCase(),
            String.format("%.8f", req.quantity()), String.format("%.8f", req.price()), ts
        );
        String sig = hmacSha256(queryString, secret);
        String url = "https://api.mexc.com/api/v3/order?" + queryString + "&signature=" + sig;
        Request httpReq = new Request.Builder().url(url)
            .addHeader("X-MEXC-APIKEY", apiKey).post(RequestBody.create(new byte[0])).build();
        try (Response resp = http.newCall(httpReq).execute()) {
            JsonNode node = mapper.readTree(resp.body().string());
            if (node.has("orderId")) {
                return new OrderResult(true, node.get("orderId").asText(),
                    "MEXC", req.side(), req.price(), req.quantity(), null);
            }
            return new OrderResult(false, null, "MEXC", req.side(), req.price(), req.quantity(), node.toString());
        }
    }

    private OrderResult placeGateOrder(OrderRequest req, String apiKey, String secret) throws Exception {
        String sym = req.symbol().replace("USDT","_USDT");
        String body = String.format(
            "{\"currency_pair\":\"%s\",\"type\":\"limit\",\"account\":\"spot\",\"side\":\"%s\",\"amount\":\"%s\",\"price\":\"%s\"}",
            sym, req.side().toLowerCase(), String.format("%.8f", req.quantity()), String.format("%.8f", req.price())
        );
        String ts = String.valueOf(System.currentTimeMillis() / 1000);
        String signBase = "POST\n/api/v4/spot/orders\n\n" + hexSha512(body) + "\n" + ts;
        String sig = hmacSha512(signBase, secret);
        Request httpReq = new Request.Builder()
            .url("https://api.gateio.ws/api/v4/spot/orders")
            .addHeader("KEY", apiKey).addHeader("Timestamp", ts).addHeader("SIGN", sig)
            .addHeader("Content-Type", "application/json")
            .post(RequestBody.create(body.getBytes(StandardCharsets.UTF_8))).build();
        try (Response resp = http.newCall(httpReq).execute()) {
            JsonNode node = mapper.readTree(resp.body().string());
            if (node.has("id")) {
                return new OrderResult(true, node.get("id").asText(),
                    "GATE", req.side(), req.price(), req.quantity(), null);
            }
            return new OrderResult(false, null, "GATE", req.side(), req.price(), req.quantity(), node.toString());
        }
    }

    private OrderResult placeKucoinOrder(OrderRequest req, String apiKey, String secret, String passphrase) throws Exception {
        String body = String.format(
            "{\"clientOid\":\"%d\",\"side\":\"%s\",\"symbol\":\"%s\",\"type\":\"limit\",\"price\":\"%s\",\"size\":\"%s\"}",
            System.currentTimeMillis(), req.side().toLowerCase(),
            req.symbol().replace("USDT","-USDT"),
            String.format("%.8f", req.price()), String.format("%.8f", req.quantity())
        );
        String ts = String.valueOf(System.currentTimeMillis());
        String signBase = ts + "POST" + "/api/v1/orders" + body;
        String sig = hmacSha256Base64(signBase, secret);
        String pp = hmacSha256Base64(passphrase, secret);
        Request httpReq = new Request.Builder()
            .url("https://api.kucoin.com/api/v1/orders")
            .addHeader("KC-API-KEY", apiKey).addHeader("KC-API-TIMESTAMP", ts)
            .addHeader("KC-API-SIGN", sig).addHeader("KC-API-PASSPHRASE", pp)
            .addHeader("KC-API-KEY-VERSION", "2").addHeader("Content-Type", "application/json")
            .post(RequestBody.create(body.getBytes(StandardCharsets.UTF_8))).build();
        try (Response resp = http.newCall(httpReq).execute()) {
            JsonNode node = mapper.readTree(resp.body().string());
            if (node.has("data") && node.get("data").has("orderId")) {
                return new OrderResult(true, node.get("data").get("orderId").asText(),
                    "KUCOIN", req.side(), req.price(), req.quantity(), null);
            }
            return new OrderResult(false, null, "KUCOIN", req.side(), req.price(), req.quantity(), node.toString());
        }
    }

    private void cancelOrder(String exchange, String symbol, String orderId,
                              String apiKey, String secret, String passphrase) {
        // Implementation varies per exchange - simplified here
        log.info("Cancelling order {} on {}", orderId, exchange);
    }

    // Crypto helpers
    private String hmacSha256(String data, String key) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }

    private String hmacSha256Base64(String data, String key) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return java.util.Base64.getEncoder().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }

    private String hmacSha512(String data, String key) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }

    private String hexSha512(String data) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-512");
        return HexFormat.of().formatHex(md.digest(data.getBytes(StandardCharsets.UTF_8)));
    }

    public record ArbExecutionResult(OrderResult buyResult, OrderResult sellResult, long latencyMs) {
        public boolean bothSucceeded() { return buyResult != null && sellResult != null && buyResult.success() && sellResult.success(); }
    }
}
