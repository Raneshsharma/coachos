import codecs

with open('d:/codex/apps/web/src/main.tsx', 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# Add useEffect to load plans
old = """  // Load notes when profile opens
  useEffect(() => {
    if (profileClientId) {
      fetchJson<ClientNote[]>(`/clients/${profileClientId}/notes`).then(setNotes).catch(() => setNotes([]));
      fetchJson<BodyMetric[]>(`/clients/${profileClientId}/metrics`).then(setMetrics).catch(() => setMetrics([]));
    }
  }, [profileClientId]);"""

new = """  // Load notes and metrics when profile opens
  useEffect(() => {
    if (profileClientId) {
      fetchJson<ClientNote[]>(`/clients/${profileClientId}/notes`).then(setNotes).catch(() => setNotes([]));
      fetchJson<BodyMetric[]>(`/clients/${profileClientId}/metrics`).then(setMetrics).catch(() => setMetrics([]));
      fetchJson<ProgramPlan[]>(`/plans`).then(setAvailablePlans).catch(() => {});
    }
  }, [profileClientId]);"""

if old in content:
    content = content.replace(old, new, 1)
    print('Added plan loading useEffect')
else:
    print('useEffect pattern not found!')

with open('d:/codex/apps/web/src/main.tsx', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Written')
