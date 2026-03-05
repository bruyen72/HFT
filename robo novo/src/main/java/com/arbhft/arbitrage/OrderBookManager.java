package com.arbhft.arbitrage;

import org.springframework.stereotype.Component;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.Map;
import java.util.Collections;

/**
 * Manages order books in memory using O(log n) ConcurrentSkipListMap.
 * Optimized for High-Frequency-Trading reads/writes.
 */
@Component
public class OrderBookManager {

    public record OrderBookEntry(double price, double qty) {
    }

    // Structure: Map<Exchange, Map<Symbol, Map<Type(SPOT/FUTURES), OrderBook>>>
    public record OrderBook(
        ConcurrentSkipListMap<Double, Double> bids, // Descending order normally, handled via iteration
        ConcurrentSkipListMap<Double, Double> asks  // Ascending order naturally
    ) {
        public OrderBook() {
            this(new ConcurrentSkipListMap<>(Collections.reverseOrder()), new ConcurrentSkipListMap<>());
        }
    }

    private final Map<String, Map<String, Map<String, OrderBook>>> books = new ConcurrentHashMap<>();

    public void updateOrderBook(String exchange, String symbol, String type, boolean isBid, double price, double qty) {
        books.putIfAbsent(exchange, new ConcurrentHashMap<>());
        books.get(exchange).putIfAbsent(symbol, new ConcurrentHashMap<>());
        books.get(exchange).get(symbol).putIfAbsent(type, new OrderBook());

        OrderBook ob = books.get(exchange).get(symbol).get(type);

        if (isBid) {
            if (qty == 0)
                ob.bids().remove(price);
            else
                ob.bids().put(price, qty);
        } else {
            if (qty == 0)
                ob.asks().remove(price);
            else
                ob.asks().put(price, qty);
        }
    }

    public OrderBook getOrderBook(String exchange, String symbol, String type) {
        var ex = books.get(exchange);
        if (ex == null)
            return null;
        var sym = ex.get(symbol);
        if (sym == null)
            return null;
        return sym.get(type);
    }

    public OrderBookEntry getBestBid(String exchange, String symbol, String type) {
        OrderBook ob = getOrderBook(exchange, symbol, type);
        if (ob == null || ob.bids().isEmpty())
            return null;
        var entry = ob.bids().firstEntry();
        return new OrderBookEntry(entry.getKey(), entry.getValue());
    }

    public OrderBookEntry getBestAsk(String exchange, String symbol, String type) {
        OrderBook ob = getOrderBook(exchange, symbol, type);
        if (ob == null || ob.asks().isEmpty())
            return null;
        var entry = ob.asks().firstEntry();
        return new OrderBookEntry(entry.getKey(), entry.getValue());
    }
}
