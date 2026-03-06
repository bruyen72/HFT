package com.arbhft.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

import java.io.IOException;
import java.util.List;

/**
 * CORS filter customizado — substitui o CorsFilter do Spring.
 *
 * PROBLEMA RESOLVIDO:
 *   O Spring CorsFilter com addAllowedOrigin("*") retornava "Access-Control-Allow-Origin: *".
 *   O Cloudflare Tunnel então injetava também "Access-Control-Allow-Origin: <request-origin>",
 *   resultando em header duplicado ("*, https://hft-six.vercel.app") que o browser rejeita.
 *
 * SOLUÇÃO:
 *   1. Roda com HIGHEST_PRECEDENCE (antes de qualquer outro filtro).
 *   2. Valida o Origin da request contra uma allowlist.
 *   3. Seta EXATAMENTE UM header Access-Control-Allow-Origin no response real.
 *   4. Envolve o response num wrapper que bloqueia qualquer escrita CORS posterior
 *      (feita por Spring MVC, outros filtros, ou código do controller).
 *   5. Para OPTIONS (preflight): responde 200 imediatamente sem chamar a chain.
 */
@Configuration
public class CorsConfig {

    /** Headers CORS que devem existir em apenas uma cópia — qualquer escrita downstream é bloqueada. */
    private static final List<String> CORS_HEADERS = List.of(
        "access-control-allow-origin",
        "access-control-allow-methods",
        "access-control-allow-headers",
        "access-control-allow-credentials",
        "access-control-expose-headers",
        "access-control-max-age"
    );

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public Filter corsFilter() {
        return new Filter() {
            @Override
            public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
                    throws IOException, ServletException {

                HttpServletRequest  request  = (HttpServletRequest)  req;
                HttpServletResponse response = (HttpServletResponse) res;

                String origin        = request.getHeader("Origin");
                String allowedOrigin = resolveOrigin(origin);

                /* ── OPTIONS (preflight) ─────────────────────────────────────────── */
                if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
                    if (allowedOrigin != null) {
                        response.setHeader("Access-Control-Allow-Origin",  allowedOrigin);
                        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
                        response.setHeader("Access-Control-Allow-Headers", "*");
                        response.setHeader("Access-Control-Max-Age",       "3600");
                        response.setHeader("Vary", "Origin");
                    }
                    response.setStatus(HttpServletResponse.SC_OK);
                    return; // sem chain — preflight respondido aqui
                }

                /* ── Requests normais ────────────────────────────────────────────── */
                // 1. Setar CORS no response REAL antes do chain (headers são escritos cedo)
                if (allowedOrigin != null) {
                    response.setHeader("Access-Control-Allow-Origin",  allowedOrigin);
                    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
                    response.setHeader("Vary", "Origin");
                }

                // 2. Wrapper que bloqueia qualquer escrita CORS posterior (Spring MVC, Cloudflare, etc.)
                HttpServletResponseWrapper shielded = new HttpServletResponseWrapper(response) {
                    @Override
                    public void setHeader(String name, String value) {
                        if (!isCorsHeader(name)) super.setHeader(name, value);
                    }
                    @Override
                    public void addHeader(String name, String value) {
                        if (!isCorsHeader(name)) super.addHeader(name, value);
                    }
                };

                chain.doFilter(request, shielded);
            }
        };
    }

    /**
     * Valida o Origin contra a allowlist.
     * Retorna o próprio Origin se permitido, ou null caso contrário.
     */
    private String resolveOrigin(String origin) {
        if (origin == null) return null;

        // Produção Vercel (qualquer deploy: preview + main)
        if (origin.matches("https://[a-zA-Z0-9][a-zA-Z0-9-]*\\.vercel\\.app")) return origin;

        // Localhost para desenvolvimento local
        if (origin.startsWith("http://localhost:")  ||
            origin.startsWith("https://localhost:") ||
            origin.equals("http://localhost")       ||
            origin.equals("https://localhost"))       return origin;

        return null;
    }

    private boolean isCorsHeader(String name) {
        return CORS_HEADERS.stream().anyMatch(h -> h.equalsIgnoreCase(name));
    }
}
