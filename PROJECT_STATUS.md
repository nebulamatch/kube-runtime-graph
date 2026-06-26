# Project Status

## What is working

### Overview / Topology page
- Top-to-bottom hierarchical graph layout is implemented.
- Sidebar and top navigation are available across pages through `DashboardLayout`.
- Pod nodes can be hidden by default and expanded with **Show Pod Details**.
- **Blast Radius** mode is implemented:
  - Clicking a node isolates upstream and downstream paths.
  - Unrelated nodes and edges are dimmed.
- **Time travel** is available as a session-based replay:
  - Live / 5m / 30m / 2h controls.
  - In-memory snapshots are captured while the app is running.
- Request provenance is being captured and shown in the UI:
  - origin service / pod
  - target service / pod
  - endpoint and status metadata on edges
- Edge styling responds to telemetry:
  - normal traffic
  - special service/database paths
  - error paths highlighted in red

### Events page
- API traces are loaded from the backend.
- Service-only filtering is implemented.
- Search, status filtering, and service filtering are implemented.
- Event details can be inspected in the UI.
- The page is already using telemetry-derived service lists, so it no longer depends on a direct services endpoint.

### Logs page
- Live log streaming is working.
- Advanced filtering is implemented:
  - severity chips
  - keyword search
  - regex toggle
  - pause/sync
- Endpoint-based log search is implemented.
- Time-window filtering around a marked log entry is implemented.
- Pod context visibility can be toggled.
- Header and layout now match the dashboard style.

### RBAC page
- RBAC data is exposed by the backend.
- Roles, role bindings, and cluster roles are available in the UI.

### Backend
- Kube context, namespace, pods, services, events, API traces, and RBAC routes exist.
- Graph telemetry includes:
  - source and destination IPs
  - source and destination service/pod identifiers
  - endpoint, method, path, status code, and duration
  - request origin metadata
- Graph topology updates are broadcast to clients.

## What is partially working

### Topology reasoning
- Upstream / downstream isolation works from telemetry edges.
- The graph still depends on what telemetry has been observed in the current session.
- Historical replay is session-based only; it is not persisted across restarts.

### L4 / L7 mismatch detection
- The UI detects likely mismatches from telemetry heuristics.
- This is useful, but it is still heuristic-based rather than a full contract validation engine.

## What is not fully working yet

### Persistent time-travel
- Old topology states are not stored in a database or external cache.
- Refreshing or restarting the app clears the replay history.

### Backend services route issue in some environments
- The frontend previously hit:
  - GET /api/kube/contexts/inClusterContext/namespaces/default/services
- If that returns 404 in a deployment, it usually means one of these:
  - an older backend image is still running
  - the deployed service is not pointing to the current NestJS build
  - the backend container is not exposing the expected route version
- The source code does define the route, so the deployment should be checked if the 404 still appears.

### Topology visuals still need refinement
- Node spacing can still look crowded when many services are present.
- Service grouping / clustering for pod expansion can be improved further.
- A smoother transition when toggling pod details would improve the UX.

## Current topology summary

### Structural layers
- Kubernetes cluster context
- Gateway / entry services
- Core business services
- Auto-discovered database nodes

### Relationship types
- Pod -> Service
- Service -> Service
- Service -> Database
- Error / anomaly flows highlighted from telemetry

### Request origin capture
- Request origin is now attached to telemetry edges.
- The drawer can show origin and destination details.
- This helps trace incidents back to the upstream caller.

## Recommended next steps

1. Persist graph history for true time-travel replay.
2. Add a real backend contract for topology snapshots at specific timestamps.
3. Refine pod clustering so service groups expand/collapse smoothly.
4. Verify the deployed backend image to resolve any remaining 404 route mismatch.
5. Improve automatic node grouping when the graph gets large.
