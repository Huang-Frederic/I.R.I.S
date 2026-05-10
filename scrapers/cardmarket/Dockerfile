FROM apify/actor-node:22

COPY --chown=myuser package*.json ./

RUN npm install --include=dev --audit=false

COPY --chown=myuser . ./

CMD npx tsx src/main.ts
