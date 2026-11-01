# Scalable Node.js Backend

A Node.js/Express API deployed on AWS EC2 Ubuntu using PM2 cluster mode,
NGINX reverse proxy, Redis-backed rate limiting, Neon PostgreSQL,
DuckDNS and HTTPS via Certbot.

## Live deployment

-   **Health endpoint:** https://dhruv-scalable-api.duckdns.org/health
-   **Repository:**
    https://github.com/dhruvG110/Scalable-Microservice-Arc

The health endpoint reports application status and the serving process
ID. A health-check benchmark is not a measure of database/API capacity.

## Architecture

``` text
Client --HTTPS:443--> NGINX --HTTP:3000--> Express / Node.js
                                           |-- PM2 cluster workers
                                           |-- Redis (rate-limit store)
                                           `-- Neon PostgreSQL
```

## Stack

-   Node.js (ES modules), Express 5
-   PostgreSQL via Neon and `pg`
-   Redis, `express-rate-limit`, `rate-limit-redis`
-   Helmet, CORS
-   PM2, NGINX
-   AWS EC2 (Ubuntu 24.04 LTS)
-   DuckDNS, Certbot / Let's Encrypt

## Local setup

``` bash
git clone https://github.com/dhruvG110/Scalable-Microservice-Arc.git
cd Scalable-Microservice-Arc
npm ci
```

Create a local `.env` file (never commit it):

``` env
DB_URL="YOUR_NEON_POSTGRES_CONNECTION_STRING"
REDIS_URL="redis://127.0.0.1:6379"
API_RATE_LIMIT_MAX=120
PORT=3000
```

Start Redis and verify it:

``` bash
redis-cli ping
# Expected: PONG
```

Start the app:

``` bash
node index.js
```

Verify locally:

``` bash
curl http://127.0.0.1:3000/health
```

## EC2 deployment outline

1.  Launch Ubuntu EC2 and configure the security group.
2.  Allow SSH (22) only from a trusted IP; allow HTTP (80) and
    HTTPS (443) publicly. Do not expose 3000, 6379, or 5432 publicly.
3.  Install Git, Node.js/npm, Redis, NGINX and PM2.
4.  Clone the repository and run `npm ci`.
5.  Create server-side `.env`, restrict permissions, and verify Neon and
    Redis connectivity.
6.  Start the app with PM2.
7.  Configure NGINX to proxy public traffic to `127.0.0.1:3000`.
8.  Point DuckDNS to the EC2 public IPv4.
9.  Set NGINX `server_name` to the hostname and issue a certificate with
    Certbot.
10. Configure PM2 startup, save the process list, reboot-test, and
    verify HTTPS.

## PM2 commands

``` bash
# Start in cluster mode
pm2 start index.js --name scalable-api -i 1

# Scale to two workers (the deployed small EC2 used two)
pm2 scale scalable-api 2

pm2 status
pm2 describe scalable-api
pm2 logs scalable-api --lines 100
pm2 restart scalable-api
pm2 reload scalable-api
pm2 stop scalable-api
pm2 flush

# Persist process list for reboot restoration
pm2 save

# Generate the systemd startup command; run the exact command PM2 prints
pm2 startup
```

Verify the systemd service name printed by PM2. The service is often
`pm2-ubuntu`, but do not assume that name if your output differs. On a
small instance, more workers are not automatically better: they consume
RAM and share CPU/database resources.

## Redis commands

``` bash
sudo systemctl status redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
redis-cli ping
# Expected: PONG
redis-cli
```

Keep Redis private/local. Never expose port 6379 publicly.

## NGINX commands

``` bash
sudo systemctl status nginx
sudo nano /etc/nginx/sites-available/scalable-api

# One-time site enablement
sudo ln -s /etc/nginx/sites-available/scalable-api /etc/nginx/sites-enabled/scalable-api

# Always validate before reload
sudo nginx -t
sudo systemctl reload nginx

curl -I http://127.0.0.1/health
```

Example HTTP reverse-proxy server block (replace hostname):

``` nginx
server {
    listen 80;
    server_name your-api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Certbot / HTTPS commands

``` bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Ensure NGINX server_name exactly matches the hostname first
sudo certbot --nginx -d your-api.example.com

# Test automatic renewal
sudo certbot renew --dry-run
```

Allow inbound TCP 443 in the EC2 security group. Keep port 80 available
for HTTP-to-HTTPS redirect and ACME HTTP validation.

## Troubleshooting: mistakes and lessons learned

  ----------------------------------------------------------------------------------------------------
  Symptom                              Cause                   Lesson / fix
  ------------------------------------ ----------------------- ---------------------------------------
  Redis `ClientClosedError` /          Rate-limit middleware   Connect Redis first, then dynamically
  `NOSCRIPT uploading script failed`   was initialized before  import modules that create the
                                       Redis connected         Redis-backed store.

  Redis `Socket already opened`        Connection was          Give connection lifecycle one owner; do
                                       attempted in more than  not connect in both startup and limiter
                                       one place               modules.

  Certbot could not find a matching    NGINX had               Set the exact hostname, run
  NGINX server block                   `server_name _;`        `sudo nginx -t`, reload NGINX, then
                                       instead of the DuckDNS  retry Certbot.
                                       hostname                

  Express warning about                NGINX forwarded proxy   Use a narrow trust setting for the
  `X-Forwarded-For`                    headers but Express did local NGINX proxy; this deployment used
                                       not trust the local     `app.set("trust proxy", "loopback")`.
                                       proxy                   

  Many HTTP 429 responses during load  The configured rate     429s are rejections, not successful
  testing                              limit was reached       throughput. Separate status codes when
                                                               interpreting benchmarks.

  Too many PM2 processes / memory      Worker count was        Select workers based on CPU and RAM.
  pressure                             increased during        This small EC2 setup was kept at two.
                                       experimentation         

  HTTP worked but HTTPS did not        DNS, hostname/server    Check DNS, exact `server_name`, Certbot
                                       block, certificate or   output and EC2 inbound TCP 443.
                                       inbound 443 could be    
                                       missing                 
  ----------------------------------------------------------------------------------------------------

## Security and operations checklist

-   [ ] Keep `.env` out of Git. `git ls-files .env` should produce no
    output.
-   [ ] Restrict server `.env`: `chmod 600 .env`.
-   [ ] If a secret was ever committed, rotate it; deleting it in a
    later commit does not erase Git history.
-   [ ] Do not expose Redis (6379), PostgreSQL (5432), or Node (3000)
    publicly.
-   [ ] Restrict SSH (22) to trusted IPs.
-   [ ] Use HTTPS and verify certificate renewal.
-   [ ] Set CORS to exact frontend origin(s) when a browser frontend is
    connected.
-   [ ] Configure request validation, centralized errors and graceful
    shutdown.
-   [ ] Back up the database and test restoration.
-   [ ] Monitor CPU, memory, disk, application logs, NGINX logs and
    database connectivity.
-   [ ] Test real endpoints under realistic load; health-check
    benchmarks are not DB benchmarks.
-   [ ] Plan for multiple instances/load balancing if availability
    requirements justify it.

## Limitations

This project runs on one EC2 instance. PM2 runs multiple Node.js workers
on that same host; it does not provide multi-instance high availability.
If the instance or host fails, the API can become unavailable. This is a
useful live deployment and learning project, but it is not automatically
a fault-tolerant production architecture.

## Secret hygiene

Never commit `.env`, private SSH keys, DuckDNS tokens, database
passwords, access tokens or cloud credentials. Use placeholders in
documentation and rotate credentials that may have been exposed.
