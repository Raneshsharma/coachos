import React, { useEffect, useState } from "react";
import { fetchJson } from "../main";

type Recipe = { id: string; name: string; ingredients: string[]; steps: string[]; calories: number; proteinG: number; carbsG: number; fatG: number; prepTime: number; cookTime: number; tags: string[] };

export function RecipeBrowserView() {
  const [search, setSearch] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Recipe | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const data = await fetchJson<Recipe[]>(`/recipes${q}`);
      setRecipes(Array.isArray(data) ? data : []);
    } catch {
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-view">
      <p className="eyebrow">Nutrition Tools</p>
      <h1 className="page-title">Recipe Browser</h1>
      <p className="page-subtitle">
        {recipes.length} recipes — browse by name, ingredients, or tags.
      </p>

      <div className="panel" style={{ maxWidth: 700 }}>
        <div className="search-wrapper">
          <span className="search-icon">⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes, ingredients, tags…"
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", placeItems: "center", padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="empty-state" style={{ maxWidth: 400 }}>
          <span className="material-symbols-outlined" style={{ fontSize: "2.5rem", color: "var(--outline)" }}>restaurant</span>
          <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600, color: "var(--text-primary)" }}>
            No recipes found
          </p>
          <p className="muted text-sm">Try a different search term.</p>
        </div>
      ) : (
        <>
          {/* Recipe cards grid */}
          <div className="content-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {recipes.map(recipe => (
              <div
                key={recipe.id}
                className="card-glass"
                style={{ cursor: "pointer", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
                onClick={() => setSelected(recipe)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>
                    {recipe.name}
                  </h3>
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: "var(--outline)", flexShrink: 0 }}>open_in_new</span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {recipe.tags?.slice(0, 3).map(tag => (
                    <span key={tag} className="pill pill-muted" style={{ fontSize: "0.68rem" }}>{tag}</span>
                  ))}
                </div>

                {/* Macros */}
                <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 0", borderTop: "1px solid var(--surface-container)" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>{recipe.calories}</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>kcal</div>
                  </div>
                  <div style={{ width: "1px", background: "var(--surface-container)", margin: "0 0.25rem" }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--primary)" }}>{recipe.proteinG}g</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>protein</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}>{recipe.carbsG}g</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>carbs</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}>{recipe.fatG}g</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", color: "var(--outline)", textTransform: "uppercase" }}>fat</div>
                  </div>
                </div>

                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--outline)" }}>
                  {recipe.prepTime + recipe.cookTime} min · {recipe.ingredients.length} ingredients
                </div>
              </div>
            ))}
          </div>

          {/* Detail modal */}
          {selected && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
              <div className="modal-panel" style={{ maxWidth: 560 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                  <div>
                    <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.2rem", color: "var(--text-primary)", margin: "0 0 0.25rem" }}>{selected.name}</h2>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--outline)" }}>
                      {selected.prepTime}min prep + {selected.cookTime}min cook
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", padding: "0.25rem", display: "grid", placeItems: "center" }}>
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                {/* Macros row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "1.25rem" }}>
                  {[
                    { label: "Calories", value: selected.calories, color: "var(--text-primary)" },
                    { label: "Protein", value: `${selected.proteinG}g`, color: "var(--primary)" },
                    { label: "Carbs", value: `${selected.carbsG}g`, color: "var(--text-muted)" },
                    { label: "Fat", value: `${selected.fatG}g`, color: "var(--text-muted)" },
                  ].map(m => (
                    <div key={m.label} style={{ background: "var(--surface-container)", borderRadius: "var(--r-lg)", padding: "0.75rem", textAlign: "center" }}>
                      <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.1rem", color: m.color }}>{m.value}</div>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)", textTransform: "uppercase" }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Ingredients */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.6rem" }}>Ingredients</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {selected.ingredients.map((ing, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", background: "var(--surface-container)", borderRadius: "var(--r-sm)" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--on-surface)" }}>{ing}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Steps */}
                {selected.steps?.length > 0 && (
                  <div>
                    <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.6rem" }}>Steps</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {selected.steps.map((step, i) => (
                        <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                          <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--primary)", color: "white", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.72rem", display: "grid", placeItems: "center", flexShrink: 0 }}>
                            {i + 1}
                          </span>
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--on-surface-variant)", lineHeight: 1.5, paddingTop: "0.1rem" }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}