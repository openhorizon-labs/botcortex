.PHONY: dev test lint ui deploy

dev:            ## install/sync the dev environment
	uv sync

test:           ## run the mock-mode test suite
	uv run pytest

lint:           ## lint + format check
	uv run ruff check .

ui:             ## build the web UI (Next.js static export → ui/out/)
	cd ui && bun install && bun run build

deploy:         ## rsync to the Thor (wire up at milestone 3 — see thor-openarm skill)
	@echo "deploy target not wired yet — milestone 3"
