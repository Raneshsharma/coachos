import React, { useEffect, useState } from "react";
import { fetchJson } from "../main";

type Recipe = { id: string; name: string; ingredients: string[]; steps: string[]; calories: number; proteinG: number; carbsG: number; fatG: number; prepTime: number; cookTime: number; tags: string[] };

export function RecipeBrowserView() {
  const [search, setSearch] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [tab, setTab] = useState<"browse"|"my">("browse");
  const [showAdd, setShowAdd] = useState(false);

  // My Recipes (localStorage)
  const [myRecipes, setMyRecipes] = useState<Recipe[]>(() => {
    try { return JSON.parse(localStorage.getItem("coachos_my_recipes") ?? "[]"); }
    catch { return []; }
  });
  const saveMyRecipes = (r: Recipe[]) => { setMyRecipes(r); localStorage.setItem("coachos_my_recipes", JSON.stringify(r)); };

  // Add form
  const [addForm, setAddForm] = useState({ name: "", ingredients: "", steps: "", calories: "", proteinG: "", carbsG: "", fatG: "", prepTime: "10", cookTime: "15", tags: "" });

  const addRecipe = () => {
    if (!addForm.name.trim() || !addForm.ingredients.trim()) return;
    const r: Recipe = {
      id: `my_${Date.now()}`,
      name: addForm.name.trim(),
      ingredients: addForm.ingredients.split(",").map(s => s.trim()).filter(Boolean),
      steps: addForm.steps.split("\n").map(s => s.trim()).filter(Boolean),
      calories: Number(addForm.calories) || 0,
      proteinG: Number(addForm.proteinG) || 0,
      carbsG: Number(addForm.carbsG) || 0,
      fatG: Number(addForm.fatG) || 0,
      prepTime: Number(addForm.prepTime) || 0,
      cookTime: Number(addForm.cookTime) || 0,
      tags: addForm.tags.split(",").map(s => s.trim()).filter(Boolean),
    };
    saveMyRecipes([r, ...myRecipes]);
    setAddForm({ name: "", ingredients: "", steps: "", calories: "", proteinG: "", carbsG: "", fatG: "", prepTime: "10", cookTime: "15", tags: "" });
    setShowAdd(false);
  };

  const deleteMyRecipe = (id: string) => saveMyRecipes(myRecipes.filter(r => r.id !== id));

  // Assign to client
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [clients, setClients] = useState<Array<{ id: string; fullName: string }>>([]);
  useEffect(() => { fetchJson<any[]>("/clients").then(cs => setClients(cs.map(c => ({ id: c.id, fullName: c.fullName })))).catch(() => {}); }, []);

  const assignRecipe = async (recipe: Recipe, clientId: string) => {
    try {
      const plans = await fetchJson<any[]>(`/plans?clientId=${clientId}`);
      let planId = plans?.[0]?.id;
      if (!planId) { const gen = await fetchJson<any>("/plans/generate", { method: "POST", body: JSON.stringify({ clientId }) }); planId = gen?.id; }
      if (planId) {
        await fetchJson(`/plans/${planId}`, { method: "PATCH", body: JSON.stringify({ assignedRecipe: recipe }) });
      }
      alert(`Recipe "${recipe.name}" assigned!`);
      setAssignTarget(null);
    } catch { alert("Failed to assign recipe."); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const data = await fetchJson<Recipe[]>(`/recipes${q}`);
      setRecipes(Array.isArray(data) ? data : []);
    } catch { setRecipes([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

  const displayRecipes = tab === "my" ? myRecipes : recipes;

  const RecipeCard = ({ r, showAssign }: { r: Recipe; showAssign: boolean }) => (
    <div className="card-glass" style={{ cursor: "pointer", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }} onClick={() => setSelected(r)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", margin: 0 }}>{r.name}</h3>
        {tab === "my" && (
          <button onClick={e => { e.stopPropagation(); deleteMyRecipe(r.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "0.8rem", padding: "0.15rem" }}>✕</button>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {r.tags?.slice(0, 3).map(tag => <span key={tag} className="pill pill-muted" style={{ fontSize: "0.68rem" }}>{tag}</span>)}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 0", borderTop: "1px solid var(--surface-container)" }}>
        <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>{r.calories}</div><div style={{ fontFamily: "var(--font-body)", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>kcal</div></div>
        <div style={{ width: "1px", background: "var(--surface-container)", margin: "0 0.25rem" }} />
        <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.85rem", color: "var(--primary)" }}>{r.proteinG}g</div><div style={{ fontFamily: "var(--font-body)", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>protein</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}>{r.carbsG}g</div><div style={{ fontFamily: "var(--font-body)", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>carbs</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}>{r.fatG}g</div><div style={{ fontFamily: "var(--font-body)", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>fat</div></div>
      </div>
      {showAssign && (
        <button className="btn-primary btn-sm" onClick={e => { e.stopPropagation(); setAssignTarget(r.id); }} style={{ alignSelf: "flex-start", fontSize: "0.7rem" }}>
          📌 Assign to Client
        </button>
      )}
      {assignTarget === r.id && (
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          <select onChange={e => { if (e.target.value) assignRecipe(r, e.target.value); }} style={{ flex: 1, padding: "0.3rem 0.5rem", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "0.75rem" }}>
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <div className="page-view">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: "0 0 0.15rem" }}>Recipe Library</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{tab === "my" ? myRecipes.length : recipes.length} recipes</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className={tab === "browse" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setTab("browse")}>🔍 Browse</button>
          <button className={tab === "my" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setTab("my")}>⭐ My Recipes</button>
          {tab === "my" && <button className="btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>+ Add Recipe</button>}
        </div>
      </div>

      {/* Add Recipe Form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "1.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", margin: "0 0 1rem" }}>Add New Recipe</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div><label className="input-label">Recipe Name</label><input className="input" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. High-Protein Overnight Oats" /></div>
            <div><label className="input-label">Tags (comma-separated)</label><input className="input" value={addForm.tags} onChange={e => setAddForm(f => ({ ...f, tags: e.target.value }))} placeholder="breakfast, high-protein" /></div>
            <div><label className="input-label">Ingredients (comma-separated)</label><input className="input" value={addForm.ingredients} onChange={e => setAddForm(f => ({ ...f, ingredients: e.target.value }))} placeholder="80g oats, 150g yogurt, 30g whey" /></div>
            <div><label className="input-label">Steps (one per line)</label><input className="input" value={addForm.steps} onChange={e => setAddForm(f => ({ ...f, steps: e.target.value }))} placeholder="Mix oats and yogurt&#10;Refrigerate overnight&#10;Top with berries" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.5rem", marginBottom: "1rem" }}>
            {(["calories","proteinG","carbsG","fatG"] as const).map(k => (
              <div key={k}><label className="input-label">{k==="proteinG"?"Protein(g)":k==="fatG"?"Fat(g)":k==="carbsG"?"Carbs(g)":"Calories"}</label><input className="input" type="number" min="0" value={addForm[k]} onChange={e => setAddForm(f => ({...f,[k]:e.target.value}))} /></div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-primary btn-sm" onClick={addRecipe}>Save Recipe</button>
            <button className="btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search (browse only) */}
      {tab === "browse" && (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "0.75rem 1rem" }}>
          <div className="search-wrapper"><span className="search-icon">⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes, ingredients, tags…" /></div>
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", placeItems: "center", padding: "4rem" }}><div className="spinner" /></div>
      ) : displayRecipes.length === 0 ? (
        <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: "2.5rem", color: "var(--outline)" }}>restaurant</span>
          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 600, color: "var(--text-primary)" }}>{tab === "my" ? "No custom recipes yet." : "No recipes found."}</p>
          {tab === "my" && <button className="btn-primary btn-sm" style={{ marginTop: "1rem" }} onClick={() => setShowAdd(true)}>+ Add Your First Recipe</button>}
        </div>
      ) : (
        <div className="content-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {displayRecipes.map(r => <RecipeCard key={r.id} r={r} showAssign={true} />)}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal-panel" style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
              <div><h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.2rem", color: "var(--text-primary)", margin: "0 0 0.25rem" }}>{selected.name}</h2><div style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--outline)" }}>{selected.prepTime}min prep + {selected.cookTime}min cook</div></div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", padding: "0.25rem" }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {[{ label: "Calories", value: selected.calories, color: "var(--text-primary)" },{ label: "Protein", value: `${selected.proteinG}g`, color: "var(--primary)" },{ label: "Carbs", value: `${selected.carbsG}g`, color: "var(--text-muted)" },{ label: "Fat", value: `${selected.fatG}g`, color: "var(--text-muted)" }].map(m => (
                <div key={m.label} style={{ background: "var(--surface-container)", borderRadius: "var(--r-lg)", padding: "0.75rem", textAlign: "center" }}><div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem", color: m.color }}>{m.value}</div><div style={{ fontFamily: "var(--font-body)", fontSize: "0.62rem", color: "var(--outline)", textTransform: "uppercase" }}>{m.label}</div></div>
              ))}
            </div>
            <div style={{ marginBottom: "1.25rem" }}><h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.6rem" }}>Ingredients</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>{selected.ingredients.map((ing, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", background: "var(--surface-container)", borderRadius: "var(--r-sm)" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} /><span style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--on-surface)" }}>{ing}</span></div>))}</div></div>
            {selected.steps?.length > 0 && (<div><h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.6rem" }}>Steps</h3><div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>{selected.steps.map((step, i) => (<div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}><span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--primary)", color: "white", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.72rem", display: "grid", placeItems: "center", flexShrink: 0 }}>{i + 1}</span><span style={{ fontFamily: "var(--font-body)", fontSize: "0.82rem", color: "var(--on-surface-variant)", lineHeight: 1.5, paddingTop: "0.1rem" }}>{step}</span></div>))}</div></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
