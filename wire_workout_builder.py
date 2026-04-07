import codecs, json

with open('d:/codex/apps/web/src/main.tsx', 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# 1. Add savingWorkout state and load from plan useEffect
old = """  // Workout Plan state
  const [workoutExercises, setWorkoutExercises] = useState([
    { id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" },
    { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" },
    { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" },
  ]);
  const [workoutDiscarded, setWorkoutDiscarded] = useState(false);

  useEffect(() => {
    if (clientPortal) {
      setEditDraft({
        goal: clientPortal.client.goal,
        status: clientPortal.client.status,
        monthlyPriceGbp: clientPortal.client.monthlyPriceGbp,
        nextRenewalDate: clientPortal.client.nextRenewalDate
      });
    }
  }, [clientPortal]);"""

new = """  // Workout Plan state
  const [workoutExercises, setWorkoutExercises] = useState([
    { id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" },
    { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" },
    { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" },
  ]);
  const [workoutDiscarded, setWorkoutDiscarded] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);

  // Load workout exercises from plan when portal loads
  useEffect(() => {
    const workouts = clientPortal?.plan?.latestVersion?.workouts;
    if (!workouts || workouts.length === 0) return;
    try {
      // Try parsing as JSON exercise objects
      const parsed = JSON.parse(workouts[0]);
      if (Array.isArray(parsed)) {
        setWorkoutExercises(parsed.map((ex, i) => ({ ...ex, id: ex.id ?? i + 1 })));
      }
    } catch {
      // Fallback: convert legacy string array to exercise objects
      setWorkoutExercises(workouts.map((w, i) => ({
        id: i + 1, name: w, tag: "Custom", sets: "3 Sets of 12", duration: "45 Seconds", advanced: ""
      })));
    }
  }, [clientPortal?.plan]);

  useEffect(() => {
    if (clientPortal) {
      setEditDraft({
        goal: clientPortal.client.goal,
        status: clientPortal.client.status,
        monthlyPriceGbp: clientPortal.client.monthlyPriceGbp,
        nextRenewalDate: clientPortal.client.nextRenewalDate
      });
    }
  }, [clientPortal]);"""

if old in content:
    content = content.replace(old, new, 1)
    print('Added workout state and useEffect')
else:
    print('Workout state pattern not found!')

# 2. Update the bottom bar with Save Draft button
old2 = """              {/* Bottom Action Bar */}
              <div className="workout-bottom-bar">
                <div className="workout-save-status">
                  <div className="workout-save-dot" />
                  Last saved 2m ago
                </div>
                <div className="workout-bottom-actions">
                  <button className="workout-discard-btn" onClick={() => { setWorkoutExercises([{ id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" }, { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" }, { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" }]); push("Workout draft discarded - reverted to last saved version"); }}>Discard Draft</button>
                  <button className="workout-publish-btn" onClick={async () => { if (clientPortal?.plan) { await onApprove(clientPortal.plan.id); push("Workout plan approved and published!", "success"); } else { push("No active plan to approve", "error"); } }}>Review &amp; Finalize</button>
                </div>
              </div>"""

new2 = """              {/* Bottom Action Bar */}
              <div className="workout-bottom-bar">
                <div className="workout-save-status">
                  <div className="workout-save-dot" />
                  {savingWorkout ? "Saving..." : "All changes saved"}
                </div>
                <div className="workout-bottom-actions">
                  <button className="workout-discard-btn" onClick={() => { setWorkoutExercises([{ id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" }, { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" }, { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" }]); push("Workout draft discarded - reverted to last saved version"); }}>Discard Draft</button>
                  <button className="workout-publish-btn" onClick={async () => { if (clientPortal?.plan) { setSavingWorkout(true); try { await fetchJson<any>(`/plans/${clientPortal.plan.id}`, { method: "PATCH", body: JSON.stringify({ workouts: JSON.stringify(workoutExercises) }) }); await onApprove(clientPortal.plan.id); push("Workout plan saved and published!", "success"); } catch { push("Failed to save workout plan", "error"); } finally { setSavingWorkout(false); } } else { push("No active plan — generate one from AI Plans first", "error"); } }}>Save &amp; Publish</button>
                </div>
              </div>"""

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Updated workout bottom bar')
else:
    print('Workout bottom bar pattern not found!')

with open('d:/codex/apps/web/src/main.tsx', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Written')
