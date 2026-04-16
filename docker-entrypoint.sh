#!/bin/sh

echo "Running migrations..."
npx prisma migrate deploy

echo "Starting app..."
node dist/main.js