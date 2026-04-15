import React, { useState, useEffect, useRef } from "react";

// ABG Practice Tool
// - React single-file component (default export)
// - Uses Tailwind utility classes for layout & spacing
// - Designed to be minimalist, accessible (ARIA + keyboard friendly)
// - Uses a Northcentral Technical College inspired blue as the primary color
// - Includes: scenario generator, timer, safety checker, feedback, and authentic ABG display

// Notes for implementer:
// - This component assumes Tailwind is available in the host app.
// - Color values chosen to match NTC site visuals (approximate): primary blue -- #0072C6
// - All important interactive elements have keyboard focus styles and ARIA labels.

const PRIMARY = "#0072C6"; // NTC-like blue (accessible and high contrast)
const ACCENT = "#003B6F"; // darker accent for focus states
const SUCCESS = "#0b9b53";
const WARN = "#d97706";
const DANGER = "#b91c1c";

// Utility: format numeric to 2 decimals where relevant
const f = (v, n = 2) => (typeof v === 'number' ? Number.parseFloat(v).toFixed(n) : v);

// Simple ABG scenario generator. Each scenario includes: clinical stem, ABG values, and meta tags
const SCENARIOS = [
  {
    id: 1,
    stem: "Elderly patient with chronic COPD admitted for shortness of breath. Using home oxygen intermittently.",
    abg: { pH: 7.34, PaCO2: 56, HCO3: 29, PaO2: 60, SpO2: 88 },
    tags: ["chronic respiratory acidosis", "partial compensation", "hypoxemia"]
  },
  {
    id: 2,
    stem: "Young diabetic with vomiting and poor oral intake for 3 days.",
    abg: { pH: 7.18, PaCO2: 28, HCO3: 9, PaO2: 98, SpO2: 98 },
    tags: ["metabolic acidosis", "respiratory compensation", "no hypoxemia"]
  },
  {
    id: 3,
    stem: "Patient with chronic kidney disease and rising creatinine, mild hyperventilation.",
    abg: { pH: 7.48, PaCO2: 46, HCO3: 33, PaO2: 95, SpO2: 97 },
    tags: ["metabolic alkalosis", "compensated", "no hypoxemia"]
  },
  {
    id: 4,
    stem: "Acute panic attack in ER, patient hyperventilating heavily.",
    abg: { pH: 7.55, PaCO2: 26, HCO3: 22, PaO2: 103, SpO2: 99 },
    tags: ["respiratory alkalosis", "acute", "no hypoxemia"]
  },
  {
    id: 5,
    stem: "Sepsis patient on ventilator with rising vasopressor needs. Sudden drop in oxygenation.",
    abg: { pH: 7.24, PaCO2: 42, HCO3: 18, PaO2: 52, SpO2: 82 },
    tags: ["metabolic acidosis", "no respiratory compensation", "severe hypoxemia"]
  },
  {
    id: 6,
    stem: "Chronic COPD baseline with superimposed pneumonia, on supplemental oxygen.",
    abg: { pH: 7.36, PaCO2: 52, HCO3: 30, PaO2: 74, SpO2: 92 },
    tags: ["compensated respiratory acidosis", "mild hypoxemia"]
  }
];

// Interpretation engine: basic clinical rules to label ABG
function interpretABG({ pH, PaCO2, HCO3, PaO2 }) {
  const errors = [];
  // Basic normal ranges
  const normal = {
    pH: [7.35, 7.45],
    PaCO2: [35, 45],
    HCO3: [22, 26],
    PaO2: [80, 100]
  };

  // Determine primary process
  const acidotic = pH < 7.35;
  const alkalotic = pH > 7.45;

  // Determine direction of PaCO2 and HCO3
  const co2High = PaCO2 > normal.PaCO2[1];
  const co2Low = PaCO2 < normal.PaCO2[0];
  const hco3High = HCO3 > normal.HCO3[1];
  const hco3Low = HCO3 < normal.HCO3[0];

  let primary = "";
  if (acidotic) {
    if (co2High) primary = "respiratory acidosis";
    else if (hco3Low) primary = "metabolic acidosis";
    else primary = "mixed or indeterminate acidosis";
  } else if (alkalotic) {
    if (co2Low) primary = "respiratory alkalosis";
    else if (hco3High) primary = "metabolic alkalosis";
    else primary = "mixed or indeterminate alkalosis";
  } else {
    // pH normal: check for compensation
    if (co2High && hco3High) primary = "compensated respiratory acidosis";
    else if (co2Low && hco3Low) primary = "compensated respiratory alkalosis";
    else if (hco3High && !co2Low) primary = "metabolic alkalosis (compensated)";
    else if (hco3Low && !co2High) primary = "metabolic acidosis (compensated)";
    else primary = "normal or compensated"
  }

  // Assess compensation approx using simple rules (not a substitute for clinician judgment)
  // Metabolic acidosis expected PaCO2 = 1.5*HCO3 + 8 ±2 (Winter's formula)
  let expectedPaCO2ForMetAcid = null;
  if (hco3Low) {
    expectedPaCO2ForMetAcid = 1.5 * HCO3 + 8;
  }

  // Oxygenation
  const hypoxemia = PaO2 < normal.PaO2[0];
  let oxygenationLabel = hypoxemia ? (PaO2 < 60 ? "severe hypoxemia" : "hypoxemia") : "no hypoxemia";

  // Safety checks (common student mistakes)
  // 1) Using PaO2 as marker for acid-base instead of oxygenation only
  if (PaO2 < 80 && (acidotic || alkalotic)) {
    errors.push({ code: 'OXY_MISUSE', message: 'PaO2 indicates oxygenation status — it does not determine acid-base primary process.' });
  }

  // 2) Missing compensation: if metabolic acidosis but PaCO2 matches Winter's formula within ±5 => appropriate compensation
  let compensation = 'none';
  if (primary === 'metabolic acidosis' || primary === 'metabolic acidosis (compensated)') {
    if (expectedPaCO2ForMetAcid) {
      const diff = Math.abs(PaCO2 - expectedPaCO2ForMetAcid);
      if (diff <= 5) compensation = 'appropriate respiratory compensation';
      else if (PaCO2 < expectedPaCO2ForMetAcid) compensation = 'excess respiratory compensation (or mixed disorder)';
      else compensation = 'insufficient compensation (or mixed disorder)';
    }
  } else if (primary.includes('respiratory')) {
    // acute vs chronic: acute respiratory acidosis -> HCO3 increases ~1 per 10 mm for acute, ~3.5 for chronic (simplified)
    if (primary === 'respiratory acidosis' || primary === 'compensated respiratory acidosis') {
      const deltaHCO3 = HCO3 - normal.HCO3[1];
      if (co2High) {
        // crude check
        if (deltaHCO3 > 4) compensation = 'chronic (partially compensated)';
        else if (deltaHCO3 > 1) compensation = 'acute on chronic or partially compensated';
        else compensation = 'acute (minimal metabolic compensation)';
      }
    }
  }

  return {
    primary,
    compensation,
    oxygenationLabel,
    errors
  };
}

export default function AbgPracticeTool() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [userLabel, setUserLabel] = useState("");
  const [includeHypoxemia, setIncludeHypoxemia] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [timerOn, setTimerOn] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90); // seconds default
  const timerRef = useRef(null);
  const [showSafety, setShowSafety] = useState(true);

  useEffect(() => {
    setScenario(SCENARIOS[scenarioIndex]);
    resetAttempt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioIndex]);

  useEffect(() => {
    if (timerOn) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            setTimerOn(false);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [timerOn]);

  function resetAttempt() {
    setUserLabel("");
    setFeedback(null);
    setTimeLeft(90);
    setTimerOn(false);
    clearInterval(timerRef.current);
  }

  function nextScenario() {
    setScenarioIndex((i) => (i + 1) % SCENARIOS.length);
  }

  function prevScenario() {
    setScenarioIndex((i) => (i - 1 + SCENARIOS.length) % SCENARIOS.length);
  }

  function handleSubmit(e) {
    e?.preventDefault();
    const result = interpretABG({
      pH: scenario.abg.pH,
      PaCO2: scenario.abg.PaCO2,
      HCO3: scenario.abg.HCO3,
      PaO2: scenario.abg.PaO2
    });

    const expectedPrimary = result.primary;
    const expectedOxy = result.oxygenationLabel;

    // Normalize user input (students should label like: "compensated metabolic acidosis without hypoxemia")
    const normalize = s => s?.toLowerCase()?.replace(/[^a-z0-9\s-]/g, '').trim();
    const normalizedUser = normalize(userLabel || '');

    const checks = [];

    // Check for primary keywords
    if (normalizedUser.includes('metabolic') && expectedPrimary.includes('metabolic')) checks.push({ ok: true, msg: 'Primary process correct: metabolic' });
    else if (normalizedUser.includes('respiratory') && expectedPrimary.includes('respiratory')) checks.push({ ok: true, msg: 'Primary process correct: respiratory' });
    else if (expectedPrimary.includes('compensated') && normalizedUser.includes('compensated')) checks.push({ ok: true, msg: 'You labeled compensation.' });
    else checks.push({ ok: false, msg: `Primary process likely ${expectedPrimary}.` });

    // Check for compensation phrase
    if (normalizedUser.includes('compensated') || normalizedUser.includes('partial') || normalizedUser.includes('acute') || normalizedUser.includes('chronic')) {
      checks.push({ ok: true, msg: 'Compensation descriptor recognized.' });
    } else {
      checks.push({ ok: false, msg: `Consider whether this is acute, chronic, or compensated. Expected: ${result.compensation}.` });
    }

    // Oxygenation
    if (normalizedUser.includes('hypox') || normalizedUser.includes('no hypox') || normalizedUser.includes('without hypoxemia') || normalizedUser.includes('with hypoxemia')) {
      // student mentioned oxygenation, check match
      if (expectedOxy === 'no hypoxemia' && (normalizedUser.includes('no hypox') || normalizedUser.includes('without hypox'))) {
        checks.push({ ok: true, msg: 'Oxygenation label correct.' });
      } else if (expectedOxy !== 'no hypoxemia' && normalizedUser.includes('hypox')) {
        checks.push({ ok: true, msg: 'Oxygenation label correct.' });
      } else {
        checks.push({ ok: false, msg: `Oxygenation expected: ${expectedOxy}.` });
      }
    } else {
      // didn't mention oxygenation
      checks.push({ ok: false, msg: `Tip: include oxygenation (e.g., "with hypoxemia" or "without hypoxemia"). Expected: ${expectedOxy}.` });
    }

    const incorrect = checks.find(c => !c.ok);

    setFeedback({ result, checks });
  }

  function randomize() {
    const idx = Math.floor(Math.random() * SCENARIOS.length);
    setScenarioIndex(idx);
  }

  // Accessibility helper: keyboard handler for quick label suggestions
  function quickFill(label) {
    setUserLabel(label);
    setTimeout(() => {
      // focus submit button for keyboard users
      const btn = document.getElementById('submit-btn');
      btn?.focus();
    }, 100);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans" style={{color: '#0f172a'}}>
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: PRIMARY }}>ABG Interpretation Practice</h1>
          <p className="text-sm text-gray-600 mt-1">Minimalist, accessible practice tool — NTC color accent. Practice recognizing acid-base disorders and oxygenation.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Scenario</div>
          <div className="font-medium">#{scenario.id} — <span className="text-gray-700">{scenario.stem.split('.').slice(0,1)}</span></div>
        </div>
      </header>

      <main className="bg-white rounded-lg shadow-sm p-6" role="main">
        <section aria-labelledby="scenario-heading" className="mb-6">
          <h2 id="scenario-heading" className="text-lg font-medium" style={{ color: ACCENT }}>Clinical scenario</h2>
          <p className="mt-2 text-gray-700">{scenario.stem}</p>
        </section>

        <section aria-labelledby="abg-heading" className="mb-6">
          <h3 id="abg-heading" className="text-base font-medium">ABG result (authentic display)</h3>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 items-center" role="table" aria-label="ABG values">
            {/** Mimic documentation display: label on left, value on right with units */}
            <div className="p-3 border rounded flex flex-col" role="row">
              <div className="text-xs text-gray-500">pH</div>
              <div className="text-lg font-mono" role="cell">{f(scenario.abg.pH, 2)}</div>
            </div>
            <div className="p-3 border rounded flex flex-col" role="row">
              <div className="text-xs text-gray-500">PaCO₂</div>
              <div className="text-lg font-mono" role="cell">{f(scenario.abg.PaCO2,0)} mmHg</div>
            </div>
            <div className="p-3 border rounded flex flex-col" role="row">
              <div className="text-xs text-gray-500">HCO₃⁻</div>
              <div className="text-lg font-mono" role="cell">{f(scenario.abg.HCO3,0)} mEq/L</div>
            </div>
            <div className="p-3 border rounded flex flex-col" role="row">
              <div className="text-xs text-gray-500">PaO₂</div>
              <div className="text-lg font-mono" role="cell">{f(scenario.abg.PaO2,0)} mmHg</div>
            </div>
            <div className="p-3 border rounded flex flex-col" role="row">
              <div className="text-xs text-gray-500">SpO₂</div>
              <div className="text-lg font-mono" role="cell">{f(scenario.abg.SpO2,0)}%</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">Tip: values shown in typical clinical order. Use pH, PaCO₂ and HCO₃⁻ to determine acid–base disorder; PaO₂/SpO₂ for oxygenation assessment.</p>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4 mb-4">
          <label htmlFor="interpretation" className="sr-only">Your interpretation</label>
          <div>
            <input
              id="interpretation"
              className="w-full border rounded p-3 focus:outline-none focus:ring-2" 
              style={{ borderColor: PRIMARY }}
              value={userLabel}
              onChange={(e) => setUserLabel(e.target.value)}
              placeholder="Type your interpretation — e.g. 'compensated metabolic acidosis without hypoxemia'"
              aria-label="Type your interpretation"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => quickFill('compensated respiratory acidosis with mild hypoxemia')} className="text-xs px-3 py-1 rounded border" style={{borderColor: PRIMARY}}>Fill: respiratory</button>
              <button type="button" onClick={() => quickFill('metabolic acidosis with respiratory compensation without hypoxemia')} className="text-xs px-3 py-1 rounded border" style={{borderColor: PRIMARY}}>Fill: metabolic</button>
              <button type="button" onClick={() => quickFill('respiratory alkalosis acute, no hypoxemia')} className="text-xs px-3 py-1 rounded border" style={{borderColor: PRIMARY}}>Fill: alkalosis</button>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <button id="submit-btn" type="submit" className="px-4 py-2 rounded text-white" style={{ background: PRIMARY }} aria-label="Submit interpretation">Check</button>
            <button type="button" onClick={() => { resetAttempt(); }} className="px-4 py-2 rounded border" aria-label="Reset">Reset</button>

            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm text-gray-600">Timer</label>
              <button type="button" onClick={() => { setTimerOn(t => !t); if (!timerOn) setTimeLeft(90); }} className="px-3 py-1 rounded border" style={{borderColor: PRIMARY}} aria-pressed={timerOn}>{timerOn ? 'Stop' : 'Start'}</button>
              <div aria-live="polite" className="text-sm font-mono">{`${Math.floor(timeLeft/60)}:${String(timeLeft%60).padStart(2,'0')}`}</div>
            </div>
          </div>
        </form>

        {feedback && (
          <section aria-live="polite" className="mt-4 p-4 rounded border" style={{ borderColor: '#e5e7eb' }}>
            <h4 className="font-medium">Feedback</h4>
            <div className="mt-2 space-y-2">
              {feedback.checks.map((c, i) => (
                <div key={i} className={`p-2 rounded ${c.ok ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                  <div className="text-sm">{c.msg}</div>
                </div>
              ))}

              {showSafety && feedback.result.errors.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-100 rounded">
                  <div className="text-sm font-semibold">Safety checker</div>
                  {feedback.result.errors.map((err, i) => (
                    <div key={i} className="text-xs mt-1">• {err.message}</div>
                  ))}
                </div>
              )}

              <div className="mt-3 text-xs text-gray-600">
                <strong>Interpreted by engine:</strong> {feedback.result.primary}. {feedback.result.compensation}. Oxygenation: {feedback.result.oxygenationLabel}.
              </div>
            </div>
          </section>
        )}

        <aside className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 border rounded">
            <div className="text-xs text-gray-500">Quick actions</div>
            <div className="mt-2 flex flex-col gap-2">
              <button onClick={randomize} className="py-2 px-3 rounded" style={{border: `1px solid ${PRIMARY}`}}>Random scenario</button>
              <div className="flex gap-2">
                <button onClick={prevScenario} className="py-2 px-3 rounded border">Prev</button>
                <button onClick={nextScenario} className="py-2 px-3 rounded border">Next</button>
              </div>
            </div>
          </div>

          <div className="p-3 border rounded" aria-hidden>
            <div className="text-xs text-gray-500">Pro tips</div>
            <ul className="mt-2 text-sm text-gray-700 list-disc ml-4">
              <li>Use pH to determine acidity direction first.</li>
              <li>Then check PaCO₂ and HCO₃⁻ for the primary process.</li>
              <li>Use Winter's formula for metabolic acidosis compensation checks.</li>
            </ul>
          </div>

          <div className="p-3 border rounded">
            <div className="text-xs text-gray-500">Accessibility</div>
            <div className="mt-2 text-sm text-gray-700">Colors use high contrast against white. All controls are keyboard accessible. Screen-reader labels included.</div>
            <div className="mt-2">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={showSafety} onChange={() => setShowSafety(s => !s)} />
                <span className="text-sm">Show safety checker</span>
              </label>
            </div>
          </div>
        </aside>

      </main>

      <footer className="mt-6 text-xs text-gray-500 text-center">
        Designed for practice — not a clinical decision tool. For teaching use only. Colors approximated from NTC public site for visual identity.
      </footer>

      {/* Inline styles for focus, minimal and clear emphasis */}
      <style jsx>{`
        input:focus, button:focus { box-shadow: 0 0 0 3px rgba(0,114,198,0.15); outline: none; }
        /* Ensure links and primary UI have sufficient contrast */
        .primary-bg { background: ${PRIMARY}; color: white; }
      `}</style>
    </div>
  );
}