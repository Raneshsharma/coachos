import codecs

with open('d:/codex/apps/web/src/main.tsx', 'r', encoding='utf-8', newline='') as f:
    content = f.read()

old = """          {activeTab === 'nutrition' && (
            clientPlan && (clientPlan as any).latestVersion?.nutrition?.length > 0
              ? <>
                {(clientPlan as any).latestVersion.explanation?.map((e: string, i: number) => (
                  <div key={i} className="card-glass" style={{ padding: '1rem', marginBottom: '0.75rem', borderLeft: '3px solid var(--primary)' }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: 0 }}>{e}</p>
                  </div>
                ))}
                <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Nutrition Guidelines</h3>
                {(clientPlan as any).latestVersion.nutrition.map((n: string, i: number) => (
                  <div key={i} className="card-glass" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0.75rem', marginBottom: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--primary)', flexShrink: 0 }}>restaurant</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface)', lineHeight: 1.5 }}>{n}</span>
                  </div>
                ))}
              </>
              : <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>restaurant</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No nutrition plan assigned yet.</p></div>
          )}"""

new = """          {activeTab === 'nutrition' && (
            <>
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {clientPlan && (clientPlan as any).latestVersion?.nutrition?.length > 0 ? (
                  <button onClick={() => setShowNutritionPicker(v => !v)} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>swap_horiz</span>
                    Change Nutrition Plan
                  </button>
                ) : (
                  <button onClick={() => setShowNutritionPicker(v => !v)} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>add</span>
                    Assign Nutrition Plan
                  </button>
                )}
                {showNutritionPicker && (
                  <div className="card-glass" style={{ padding: '0.75rem', width: '100%' }}>
                    {availablePlans.length === 0 ? (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', color: 'var(--outline)' }}>No plans available. Create one in the AI Plans section.</p>
                    ) : (
                      availablePlans.map(p => (
                        <button key={p.id} onClick={async () => {
                          setAssigning(true);
                          try {
                            await fetchJson(`/clients/${profileClientId}`, { method: 'PATCH', body: JSON.stringify({ nutritionPlanId: p.id }) });
                            setShowNutritionPicker(false);
                          } catch { /* silent */ } finally { setAssigning(false); }
                        }} disabled={assigning} style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', background: 'none', border: 'none', borderBottom: '1px solid var(--surface-container)', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {p.title || 'Unnamed Plan'}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {clientPlan && (clientPlan as any).latestVersion?.nutrition?.length > 0 ? (
                <>
                  {(clientPlan as any).latestVersion.explanation?.map((e: string, i: number) => (
                    <div key={i} className="card-glass" style={{ padding: '1rem', marginBottom: '0.75rem', borderLeft: '3px solid var(--primary)' }}>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: 0 }}>{e}</p>
                    </div>
                  ))}
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Nutrition Guidelines</h3>
                  {(clientPlan as any).latestVersion.nutrition.map((n: string, i: number) => (
                    <div key={i} className="card-glass" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0.75rem', marginBottom: '0.5rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--primary)', flexShhrink: 0 }}>restaurant</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface)', lineHeight: 1.5 }}>{n}</span>
                    </div>
                  ))}
                </>
              ) : !showNutritionPicker && (
                <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>restaurant</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No nutrition plan assigned yet.</p></div>
              )}
            </>
          )}"""

if old in content:
    content = content.replace(old, new, 1)
    print('Replaced nutrition tab')
else:
    print('Nutrition tab pattern not found!')

with open('d:/codex/apps/web/src/main.tsx', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Written')