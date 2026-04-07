import codecs

with open('d:/codex/apps/web/src/main.tsx', 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# Add plan assignment states after metrics state
old = "  const [metrics, setMetrics] = useState<BodyMetric[]>([]);\n  const [metricDraft, setMetricDraft] = useState({ weightKg: '', bodyFatPct: '', waistCm: '', hipsCm: '', armCm: '', thighCm: '', energyScore: '', sleepRating: '' });\n  const [savingMetric, setSavingMetric] = useState(false);"
new = "  const [metrics, setMetrics] = useState<BodyMetric[]>([]);\n  const [metricDraft, setMetricDraft] = useState({ weightKg: '', bodyFatPct: '', waistCm: '', hipsCm: '', armCm: '', thighCm: '', energyScore: '', sleepRating: '' });\n  const [savingMetric, setSavingMetric] = useState(false);\n  const [availablePlans, setAvailablePlans] = useState<ProgramPlan[]>([]);\n  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);\n  const [showNutritionPicker, setShowNutritionPicker] = useState(false);\n  const [assigning, setAssigning] = useState(false);"

if old in content:
    content = content.replace(old, new, 1)
    print('Added plan assignment states')
else:
    print('Pattern not found!')

with open('d:/codex/apps/web/src/main.tsx', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Written')
