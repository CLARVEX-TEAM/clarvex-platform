#!/usr/bin/env bash
SECRET=$(grep -m1 '^CRON_SECRET=' /home/ubuntu/clarvex-app/.env | cut -d= -f2- | tr -d '"')
curl -s -X POST https://app.adrianluna.mx/api/cron/plan-reminder -H "Authorization: Bearer $SECRET"
