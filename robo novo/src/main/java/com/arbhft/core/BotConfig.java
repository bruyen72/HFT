package com.arbhft.core;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.Map;
import java.util.HashMap;

@Configuration
@ConfigurationProperties(prefix = "bot")
public class BotConfig {

    // Default values if not specified in properties
    private double minSpread = 0.3;
    private double minNet = 0.15;
    private double orderSize = 500.0;
    private int maxOrders = 5;
    private double maxSlippage = 0.08;
    private double stopLoss = 0.50;
    private double maxExposure = 5000.0;
    private double minLiquidity = 50000.0;
    private int webPort = 8080;

    // Toggles
    private boolean autoExecute = false;
    private boolean monitorFunding = true;

    // API Keys (exchange -> Map(key, secret, passphrase))
    private Map<String, Map<String, String>> keys = new HashMap<>();

    public BotConfig() {
    }

    public static BotConfig load() {
        return new BotConfig(); // For the non-Spring boot legacy startup if ever needed
    }

    // Getters and Setters
    public double getMinSpread() {
        return minSpread;
    }

    public void setMinSpread(double minSpread) {
        this.minSpread = minSpread;
    }

    public double getMinNet() {
        return minNet;
    }

    public void setMinNet(double minNet) {
        this.minNet = minNet;
    }

    public double getOrderSize() {
        return orderSize;
    }

    public void setOrderSize(double orderSize) {
        this.orderSize = orderSize;
    }

    public int getMaxOrders() {
        return maxOrders;
    }

    public void setMaxOrders(int maxOrders) {
        this.maxOrders = maxOrders;
    }

    public double getMaxSlippage() {
        return maxSlippage;
    }

    public void setMaxSlippage(double maxSlippage) {
        this.maxSlippage = maxSlippage;
    }

    public double getStopLoss() {
        return stopLoss;
    }

    public void setStopLoss(double stopLoss) {
        this.stopLoss = stopLoss;
    }

    public double getMaxExposure() {
        return maxExposure;
    }

    public void setMaxExposure(double maxExposure) {
        this.maxExposure = maxExposure;
    }

    public double getMinLiquidity() {
        return minLiquidity;
    }

    public void setMinLiquidity(double minLiquidity) {
        this.minLiquidity = minLiquidity;
    }

    public int getWebPort() {
        return webPort;
    }

    public void setWebPort(int webPort) {
        this.webPort = webPort;
    }

    public boolean isAutoExecute() {
        return autoExecute;
    }

    public void setAutoExecute(boolean autoExecute) {
        this.autoExecute = autoExecute;
    }

    public boolean isMonitorFunding() {
        return monitorFunding;
    }

    public void setMonitorFunding(boolean monitorFunding) {
        this.monitorFunding = monitorFunding;
    }

    public Map<String, Map<String, String>> getKeys() {
        return keys;
    }

    public void setKeys(Map<String, Map<String, String>> keys) {
        this.keys = keys;
    }
}
