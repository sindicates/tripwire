PYTHON := $(shell command -v python3.13 || command -v python3.12 || command -v python3.11)
VENV   := backend/.venv
PIP    := $(VENV)/bin/pip
PYTHON_VENV := $(VENV)/bin/python

.PHONY: setup setup-backend setup-frontend setup-mobile install check-python

## Bootstrap the full stack for any developer
setup: check-python setup-backend setup-frontend setup-mobile
	@echo ""
	@echo "Setup complete. Next steps:"
	@echo "  1. cp .env.example .env    # fill in API keys — single file for all services"
	@echo "  2. docker compose up -d"
	@echo "  3. source backend/.venv/bin/activate && cd backend && alembic upgrade head"

check-python:
	@if [ -z "$(PYTHON)" ]; then \
		echo "ERROR: Python 3.11+ not found. Install via: brew install python@3.11"; \
		exit 1; \
	fi
	@echo "Using Python: $(PYTHON) ($$($(PYTHON) --version))"

setup-backend: $(VENV)/bin/activate
	$(PIP) install --quiet --upgrade pip
	$(PIP) install --quiet -r requirements.txt
	$(VENV)/bin/playwright install chromium
	@echo "Backend venv ready at backend/.venv"

$(VENV)/bin/activate:
	$(PYTHON) -m venv $(VENV)

setup-frontend:
	cd frontend && npm install --silent
	@# Symlink root .env into frontend so Next.js picks up NEXT_PUBLIC_* vars
	ln -sf ../.env frontend/.env.local
	@echo "Frontend deps ready"

setup-mobile:
	cd mobile && npm install --silent
	@# Symlink root .env into mobile so Expo picks up EXPO_PUBLIC_* vars
	ln -sf ../.env mobile/.env
	@echo "Mobile deps ready"

## Tear down and rebuild the venv from scratch
reset-venv:
	rm -rf $(VENV)
	$(MAKE) check-python setup-backend
