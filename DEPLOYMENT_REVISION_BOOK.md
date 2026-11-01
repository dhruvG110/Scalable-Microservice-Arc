# Backend Deployment Revision Book

A practical revision guide based on deploying an Express backend to AWS
EC2. Use it as a repeatable checklist for similar projects.

## 1. Deployment map

``` text
Client
  | HTTPS :443
  v
NGINX (TLS termination / reverse proxy)
  | HTTP to 127.0.0.1:3000
  v
Node.js + Express
  |-- PM2 cluster workers
  |-- Redis (rate-limit state)
  `-- Neon PostgreSQL
```

NGINX is the public entry point. Node listens privately on port 3000.
Redis should remain private/local. Neon is a managed remote database.

## 2. What each component does

  Component           Purpose
  ------------------- -------------------------------------------------------------
  EC2                 Virtual Linux server that runs the backend
  Node.js             JavaScript runtime
  Express             HTTP framework and routing/middleware
  PM2                 Process manager; cluster mode can run multiple workers
  Redis               In-memory data store; used here for shared rate-limit state
  PostgreSQL / Neon   Persistent relational database
  NGINX               Reverse proxy; forwards public traffic to Node
  DNS / DuckDNS       Maps a hostname to the server IP
  TLS / HTTPS         Encrypts traffic between client and server
  Certbot             Requests and renews TLS certificates

## 3. Commands to remember

### PM2

``` bash
pm2 start index.js --name scalable-api -i 1
pm2 scale scalable-api 2
pm2 status
pm2 describe scalable-api
pm2 logs scalable-api --lines 100
pm2 restart scalable-api
pm2 reload scalable-api
pm2 stop scalable-api
pm2 flush
pm2 save
pm2 startup
```

-   `-i 1` starts one cluster-mode instance; `-i 2` requests two.
-   Run the exact privileged startup command printed by `pm2 startup`.
-   `pm2 save` saves the process list for restoration after reboot.
-   Verify the service before rebooting.
-   More workers are not always better: they consume RAM and compete for
    CPU and database connections.

### Redis

``` bash
sudo systemctl status redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
redis-cli ping
redis-cli
```

Expected `redis-cli ping` response: `PONG`.

### NGINX

``` bash
sudo systemctl status nginx
sudo nano /etc/nginx/sites-available/scalable-api
sudo nginx -t
sudo systemctl reload nginx
curl -I http://127.0.0.1/health
```

Always run `nginx -t` before reloading.

### Certbot

``` bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-hostname.example
sudo certbot renew --dry-run
```

Before Certbot: 1. DNS must resolve to the EC2 public IP. 2. NGINX must
have an exact matching `server_name`. 3. `sudo nginx -t` must pass. 4.
Inbound TCP 80 must be reachable for HTTP validation. 5. Inbound TCP 443
must be allowed for HTTPS.

## 4. Problems encountered and their lessons

### A. Redis was not connected when the rate limiter initialized

**Observed:** `ClientClosedError` and
`NOSCRIPT uploading script failed`.

**Why:** ES module static imports execute before the server startup
function. The rate limiter created a Redis-backed store before Redis
connected.

**Lesson:** Connect Redis first, then dynamically import modules that
construct Redis-dependent middleware.

Illustrative pattern:

``` js
if (!redisClient.isOpen) {
  await redisClient.connect();
}

const [{ default: routes }, { default: apiLimiter }] =
  await Promise.all([
    import("./route.js"),
    import("./rateLimiter.js")
  ]);
```

Keep the actual connection in one place. Do not also call
`redisClient.connect()` inside `rateLimiter.js`.

### B. Redis reported "Socket already opened"

**Why:** Connection was attempted more than once.

**Lesson:** One startup path should own the Redis connection lifecycle.
Check `redisClient.isOpen` before connecting; avoid duplicated
connection code.

### C. Certbot could not find the matching NGINX server block

**Why:** The site used `server_name _;` rather than the DuckDNS
hostname.

**Fix:** Put the exact hostname in `server_name`, validate with
`nginx -t`, reload NGINX, then run Certbot.

### D. Express complained about X-Forwarded-For

**Why:** NGINX forwards client-IP headers, but Express needs an
appropriate trust-proxy setting to interpret them.

**Fix used:** `app.set("trust proxy", "loopback")`, because NGINX runs
on the same host.

**Lesson:** Trust only proxy hops you control. Do not blindly trust
every proxy.

### E. Rate-limit benchmark returned many 429 responses

**Why:** The rate limiter was rejecting requests above its configured
limit.

**Lesson:** Separate 2xx responses from 429 responses. A benchmark
dominated by 429s does not measure database throughput.

### F. Worker count was increased aggressively during experiments

**Lesson:** The EC2 instance had limited RAM. Two PM2 workers were used
in the final setup. Benchmark CPU, memory, latency, error rate and DB
connection use before increasing workers.

## 5. Reusable checklist for a similar backend

### Application readiness

-   [ ] Organize routes, controllers/services, database access and
    middleware.
-   [ ] Validate incoming request data.
-   [ ] Add centralized error handling.
-   [ ] Add health and readiness endpoints.
-   [ ] Configure Helmet.
-   [ ] Configure CORS for known frontend origins only.
-   [ ] Add rate limiting; decide whether state must be shared across
    workers.
-   [ ] Use PostgreSQL connection pooling.
-   [ ] Handle graceful shutdown and close Redis/database connections.
-   [ ] Keep secrets in environment variables, never source code.

### Infrastructure readiness

-   [ ] Choose EC2 size and region appropriate to resource needs.
-   [ ] Allow SSH from trusted IP only; allow HTTP/HTTPS as required.
-   [ ] Do not expose 3000, 6379 or 5432 publicly.
-   [ ] Install Git, Node.js/npm, Redis, NGINX and PM2.
-   [ ] Clone repository and run `npm ci`.
-   [ ] Create server-side `.env`; set `chmod 600 .env`.
-   [ ] Verify PostgreSQL connectivity and Redis `PONG`.
-   [ ] Start with PM2 and inspect logs.
-   [ ] Configure NGINX reverse proxy; validate with `nginx -t`.
-   [ ] Configure DNS and exact NGINX `server_name`.
-   [ ] Install HTTPS certificate; allow inbound 443.
-   [ ] Test renewal with `certbot renew --dry-run`.
-   [ ] Configure PM2 startup, save process list and test after reboot.

### After deployment

-   [ ] Test public health endpoint over HTTPS.
-   [ ] Test real CRUD routes and expected error cases.
-   [ ] Confirm rate limiting returns 429 only when expected.
-   [ ] Check PM2, Redis, NGINX and application logs.
-   [ ] Monitor CPU, RAM, disk, network and DB connections.
-   [ ] Automate database backups and periodically test restore.
-   [ ] Rotate any secret that was ever committed or exposed.
-   [ ] Document deployment and rollback procedures.
-   [ ] Review EC2, EBS, public IPv4, data transfer and database costs.

## 6. Git and secret hygiene

``` bash
# No output expected if .env is not tracked
git ls-files .env

git status
git check-ignore -v .env
```

Deleting a secret in a later commit does not remove it from earlier Git
commits. Rotate any real password/token that was committed. Never paste
secrets into chat, tickets, screenshots or README files.

Example `.gitignore`:

``` gitignore
node_modules/
.env
.env.*
!.env.example
logs/
*.log
```

## 7. Production-readiness reality check

One EC2 host with PM2 cluster mode is a valid deployment, but it is
still one failure domain. If the instance fails, all workers and the
local NGINX proxy go down together.

For stronger availability, consider multiple EC2 instances across
Availability Zones, an Application Load Balancer, an Auto Scaling Group,
managed cache/database availability, backups and restore drills,
centralized logs/metrics/alarms, and rollback procedures.

Add these when reliability, traffic and budget justify them---not just
for complexity.

## 8. Quick pre-flight checklist

Before calling a backend deployed, verify:

1.  App starts cleanly.
2.  Redis returns `PONG`.
3.  Database connection succeeds.
4.  `pm2 status` shows expected workers online.
5.  `sudo nginx -t` passes.
6.  DNS resolves to the current public IP.
7.  HTTP health check works.
8.  HTTPS health check works and certificate is valid.
9.  PM2 process list survives reboot.
10. Logs, backups and security rules have been reviewed.
