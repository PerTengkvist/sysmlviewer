# JSON Schemas for the FMEA/FMECA data

Generated from the pydantic models in `backend/src/domain/fmea/schema.py`. Do not edit by hand.

| File | Data file |
|---|---|
| `fmea-library.schema.json` | `<project>/fmea/library/*.yaml` |
| `fmea-instances.schema.json` | `<project>/fmea/instances.yaml` |
| `fmea-severity.schema.json` | `<project>/fmea/severity.yaml` |

Point an editor at a schema with a first line such as
`# yaml-language-server: $schema=../../../../docs/schemas/fmea-library.schema.json`.
Field descriptions say which mode (`--mode fmea` or `--mode fmeca`) needs a field.

Regenerate after changing the models:

    backend/.venv/bin/python scripts/fmea.py schema --write

`backend/tests/test_fmea_schema.py` fails when these files differ from the models.
