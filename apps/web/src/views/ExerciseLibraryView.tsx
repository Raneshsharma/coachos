import React, { useEffect, useState } from "react";
import { fetchJson } from "../main";

type Exercise = { id: string; name: string; bodyPart: string; equipment: string; goal: string; difficulty: "beginner"|"intermediate"|"advanced"; instructions: string };

const BODY_PARTS = ["all", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio"];

export function ExerciseLibraryView() {
  const [search, setSearch] = useState("");
  const [bodyPart, setBodyPart] = useState("all");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim());
      if (bodyPart !== "all") q.set("bodyPart", bodyPart);
      const suffix = q.toString() ? `?${q}` : "";
      const data = await fetchJson<Exercise[]>(`/exercises${suffix}`);
      setExercises(Array.isArray(data) ? data : []);
    } catch {
      setExercises([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [bodyPart]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const difficultyColor = (diff: string) =>
    diff === "beginner" ? "var(--success)" :
    diff === "intermediate" ? "var(--warning)" :
    "var(--danger)";

  return (
    <div className="page-view">
      <p className="eyebrow">Exercise Library</p>
      <h1 className="page-title">Movement Database</h1>
      <p className="page-subtitle">
        {exercises.length} exercises across all movement patterns — tagged by body part, equipment, and difficulty.
      </p>

      <div className="panel" style={{ maxWidth: 700 }}>
        <div className="search-wrapper" style={{ marginBottom: "1rem" }}>
          <span className="search-icon">⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search exercises…"
          />
        </div>
        <div className="exercise-filters">
          {BODY_PARTS.map(bp => (
            <button
              key={bp}
              className={`exercise-filter-pill${bodyPart === bp ? " active" : ""}`}
              onClick={() => setBodyPart(bp)}
            >
              {bp === "all" ? "All" : bp}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", placeItems: "center", padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : exercises.length === 0 ? (
        <div className="empty-state" style={{ maxWidth: 400 }}>
          <span className="material-symbols-outlined" style={{ fontSize: "2.5rem", color: "var(--outline)" }}>fitness_center</span>
          <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600, color: "var(--text-primary)" }}>
            No exercises match your filters.
          </p>
          <p className="muted text-sm">Try adjusting your search or body part filter.</p>
        </div>
      ) : (
        <div className="exercise-grid">
          {exercises.map(ex => (
            <div key={ex.id} className="exercise-card">
              <div className="exercise-card-header">
                <div>
                  <div className="exercise-name">{ex.name}</div>
                  <div className="exercise-tags">
                    <span className="exercise-tag exercise-tag--bodypart">{ex.bodyPart}</span>
                    <span className="exercise-tag exercise-tag--equipment">{ex.equipment}</span>
                    <span className={`exercise-tag`} style={{ color: difficultyColor(ex.difficulty) }}>
                      {ex.difficulty}
                    </span>
                  </div>
                </div>
              </div>
              <p className="exercise-instructions">{ex.instructions}</p>
              <div className="exercise-card-footer">
                <span className="pill pill-muted" style={{ fontSize: "0.72rem" }}>{ex.goal}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}