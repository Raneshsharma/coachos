import { useEffect, useState } from "react";
import type { CheckIn, ClientProfile, ProgramPlan } from "@coachos/domain";

type ClientNote = { id: string; coachId: string; clientId: string; content: string; createdAt: string; updatedAt: string };

const isProd = import.meta.env.PROD;
const apiBase = isProd ? "/api" : "http://localhost:4000/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

type MealEntry = {
  id: string;
  name: string;
  ingredients: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type WorkoutEntry = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  notes: string;
};

type MealPlanDay = {
  day: string;
  meals: MealEntry[];
};

type WorkoutPlanDay = {
  day: string;
  exercises: WorkoutEntry[];
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_SLOTS = ["breakfast","snack1","lunch","snack2","dinner","cheat"] as const;
const SLOT_LABELS: Record<string,string> = {breakfast:"☀️ Breakfast",snack1:"🥜 Morning Snack",lunch:"🥗 Lunch",snack2:"🍎 Afternoon Snack",dinner:"🍗 Dinner",cheat:"🍕 Cheat Meal"};
type MealSlotData = {dish:string;time:string;ingredients:string;calories:number;proteinG:number;carbsG:number;fatG:number};
type WeekMealMap = Record<string,Record<string,MealSlotData>>;
const emptySlot = ():MealSlotData=>({dish:"",time:"",ingredients:"",calories:0,proteinG:0,carbsG:0,fatG:0});

function parseAIPlan(text: string, map: WeekMealMap) {
  const lines = text.split("\n");
  let currentDay = DAYS[0];
  const mealSlotPatterns: [string, string, RegExp][] = [
    ["breakfast", "breakfast", /(breakfast|🍳|meal 1|morning).*?(?:dish|name)[:\s]*(.+?)(?:$|\n)/i],
    ["snack1", "snack", /(snack|🥜|morning snack|11.*am)/i],
    ["lunch", "lunch", /(lunch|🥗|meal 2|afternoon meal).*?(?:dish|name)[:\s]*(.+?)(?:$|\n)/i],
    ["snack2", "snack2", /(afternoon snack|4.*pm|evening snack)/i],
    ["dinner", "dinner", /(dinner|🍗|meal 3|evening meal).*?(?:dish|name)[:\s]*(.+?)(?:$|\n)/i],
    ["cheat", "cheat", /(cheat|🍕|dessert|treat)/i],
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect day: "Day 1 — Monday:" or "Monday:" or "Mon:"
    const dayMatch = trimmed.match(/(?:day\s*\d+\s*[—–-]\s*)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i);
    if (dayMatch) {
      const d = dayMatch[1].toLowerCase().substring(0, 3);
      const dayMap: Record<string,string> = {mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri",sat:"Sat",sun:"Sun"};
      currentDay = dayMap[d] ?? DAYS[0];
      continue;
    }

    // Detect dish name
    const dishMatch = trimmed.match(/(?:dish|name)[:\s]*(.+)/i) || trimmed.match(/^[•\-*]\s*(.+)/);
    const dishName = dishMatch?.[1]?.trim();

    // Detect time
    const timeMatch = trimmed.match(/(\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?)/);
    const time = timeMatch?.[1];

    // Detect macros: "420 kcal · 38g P · 45g C · 12g F" or "Cal: 400 P: 30 C: 40 F: 12"
    const macrosMatch1 = trimmed.match(/(\d+)\s*kcal.*?(\d+)g\s*P.*?(\d+)g\s*C.*?(\d+)g\s*F/i);
    const macrosMatch2 = trimmed.match(/Cal[:\s]*(\d+).*?P[:\s]*(\d+).*?C[:\s]*(\d+).*?F[:\s]*(\d+)/i);
    const macros = macrosMatch1 || macrosMatch2;
    const cal = macros ? Number(macros[1]) : 0;
    const p = macros ? Number(macros[2]) : 0;
    const c = macros ? Number(macros[3]) : 0;
    const f = macros ? Number(macros[4]) : 0;

    // Detect ingredients
    const ingMatch = trimmed.match(/ingredients?[:\s]*(.+)/i);
    const ingredients = ingMatch?.[1]?.trim() || "";

    // Match meal slot
    for (const [slotKey, _label, pattern] of mealSlotPatterns) {
      if (pattern.test(trimmed)) {
        const existing = map[currentDay]?.[slotKey];
        if (existing && (!existing.dish || dishName)) {
          if (dishName) existing.dish = dishName;
          if (time) existing.time = time;
          if (ingredients) existing.ingredients = ingredients;
          if (cal > 0) { existing.calories = cal; existing.proteinG = p; existing.carbsG = c; existing.fatG = f; }
        }
        break;
      }
    }
  }
}

function MealPlannerModal({clientName,macroTargets,onClose,onSave,push,initialPlan}:{clientName:string;macroTargets:{calories:number;proteinG:number;fatG:number;carbsG:number};onClose:()=>void;onSave:(d:WeekMealMap)=>Promise<void>;push:(m:string,t?:string)=>void;initialPlan?:string|null}){
  const [day,setDay]=useState(DAYS[0]);const [edit,setEdit]=useState<string|null>(null);const [saving,setSaving]=useState(false);
  const [data,setData]=useState<WeekMealMap>(()=>{
    const m:WeekMealMap={};DAYS.forEach(d=>{m[d]={};MEAL_SLOTS.forEach(s=>m[d][s]=emptySlot())});
    if(initialPlan){parseAIPlan(initialPlan,m)}
    return m;
  });
  const dayData=data[day]??{};
  const totals=(()=>{let c=0,p=0,cb=0,f=0;MEAL_SLOTS.forEach(s=>{const x=dayData[s];if(x){  c+=x.calories||0;p+=x.proteinG||0;cb+=x.carbsG||0;f+=x.fatG||0}});return{cal:c,pro:p,carb:cb,fat:f}})();
  const upd=(slot:string,field:keyof MealSlotData,val:string|number)=>setData(p=>({...p,[day]:{...p[day],[slot]:{...(p[day]?.[slot]??emptySlot()),[field]:val}}}));
  const handleSave=async()=>{setSaving(true);try{await onSave(data);push("Week meal plan saved!","success");onClose()}catch{push("Failed to save","error")}finally{setSaving(false)}};
  return (<div className="fullscreen-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div className="fullscreen-modal" style={{maxWidth:"960px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
      <div><h2 style={{fontFamily:"var(--font-heading)",fontWeight:800,fontSize:"1.3rem",color:"var(--text-primary)",margin:0}}>🍽️ Meal Planner — {clientName}</h2><p style={{fontFamily:"var(--font-body)",fontSize:"0.8rem",color:"var(--text-secondary)",margin:"0.25rem 0 0 0"}}>Daily Target: {macroTargets.calories}kcal · {macroTargets.proteinG}g P · {macroTargets.carbsG}g C · {macroTargets.fatG}g F</p></div>
      <button className="btn-ghost" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
    </div>
    <div style={{display:"flex",gap:"0.35rem",marginBottom:"1.5rem",flexWrap:"wrap"}}>{DAYS.map(d=><button key={d} onClick={()=>{setDay(d);setEdit(null)}} style={{padding:"0.55rem 1.1rem",borderRadius:"var(--r-full)",border:`2px solid ${day===d?"var(--primary)":"var(--border)"}`,background:day===d?"var(--primary-light)":"var(--bg-card)",color:day===d?"var(--primary-dark)":"var(--text-secondary)",fontFamily:"var(--font-heading)",fontWeight:700,fontSize:"0.82rem",cursor:"pointer"}}>{d}</button>)}</div>
    <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",marginBottom:"1rem"}}>{MEAL_SLOTS.map(s=>{const m=dayData[s]??emptySlot();const e=edit===s;return(<div key={s} className="card" style={{padding:"1rem",border:e?"1px solid var(--primary)":"1px solid var(--border)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:e?"0.75rem":"0"}}><div style={{display:"flex",alignItems:"center",gap:"0.5rem",flex:1,flexWrap:"wrap"}}><span style={{fontFamily:"var(--font-heading)",fontWeight:700,fontSize:"0.85rem",color:"var(--text-primary)"}}>{SLOT_LABELS[s]}</span>{!e&&m.dish&&<span style={{fontFamily:"var(--font-body)",fontSize:"0.78rem",color:"var(--primary)",fontWeight:600}}>{m.dish}</span>}{!e&&m.time&&<span style={{fontFamily:"var(--font-body)",fontSize:"0.7rem",color:"var(--text-muted)"}}>⏰{m.time}</span>}{!e&&m.calories>0&&<span style={{fontFamily:"var(--font-body)",fontSize:"0.72rem",color:"var(--text-secondary)",marginLeft:"auto"}}>{m.calories}kcal · {m.proteinG}gP · {m.carbsG}gC · {m.fatG}gF</span>}</div><button className="btn-ghost btn-xs" onClick={()=>setEdit(e?null:s)}><span className="material-symbols-outlined" style={{fontSize:"0.9rem"}}>{e?"close":"edit"}</span></button></div>{e&&(<div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem"}}><div><label className="input-label">Dish Name</label><input className="input" value={m.dish} onChange={e=>upd(s,"dish",e.target.value)} placeholder="e.g. Overnight Oats"/></div><div><label className="input-label">Time</label><input className="input" value={m.time} onChange={e=>upd(s,"time",e.target.value)} placeholder="e.g. 7:30 AM"/></div></div><div><label className="input-label">Ingredients</label><input className="input" value={m.ingredients} onChange={e=>upd(s,"ingredients",e.target.value)} placeholder="e.g. 80g oats, 150g yogurt"/></div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.5rem"}}>{(["calories","proteinG","carbsG","fatG"]as const).map(k=><div key={k}><label className="input-label">{k==="proteinG"?"Protein(g)":k==="fatG"?"Fat(g)":k==="carbsG"?"Carbs(g)":"Calories"}</label><input className="input" type="number" min="0" value={m[k]||""} onChange={e=>upd(s,k,Number(e.target.value))}/></div>)}</div></div>)}</div>)})}</div>
    <div className="card" style={{padding:"0.75rem 1rem",marginBottom:"1rem",background:"var(--primary-light)",border:"1px solid var(--primary-mid)"}}><div style={{fontFamily:"var(--font-heading)",fontWeight:700,fontSize:"0.85rem",color:"var(--primary-dark)"}}>📊 {day} TOTALS: {totals.cal}kcal · {totals.pro}gP · {totals.carb}gC · {totals.fat}gF</div></div>
    <div style={{display:"flex",gap:"0.75rem"}}><button className="btn-primary" onClick={handleSave} disabled={saving} style={{flex:1}}>{saving?"Saving...":"💾 Save Week Plan"}</button><button className="btn-ghost" onClick={()=>{push("Open AI Coach to generate meal plan","info");onClose()}}>🤖 AI Generate</button></div>
  </div></div>);
}

export function ClientCommandCenter({
  clientId,
  clients,
  onBack,
  push,
}: {
  clientId: string;
  clients: ClientProfile[];
  onBack: () => void;
  push: (message: string, type?: string, opts?: Record<string, unknown>) => unknown;
}) {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [plan, setPlan] = useState<ProgramPlan | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mealDay, setMealDay] = useState<string>("today");
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [workoutDay, setWorkoutDay] = useState<string>("today");
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [weekMeals, setWeekMeals] = useState<MealPlanDay[]>([]);
  const [weekWorkouts, setWeekWorkouts] = useState<WorkoutPlanDay[]>([]);
  const [assignedNutrition, setAssignedNutrition] = useState<string | null>(null);
  const [assignedWorkout, setAssignedWorkout] = useState<string | null>(null);

  const [showMealModal, setShowMealModal] = useState(false);
  const [savingMeals, setSavingMeals] = useState(false);
  const [savingWorkouts, setSavingWorkouts] = useState(false);
  const [savingMacros, setSavingMacros] = useState(false);
  const [savingMedical, setSavingMedical] = useState(false);

  const [editMedical, setEditMedical] = useState(false);
  const [medicalDraft, setMedicalDraft] = useState({
    healthConditions: "" as string,
    allergies: "" as string,
    supplements: "" as string,
    dailyWaterTarget: 2.5,
    dailyStepsTarget: 8000,
  });

  const [macroDraft, setMacroDraft] = useState({
    calories: 0,
    proteinG: 0,
    fatG: 0,
    carbsG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
  });
  const [editMacros, setEditMacros] = useState(false);

  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const [checkInForm, setCheckInForm] = useState({
    weightKg: "",
    bodyFatPct: "",
    waistCm: "",
    energyScore: "",
  });
  const [showCheckInForm, setShowCheckInForm] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [showCheckInHistory, setShowCheckInHistory] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchJson<ClientProfile>(`/clients/${clientId}`),
      fetchJson<ProgramPlan[]>(`/plans?clientId=${clientId}`).catch(() => [] as ProgramPlan[]),
      fetchJson<CheckIn[]>(`/check-ins?clientId=${clientId}`).catch(() => [] as CheckIn[]),
      fetchJson<ClientNote[]>(`/clients/${clientId}/notes`).catch(() => [] as ClientNote[]),
    ])
      .then(([c, plans, cis, ns]) => {
        setClient(c);
        setCheckIns(cis);
        setNotes(ns);
        const p = plans[0] ?? null;
        setPlan(p);
        if (p) {
          try {
            const lv = p.latestVersion as Record<string, unknown>;
            const loadedMeals: MealEntry[] = Array.isArray(lv?.nutritionMeals) ? lv.nutritionMeals : [];
            const loadedWorkouts: WorkoutEntry[] = Array.isArray(lv?.workoutExercises) ? lv.workoutExercises : [];
            const loadedWeekMeals: MealPlanDay[] = Array.isArray(lv?.weekMeals) ? lv.weekMeals : [];
            const loadedWeekWorkouts: WorkoutPlanDay[] = Array.isArray(lv?.weekWorkouts) ? lv.weekWorkouts : [];
            setMeals(loadedMeals);
            setWorkouts(loadedWorkouts);
            setWeekMeals(loadedWeekMeals);
            setWeekWorkouts(loadedWeekWorkouts);
            setAssignedNutrition((lv?.assignedNutrition as string) ?? null);
            setAssignedWorkout((lv?.assignedWorkout as string) ?? null);
          } catch {
            /* ignore malformed JSON */
          }
        }
        const cAny = c as Record<string, unknown>;
        const hc = (cAny.healthConditions as any[]) ?? [];
        const hcLabels = hc.map((h: any) => typeof h === "string" ? h : (h?.label ?? "")).filter(Boolean);
        const supp = (cAny.supplements as string[]) ?? [];
        const allg = (cAny.allergies as string[]) ?? [];
        const water = (cAny.dailyWaterTarget as number) ?? 2.5;
        const steps = (cAny.dailyStepsTarget as number) ?? 8000;
        setMedicalDraft({
          healthConditions: hcLabels.join(", "),
          allergies: allg.join(", "),
          supplements: supp.join(", "),
          dailyWaterTarget: water,
          dailyStepsTarget: steps,
        });
        const mac = cAny.macros as Record<string, number> ?? { calories: c.nutritionCalories ?? 0, proteinG: c.nutritionProteinG ?? 0, fatG: c.nutritionFatG ?? 0, carbsG: c.nutritionCarbsG ?? 0, fiberG: 0, sugarG: 0, sodiumMg: 0 };
        setMacroDraft({
          calories: mac.calories ?? 0,
          proteinG: mac.proteinG ?? 0,
          fatG: mac.fatG ?? 0,
          carbsG: mac.carbsG ?? 0,
          fiberG: mac.fiberG ?? 0,
          sugarG: mac.sugarG ?? 0,
          sodiumMg: mac.sodiumMg ?? 0,
        });
      })
      .catch(() => push("Failed to load client data", "error"))
      .finally(() => setLoading(false));
  }, [clientId]);

  const getDayMeals = (day: string) => {
    if (day === "today") return meals;
    return weekMeals.find((wm) => wm.day === day)?.meals ?? [];
  };

  const getDayWorkouts = (day: string) => {
    if (day === "today") return workouts;
    return weekWorkouts.find((ww) => ww.day === day)?.exercises ?? [];
  };

  const todayIndex = (new Date().getDay() + 6) % 7;

  const totalMealMacros = (() => {
    const m = mealDay === "today" ? meals : getDayMeals(mealDay);
    return {
      calories: m.reduce((s, x) => s + (x.calories || 0), 0),
      proteinG: m.reduce((s, x) => s + (x.proteinG || 0), 0),
      fatG: m.reduce((s, x) => s + (x.fatG || 0), 0),
      carbsG: m.reduce((s, x) => s + (x.carbsG || 0), 0),
    };
  })();

  const saveMeals = async () => {
    setSavingMeals(true);
    try {
      let planId = plan?.id;
      if (!planId) {
        const gen = await fetchJson<any>("/plans/generate", { method: "POST", body: JSON.stringify({ clientId }) });
        planId = gen?.id;
        setPlan(gen);
      }
      if (planId) {
        await fetchJson(`/plans/${planId}`, { method: "PATCH", body: JSON.stringify({ nutritionMeals: meals, weekMeals }) });
        push("Meal plan saved", "success");
      } else {
        push("Could not save — generate a plan first", "error");
      }
    } catch {
      push("Failed to save meals", "error");
    } finally {
      setSavingMeals(false);
    }
  };

  const saveWorkouts = async () => {
    setSavingWorkouts(true);
    try {
      let planId = plan?.id;
      if (!planId) {
        const gen = await fetchJson<any>("/plans/generate", { method: "POST", body: JSON.stringify({ clientId }) });
        planId = gen?.id;
        setPlan(gen);
      }
      if (planId) {
        await fetchJson(`/plans/${planId}`, { method: "PATCH", body: JSON.stringify({ workoutExercises: workouts, weekWorkouts }) });
        push("Workout plan saved", "success");
      } else {
        push("Could not save — generate a plan first", "error");
      }
    } catch {
      push("Failed to save workouts", "error");
    } finally {
      setSavingWorkouts(false);
    }
  };

  const handleSaveMedical = async () => {
    setSavingMedical(true);
    try {
      const payload = {
        healthConditions: medicalDraft.healthConditions
          .split(",").map((s: string) => ({ label: s.trim(), note: "" })).filter((h: any) => h.label),
        allergies: medicalDraft.allergies
          .split(",").map((s: string) => s.trim()).filter(Boolean),
        supplements: medicalDraft.supplements
          .split(",").map((s: string) => s.trim()).filter(Boolean),
        dailyWaterTarget: medicalDraft.dailyWaterTarget,
        dailyStepsTarget: medicalDraft.dailyStepsTarget,
      };
      await fetchJson(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditMedical(false);
      push("Medical info updated", "success");
    } catch {
      push("Failed to save", "error");
    } finally {
      setSavingMedical(false);
    }
  };

  const handleSaveMacros = async () => {
    setSavingMacros(true);
    try {
      await fetchJson(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          nutritionCalories: Number(macroDraft.calories),
          nutritionProteinG: Number(macroDraft.proteinG),
          nutritionFatG: Number(macroDraft.fatG),
          nutritionCarbsG: Number(macroDraft.carbsG),
        }),
      });
      setEditMacros(false);
      push("Macros updated", "success");
    } catch {
      push("Failed to save macros", "error");
    } finally {
      setSavingMacros(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    try {
      const created = await fetchJson<ClientNote>(`/clients/${clientId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: newNote.trim() }),
      });
      setNotes((prev) => [created, ...prev]);
      setNewNote("");
      push("Note added", "success");
    } catch {
      push("Failed to add note", "error");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await fetchJson(`/clients/${clientId}/notes/${noteId}`, {
        method: "DELETE",
      });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      push("Note deleted", "success");
    } catch {
      push("Failed to delete note", "error");
    }
  };

  const handleLogCheckIn = async () => {
    if (!checkInForm.weightKg && !checkInForm.energyScore) return;
    setSavingCheckIn(true);
    try {
      await fetchJson("/check-ins", {
        method: "POST",
        body: JSON.stringify({
          id: `checkin_${Date.now()}`,
          clientId,
          submittedAt: new Date().toISOString(),
          progress: {
            weightKg: checkInForm.weightKg ? Number(checkInForm.weightKg) : null,
            bodyFatPct: checkInForm.bodyFatPct ? Number(checkInForm.bodyFatPct) : null,
            waistCm: checkInForm.waistCm ? Number(checkInForm.waistCm) : null,
            energyScore: checkInForm.energyScore ? Number(checkInForm.energyScore) : null,
          },
          photoCount: 0,
        }),
      });
      const fresh = await fetchJson<CheckIn[]>(`/check-ins?clientId=${clientId}`);
      setCheckIns(fresh);
      setShowCheckInForm(false);
      setCheckInForm({ weightKg: "", bodyFatPct: "", waistCm: "", energyScore: "" });
      push("Check-in logged", "success");
    } catch {
      push("Failed to log check-in", "error");
    } finally {
      setSavingCheckIn(false);
    }
  };

  const initials = (name: string) =>
    name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  if (loading) {
    return (
      <div className="page-view">
        <div className="loading-inner" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "4rem 2rem" }}>
          <div className="spinner" />
          <p className="muted">Loading client command center...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="page-view">
        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.9rem", color: "var(--outline)", marginBottom: "1rem" }}>Client not found.</p>
          <button className="btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const statusLabel =
    client.status === "at_risk" ? "At Risk" : client.status === "trial" ? "Trial" : "Active";
  const statusBadgeClass =
    client.status === "at_risk" ? "badge-danger" : client.status === "trial" ? "badge-warning" : "badge-success";
  const sortedCheckIns = [...checkIns].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
  const latestCi = sortedCheckIns[0] ?? null;
  const prevCi = sortedCheckIns[1] ?? null;
  const weightTrend =
    latestCi?.progress?.weightKg != null && prevCi?.progress?.weightKg != null
      ? Number(latestCi.progress.weightKg) - Number(prevCi.progress.weightKg) < 0
        ? "down"
        : "up"
      : null;

  const adhColor =
    client.adherenceScore < 50 ? "var(--danger)" : client.adherenceScore < 75 ? "var(--warning)" : "var(--primary)";

  const fn700 = { fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em" } as const;

  return (
    <div className="page-view">
      {/* HEADER BAR */}
      <div className="card" style={{ marginBottom: "1.25rem", padding: "1rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              className="btn-ghost btn-sm"
              onClick={onBack}
              style={{ border: "none", padding: "0.4rem 0.75rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>arrow_back</span>
              Back
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "var(--r-md)",
                  background: "linear-gradient(135deg, var(--success-light) 0%, var(--primary-light) 100%)",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "Manrope, sans-serif",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  color: "var(--primary-dark)",
                }}
              >
                {initials(client.fullName)}
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: "Manrope, sans-serif",
                    fontWeight: 800,
                    fontSize: "1.2rem",
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                    margin: 0,
                  }}
                >
                  {client.fullName}
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.1rem" }}>
                  <span className={`badge ${statusBadgeClass}`} style={{ fontSize: "0.65rem" }}>
                    {statusLabel}
                  </span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--outline)" }}>
                    Adh:{" "}
                    <span style={{ fontWeight: 700, color: adhColor }}>{client.adherenceScore}%</span>
                  </span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--outline)" }}>
                    £{client.monthlyPriceGbp}
                    <span style={{ color: "var(--text-muted)" }}>/mo</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* THREE PANEL GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {/* MEDICAL PANEL */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3
              style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 800,
                fontSize: "0.9rem",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                margin: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: "var(--danger)" }}>
                medical_services
              </span>
              Medical
            </h3>
            <button className="btn-ghost btn-xs" onClick={() => setEditMedical((v) => !v)}>
              <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>
                {editMedical ? "close" : "edit"}
              </span>
              {editMedical ? "Cancel" : "Edit"}
            </button>
          </div>

          {editMedical ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div>
                <label
                  style={{ ...fn700, display: "block", marginBottom: "0.2rem" }}
                >
                  Health Conditions
                </label>
                <input
                  className="input"
                  value={medicalDraft.healthConditions}
                  onChange={(e) =>
                    setMedicalDraft((d) => ({ ...d, healthConditions: e.target.value }))
                  }
                  placeholder="e.g. Hypothyroidism, Knee injury"
                  style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}
                />
              </div>
              <div>
                <label style={{ ...fn700, display: "block", marginBottom: "0.2rem" }}>
                  Allergies
                </label>
                <input
                  className="input"
                  value={medicalDraft.allergies}
                  onChange={(e) =>
                    setMedicalDraft((d) => ({ ...d, allergies: e.target.value }))
                  }
                  placeholder="e.g. Lactose, Gluten"
                  style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}
                />
              </div>
              <div>
                <label style={{ ...fn700, display: "block", marginBottom: "0.2rem" }}>
                  Supplements
                </label>
                <input
                  className="input"
                  value={medicalDraft.supplements}
                  onChange={(e) =>
                    setMedicalDraft((d) => ({ ...d, supplements: e.target.value }))
                  }
                  placeholder="e.g. Vitamin D3, Whey Protein"
                  style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...fn700, display: "block", marginBottom: "0.2rem" }}>
                    Water (L)
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.5"
                    value={medicalDraft.dailyWaterTarget}
                    onChange={(e) =>
                      setMedicalDraft((d) => ({ ...d, dailyWaterTarget: Number(e.target.value) }))
                    }
                    style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ ...fn700, display: "block", marginBottom: "0.2rem" }}>
                    Steps
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1000"
                    value={medicalDraft.dailyStepsTarget}
                    onChange={(e) =>
                      setMedicalDraft((d) => ({ ...d, dailyStepsTarget: Number(e.target.value) }))
                    }
                    style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}
                  />
                </div>
              </div>
              <button
                className="btn-primary btn-sm"
                onClick={handleSaveMedical}
                disabled={savingMedical}
                style={{ width: "100%", marginTop: "0.25rem" }}
              >
                {savingMedical ? "Saving..." : "Save Medical Info"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
              {medicalDraft.healthConditions.trim() && (
                <div>
                  <div style={{ ...fn700, marginBottom: "0.3rem" }}>Health Conditions</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {medicalDraft.healthConditions.split(",").map((c, i) => (
                      <span key={i} className="badge badge-danger" style={{ fontSize: "0.65rem" }}>{c.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              {medicalDraft.allergies.trim() && (
                <div>
                  <div style={{ ...fn700, marginBottom: "0.3rem" }}>Allergies</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {medicalDraft.allergies.split(",").map((a, i) => (
                      <span key={i} className="badge badge-warning" style={{ fontSize: "0.65rem" }}>{a.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div style={{ ...fn700, marginBottom: "0.3rem" }}>Daily Targets</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.72rem",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.2rem",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "0.8rem", color: "var(--info)" }}>
                      water_drop
                    </span>
                    Water: {medicalDraft.dailyWaterTarget}L
                  </span>
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.72rem",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.2rem",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
                      directions_walk
                    </span>
                    Steps: {medicalDraft.dailyStepsTarget.toLocaleString()}
                  </span>
                </div>
              </div>
              {medicalDraft.supplements.trim() && (
                <div>
                  <div style={{ ...fn700, marginBottom: "0.3rem" }}>Supplements</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {medicalDraft.supplements.split(",").map((s, i) => (
                      <span key={i} className="badge badge-info" style={{ fontSize: "0.65rem" }}>{s.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              {!medicalDraft.healthConditions.trim() &&
                !medicalDraft.allergies.trim() &&
                !medicalDraft.supplements.trim() && (
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.75rem",
                      color: "var(--outline)",
                      fontStyle: "italic",
                      textAlign: "center",
                      padding: "1rem 0",
                    }}
                  >
                    No medical data. Click Edit to add.
                  </p>
                )}
            </div>
          )}
        </div>

        {/* ASSIGNED AI PLANS */}
        {(assignedNutrition || assignedWorkout) && (
          <div className="card" style={{ marginBottom: "1rem", background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(245,158,11,0.08))", border: "1px solid var(--primary-glow)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span className="material-symbols-outlined" style={{ color: "var(--primary)", fontSize: "1.1rem" }}>auto_awesome</span>
              <h3 style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>AI-Assigned Plans</h3>
              <span className="badge-accent" style={{ fontSize: "0.6rem" }}>from AI Coach</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: assignedNutrition && assignedWorkout ? "1fr 1fr" : "1fr", gap: "1rem" }}>
              {assignedNutrition && (
                <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-md)", padding: "0.75rem", maxHeight: "400px", overflowY: "auto" }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>🍽️ Nutrition Plan</div>
                  <pre style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.6 }}>{assignedNutrition}</pre>
                </div>
              )}
              {assignedWorkout && (
                <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-md)", padding: "0.75rem", maxHeight: "400px", overflowY: "auto" }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>💪 Workout Plan</div>
                  <pre style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.6 }}>{assignedWorkout}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MEAL PLANNER */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h3
            style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 800,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              margin: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: "var(--accent)" }}>
              restaurant
            </span>
            Meal Planner
            <button className="btn-ghost btn-xs" onClick={() => setShowMealModal(true)} style={{ marginLeft: "auto", fontSize: "0.65rem" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>open_in_full</span>
              Open Full Planner
            </button>
          </h3>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button
              className={`tab${mealDay === "today" ? " active" : ""}`}
              onClick={() => setMealDay("today")}
            >
              Today
            </button>
            <button
              className={`tab${mealDay !== "today" ? " active" : ""}`}
              onClick={() => setMealDay(DAYS[todayIndex])}
            >
              Weekly
            </button>
          </div>

          {mealDay === "today" || DAYS.includes(mealDay) ? (
            <>
              {mealDay !== "today" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setMealDay(d)}
                      style={{
                        padding: "0.35rem 0.7rem",
                        borderRadius: "var(--r-full)",
                        border: `1.5px solid ${mealDay === d ? "var(--primary)" : "var(--outline-variant)"}`,
                        background: mealDay === d ? "var(--primary-light)" : "var(--surface-container)",
                        color: mealDay === d ? "var(--primary)" : "var(--on-surface-variant)",
                        fontFamily: "Manrope, sans-serif",
                        fontWeight: 700,
                        fontSize: "0.7rem",
                        cursor: "pointer",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {getDayMeals(mealDay).length === 0 ? (
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "0.75rem",
                    color: "var(--outline)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "0.5rem 0",
                  }}
                >
                  No meals planned. Add one below.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    maxHeight: "240px",
                    overflowY: "auto",
                  }}
                >
                  {getDayMeals(mealDay).map((m, i) => (
                    <div
                      key={m.id}
                      style={{
                        background: "var(--surface-container-low)",
                        borderRadius: "var(--r-md)",
                        padding: "0.6rem 0.75rem",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.2rem",
                        }}
                      >
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) => {
                            const updated = [
                              ...(mealDay === "today"
                                ? meals
                                : weekMeals.find((wm) => wm.day === mealDay)?.meals ?? []),
                            ];
                            updated[i] = { ...updated[i], name: e.target.value };
                            if (mealDay === "today") setMeals(updated);
                            else
                              setWeekMeals((prev) =>
                                prev.map((wm) =>
                                  wm.day === mealDay ? { ...wm, meals: updated } : wm
                                )
                              );
                          }}
                          placeholder="Meal name"
                          style={{
                            fontFamily: "Manrope, sans-serif",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            border: "none",
                            background: "transparent",
                            outline: "none",
                            color: "var(--text-primary)",
                            flex: 1,
                          }}
                        />
                        <button
                          className="btn-ghost btn-xs"
                          onClick={() => {
                            if (mealDay === "today")
                              setMeals((prev) => prev.filter((_, idx) => idx !== i));
                            else
                              setWeekMeals((prev) =>
                                prev.map((wm) =>
                                  wm.day === mealDay
                                    ? { ...wm, meals: wm.meals.filter((_, idx) => idx !== i) }
                                    : wm
                                )
                              );
                          }}
                          style={{ color: "var(--danger)", border: "none", padding: "0.15rem" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>
                            delete
                          </span>
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)" }}>
                          Cal: <b>{m.calories}</b>
                        </span>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)" }}>
                          P: <b>{m.proteinG}g</b>
                        </span>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)" }}>
                          C: <b>{m.carbsG}g</b>
                        </span>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)" }}>
                          F: <b>{m.fatG}g</b>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  background: "var(--surface-container)",
                  borderRadius: "var(--r-md)",
                  padding: "0.5rem 0.75rem",
                }}
              >
                <div style={{ ...fn700, marginBottom: "0.3rem" }}>Day Totals</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    fontFamily: "Manrope, sans-serif",
                    fontWeight: 700,
                    fontSize: "0.72rem",
                    color: "var(--text-primary)",
                  }}
                >
                  <span>{totalMealMacros.calories} kcal</span>
                  <span>P: {totalMealMacros.proteinG}g</span>
                  <span>C: {totalMealMacros.carbsG}g</span>
                  <span>F: {totalMealMacros.fatG}g</span>
                </div>
              </div>

              <button
                className="btn-ghost btn-xs"
                onClick={() => {
                  const newMeal: MealEntry = {
                    id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    name: `Meal ${getDayMeals(mealDay).length + 1}`,
                    ingredients: "",
                    calories: 400,
                    proteinG: 30,
                    carbsG: 40,
                    fatG: 12,
                  };
                  if (mealDay === "today") {
                    setMeals((prev) => [...prev, newMeal]);
                  } else {
                    setWeekMeals((prev) => {
                      const exists = prev.find((wm) => wm.day === mealDay);
                      if (exists)
                        return prev.map((wm) =>
                          wm.day === mealDay ? { ...wm, meals: [...wm.meals, newMeal] } : wm
                        );
                      return [...prev, { day: mealDay, meals: [newMeal] }];
                    });
                  }
                }}
                style={{ width: "100%" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>
                  add
                </span>
                Add Meal
              </button>

              <button
                className="btn-primary btn-sm"
                onClick={saveMeals}
                disabled={savingMeals}
                style={{ width: "100%" }}
              >
                {savingMeals ? "Saving..." : "Save Meals"}
              </button>

              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  const name = client?.fullName?.split(" ")[0] ?? "client";
                  const prompt = `Create a meal plan for today for ${name} with ${macroDraft.calories} calories, ${macroDraft.proteinG}g protein, ${macroDraft.fatG}g fat, and ${macroDraft.carbsG}g carbs. Include quantified ingredients and macros per meal.`;
                  navigator.clipboard.writeText(prompt);
                  push("Meal plan prompt copied! Open AI Coach to generate.", "info");
                }}
                style={{ width: "100%", fontSize: "0.72rem" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>auto_awesome</span>
                🤖 AI Plan Meal
              </button>
            </>
          ) : null}
        </div>

        {/* WORKOUT PLANNER */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h3
            style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 800,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              margin: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: "var(--info)" }}>
              fitness_center
            </span>
            Workout Planner
          </h3>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button
              className={`tab${workoutDay === "today" ? " active" : ""}`}
              onClick={() => setWorkoutDay("today")}
            >
              Today
            </button>
            <button
              className={`tab${workoutDay !== "today" ? " active" : ""}`}
              onClick={() => setWorkoutDay(DAYS[todayIndex])}
            >
              Weekly
            </button>
          </div>

          {workoutDay === "today" || DAYS.includes(workoutDay) ? (
            <>
              {workoutDay !== "today" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setWorkoutDay(d)}
                      style={{
                        padding: "0.35rem 0.7rem",
                        borderRadius: "var(--r-full)",
                        border: `1.5px solid ${workoutDay === d ? "var(--primary)" : "var(--outline-variant)"}`,
                        background: workoutDay === d ? "var(--primary-light)" : "var(--surface-container)",
                        color: workoutDay === d ? "var(--primary)" : "var(--on-surface-variant)",
                        fontFamily: "Manrope, sans-serif",
                        fontWeight: 700,
                        fontSize: "0.7rem",
                        cursor: "pointer",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {getDayWorkouts(workoutDay).length === 0 ? (
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "0.75rem",
                    color: "var(--outline)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "0.5rem 0",
                  }}
                >
                  No workouts planned. Add one below.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    maxHeight: "240px",
                    overflowY: "auto",
                  }}
                >
                  {getDayWorkouts(workoutDay).map((w, i) => (
                    <div
                      key={w.id}
                      style={{
                        background: "var(--surface-container-low)",
                        borderRadius: "var(--r-md)",
                        padding: "0.6rem 0.75rem",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.3rem",
                        }}
                      >
                        <input
                          type="text"
                          value={w.name}
                          onChange={(e) => {
                            const updated = [
                              ...(workoutDay === "today"
                                ? workouts
                                : weekWorkouts.find((ww) => ww.day === workoutDay)?.exercises ?? []),
                            ];
                            updated[i] = { ...updated[i], name: e.target.value };
                            if (workoutDay === "today") setWorkouts(updated);
                            else
                              setWeekWorkouts((prev) =>
                                prev.map((ww) =>
                                  ww.day === workoutDay ? { ...ww, exercises: updated } : ww
                                )
                              );
                          }}
                          placeholder="Exercise name"
                          style={{
                            fontFamily: "Manrope, sans-serif",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            border: "none",
                            background: "transparent",
                            outline: "none",
                            color: "var(--text-primary)",
                            flex: 1,
                          }}
                        />
                        <button
                          className="btn-ghost btn-xs"
                          onClick={() => {
                            if (workoutDay === "today")
                              setWorkouts((prev) => prev.filter((_, idx) => idx !== i));
                            else
                              setWeekWorkouts((prev) =>
                                prev.map((ww) =>
                                  ww.day === workoutDay
                                    ? {
                                        ...ww,
                                        exercises: ww.exercises.filter((_, idx) => idx !== i),
                                      }
                                    : ww
                                )
                              );
                          }}
                          style={{ color: "var(--danger)", border: "none", padding: "0.15rem" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>
                            delete
                          </span>
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)" }}>
                          Sets: <b>{w.sets}</b>
                        </span>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)" }}>
                          Reps: <b>{w.reps}</b>
                        </span>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)" }}>
                          {w.notes || "No notes"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="btn-ghost btn-xs"
                onClick={() => {
                  const newEx: WorkoutEntry = {
                    id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    name: `Exercise ${getDayWorkouts(workoutDay).length + 1}`,
                    sets: 3,
                    reps: 10,
                    notes: "",
                  };
                  if (workoutDay === "today") {
                    setWorkouts((prev) => [...prev, newEx]);
                  } else {
                    setWeekWorkouts((prev) => {
                      const exists = prev.find((ww) => ww.day === workoutDay);
                      if (exists)
                        return prev.map((ww) =>
                          ww.day === workoutDay
                            ? { ...ww, exercises: [...ww.exercises, newEx] }
                            : ww
                        );
                      return [...prev, { day: workoutDay, exercises: [newEx] }];
                    });
                  }
                }}
                style={{ width: "100%" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>
                  add
                </span>
                Add Exercise
              </button>

              <button
                className="btn-primary btn-sm"
                onClick={saveWorkouts}
                disabled={savingWorkouts}
                style={{ width: "100%" }}
              >
                {savingWorkouts ? "Saving..." : "Save Workouts"}
              </button>

              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  const name = client?.fullName?.split(" ")[0] ?? "client";
                  const prompt = `Create a workout plan for ${name}. Include exercises with sets, reps, and rest periods. Consider any medical conditions they have.`;
                  navigator.clipboard.writeText(prompt);
                  push("Workout prompt copied! Open AI Coach to generate.", "info");
                }}
                style={{ width: "100%", fontSize: "0.72rem" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>auto_awesome</span>
                🤖 AI Plan Workout
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* MACROS & METRICS */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3
            style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 800,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              margin: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: "var(--accent)" }}>
              monitoring
            </span>
            Macros &amp; Metrics
          </h3>
          <button className="btn-ghost btn-xs" onClick={() => setEditMacros((v) => !v)}>
            <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>
              {editMacros ? "close" : "edit"}
            </span>
            {editMacros ? "Cancel" : "Update Macros"}
          </button>
        </div>

        {editMacros ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
              {(["calories", "proteinG", "fatG", "carbsG"] as const).map((k) => (
                <div key={k}>
                  <label style={{ ...fn700, display: "block", marginBottom: "0.15rem" }}>
                    {k === "proteinG" ? "Protein (g)" : k === "fatG" ? "Fat (g)" : k === "carbsG" ? "Carbs (g)" : "Calories"}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={macroDraft[k]}
                    onChange={(e) => setMacroDraft((d) => ({ ...d, [k]: Number(e.target.value) }))}
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
              {(["fiberG", "sugarG", "sodiumMg"] as const).map((k) => (
                <div key={k}>
                  <label style={{ ...fn700, display: "block", marginBottom: "0.15rem" }}>
                    {k === "fiberG" ? "Fiber (g)" : k === "sugarG" ? "Sugar (g)" : "Sodium (mg)"}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={macroDraft[k]}
                    onChange={(e) => setMacroDraft((d) => ({ ...d, [k]: Number(e.target.value) }))}
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                  />
                </div>
              ))}
            </div>
            <button
              className="btn-primary btn-sm"
              onClick={handleSaveMacros}
              disabled={savingMacros}
              style={{ alignSelf: "flex-start" }}
            >
              {savingMacros ? "Saving..." : "Save Macros"}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                Calories: <span style={{ color: "var(--primary)" }}>{macroDraft.calories || "—"}</span>
              </span>
              <span style={{ color: "var(--outline-variant)" }}>|</span>
              <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                Protein: <span style={{ color: "var(--primary)" }}>{macroDraft.proteinG || "—"}g</span>
              </span>
              <span style={{ color: "var(--outline-variant)" }}>|</span>
              <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                Fat: <span style={{ color: "var(--primary)" }}>{macroDraft.fatG || "—"}g</span>
              </span>
              <span style={{ color: "var(--outline-variant)" }}>|</span>
              <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                Carbs: <span style={{ color: "var(--primary)" }}>{macroDraft.carbsG || "—"}g</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--on-surface-variant)" }}>
                Fiber: <b>{macroDraft.fiberG || "—"}g</b>
              </span>
              <span style={{ color: "var(--outline-variant)" }}>|</span>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--on-surface-variant)" }}>
                Sugar: <b>{macroDraft.sugarG || "—"}g</b>
              </span>
              <span style={{ color: "var(--outline-variant)" }}>|</span>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--on-surface-variant)" }}>
                Sodium: <b>{macroDraft.sodiumMg || "—"}mg</b>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* PROGRESS TRACKER */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3
            style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 800,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              margin: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: "var(--success)" }}>
              trending_up
            </span>
            Progress Tracker
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button className="btn-ghost btn-xs" onClick={() => setShowCheckInHistory((v) => !v)}>
              <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>history</span>
              {showCheckInHistory ? "Hide History" : "View History"}
            </button>
            <button className="btn-primary btn-xs" onClick={() => setShowCheckInForm((v) => !v)}>
              <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>
                {showCheckInForm ? "close" : "add"}
              </span>
              {showCheckInForm ? "Cancel" : "Log Check-in"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          {latestCi ? (
            <>
              <div>
                <div style={{ ...fn700 }}>Weight</div>
                <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                  {latestCi.progress?.weightKg != null ? (
                    <>
                      {latestCi.progress.weightKg} kg{" "}
                      {weightTrend && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: weightTrend === "down" ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {weightTrend === "down" ? "↓" : "↑"}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div>
                <div style={{ ...fn700 }}>Body Fat</div>
                <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                  {(latestCi.progress as any)?.bodyFatPct != null ? `${(latestCi.progress as any).bodyFatPct}%` : "—"}
                </div>
              </div>
              <div>
                <div style={{ ...fn700 }}>Waist</div>
                <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                  {latestCi.progress?.waistCm != null ? `${latestCi.progress.waistCm} cm` : "—"}
                </div>
              </div>
              <div>
                <div style={{ ...fn700 }}>Energy</div>
                <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                  {latestCi.progress?.energyScore != null ? `${latestCi.progress.energyScore}/10` : "—"}
                </div>
              </div>
            </>
          ) : (
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.8rem",
                color: "var(--outline)",
                fontStyle: "italic",
                gridColumn: "1 / -1",
              }}
            >
              No check-ins yet. Log one to start tracking.
            </p>
          )}
        </div>

        {showCheckInForm && (
          <div
            style={{
              background: "var(--surface-container-low)",
              borderRadius: "var(--r-md)",
              padding: "0.75rem",
              marginBottom: "0.75rem",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <div>
                <label style={{ ...fn700, display: "block", marginBottom: "0.15rem" }}>Weight (kg)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={checkInForm.weightKg}
                  onChange={(e) => setCheckInForm((f) => ({ ...f, weightKg: e.target.value }))}
                  placeholder="72.0"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                />
              </div>
              <div>
                <label style={{ ...fn700, display: "block", marginBottom: "0.15rem" }}>Body Fat (%)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="60"
                  step="0.1"
                  value={checkInForm.bodyFatPct}
                  onChange={(e) => setCheckInForm((f) => ({ ...f, bodyFatPct: e.target.value }))}
                  placeholder="22.0"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                />
              </div>
              <div>
                <label style={{ ...fn700, display: "block", marginBottom: "0.15rem" }}>Waist (cm)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={checkInForm.waistCm}
                  onChange={(e) => setCheckInForm((f) => ({ ...f, waistCm: e.target.value }))}
                  placeholder="82.0"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                />
              </div>
              <div>
                <label style={{ ...fn700, display: "block", marginBottom: "0.15rem" }}>Energy (1-10)</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="10"
                  value={checkInForm.energyScore}
                  onChange={(e) => setCheckInForm((f) => ({ ...f, energyScore: e.target.value }))}
                  placeholder="7"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                />
              </div>
            </div>
            <button className="btn-primary btn-sm" onClick={handleLogCheckIn} disabled={savingCheckIn}>
              {savingCheckIn ? "Saving..." : "Log Check-in"}
            </button>
          </div>
        )}

        {showCheckInHistory && sortedCheckIns.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "180px", overflowY: "auto" }}>
            {sortedCheckIns.slice(0, 10).map((ci) => (
              <div
                key={ci.id}
                style={{
                  background: "var(--surface-container-low)",
                  borderRadius: "var(--r-md)",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.7rem", color: "var(--primary)" }}>
                  {new Date(ci.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                {ci.progress?.weightKg != null && (
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--on-surface-variant)" }}>
                    {ci.progress.weightKg} kg
                  </span>
                )}
                {(ci.progress as any)?.bodyFatPct != null && (
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--on-surface-variant)" }}>
                    {(ci.progress as any).bodyFatPct}% BF
                  </span>
                )}
                {ci.progress?.energyScore != null && (
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--on-surface-variant)" }}>
                    {ci.progress.energyScore}/10
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COACH NOTES */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3
          style={{
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            fontSize: "0.9rem",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            margin: "0 0 0.75rem 0",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: "var(--primary)" }}>
            sticky_note_2
          </span>
          Coach Notes
          {notes.length > 0 && (
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.65rem", fontWeight: 700, color: "var(--outline)", marginLeft: "0.3rem" }}>
              ({notes.length})
            </span>
          )}
        </h3>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input
            className="input"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a private note..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && newNote.trim()) handleAddNote();
            }}
            style={{ flex: 1, fontSize: "0.82rem", padding: "0.5rem 0.75rem" }}
          />
          <button
            className="btn-primary btn-sm"
            onClick={handleAddNote}
            disabled={noteSaving || !newNote.trim()}
            style={{ flexShrink: 0 }}
          >
            {noteSaving ? "Saving..." : "Save"}
          </button>
        </div>

        {notes.length === 0 ? (
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "0.78rem",
              color: "var(--outline)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "0.75rem 0",
            }}
          >
            No notes yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "200px", overflowY: "auto" }}>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  background: "var(--surface-container-low)",
                  borderRadius: "var(--r-md)",
                  padding: "0.6rem 0.75rem",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.8rem",
                      color: "var(--on-surface-variant)",
                      lineHeight: 1.5,
                      margin: "0 0 0.25rem 0",
                    }}
                  >
                    {note.content}
                  </p>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.65rem", color: "var(--outline)" }}>
                    {new Date(note.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <button
                  className="btn-ghost btn-xs"
                  onClick={() => {
                    if (confirm("Delete note?")) handleDeleteNote(note.id);
                  }}
                  style={{ color: "var(--danger)", border: "none", padding: "0.15rem", flexShrink: 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {showMealModal && (
        <MealPlannerModal
          clientName={client?.fullName ?? "Client"}
          macroTargets={{ calories: macroDraft.calories, proteinG: macroDraft.proteinG, fatG: macroDraft.fatG, carbsG: macroDraft.carbsG }}
          onClose={() => setShowMealModal(false)}
          onSave={async (data) => {
            const mealsForPlan = Array.from(Object.entries(data).flatMap(([day,slots]) =>
              Object.entries(slots).filter(([_,m])=>m.dish).map(([slot,m])=>({id:`meal_${day}_${slot}_${Date.now()}`,name:m.dish||`${SLOT_LABELS[slot]}`,ingredients:m.ingredients||"",calories:m.calories||0,proteinG:m.proteinG||0,carbsG:m.carbsG||0,fatG:m.fatG||0}))
            ));
            const weekPlanData = DAYS.map(d=>({day:d,meals:Object.entries(data[d]??{}).filter(([_,m])=>m.dish).map(([slot,m])=>({id:`meal_${d}_${slot}_${Date.now()}`,name:m.dish||"",ingredients:m.ingredients||"",calories:m.calories||0,proteinG:m.proteinG||0,carbsG:m.carbsG||0,fatG:m.fatG||0}))}));
            setMeals(mealsForPlan.slice(0,6));
            setWeekMeals(weekPlanData);
            await saveMeals();
          }}
          initialPlan={(typeof window !== "undefined" && (window as any).__coachosPendingMealPlan?.[clientId]) ?? null}
          push={(msg: string, t?: string) => push(msg, (t ?? "info") as any)}
        />
      )}
    </div>
  );
}
