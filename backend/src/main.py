from adapters.api.app import app, create_app
from cli import main, parse_args, resolve_startup

__all__ = ["app", "create_app", "main", "parse_args", "resolve_startup"]

if __name__ == "__main__":
    main()
