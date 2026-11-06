with open('/home/ubuntu/clarvex/compartido/bin/cron-authenticated-post.sh', 'r') as f:
    content = f.read()
old = "  '/api/cron/capture-alert')"
new = "  '/api/cron/capture-alert'|\\\n  '/api/cron/auto-assume-attendance')"
content = content.replace(old, new)
with open('/home/ubuntu/clarvex/compartido/bin/cron-authenticated-post.sh', 'w') as f:
    f.write(content)
print('OK')
