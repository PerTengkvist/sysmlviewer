# Persistence adapters

## JsonFileProjectRepository (alpha default)

Stores each project as `data/projects/{id}.json`.

## MongoProjectRepository (stub)

Located in [`backend/src/adapters/persistence/mongo_repo.py`](../backend/src/adapters/persistence/mongo_repo.py).

Implements the same `ProjectRepository` port but raises `NotImplementedError`. Wire it in `create_app` when Mongo support is added:

```python
repo = MongoProjectRepository(uri=os.environ["MONGODB_URI"])
```

No MongoDB dependency is required to run the alpha.
