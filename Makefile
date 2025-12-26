.PHONY: dev build test test-e2e deploy db-init db-init-remote

dev:
	npm run dev

build:
	npm run build:frontend

test:
	npm test

test-e2e:
	npm run test:e2e

deploy:
	npm run deploy

db-init:
	npm run db:init

db-init-remote:
	npm run db:init:remote

typecheck:
	npm run typecheck
