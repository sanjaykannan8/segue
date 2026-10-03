# Airport config

One file per transfer airport, named by IATA code (`DXB.yaml`). An airport with no file uses the defaults in `backend/segue/core/buffer.py`.

| Key | Meaning |
|---|---|
| `gate_close_min` | Minutes before departure that the gate closes |
| `deplane_min` | Minutes for a mid-cabin passenger to leave the aircraft |
| `deplane_per_row_s` | Extra seconds per seat row behind row 20 (rows ahead of it get the time back) |
| `queue_min` | Transfer security queue, used when there is no live figure |
| `walk_same_terminal_min`, `walk_other_terminal_min` | Walking time defaults |
| `walk` | Exact walking minutes for a terminal pair, as `"arrival>departure"` |
| `assistance_factor` | Multiplier on walking time for a declared assistance need |

These numbers decide the time buffer, so they should come from the airport, not from guesses.
