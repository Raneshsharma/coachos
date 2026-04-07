import codecs

with open('d:/codex/apps/web/src/main.tsx', 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# Find and replace the hardcoded meal calendar array
# The pattern starts with "                  {/* Helper to render a day column */}"
# and ends with "                  ].map((day) => {"

# We need to find the start of the hardcoded array and replace with mealWeek.map
old_start = "                  {/* Helper to render a day column */}\n                  {[\n"
new_start = "                  {/* Meal week — loaded from state */}\n                  {mealWeek.map((day) => {\n                    const today = new Date();\n                    const dayOffset = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(day.name);\n                    const startOfWeek = new Date(today);\n                    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + mealWeekOffset * 7);\n                    const dayDate = new Date(startOfWeek);\n                    dayDate.setDate(startOfWeek.getDate() + ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(day.name));\n                    const isToday = dayDate.toDateString() === today.toDateString();\n                    const dayCal = day.meals.reduce((s, m) => s + (m.cal || 0), 0);\n                    const dayProtein = day.meals.reduce((s, m) => s + (m.protein || 0), 0);\n                    const dayCarbs = Math.round(dayProtein * 1.4);\n                    const dayFat = Math.round(dayProtein * 0.4);\n                    return (\n                      <div key={day.name} className=\"meal-day-col\">\n                        <div className=\"meal-day-header\">\n                          <div className={\"meal-day-name\" + (isToday ? \" meal-day-name--today\" : \"\")}>{day.name}</div>\n                          <div className=\"meal-day-date\">{dayDate.getDate()}</div>\n                        </div>\n                        <div className=\"meal-daily-total\">\n                          <div className=\"meal-daily-total-header\">\n                            <span className=\"meal-daily-total-label\">Daily Total</span>\n                            <span className=\"meal-daily-total-cal\">{dayCal > 0 ? (dayCal / 1000).toFixed(1) + 'k' : '0'} cal</span>\n                          </div>\n                          <div className=\"meal-daily-bar\">\n                            <div className=\"meal-daily-bar-fill\" style={{ width: dayCal > 0 ? Math.min(Math.round(dayCal / 1800 * 100), 100) + '%' : '0%' }} />\n                          </div>\n                          <div style={{ display: \"flex\", justifyContent: \"space-between\", marginBottom: \"0.3rem\" }}>\n                            <span style={{ fontFamily: \"Inter, sans-serif\", fontSize: \"0.58rem\", fontWeight: 700, color: \"var(--on-surface-variant)\", textTransform: \"uppercase\", letterSpacing: \"0.04em\" }}>P / C / F</span>\n                            <span style={{ fontFamily: \"Inter, sans-serif\", fontSize: \"0.58rem\", fontWeight: 700, color: \"var(--text-primary)\" }}>{dayProtein}g · {dayCarbs}g · {dayFat}g</span>\n                          </div>\n                        </div>\n"

idx = content.find(old_start)
if idx >= 0:
    print(f'Found hardcoded meal array at position {idx}')
else:
    print('Hardcoded meal array pattern not found! Trying shorter pattern...')
    # Try just the start
    alt = "                  {/* Helper to render a day column */}"
    idx2 = content.find(alt)
    if idx2 >= 0:
        print(f'Found alt pattern at {idx2}')
    else:
        print('Alt pattern also not found!')
        exit(1)

print('Skipping complex meal calendar replacement - will use simpler approach')
print('Done')