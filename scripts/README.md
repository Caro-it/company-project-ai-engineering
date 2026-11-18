# `scripts` folder

This folder contains **helper scripts** for the monorepo: development automation, maintenance utilities, repetitive tasks (setup, lint, migrations, data generation, etc.), and internal tooling.

- **Main purpose**: group support tools that do not belong to a specific app, agent, or pipeline but make the team’s work easier.
- **Recommendation**: document each script (what it does, parameters, requirements, usage examples) and keep them reproducible (and safe) across environments.

> _Spanish version: [README.es.md](./README.es.md)._

## Scripts

| Script | What it does |
| --- | --- |
| `seed_incidents.py` | Loads the incidents in `incidents-nexova.csv` into the API |
| `analyze.py` | Incident CSV analysis |
| `nightly_export.py` | Nightly telemetry job (DEV-53): yesterday's CSV in `data/raw/`, pipeline run and `job_runs` record. See [`docs/background-jobs/nightly-export.md`](../docs/background-jobs/nightly-export.md) (Spanish) |
| `cron/` | Triggers for the nightly job: crontab (Linux/macOS) and Task Scheduler (Windows) |
