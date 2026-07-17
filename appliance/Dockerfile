FROM oven/bun:1.3.14-debian

WORKDIR /opt/superset-local
COPY . .
# The appliance runs the API/web services only. Electron native rebuilds are
# intentionally excluded from this headless image and are built by desktop CI.
RUN bun install --frozen-lockfile --ignore-scripts

ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
ARG NEXT_PUBLIC_WEB_URL=http://127.0.0.1:3000
ARG NEXT_PUBLIC_ELECTRIC_URL=http://127.0.0.1:8787

ENV NODE_ENV=production \
    SUPERSET_LOCAL_MODE=true \
    NEXT_PUBLIC_SUPERSET_LOCAL_MODE=true \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL} \
    NEXT_PUBLIC_ADMIN_URL=${NEXT_PUBLIC_WEB_URL} \
    NEXT_PUBLIC_DESKTOP_URL=${NEXT_PUBLIC_WEB_URL} \
    NEXT_PUBLIC_MARKETING_URL=${NEXT_PUBLIC_WEB_URL} \
    NEXT_PUBLIC_DOCS_URL=${NEXT_PUBLIC_WEB_URL} \
    NEXT_PUBLIC_RELAY_URL=http://127.0.0.1:9 \
    NEXT_PUBLIC_STREAMS_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_ELECTRIC_URL=${NEXT_PUBLIC_ELECTRIC_URL} \
    NEXT_PUBLIC_POSTHOG_KEY=phc_local_disabled \
    NEXT_PUBLIC_POSTHOG_HOST=http://127.0.0.1:9 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    DATABASE_URL_UNPOOLED=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-only-not-used-at-runtime \
    SUPERSET_INTERNAL_API_URL=http://127.0.0.1:3001 \
    GH_APP_ID=0 \
    GH_APP_PRIVATE_KEY=local-disabled \
    GH_WEBHOOK_SECRET=local-disabled \
    QSTASH_TOKEN=local-disabled \
    QSTASH_URL=http://127.0.0.1:9 \
    QSTASH_CURRENT_SIGNING_KEY=local-disabled \
    QSTASH_NEXT_SIGNING_KEY=local-disabled \
    POSTHOG_API_KEY=local-disabled \
    POSTHOG_API_HOST=http://127.0.0.1:9 \
    POSTHOG_PROJECT_ID=0 \
    RESEND_API_KEY=local-disabled \
    STRIPE_SECRET_KEY=sk_test_local_disabled \
    STRIPE_WEBHOOK_SECRET=whsec_local_disabled \
    STRIPE_PRO_MONTHLY_PRICE_ID=price_local_disabled \
    STRIPE_PRO_YEARLY_PRICE_ID=price_local_disabled \
    LINEAR_CLIENT_ID=local-disabled \
    LINEAR_CLIENT_SECRET=local-disabled \
    SLACK_CLIENT_ID=local-disabled \
    SLACK_CLIENT_SECRET=local-disabled \
    RELAY_URL=http://127.0.0.1:9 \
    SKIP_ENV_VALIDATION=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

RUN bun run --cwd apps/api build && bun run --cwd apps/web build

ENV SKIP_ENV_VALIDATION=
EXPOSE 3000 3001 8787

CMD ["bun", "run", "--cwd", "apps/web", "start"]
