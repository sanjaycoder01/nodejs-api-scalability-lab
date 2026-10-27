# MongoDB Sharding Lab Guide

What we built, how it is configured, and how to test which shard serves a product.

---

## What we achieved

1. Kept the original standalone MongoDB (`mongo-lab`) and Redis untouched.
2. Added a **separate** 2-shard MongoDB cluster (config server + shard1 + shard2 + mongos).
3. Each new node uses its **own Docker volume** (no in-place conversion of `mongo-lab`).
4. Initialized three single-member replica sets (required for sharding; not HA).
5. Started **mongos**, registered both shards, enabled sharding on `api_scalability_lab`.
6. Sharded `products` with hashed shard key `{ productId: "hashed" }`.
7. Copied ~1M products and 100k orders from `mongo-lab` into the new cluster via mongos.
8. Pointed the Node.js API at mongos (`localhost:27018`) and verified the API.

**Important:** Enabling sharding does not move data by itself. We copied data into the new cluster. `mongo-lab` on port `27017` still holds the original dataset.

---

## Architecture

```text
                    Node.js API (:3000)
                           |
                           v
              mongos  host:27018 → container:27017
                           |
          +----------------+----------------+
          |                |                |
     configsvr         shard1           shard2
   (metadata)     (part of products) (part of products)
     :27019           :27018             :27018
   (internal)       (internal)         (internal)

  Still running separately:
    mongo-lab  :27017   (original data, unchanged)
    Redis      :6379
```

| Host port | Service | Role |
|-----------|---------|------|
| `27017` | `mongo-lab` | Original standalone MongoDB |
| `27018` | `sharding-mongos` | Cluster router (what the app uses) |
| `6379` | Redis | Cache |
| _(none)_ | `sharding-configsvr` | Cluster metadata |
| _(none)_ | `sharding-shard1` | Shard 1 data |
| _(none)_ | `sharding-shard2` | Shard 2 data |

Shards listen on **27018 inside their containers**, but that port is **not** published on the host. Host `27018` is **only mongos**.

---

## What we configured

### Docker Compose services (`docker-compose.yml`)

| Service | Container | Purpose |
|---------|-----------|---------|
| `mongo` | `mongo-lab` | Existing DB (preserved) |
| `redis` | `api-scalability-redis` | Existing cache (preserved) |
| `configsvr` | `sharding-configsvr` | Config server replica set `configReplSet` |
| `shard1` | `sharding-shard1` | Shard replica set `shard1ReplSet` |
| `shard2` | `sharding-shard2` | Shard replica set `shard2ReplSet` |
| `mongos` | `sharding-mongos` | Query router → `configReplSet/configsvr:27019` |

### Volumes

| Volume | Stores |
|--------|--------|
| `mongo-lab-data` | Original MongoDB data |
| `redis_data` | Redis AOF data |
| `configsvr-data` | Config server data |
| `shard1-data` | Shard 1 database files |
| `shard2-data` | Shard 2 database files |

**Do not run** `docker compose down -v` — that can delete these volumes, including your original million-product dataset.

### Replica sets (initialized with `rs.initiate`)

| Replica set | Member | Role |
|-------------|--------|------|
| `configReplSet` | `configsvr:27019` | Config server (PRIMARY) |
| `shard1ReplSet` | `shard1:27018` | Shard 1 (PRIMARY) |
| `shard2ReplSet` | `shard2:27018` | Shard 2 (PRIMARY) |

Each set has a single member (learning setup, not highly available).

### Sharding settings

| Setting | Value |
|---------|--------|
| Database | `api_scalability_lab` |
| Sharded collection | `products` |
| Shard key | `{ productId: "hashed" }` |
| `orders` | Copied; **not** sharded (lives on the primary shard) |

Hashed `productId` spreads documents evenly. Queries that include `productId` are typically **targeted** (one shard). Filters on `category` alone are **scatter-gather** (both shards).

### App connection (`.env`)

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27018
MONGODB_DB=api_scalability_lab
REDIS_URL=redis://127.0.0.1:6379
```

To compare against the old standalone DB, temporarily set:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
```

Then restart the API.

---

## Start / status commands

```bash
# Start existing + sharding backends (if stopped)
docker compose up -d

# Status
docker compose ps

# Start API (uses .env → mongos :27018)
npm start

# Automated API checks
npm run verify
```

---

## Test product APIs in the terminal

### Call the API

```bash
# Product on shard1 (example)
curl -s http://127.0.0.1:3000/products/prod-0000001

# Product on shard2 (example)
curl -s http://127.0.0.1:3000/products/prod-0000003

# Pretty-print (if jq is installed)
curl -s http://127.0.0.1:3000/products/prod-0000003 | jq

# Category list (hits BOTH shards — scatter-gather)
curl -s "http://127.0.0.1:3000/products?category=electronics&limit=5"
```

### Known sample productIds and shards

| productId | Shard |
|-----------|--------|
| `prod-0000001` | shard1 (`shard1ReplSet`) |
| `prod-0000002` | shard1 |
| `prod-0000003` | **shard2** (`shard2ReplSet`) |
| `prod-0000004` | **shard2** |
| `prod-0000005` | shard1 |

(Exact placement comes from the hashed key; use explain below to confirm any id.)

---

## Check which shard a productId uses

### Via mongos explain (recommended)

```bash
docker exec -it sharding-mongos mongosh --quiet --eval '
const id = "prod-0000003";
const lab = db.getSiblingDB("api_scalability_lab");
const ex = lab.products.find({ productId: id }).explain("queryPlanner");
print("productId:", id);
print("hashed:", convertShardKeyToHashed(id));
print("stage:", ex.queryPlanner.winningPlan.stage);
print("shard:", ex.queryPlanner.winningPlan.shards[0].shardName);
'
```

Change `id` to any productId. Expect:

- `stage: SINGLE_SHARD`
- `shard: shard1ReplSet` or `shard2ReplSet`

### Confirm the document on each shard

```bash
ID=prod-0000003

docker exec sharding-shard1 mongosh --port 27018 --quiet --eval "
db.getSiblingDB('api_scalability_lab').products.findOne(
  { productId: '$ID' }, { productId: 1, category: 1, _id: 0 }
)
"

docker exec sharding-shard2 mongosh --port 27018 --quiet --eval "
db.getSiblingDB('api_scalability_lab').products.findOne(
  { productId: '$ID' }, { productId: 1, category: 1, _id: 0 }
)
"
```

One returns the document; the other returns `null`.

### Interactive mongos shell

```bash
docker exec -it sharding-mongos mongosh
```

```javascript
use api_scalability_lab

db.products.find({ productId: "prod-0000003" })

db.products.find({ productId: "prod-0000003" }).explain("queryPlanner")

db.products.getShardDistribution()
```

### Category query shows both shards

```bash
docker exec sharding-mongos mongosh --quiet --eval '
const lab = db.getSiblingDB("api_scalability_lab");
const ex = lab.products.find({ category: "electronics" }).limit(5).explain("queryPlanner");
print("stage:", ex.queryPlanner.winningPlan.stage);
print("shards:", ex.queryPlanner.winningPlan.shards.map(s => s.shardName).join(", "));
'
```

Expect `SHARD_MERGE` and both `shard1ReplSet`, `shard2ReplSet`.

---

## Quick reference: open shells

```bash
# App router (same entry point as the API)
docker exec -it sharding-mongos mongosh

# Direct shard access (internal port 27018)
docker exec -it sharding-shard1 mongosh --port 27018
docker exec -it sharding-shard2 mongosh --port 27018

# Config server
docker exec -it sharding-configsvr mongosh --port 27019

# Original standalone (unchanged data)
docker exec -it mongo-lab mongosh
```

---

## Safety reminders

- Prefer `docker compose stop` / `docker compose down` **without** `-v`.
- Never use `docker compose down -v` unless you intend to wipe volumes.
- Host `27018` = mongos only; shards are not exposed on the host.
- Original data remains on `mongo-lab` (`27017`) until you choose to remove it.
