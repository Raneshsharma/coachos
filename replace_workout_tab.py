import codecs

with open('d:/codex/apps/web/src/main.tsx', 'r', encoding='utf-8', newline='') as f:
    content = f.read()

old = """          {activeTab === 'workouts' && (
            sortedCheckIns.length === 0 && !clientPlan
              ? <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>fitness_center</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No workout history yet.</p></div>
              : <>
                {clientPlan && (clientPlan as any).latestVersion?.workouts?.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Current Programme</h3>
                    {(clientPlan as any).latestVersion.workouts.map((w: string, i: number) => (
                      <div key={i} className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', borderLeft: `3px solid ${i === 0 ? 'var(--primary)' : 'var(--surface-container)'}` }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: i === 0 ? 'var(--primary)' : 'var(--outline)', flexShrink: 0 }}>fitness_center</span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface)' }}>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
                {sortedCheckIns.length > 0 && (
                  <div>
                    <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Session Log ({sortedCheckIns.length})</h3>
                    {sortedCheckIns.map((ci, i) => (
                      <div key={ci.id} className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Session #{sortedCheckIns.length - i}</div>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--outline)' }}>{new Date(ci.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                        </div>
                        {ci.progress.energyScore != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: ci.progress.energyScore <= 4 ? 'var(--danger)' : ci.progress.energyScore <= 6 ? 'var(--warning)' : 'var(--primary)' }}>{ci.progress.energyScore}/10</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Energy</div></div>}
                        {ci.progress.adherenceScore != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: ci.progress.adherenceScore >= 75 ? 'var(--primary)' : ci.progress.adherenceScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{ci.progress.adherenceScore}%</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Adherence</div></div>}
                        {ci.progress.steps != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--on-surface)' }}>{ci.progress.steps.toLocaleString()}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Steps</div></div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
          )}"""

new = """          {activeTab === 'workouts' && (
            <>
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {clientPlan ? (
                  <button onClick={() => setShowWorkoutPicker(v => !v)} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>swap_horiz</span>
                    Change Programme
                  </button>
                ) : (
                  <button onClick={() => setShowWorkoutPicker(v => !v)} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>add</span>
                    Assign Programme
                  </button>
                )}
                {showWorkoutPicker && (
                  <div className="card-glass" style={{ padding: '0.75rem', width: '100%' }}>
                    {availablePlans.length === 0 ? (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', color: 'var(--outline)' }}>No plans available. Create one in the AI Plans section.</p>
                    ) : (
                      availablePlans.map(p => (
                        <button key={p.id} onClick={async () => {
                          setAssigning(true);
                          try {
                            await fetchJson(`/clients/${profileClientId}`, { method: 'PATCH', body: JSON.stringify({ planId: p.id }) });
                            setShowWorkoutPicker(false);
                          } catch { /* silent */ } finally { setAssigning(false); }
                        }} disabled={assigning} style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', background: 'none', border: 'none', borderBottom: '1px solid var(--surface-container)', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {p.title || 'Unnamed Plan'}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {!clientPlan && sortedCheckIns.length === 0 && (
                <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>fitness_center</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No workout history and no programme assigned yet.</p></div>
              )}
              {clientPlan && (clientPlan as any).latestVersion?.workouts?.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Current Programme</h3>
                  {(clientPlan as any).latestVersion.workouts.map((w: string, i: number) => (
                    <div key={i} className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', borderLeft: `3px solid ${i === 0 ? 'var(--primary)' : 'var(--surface-container)'}` }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: i === 0 ? 'var(--primary)' : 'var(--outline)', flexShrink: 0 }}>fitness_center</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface)' }}>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {sortedCheckIns.length > 0 && (
                <div>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Session Log ({sortedCheckIns.length})</h3>
                  {sortedCheckIns.map((ci, i) => (
                    <div key={ci.id} className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Session #{sortedCheckIns.length - i}</div>
                        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--outline)' }}>{new Date(ci.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      {ci.progress.energyScore != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: ci.progress.energyScore <= 4 ? 'var(--danger)' : ci.progress.energyScore <= 6 ? 'var(--warning)' : 'var(--primary)' }}>{ci.progress.energyScore}/10</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Energy</div></div>}
                      {ci.progress.adherenceScore != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: ci.progress.adherenceScore >= 75 ? 'var(--primary)' : ci.progress.adherenceScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{ci.progress.adherenceScore}%</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Adherence</div></div>}
                      {ci.progress.steps != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--on-surface)' }}>{ci.progress.steps.toLocaleString()}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Steps</div></div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}"""

if old in content:
    content = content.replace(old, new, 1)
    print('Replaced workout tab')
else:
    print('Workout tab pattern not found!')

with open('d:/codex/apps/web/src/main.tsx', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Written')
