# Segue: scalability benchmark

Measured on 2026-10-04. No flight API query was used: the benchmark makes up its own flights and passengers.

## What was measured

`python -m segue.bench` (run inside the `api` container) does this against the live stack:

1. Seeds N connections at Dubai International (gate C22 to gate B14, 95 minutes apart), each with M made-up passengers. One passenger in eight is on separate tickets.
2. Delays every inbound flight by 25 minutes at the same moment: one `flight.updated` event per connection, published to Redpanda. This is the worst case, a disruption that hits every connection at once.
3. Waits until every event is committed and every message is delivered, then reads the timing records the services wrote.
4. Deletes everything it created.

Each event goes through the whole pipeline: engine, model, Postgres decision and outbox in one transaction, relay, RabbitMQ, consumers, feed rows.

**Machine:** one laptop, 8 CPU threads and 8 GB given to Docker, running all containers (Postgres, Redis, Redpanda, RabbitMQ, API, engine, relay, consumers, poller, web) at once. These are not cloud numbers.

**Two model modes:**

- **Real model:** clef-flash on the local network, called for every decision.
- **Fake model:** the model call is replaced by an instant, policy-based answer (`MODEL_FAKE=true`). This measures the pipeline itself, with the model taken out.

## Results

| Run | Passengers | Events | Decisions delivered | Engine time | End to end | Events / s | Passengers / s | Engine time per event (p50 / p95) |
|---|---|---|---|---|---|---|---|---|
| Real model, 1 engine | 200 | 20 | 540 | 54.03 s | 54.41 s | 0.4 | 3.7 | 2663 / 2984 ms |
| Fake model, 1 engine, 1 consumer | 4,000 | 200 | 11,000 | 92.41 s | 104.65 s | 2.2 | 43.3 | 425 / 626 ms |
| Fake model, 3 engines, 1 consumer | 4,000 | 200 | 11,000 | 50.63 s | 102.87 s | 4.0 | 79.0 | 611 / 966 ms |
| Fake model, 3 engines, 3 consumers | 4,000 | 200 | 11,000 | 55.38 s | 55.78 s | 3.6 | 72.2 | 742 / 1038 ms |

Every run completed: all events processed, all messages delivered, none lost, none duplicated (11,000 decisions and 11,000 deliveries in each fake-model run).

"Engine time" is from the first event published to the last decision committed. "End to end" is to the last message delivered to its audience.

## What the numbers say

- **The model is the limit, not the pipeline.** With the real model one engine handles 3.7 passengers a second; with the model taken out the same engine handles 43.3. The real run made 240 model calls in 54.03 s, about 225 ms a call: the local model server answers one request at a time.
- **Risk caching cuts model calls.** Risk is scored once per connection, not once per passenger. The real run made 240 calls for 200 passengers; scoring risk per passenger would have taken 420 (43% fewer). The saving grows with passengers per connection: 4,400 against 8,200 at 20 passengers per connection.
- **Engines scale out.** Events are keyed by flight across 6 Redpanda partitions, so engine instances share the work. Three engines finished the same load in 50.63 s against 92.41 s for one. Two earlier three-engine runs took 36.4 s and 40.3 s; the spread is the laptop, where the engines compete with every other container for the same 8 threads.
- **Delivery scales out too.** With one consumer instance, delivery was the slow side (102.87 s end to end). With three, the whole run finished in 55.78 s.
- **A full-airport disruption is absorbed, not dropped.** In the one-engine run the last connection waited 92 s for its decisions. Nothing was lost while it waited: events sit in Redpanda, messages in the outbox and RabbitMQ.

## What this does not show

- **No cloud or multi-machine run.** Everything shared one laptop, so adding instances also took CPU from Postgres and the brokers. Separate machines should scale better, but that was not measured.
- **One load shape.** 200 connections of 20 passengers (4,000 passengers), all delayed at once. Not tested: sustained load over hours, or more than 4,000 passengers.
- **The fake model is not a model.** Its runs show what the pipeline can carry if the model keeps up. Real throughput is the "real model" row until the model server handles requests in parallel or is given more instances.
- **Ordering across several consumer instances.** With more than one consumer, two messages about the same passenger sent seconds apart could be applied out of order. It did not happen in these runs, where each passenger gets one event.
- **Email was not part of the load.** Benchmark passengers have no address.

## Run it again

```bash
docker compose exec api python -m segue.bench --connections 20 --passengers 10 --label "real model, 1 engine"
```

```bash
MODEL_FAKE=true docker compose up -d --scale engine=3 --scale consumers=3
```

```bash
docker compose exec api python -m segue.bench --connections 200 --passengers 20 --label "fake model, 3 engines, 3 consumers"
```

```bash
docker compose up -d --scale engine=1 --scale consumers=1
```

The last command puts the real model back. Raw results are in `docs/bench/`.
