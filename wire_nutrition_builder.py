import codecs

with open('d:/codex/apps/web/src/main.tsx', 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# 1. Add meal state and food search state in PortalView
old = """  // Meal Planner state
  const [mealWeekOffset, setMealWeekOffset] = useState(0);
  const [editingMeal, setEditingMeal] = useState<{ day: string; slot: string } | null>(null);
  const [showArchitect, setShowArchitect] = useState(true);"""

new = """  // Meal Planner state
  const [mealWeekOffset, setMealWeekOffset] = useState(0);
  const [editingMeal, setEditingMeal] = useState<{ day: string; slot: string } | null>(null);
  const [showArchitect, setShowArchitect] = useState(true);
  const [mealWeek, setMealWeek] = useState([
    { name: "Mon", meals: [
      { slot: "Breakfast", name: "Greek Yogurt with Berries", cal: 320, protein: 24 },
      { slot: "Lunch", name: "Grilled Salmon Salad", cal: 480, protein: 38 },
      { slot: "Snacks", name: "Almonds & Apple", cal: 210, protein: 6 },
      { slot: "Dinner", name: "Sesame Tofu Stir-fry", cal: 540, protein: 22 },
    ]},
    { name: "Tue", meals: [
      { slot: "Breakfast", name: "Oatmeal with Banana", cal: 380, protein: 12 },
      { slot: "Lunch", name: "Chicken Quinoa Bowl", cal: 520, protein: 42 },
      { slot: "Snacks", name: "Greek Yogurt", cal: 150, protein: 15 },
      { slot: "Dinner", name: "Baked Cod & Asparagus", cal: 430, protein: 40 },
    ]},
    { name: "Wed", meals: [
      { slot: "Breakfast", name: "Avocado Toast & Eggs", cal: 450, protein: 20 },
      { slot: "Lunch", name: "Turkey & Hummus Wrap", cal: 490, protein: 35 },
      { slot: "Snacks", name: "Mixed Nuts & Dates", cal: 280, protein: 8 },
      { slot: "Dinner", name: "Lean Beef Stir-fry", cal: 580, protein: 45 },
    ]},
    { name: "Thu", meals: [
      { slot: "Breakfast", name: "Protein Smoothie Bowl", cal: 340, protein: 30 },
      { slot: "Lunch", name: "Tuna Nicoise Salad", cal: 420, protein: 40 },
      { slot: "Snacks", name: "Rice Cakes & Almond Butter", cal: 180, protein: 5 },
      { slot: "Dinner", name: "—", cal: 0, protein: 0 },
    ]},
    { name: "Fri", meals: [
      { slot: "Breakfast", name: "—", cal: 0, protein: 0 },
      { slot: "Lunch", name: "—", cal: 0, protein: 0 },
      { slot: "Snacks", name: "—", cal: 0, protein: 0 },
      { slot: "Dinner", name: "—", cal: 0, protein: 0 },
    ]},
    { name: "Sat", meals: [
      { slot: "Breakfast", name: "—", cal: 0, protein: 0 },
      { slot: "Lunch", name: "—", cal: 0, protein: 0 },
      { slot: "Snacks", name: "—", cal: 0, protein: 0 },
      { slot: "Dinner", name: "—", cal: 0, protein: 0 },
    ]},
    { name: "Sun", meals: [
      { slot: "Breakfast", name: "—", cal: 0, protein: 0 },
      { slot: "Lunch", name: "—", cal: 0, protein: 0 },
      { slot: "Snacks", name: "—", cal: 0, protein: 0 },
      { slot: "Dinner", name: "—", cal: 0, protein: 0 },
    ]},
  ]);
  const [savingMeal, setSavingMeal] = useState(false);
  const [foodSearch, setFoodSearch] = useState("");
  const [foodSuggestions, setFoodSuggestions] = useState<string[]>([]);
  const [searchingFood, setSearchingFood] = useState(false);

  // Load nutrition from plan into mealWeek
  useEffect(() => {
    const nutrition = clientPortal?.plan?.latestVersion?.nutrition;
    if (!nutrition || nutrition.length === 0) return;
    try {
      const parsed = JSON.parse(nutrition[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]?.meals)) {
        setMealWeek(parsed);
      }
    } catch { /* keep default */ }
  }, [clientPortal?.plan]);

  // Food search
  useEffect(() => {
    if (!foodSearch.trim()) { setFoodSuggestions([]); return; }
    setSearchingFood(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetchJson<{name?: string; recipes?: string[]}>(`/recipes?food=${encodeURIComponent(foodSearch)}`);
        setFoodSuggestions(Array.isArray(res) ? res.slice(0, 5) : (res?.recipes ?? []));
      } catch { setFoodSuggestions([]); }
      finally { setSearchingFood(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [foodSearch]);

  const saveMealPlan = async () => {
    if (!clientPortal?.plan) return;
    setSavingMeal(true);
    try {
      const nutritionStrings = mealWeek.map(day =>
        `${day.name}: ${day.meals.filter(m => m.name !== "—").map(m => `${m.slot} — ${m.name} (${m.cal} cal, ${m.protein}g protein)`).join(" | ")}`
      );
      await fetchJson<any>(`/plans/${clientPortal.plan.id}`, { method: "PATCH", body: JSON.stringify({ nutrition: nutritionStrings }) });
      push("Meal plan saved to client profile!", "success");
    } catch { push("Failed to save meal plan", "error"); }
    finally { setSavingMeal(false); }
  };"""

if old in content:
    content = content.replace(old, new, 1)
    print('Added meal state and food search')
else:
    print('Meal state pattern not found!')

# 2. Update "Save & Assign" button
old2 = """                  <button className="meal-save-btn" onClick={() => { push("Meal plan saved and assigned to " + (clientPortal?.client.fullName ?? "client")); setEditingMeal(null); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem", verticalAlign: "middle", marginRight: "0.35rem" }}>check_circle</span>
                    Save &amp; Assign
                  </button>"""

new2 = """                  <button className="meal-save-btn" onClick={async () => { await saveMealPlan(); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem", verticalAlign: "middle", marginRight: "0.35rem" }}>check_circle</span>
                    {savingMeal ? "Saving..." : "Save & Assign"}
                  </button>"""

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Updated Save & Assign button')
else:
    print('Save & Assign button pattern not found!')

with open('d:/codex/apps/web/src/main.tsx', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Written')