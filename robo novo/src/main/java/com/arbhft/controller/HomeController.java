package com.arbhft.controller;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;

@RestController
public class HomeController {
    @GetMapping("/")
    public ResponseEntity<Resource> home() {
        return index();
    }

    @GetMapping("/index.html")
    public ResponseEntity<Resource> index() {
        Path path = Path.of("index.html");
        if (!Files.exists(path)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        FileSystemResource res = new FileSystemResource(path.toFile());
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(res);
    }
}
