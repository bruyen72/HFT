package com.arbhft.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;

@RestController
@RequestMapping("/proxy")
public class ProxyController {
    // Block headers that can trigger origin restrictions on exchanges
    private static final List<String> BLOCKED=List.of(
        "host",
        "content-length",
        "transfer-encoding",
        "connection",
        "accept-encoding",
        "origin",
        "referer",
        "sec-fetch-site",
        "sec-fetch-mode",
        "sec-fetch-dest",
        "sec-fetch-user"
    );
    private final WebClient client=WebClient.builder()
        .defaultHeader("User-Agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .defaultHeader("Accept","application/json")
        .defaultHeader("Accept-Encoding","identity")
        .codecs(c->c.defaultCodecs().maxInMemorySize(4*1024*1024)).build();
    @RequestMapping(value="/**",method={RequestMethod.GET,RequestMethod.POST,RequestMethod.PUT,RequestMethod.DELETE,RequestMethod.OPTIONS})
    public Mono<ResponseEntity<String>> proxy(@RequestBody(required=false) String body,@RequestHeader HttpHeaders headers,@RequestParam(name="_target") String target,HttpServletRequest request){
        HttpMethod method = HttpMethod.valueOf(request.getMethod());
        String safeTarget;
        try {
            safeTarget = validateTarget(target);
        } catch (IllegalArgumentException e) {
            return Mono.just(ResponseEntity.badRequest().body("{\"error\":\"" + e.getMessage() + "\"}"));
        }

        System.out.println("[PROXY] "+method+" -> "+safeTarget);
        if (method == HttpMethod.OPTIONS) {
            return Mono.just(ResponseEntity.ok().build());
        }

        WebClient.RequestBodySpec req=client.method(method).uri(URI.create(safeTarget))
            .headers(h->{
                headers.forEach((name,values)->{if(BLOCKED.stream().noneMatch(b->b.equalsIgnoreCase(name)))values.forEach(v->h.add(name,v));});
            });
        if(body!=null&&!body.isBlank())req.contentType(MediaType.APPLICATION_JSON).bodyValue(body);
        return req.retrieve().toEntity(String.class)
            .onErrorResume(WebClientResponseException.class,e->{
                System.out.println("[PROXY] "+e.getStatusCode()+" body: "+e.getResponseBodyAsString());
                return Mono.just(ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString()));
            })
            .onErrorResume(e->{
                System.err.println("[PROXY] Erro: "+e.getMessage());
                return Mono.just(ResponseEntity.status(502).body("{\"error\":\""+e.getMessage()+"\"}"));
            });
    }

    private String validateTarget(String target) {
        try {
            URI uri = new URI(target);
            String scheme = uri.getScheme();
            if (scheme == null || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
                throw new IllegalArgumentException("invalid target scheme");
            }
            if (uri.getHost() == null) {
                throw new IllegalArgumentException("invalid target host");
            }
            return uri.toString();
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("invalid target uri");
        }
    }
}
