worker_processes auto;
error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # ── Logging ────────────────────────────────────────────────
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" $request_time';
    access_log /var/log/nginx/access.log main;

    # ── Performance ────────────────────────────────────────────
    sendfile            on;
    tcp_nopush          on;
    tcp_nodelay         on;
    keepalive_timeout   65;
    types_hash_max_size 2048;
    server_tokens       off;

    # ── Compression ────────────────────────────────────────────
    gzip              on;
    gzip_vary         on;
    gzip_proxied      any;
    gzip_comp_level   6;
    gzip_types
        text/plain text/css text/javascript application/javascript
        application/json application/xml image/svg+xml
        font/woff font/woff2;

    # ── Rate limiting zones ────────────────────────────────────
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=2r/m;

    # ── Upstream backend ───────────────────────────────────────
    upstream backend {
        server backend:3002;
        keepalive 32;
    }

    # ── HTTP → HTTPS redirect ──────────────────────────────────
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # ── HTTPS main server ──────────────────────────────────────
    server {
        listen 443 ssl http2;
        server_name app.smartnyumba.com;

        # SSL
        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 1d;

        # ── Security headers ───────────────────────────────────
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options    "nosniff"         always;
        add_header X-Frame-Options           "DENY"            always;
        add_header X-XSS-Protection          "1; mode=block"   always;
        add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy        "camera=(), microphone=(), geolocation=()" always;

        root /usr/share/nginx/html;
        index index.html;

        # ── API proxy ──────────────────────────────────────────
        location /api/ {
            limit_req zone=api burst=20 nodelay;

            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Upgrade           $http_upgrade;
            proxy_set_header   Connection        "upgrade";
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
            proxy_buffering    off;
        }

        # Stricter rate limit on auth endpoints
        location /api/auth/login {
            limit_req zone=auth burst=5 nodelay;
            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }

        # ── Uploads (served by nginx, not Express) ─────────────
        location /uploads/ {
            alias /usr/share/nginx/uploads/;
            expires 7d;
            add_header Cache-Control "public, immutable";
            # Prevent XSS via uploaded files
            add_header Content-Disposition "attachment";
            add_header X-Content-Type-Options "nosniff";
        }

        # ── Static frontend assets (cache-busted by hash) ──────
        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            gzip_static on;
        }

        # ── SPA fallback ───────────────────────────────────────
        location / {
            try_files $uri $uri/ /index.html;
            # No caching for index.html (it references hashed assets)
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            expires 0;
        }
    }
}